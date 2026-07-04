use crate::db::models::GeneratedImage;
use crate::AppState;
use futures_util::StreamExt;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::sync::Arc;
use tauri::{AppHandle, Manager, State, Emitter};
use tokio::sync::Mutex;
use tokio_tungstenite::{connect_async, tungstenite::protocol::Message};
use tauri_plugin_notification::NotificationExt;
use log::{info, error};
use std::time::Duration;

#[derive(Clone, Serialize, Deserialize)]
pub struct JobContext {
    pub job_id: String,
    pub project_id: String,
    pub workflow_id: Option<String>,
    pub seed: Option<i64>,
    pub project_title: String,
    pub comfy_url: String,
}

pub struct ComfyState {
    pub active_jobs: Arc<Mutex<HashMap<String, JobContext>>>,
    pub orphan_executed: Arc<Mutex<HashMap<String, Vec<Value>>>>,
    pub ws_connected: Arc<Mutex<bool>>,
}

impl ComfyState {
    pub fn new() -> Self {
        Self {
            active_jobs: Arc::new(Mutex::new(HashMap::new())),
            orphan_executed: Arc::new(Mutex::new(HashMap::new())),
            ws_connected: Arc::new(Mutex::new(false)),
        }
    }
}

fn emit_to_frontend(app: &AppHandle, event: &str, payload: Value) {
    let _ = app.emit(event, payload);
}

