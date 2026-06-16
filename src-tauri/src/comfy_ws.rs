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

    let mut local_paths = Vec::new();
    for (i, url) in images_urls.iter().enumerate() {
        if let Ok(local_path) = crate::commands::images::download_comfyui_image(app_clone.clone(), url.clone()).await {
            local_paths.push(local_path.clone());
            
            let img_record = GeneratedImage {
                id: format!("img_{}_{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis(), i),
                prompt_id: Some(ctx.project_id.clone()),
                workflow_id: ctx.workflow_id.clone(),
                seed: ctx.seed.map(|s| s.to_string()),
                output_path: local_path,
                output_type: "image".to_string(),
                status: "completed".to_string(),
                error_msg: None,
                is_saved: false,
                created_at: 0,
            };
            
            if let Some(app_state) = app_clone.try_state::<AppState>() {
                let _ = crate::commands::history::save_generated_image(app_state, img_record).await;
            }
        }
    }

    emit_to_frontend(&app_clone, "comfy-completed", serde_json::json!({
        "prompt_id": prompt_id,
        "job_id": ctx.job_id,
        "images": local_paths
    }));

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
        return;
    }
    *connected = true;
    drop(connected);

    let jobs_map = state.active_jobs.clone();
    let orphans_map = state.orphan_executed.clone();
    let app_clone = app.clone();

    tokio::spawn(async move {
        let connect_url = format!("{}/ws?clientId={}", ws_url, client_id);
        println!("[ComfyWS Backend] Connecting to {}", connect_url);
        
        match connect_async(&connect_url).await {
            Ok((ws_stream, _)) => {
                println!("[ComfyWS Backend] Connected!");
                emit_to_frontend(&app_clone, "comfy-status", serde_json::json!("connected"));

                let (_, mut read) = ws_stream.split();

                while let Some(msg_result) = read.next().await {
                    match msg_result {
                        Ok(Message::Text(text)) => {
                            if let Ok(json) = serde_json::from_str::<Value>(&text) {
                                let msg_type = json["type"].as_str().unwrap_or("");
                                let data = &json["data"];
                                let prompt_id = data["prompt_id"].as_str().unwrap_or("").to_string();

                                if msg_type == "progress" {
                                    emit_to_frontend(&app_clone, "comfy-progress", json.clone());
                                } else if msg_type == "executed" {
                                    println!("[ComfyWS Backend] Executed for prompt {}", prompt_id);
                                    
                                    let mut images_list = Vec::new();
                                    if let Some(outputs) = data["output"]["images"].as_array() {
                                        images_list = outputs.clone();
                                    }

                                    let mut locked_jobs = jobs_map.lock().await;
                                    if let Some(ctx) = locked_jobs.remove(&prompt_id) {
                                        drop(locked_jobs);
                                        let app_c = app_clone.clone();
                                        tokio::spawn(async move {
                                            process_executed(app_c, ctx, images_list, prompt_id).await;
                                        });
                                    } else {
                                        // Race condition: HTTP response hasn't returned yet, store for later
                                        let mut orphans = orphans_map.lock().await;
                                        orphans.insert(prompt_id.clone(), images_list);
                                    }
                                } else if msg_type == "execution_error" {
                                    emit_to_frontend(&app_clone, "comfy-error", json.clone());
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
                            println!("[ComfyWS Backend] WS Error: {}", e);
                            break;
                        }
                    }
                }
            }
            Err(e) => {
                println!("[ComfyWS Backend] Connection failed: {}", e);
            }
        }
        
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

        if let Some(images_list) = orphans.remove(&prompt_id_str) {
            // Already finished execution before this HTTP response returned
            drop(orphans);
            drop(jobs);
            
            let app_clone = app.clone();
            tokio::spawn(async move {
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
                                        }

                                        let mut locked_jobs = jobs_poll.lock().await;
                                        if let Some(ctx_poll) = locked_jobs.remove(&prompt_poll) {
                                            drop(locked_jobs);
                                            println!("[ComfyWS Backend] Fallback Poll completed prompt {}", prompt_poll);
                                            
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