pub async fn process_executed(app_clone: AppHandle, ctx: JobContext, images: Vec<Value>, prompt_id: String) {
    let mut images_urls = Vec::new();
    for img in images {
        let filename = img["filename"].as_str().unwrap_or("");
        let subfolder = img["subfolder"].as_str().unwrap_or("");
        let img_type = img["type"].as_str().unwrap_or("");
        let img_url = format!("{}/view?filename={}&subfolder={}&type={}", ctx.comfy_url, filename, subfolder, img_type);
        images_urls.push(img_url);
    }

    // Resolve the canonical app data dir and AppState once.
    // We use `state.app_data_dir` (hardcoded on Android) instead of `app.path().app_data_dir()`,
    // because the Tauri runtime path API relies on the JNI/ndk_context which is unreliable on
    // Android worker threads — that was silently failing image downloads and dropping history.
    let app_state = app_clone.try_state::<AppState>();
    let app_data_dir = app_state.as_ref().map(|s| s.app_data_dir.clone());

    let mut local_paths = Vec::new();
    for (i, url) in images_urls.iter().enumerate() {
        let Some(ref data_dir) = app_data_dir else {
            error!("[ComfyWS] AppState not available, cannot resolve app_data_dir for download");
            break;
        };
        match crate::commands::images::download_comfyui_image(data_dir.clone(), url.clone()).await {
            Ok(local_path) => {
                let output_type = if local_path.ends_with(".mp4") || local_path.ends_with(".webm") || local_path.ends_with(".avi") || local_path.ends_with(".mov") || local_path.ends_with(".mkv") {
                    "video"
                } else {
                    "image"
                };
                local_paths.push(local_path.clone());

                let img_record = GeneratedImage {
                    id: format!("img_{}_{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis(), i),
                    prompt_id: if ctx.project_id.starts_with("video_") { None } else { Some(ctx.project_id.clone()) },
                    workflow_id: ctx.workflow_id.clone(),
                    seed: ctx.seed.map(|s| s.to_string()),
                    output_path: local_path,
                    output_type: output_type.to_string(),
                    status: "completed".to_string(),
                    error_msg: None,
                    is_saved: false,
                    created_at: 0,
                };

                if let Some(ref app_state) = app_state {
                    match crate::commands::history::save_generated_image(app_state.clone(), img_record.clone()).await {
                        Ok(_) => info!("[ComfyWS] Saved to history: {}", img_record.output_path),
                        Err(e) => error!("[ComfyWS] Failed to save to history: {}", e),
                    }
                } else {
                    error!("[ComfyWS] AppState not available, cannot save to history");
                }
            }
            Err(e) => {
                error!("[ComfyWS] Failed to download image from {}: {}", url, e);
            }
        }
    }

    emit_to_frontend(&app_clone, "comfy-completed", serde_json::json!({
        "prompt_id": prompt_id,
        "job_id": ctx.job_id,
        "images": local_paths
    }));

    android_stop_service(&app_clone);

    let _ = app_clone.notification()
        .builder()
        .title("生成完成")
        .body(format!("项目 {} 已生成完成", ctx.project_title))
        .show();
}

pub async fn ensure_ws_connection(app: AppHandle, ws_url: String, client_id: String) {
    let state = app.state::<ComfyState>();
    let mut connected = state.ws_connected.lock().await;
    if *connected {
        info!("[ComfyWS Backend] ensure_ws_connection: already connected, skipping. ws_url={}", ws_url);
        return;
    }
    *connected = true;
    info!("[ComfyWS Backend] ensure_ws_connection: spawning WS task for {}", ws_url);
    drop(connected);

    let jobs_map = state.active_jobs.clone();
    let orphans_map = state.orphan_executed.clone();
    let app_clone = app.clone();

    tokio::spawn(async move {
        let connect_url = format!("{}/ws?clientId={}", ws_url, client_id);
        info!("[ComfyWS Backend] Connecting to {}", connect_url);
        let mut msg_count: u64 = 0;
        let mut prog_count: u64 = 0;
        
        match connect_async(&connect_url).await {
            Ok((ws_stream, _)) => {
                info!("[ComfyWS Backend] Connected!");
                emit_to_frontend(&app_clone, "comfy-status", serde_json::json!("connected"));

                let (_, mut read) = ws_stream.split();

                while let Some(msg_result) = read.next().await {
                    match msg_result {
                        Ok(Message::Text(text)) => {
                            msg_count += 1;
                            if msg_count <= 3 || msg_count % 10 == 0 {
                                info!("[ComfyWS Backend] WS msg #{}: len={}", msg_count, text.len());
                            }
                            if let Ok(json) = serde_json::from_str::<Value>(&text) {
                                let msg_type = json["type"].as_str().unwrap_or("");
                                let data = &json["data"];
                                let prompt_id = data["prompt_id"].as_str().unwrap_or("").to_string();

                                if msg_type == "progress" {
                                    prog_count += 1;
                                    if prog_count <= 3 || prog_count % 10 == 0 {
                                        info!("[ComfyWS Backend] Progress #{}: value={}/{} node={}", prog_count, data["value"], data["max"], data["node"]);
                                    }
                                    emit_to_frontend(&app_clone, "comfy-progress", json.clone());
                                    
                                    let progress_val = data["value"].as_i64().unwrap_or(0);
                                    let max_val = data["max"].as_i64().unwrap_or(1);
                                    let percentage = if max_val > 0 { (progress_val as f64 / max_val as f64 * 100.0) as i32 } else { 0 };
                                    android_update_progress(&app_clone, "云端渲染中", percentage);
                                    
                                } else if msg_type == "executing" {
                                    if data["node"].is_null() {
                                        info!("[ComfyWS Backend] Prompt {} fully executed!", prompt_id);
                                        
                                        let mut locked_jobs = jobs_map.lock().await;
                                        if let Some(ctx) = locked_jobs.remove(&prompt_id) {
                                            drop(locked_jobs);
                                            let app_c = app_clone.clone();
                                            let p_id = prompt_id.clone();
                                            tokio::spawn(async move {
                                                tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                                                let mut images_list = Vec::new();
                                                let client = reqwest::Client::new();
                                                if let Ok(res) = client.get(format!("{}/history/{}", ctx.comfy_url, p_id)).send().await {
                                                    if let Ok(json) = res.json::<Value>().await {
                                                        if let Some(history) = json.get(&p_id) {
                                                            if let Some(outputs) = history.get("outputs").and_then(|o| o.as_object()) {
                                                                for (_, node_output) in outputs {
                                                                    if let Some(imgs) = node_output.get("images").and_then(|i| i.as_array()) {
                                                                        images_list.extend(imgs.clone());
                                                                    }
                                                                    if let Some(gifs) = node_output.get("gifs").and_then(|g| g.as_array()) {
                                                                        images_list.extend(gifs.clone());
                                                                    }
                                                                    if let Some(videos) = node_output.get("video").and_then(|v| v.as_array()) {
                                                                        images_list.extend(videos.clone());
                                                                    }
                                                                }
                                                            }
                                                        }
                                                    }
                                                }
                                                process_executed(app_c, ctx, images_list, p_id).await;
                                            });
                                        } else {
                                            let mut orphans = orphans_map.lock().await;
                                            orphans.insert(prompt_id.clone(), Vec::new());
                                        }
                                    }
                                } else if msg_type == "execution_error" {
                                    emit_to_frontend(&app_clone, "comfy-error", json.clone());
                                    android_stop_service(&app_clone);
                                    let _ = app_clone.notification()
                                        .builder()
                                        .title("生成失败")
                                        .body(data["exception_message"].as_str().unwrap_or("生成发生错误"))
                                        .show();
                                }
                            }
                        }
                        Ok(_) => {},
                        Err(e) => {
                            info!("[ComfyWS Backend] WS Error: {}", e);
                            break;
                        }
                    }
                }
            }
            Err(e) => {
                info!("[ComfyWS Backend] Connection failed: {}", e);
            }
        }
        
        info!("[ComfyWS Backend] WS task exiting after {} msgs ({} progress). Resetting ws_connected.", msg_count, prog_count);
        let state = app_clone.state::<ComfyState>();
        let mut connected = state.ws_connected.lock().await;
        *connected = false;
        emit_to_frontend(&app_clone, "comfy-status", serde_json::json!("disconnected"));
    });
}

#[tauri::command]
pub async fn queue_prompt_and_track(
    app: AppHandle,
    state: State<'_, ComfyState>,
    prompt: Value,
    comfy_url: String,
    client_id: String,
    job_id: String,
    project_id: String,
    project_title: String,
    workflow_id: Option<String>,
    seed: Option<i64>
) -> Result<Value, String> {
    let ws_url = comfy_url.replace("http://", "ws://").replace("https://", "wss://");
    ensure_ws_connection(app.clone(), ws_url, client_id.clone()).await;

    let client = Client::new();
    let res = client.post(format!("{}/prompt", comfy_url))
        .json(&serde_json::json!({
            "prompt": prompt,
            "client_id": client_id
        }))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        return Err(format!("Failed to queue prompt: {}", res.status()));
    }

    let res_json: Value = res.json().await.map_err(|e| e.to_string())?;
    
    // Start foreground service before storing context
    android_start_service(&app, &format!("项目: {}", project_title));
    
    if let Some(prompt_id) = res_json["prompt_id"].as_str() {
        let prompt_id_str = prompt_id.to_string();
        let ctx = JobContext {
            job_id,
            project_id,
            workflow_id,
            seed,
            project_title,
            comfy_url: comfy_url.clone(),
        };

        let mut jobs = state.active_jobs.lock().await;
        let mut orphans = state.orphan_executed.lock().await;

        if let Some(_) = orphans.remove(&prompt_id_str) {
            // Already finished execution before this HTTP response returned
            drop(orphans);
            drop(jobs);
            
            let app_clone = app.clone();
            tokio::spawn(async move {
                // Fetch history
                tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                let mut images_list = Vec::new();
                let client = reqwest::Client::new();
                if let Ok(res) = client.get(format!("{}/history/{}", ctx.comfy_url, prompt_id_str)).send().await {
                    if let Ok(json) = res.json::<Value>().await {
                        if let Some(history) = json.get(&prompt_id_str) {
                            if let Some(outputs) = history.get("outputs").and_then(|o| o.as_object()) {
                                for (_, node_output) in outputs {
                                    if let Some(imgs) = node_output.get("images").and_then(|i| i.as_array()) {
                                        images_list.extend(imgs.clone());
                                    }
                                    if let Some(gifs) = node_output.get("gifs").and_then(|g| g.as_array()) {
                                        images_list.extend(gifs.clone());
                                    }
                                    if let Some(videos) = node_output.get("video").and_then(|v| v.as_array()) {
                                        images_list.extend(videos.clone());
                                    }
                                }
                            }
                        }
                    }
                }
                process_executed(app_clone, ctx, images_list, prompt_id_str).await;
            });
        } else {
            jobs.insert(prompt_id_str.clone(), ctx.clone());
            drop(jobs);
            drop(orphans);

            // Spawn a robust polling fallback task to handle Android background app suspensions/WS drops
            let app_poll = app.clone();
            let jobs_poll = state.active_jobs.clone();
            let prompt_poll = prompt_id_str.clone();
            
            tokio::spawn(async move {
                let poll_client = Client::new();
                let mut attempts = 0;
                
                loop {
                    tokio::time::sleep(Duration::from_secs(3)).await;
                    attempts += 1;
                    
                    // Check if it's still in active_jobs
                    let jobs = jobs_poll.lock().await;
                    if !jobs.contains_key(&prompt_poll) {
                        break; // Already processed by WS or another task
                    }
                    drop(jobs);

                    // Timeout after approx 50 minutes (1000 * 3s)
                    if attempts > 1000 {
                        break;
                    }

                    // Poll history endpoint
                    let history_url = format!("{}/history/{}", comfy_url, prompt_poll);
                    if let Ok(history_res) = poll_client.get(&history_url).send().await {
                        if history_res.status().is_success() {
                            if let Ok(json) = history_res.json::<Value>().await {
                                if let Some(history) = json.get(&prompt_poll) {
                                    if let Some(outputs) = history.get("outputs").and_then(|o| o.as_object()) {
                                        let mut images_list = Vec::new();
                                        for (_, node_output) in outputs {
                                            if let Some(imgs) = node_output.get("images").and_then(|i| i.as_array()) {
                                                images_list.extend(imgs.clone());
                                            }
                                            if let Some(gifs) = node_output.get("gifs").and_then(|g| g.as_array()) {
                                                images_list.extend(gifs.clone());
                                            }
                                            if let Some(videos) = node_output.get("video").and_then(|v| v.as_array()) {
                                                images_list.extend(videos.clone());
                                            }
                                        }

                                        let mut locked_jobs = jobs_poll.lock().await;
                                        if let Some(ctx_poll) = locked_jobs.remove(&prompt_poll) {
                                            drop(locked_jobs);
                                            info!("[ComfyWS Backend] Fallback Poll completed prompt {}", prompt_poll);
                                            
                                            // Emit a full progress event just to update UI to 100%
                                            let _ = emit_to_frontend(&app_poll, "comfy-progress", serde_json::json!({
                                                "data": { "value": 100, "max": 100, "node": "poll" }
                                            }));
                                            
                                            process_executed(app_poll.clone(), ctx_poll, images_list, prompt_poll.clone()).await;
                                        }
                                        break;
                                    }
                                }
                            }
                        }
                    }
                }
            });
        }
    }

    Ok(res_json)
}

#[cfg(target_os = "android")]
pub fn android_start_service(_app: &tauri::AppHandle, title: &str) {
    let title_string = title.to_string();
    let vm_opt = unsafe { crate::jvm_plugin::JVM.as_ref() };
    if vm_opt.is_none() { return; }
    let vm = vm_opt.unwrap();
    
    let mut env = match vm.get_env() {
        Ok(env) => env,
        Err(_) => match vm.attach_current_thread_permanently() {
            Ok(e) => e,
            Err(_) => return,
        }
    };
    // Safety: clear any stale JNI exception (from a prior failed JNI call that
    // was missed) to prevent ART abort on the next JNI invocation.
    let _ = env.exception_clear();
    
    let class_ref = unsafe { crate::jvm_plugin::MAIN_ACTIVITY_CLASS.as_ref().unwrap() };
    let activity_class: &jni::objects::JClass = <&jni::objects::JClass>::from(class_ref.as_obj());
    
    if let Ok(title_jstr) = env.new_string(&title_string) {
        let _ = env.call_static_method(
            activity_class,
            "startComfyService",
            "(Ljava/lang/String;)V",
            &[(&title_jstr).into()]
        );
        if env.exception_check().unwrap_or(false) {
            let _ = env.exception_clear();
        }
    }
}

#[cfg(not(target_os = "android"))]
pub fn android_start_service(_app: &tauri::AppHandle, _title: &str) {}

#[cfg(target_os = "android")]
pub fn android_update_progress(_app: &tauri::AppHandle, title: &str, progress: i32) {
    let title_string = title.to_string();
    let vm_opt = unsafe { crate::jvm_plugin::JVM.as_ref() };
    if vm_opt.is_none() { return; }
    let vm = vm_opt.unwrap();
    
    let mut env = match vm.get_env() {
        Ok(env) => env,
        Err(_) => match vm.attach_current_thread_permanently() {
            Ok(e) => e,
            Err(_) => return,
        }
    };
    let _ = env.exception_clear();
    
    let class_ref = unsafe { crate::jvm_plugin::MAIN_ACTIVITY_CLASS.as_ref().unwrap() };
    let activity_class: &jni::objects::JClass = <&jni::objects::JClass>::from(class_ref.as_obj());
    
    if let Ok(title_jstr) = env.new_string(&title_string) {
        let _ = env.call_static_method(
            activity_class,
            "updateComfyProgress",
            "(Ljava/lang/String;I)V",
            &[(&title_jstr).into(), jni::objects::JValueGen::Int(progress)]
        );
        if env.exception_check().unwrap_or(false) {
            let _ = env.exception_clear();
        }
    }
}

#[cfg(not(target_os = "android"))]
pub fn android_update_progress(_app: &tauri::AppHandle, _title: &str, _progress: i32) {}

#[cfg(target_os = "android")]
pub fn android_stop_service(_app: &tauri::AppHandle) {
    let vm_opt = unsafe { crate::jvm_plugin::JVM.as_ref() };
    if vm_opt.is_none() { return; }
    let vm = vm_opt.unwrap();
    
    let mut env = match vm.get_env() {
        Ok(env) => env,
        Err(_) => match vm.attach_current_thread_permanently() {
            Ok(e) => e,
            Err(_) => return,
        }
    };
    let _ = env.exception_clear();
    
    let class_ref = unsafe { crate::jvm_plugin::MAIN_ACTIVITY_CLASS.as_ref().unwrap() };
    let activity_class: &jni::objects::JClass = <&jni::objects::JClass>::from(class_ref.as_obj());
    
    let _ = env.call_static_method(
        activity_class,
        "stopComfyService",
        "()V",
        &[]
    );
    if env.exception_check().unwrap_or(false) {
        let _ = env.exception_clear();
    }
}

#[cfg(not(target_os = "android"))]
pub fn android_stop_service(_app: &tauri::AppHandle) {}

#[tauri::command]
pub async fn upload_image_to_comfy(
    comfy_url: String,
    image_data: Vec<u8>,
    filename: String,
) -> Result<String, String> {
    let client = reqwest::Client::new();
    let url = format!("{}/upload/image", comfy_url);
    let part = reqwest::multipart::Part::bytes(image_data)
        .file_name(filename.clone())
        .mime_str("image/png")
        .map_err(|e| e.to_string())?;
    let form = reqwest::multipart::Form::new()
        .part("image", part)
        .text("type", "input")
        .text("overwrite", "true");
    let res = client.post(&url).multipart(form).send().await.map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("Upload failed: {}", res.status()));
    }
    let json: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
    let name = json["name"].as_str().unwrap_or(&filename).to_string();
    Ok(name)
}

