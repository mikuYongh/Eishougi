use tauri::{AppHandle, Emitter};
use tokio::process::Command;
use std::io::Write;
use futures_util::StreamExt;

// NOTE: The one-click deploy (clone ComfyUI + venv + PyTorch) was removed because it was unreliable.
// Users now install ComfyUI themselves (e.g. via ComfyUI-aki). This file retains the component
// download / custom-node install / status check utilities that the new onboarding wizard uses.

fn emit_progress(app: &AppHandle, step: usize, total: usize, status: &str, message: &str) {
    let _ = app.emit("deploy-progress", serde_json::json!({
        "step": step, "total": total, "status": status, "message": message
    }));
}

fn get_default_comfy_dir() -> String {
    #[cfg(target_os = "windows")]
    { "C:\\ComfyUI".to_string() }
    #[cfg(not(target_os = "windows"))]
    { format!("{}/ComfyUI", std::env::var("HOME").unwrap_or_else(|_| ".".to_string())) }
}

async fn run_cmd(program: &str, args: &[&str], cwd: Option<&str>) -> Result<String, String> {
    let mut cmd = Command::new(program);
    cmd.args(args);
    if let Some(dir) = cwd { cmd.current_dir(dir); }
    let output = cmd.output().await
        .map_err(|e| format!("执行失败 {} {}: {}", program, args.join(" "), e))?;
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    if !output.status.success() {
        return Err(if stderr.is_empty() { stdout } else { stderr });
    }
    Ok(if stdout.is_empty() { stderr } else { stdout })
}

fn known_custom_nodes() -> Vec<(&'static str, &'static str)> {
    vec![
        ("cg-use-everywhere", "https://gitee.com/lubaiwan/cg-use-everywhere.git"),
        ("ComfyUI_essentials", "https://gitee.com/mrnf/ComfyUI_essentials.git"),
        ("comfyui_LLM_party", "https://gitee.com/gimu2026/comfyui_LLM_party.git"),
        ("rgthree-comfy", "https://gitee.com/mrnf/rgthree-comfy.git"),
        ("ComfyUI-SeedVR2_VideoUpscaler", "https://gitee.com/wx-gx/ComfyUI-SeedVR2_VideoUpscaler.git"),
    ]
}

fn known_model_urls() -> Vec<(&'static str, &'static str, &'static str)> {
    vec![
        ("qwen_image_vae.safetensors", "models/vae",
         "https://cnb.cool/ai-models/circlestone-labs/Anima/-/lfs/a70580f0213e67967ee9c95f05bb400e8fb08307e017a924bf3441223e023d1f"),
        ("qwen_3_06b_base.safetensors", "models/text_encoders",
         "https://cnb.cool/ai-models/circlestone-labs/Anima/-/lfs/cd2a512003e2f9f3cd3c32a9c3573f820bb28c940f73c57b1ddaa983d9223eba"),
        ("ganima-base-v1.0.safetensors", "models/diffusion_models",
         "https://cnb.cool/ai-models/circlestone-labs/Anima/-/lfs/bd43b7cffe1ed1153d9c41e7beb2f18cb1273eafbaa3af3edd6a173dc90a006e"),
        ("anima-base-v1.0.safetensors", "models/diffusion_models",
         "https://cnb.cool/bailaiowo/anima/-/lfs/bd43b7cffe1ed1153d9c41e7beb2f18cb1273eafbaa3af3edd6a173dc90a006e"),
        ("10Eros_v1-fp8mixed_learned.safetensors", "models/checkpoints",
         "https://cnb.cool/ai-models/TenStrip/LTX2.3-10Eros/-/lfs/5c00038d4f1527e9842a832eb35192990de410ed2dd722c70aaf0f23cb3c9fd6?name=10Eros_v1-fp8mixed_learned.safetensors"),
        ("ltx-2.3-spatial-upscaler-x2-1.1.safetensors", "models/upscale_models",
         "https://cnb.cool/ai-models/Lightricks/LTX-2.3/-/lfs/5f416311fa8172b65af67530758964708d29a317b830d689a51143b7f91913ed?name=ltx-2.3-spatial-upscaler-x2-1.1.safetensors"),
        ("ltx-2.3-22b-distilled-lora-384.safetensors", "models/loras",
         "https://cnb.cool/ai-models/Lightricks/LTX-2.3/-/lfs/f5d4953f3386197a4b4f5abdb17616ff256171e8075c111d6e7d2dfa6e823b3a?name=ltx-2.3-22b-distilled-lora-384-1.1.safetensors"),
        ("gemma_3_12B_it_fpmixed.safetensors", "models/text_encoders",
         "https://cnb.cool/ai-models/Comfy-Org/ltx-2/-/lfs/82457a446f1636422689b15fe4762e71c5d1d11fdc02ac9cd2d8c4acec833e52"),
    ]
}

// ========== install_custom_node ==========
#[tauri::command]
pub async fn install_custom_node(
    app: AppHandle, node_url: String, comfy_dir: Option<String>,
) -> Result<(), String> {
    let dir = comfy_dir.unwrap_or_else(get_default_comfy_dir);
    let cn_dir = std::path::Path::new(&dir).join("custom_nodes");
    if !cn_dir.exists() { return Err("custom_nodes 目录不存在，请先部署 ComfyUI".to_string()); }
    let repo_name = node_url.split('/').last().unwrap_or("node").trim_end_matches(".git");
    let cn_str = cn_dir.to_str().ok_or("Invalid path")?;
    let node_path = cn_dir.join(repo_name);
    emit_progress(&app, 1, 1, "running", &format!("安装中: {}...", repo_name));
    if node_path.exists() {
        let _ = run_cmd("git", &["pull"], Some(node_path.to_str().unwrap())).await;
        emit_progress(&app, 1, 1, "success", &format!("更新完成: {}", repo_name));
    } else {
        run_cmd("git", &["clone", &node_url, repo_name], Some(cn_str)).await?;
        emit_progress(&app, 1, 1, "success", &format!("安装完成: {}", repo_name));
    }
    Ok(())
}

// ========== check_comfyui_status ==========
#[tauri::command]
pub async fn check_comfyui_status(url: Option<String>) -> Result<serde_json::Value, String> {
    // 保留 127.0.0.1:8188 作为最终兜底（前端正常流程都会传入 settings.comfyUrl）
    let u = url.unwrap_or_else(|| "http://127.0.0.1:8188".to_string());
    match reqwest::get(format!("{}/system_stats", &u)).await {
        Ok(resp) => {
            if resp.status().is_success() {
                Ok(serde_json::json!({ "online": true, "url": u, "system_stats": resp.json::<serde_json::Value>().await.unwrap_or_default() }))
            } else {
                Ok(serde_json::json!({ "online": false, "url": u, "error": format!("HTTP {}", resp.status()) }))
            }
        }
        Err(e) => Ok(serde_json::json!({ "online": false, "url": u, "error": e.to_string() }))
    }
}

// ========== check_environment ==========
/// Unified environment check: is ComfyUI online? What models/nodes are available?
/// Used by the onboarding wizard to determine what needs to be downloaded/installed.
#[tauri::command]
pub async fn check_environment(url: Option<String>) -> Result<serde_json::Value, String> {
    let comfy_url = url.unwrap_or_else(|| "http://127.0.0.1:8188".to_string());
    let base = comfy_url.trim_end_matches('/');

    // 1. Check if ComfyUI is online
    let status = check_comfyui_status(Some(comfy_url.clone())).await?;
    let online = status["online"].as_bool().unwrap_or(false);
    if !online {
        return Ok(serde_json::json!({
            "online": false,
            "url": comfy_url,
            "checkpoints": [],
            "lora_count": 0,
            "missing_nodes": [],
            "installed_nodes": [],
            "error": status.get("error").cloned().unwrap_or_default(),
        }));
    }

    // 2. Fetch available models
    let models = fetch_comfy_models(Some(comfy_url.clone())).await?;
    let checkpoints: Vec<String> = models["checkpoints"]
        .as_array()
        .map(|a| a.iter().filter_map(|v| v.as_str().map(String::from)).collect())
        .unwrap_or_default();
    let lora_count = models["loras"]
        .as_array()
        .map(|a| a.len())
        .unwrap_or(0);
    let vaes: Vec<String> = models["vaes"]
        .as_array()
        .map(|a| a.iter().filter_map(|v| v.as_str().map(String::from)).collect())
        .unwrap_or_default();
    let clips: Vec<String> = models["clips"]
        .as_array()
        .map(|a| a.iter().filter_map(|v| v.as_str().map(String::from)).collect())
        .unwrap_or_default();

    // The default Anima workflow needs these specific model files. Check each one against
    // what ComfyUI actually reports as available, so we can tell the user exactly what's
    // missing instead of a generic "0 checkpoints" message.
    let required_models = [
        ("anima-base-v1.0.safetensors", &checkpoints, "diffusion_models"),
        ("qwen_image_vae.safetensors", &vaes, "vae"),
        ("qwen_3_06b_base.safetensors", &clips, "text_encoders"),
    ];
    let missing_models: Vec<String> = required_models
        .iter()
        .filter(|(name, avail, _)| !avail.iter().any(|a| a == name))
        .map(|(name, _, dir)| format!("{} (models/{}/)", name, dir))
        .collect();

    // 3. Check custom nodes — we can't directly list custom_nodes via the API (no standard endpoint),
    //    but we can infer which critical nodes are available by checking object_info for their class_type.
    //    The Anima workflow needs: Power Lora Loader (rgthree), Simple String (pysssss), SDXLEmptyLatentSizePicker+ (inspire)
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build().map_err(|e| format!("{}", e))?;

    let required_nodes = [
        ("Power Lora Loader (rgthree)", "rgthree-comfy"),
        ("SDXLEmptyLatentSizePicker+", "ComfyUI-Inspire-Pack"),
    ];

    let mut installed_nodes = Vec::new();
    let mut missing_nodes = Vec::new();

    for (class_type, node_name) in &required_nodes {
        let check_url = format!("{}/object_info/{}", base,
            class_type.replace(" ", "%20").replace("(", "%28").replace(")", "%29").replace("+", "%2B"));
        let exists = match client.get(&check_url).send().await {
            Ok(r) => {
                if r.status().is_success() {
                    // If the response contains the class_type as a key, the node is installed
                    match r.json::<serde_json::Value>().await {
                        Ok(j) => j.get(*class_type).is_some(),
                        Err(_) => false,
                    }
                } else { false }
            }
            Err(_) => false,
        };
        if exists {
            installed_nodes.push(*node_name);
        } else {
            missing_nodes.push(*node_name);
        }
    }

    // Check for pysssss Simple String node
    let ss_url = format!("{}/object_info/Simple%20String", base);
    let has_simple_string = match client.get(&ss_url).send().await {
        Ok(r) if r.status().is_success() => {
            match r.json::<serde_json::Value>().await {
                Ok(j) => j.get("Simple String").is_some() || j.get("SimpleString").is_some(),
                Err(_) => false,
            }
        }
        _ => false,
    };
    if has_simple_string {
        installed_nodes.push("pysssss (Simple String)");
    } else {
        missing_nodes.push("pysssss (Simple String)");
    }

    Ok(serde_json::json!({
        "online": true,
        "url": comfy_url,
        "checkpoints": checkpoints,
        "lora_count": lora_count,
        "missing_nodes": missing_nodes,
        "installed_nodes": installed_nodes,
        "missing_models": missing_models,
    }))
}

// ========== fetch_comfy_models ==========
#[tauri::command]
pub async fn fetch_comfy_models(url: Option<String>) -> Result<serde_json::Value, String> {
    let base = url.unwrap_or_else(|| "http://127.0.0.1:8188".to_string())
        .trim_end_matches('/').to_string();
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build().map_err(|e| format!("{}", e))?;

    let nodes = ["UNETLoader","CheckpointLoaderSimple","CheckpointLoader","LoraLoader","Power Lora Loader (rgthree)","VAELoader","CLIPLoader"];
    let mut checkpoints = Vec::new();
    let mut loras = Vec::new();
    let mut vaes = Vec::new();
    let mut clips = Vec::new();

    for node in &nodes {
        let u = format!("{}/object_info/{}", base, node.replace(" ", "%20").replace("(", "%28").replace(")", "%29"));
        match client.get(&u).send().await {
            Ok(r) if r.status().is_success() => {
                if let Ok(j) = r.json::<serde_json::Value>().await {
                    if let Some(nd) = j.get(node) {
                        let inputs = nd["input"]["required"].as_object()
                            .or_else(|| nd["input"]["optional"].as_object());
                        if let Some(inputs) = inputs {
                            for (k, v) in inputs {
                                let kl = k.to_lowercase();
                                if let Some(arr) = v.as_array().and_then(|a| a.first()?.as_array()) {
                                    let strs: Vec<String> = arr.iter().filter_map(|x| x.as_str().map(String::from)).collect();
                                    if kl.contains("lora") || kl.contains("lora_name") || node.to_lowercase().contains("lora") {
                                        loras.extend(strs);
                                    } else if kl.contains("unet") || kl.contains("ckpt") || kl.contains("model") {
                                        checkpoints.extend(strs);
                                    } else if kl.contains("vae") {
                                        vaes.extend(strs);
                                    } else if kl.contains("clip") {
                                        clips.extend(strs);
                                    }
                                }
                            }
                        }
                    }
                }
            }
            Ok(r) => { log::warn!("[fetch_models] {} HTTP {}", node, r.status()); }
            Err(e) => { log::error!("[fetch_models] {} failed: {}", node, e); return Err(format!("无法连接 ComfyUI: {}", e)); }
        }
    }
    checkpoints.sort(); checkpoints.dedup();
    loras.sort(); loras.dedup();
    vaes.sort(); vaes.dedup();
    clips.sort(); clips.dedup();
    Ok(serde_json::json!({ "checkpoints": checkpoints, "loras": loras, "vaes": vaes, "clips": clips }))
}

// ========== interrupt_comfy ==========
#[tauri::command]
pub async fn interrupt_comfy(url: Option<String>) -> Result<bool, String> {
    let base = url.unwrap_or_else(|| "http://127.0.0.1:8188".to_string())
        .trim_end_matches('/').to_string();
    let client = reqwest::Client::new();
    match client.post(format!("{}/interrupt", base)).send().await {
        Ok(r) if r.status().is_success() => Ok(true),
        Ok(r) => Err(format!("HTTP {}", r.status())),
        Err(e) => Err(format!("请求失败: {}", e)),
    }
}

// ========== download_model_file (streaming with progress) ==========
#[tauri::command]
pub async fn download_model_file(
    app: AppHandle,
    url: String,
    dest_path: String,
    model_name: String,
) -> Result<String, String> {
    if let Some(parent) = std::path::Path::new(&dest_path).parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let client = reqwest::Client::new();
    let resp = client.get(&url).send().await.map_err(|e| format!("请求失败: {}", e))?;
    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status()));
    }

    let total = resp.content_length().unwrap_or(0);
    let mut downloaded: u64 = 0;
    let mut file = std::fs::File::create(&dest_path).map_err(|e| e.to_string())?;
    let mut stream = resp.bytes_stream();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Stream error: {}", e))?;
        file.write_all(&chunk).map_err(|e| e.to_string())?;
        downloaded += chunk.len() as u64;

        if total > 0 {
            let pct = (downloaded as f64 / total as f64 * 100.0) as u32;
            let mb = downloaded as f64 / 1048576.0;
            let total_mb = total as f64 / 1048576.0;
            let _ = app.emit("model-download-progress", serde_json::json!({
                "name": model_name,
                "downloaded": downloaded,
                "total": total,
                "percent": pct,
                "status": "downloading",
                "mb": format!("{:.1} / {:.1} MB", mb, total_mb)
            }));
        }
    }

    let _ = app.emit("model-download-progress", serde_json::json!({
        "name": model_name,
        "downloaded": downloaded,
        "total": total,
        "percent": 100,
        "status": "done",
        "mb": format!("{:.1} / {:.1} MB", downloaded as f64 / 1048576.0, total as f64 / 1048576.0)
    }));

    Ok(dest_path)
}

// ========== call_llm_proxy (HTTP proxy for webview CORS bypass) ==========
/// `run_id` — 唯一标识本次请求。前端 stop 时调用 cancel_llm_run(run_id) 设置取消标志。
/// 后端在流读取循环中检查该标志，收到取消立即中断，避免"用户点了停止但 token 继续烧"。
use std::collections::HashMap;
use std::sync::OnceLock;

static CANCEL_FLAGS: OnceLock<std::sync::Mutex<HashMap<String, bool>>> = OnceLock::new();

fn get_cancel_flags() -> &'static std::sync::Mutex<HashMap<String, bool>> {
    CANCEL_FLAGS.get_or_init(|| std::sync::Mutex::new(HashMap::new()))
}

#[tauri::command]
pub async fn cancel_llm_run(run_id: String) -> Result<(), String> {
    let mut flags = get_cancel_flags().lock().map_err(|e| e.to_string())?;
    flags.insert(run_id, true);
    Ok(())
}

#[tauri::command]
pub async fn call_llm_proxy(
    api_url: String,
    api_key: String,
    body_json: String,
    on_chunk: tauri::ipc::Channel<String>,
    run_id: Option<String>,
) -> Result<(), String> {
    log::info!("[LLM Proxy] body_json length: {} chars / {} bytes", body_json.len(), body_json.len());

    // 发送前校验 body_json 是否为合法 JSON — 如果不合法，精确定位错误位置
    if let Err(e) = serde_json::from_str::<serde_json::Value>(&body_json) {
        // 提取错误位置（serde_json 错误包含 byte offset）
        let err_str = e.to_string();
        log::error!("[LLM Proxy] body_json is INVALID JSON: {}", err_str);
        // 打印错误位置附近的内容（字符形式，便于排查）
        // serde_json 错误格式: "invalid type: ... at line X column Y (char Z)"
        // 或者 "invalid escaped character in string: ... at line X column Y"
        // 尝试提取 char 位置
        if let Some(pos) = err_str.rfind("char ") {
            let pos_str = &err_str[pos+5..].trim_end_matches(')');
            if let Ok(byte_pos) = pos_str.parse::<usize>() {
                let start = byte_pos.saturating_sub(50);
                let end = std::cmp::min(byte_pos + 50, body_json.len());
                log::error!("[LLM Proxy] Invalid JSON at byte {}. Context: {:?}", byte_pos, &body_json[start..end]);
                log::error!("[LLM Proxy] Char at error pos: {:?} (bytes: {:?})", &body_json[byte_pos..std::cmp::min(byte_pos+10, body_json.len())], &body_json.as_bytes()[byte_pos..std::cmp::min(byte_pos+10, body_json.len())]);
            }
        } else {
            // 没有 char 位置信息，打印 line/column
            let preview = if body_json.len() > 300 { &body_json[..300] } else { &body_json };
            log::error!("[LLM Proxy] body start: {:?}", preview);
        }
    }

    let client = reqwest::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("Client build failed: {}", e))?;

    // 注册取消标志（如果提供了 run_id）
    let rid = run_id.unwrap_or_default();
    if !rid.is_empty() {
        let mut flags = get_cancel_flags().lock().map_err(|e| e.to_string())?;
        flags.insert(rid.clone(), false);
    }
    let is_cancelled = || -> bool {
        if rid.is_empty() { return false; }
        let flags = get_cancel_flags().lock();
        match flags {
            Ok(f) => *f.get(&rid).unwrap_or(&false),
            Err(_) => false,
        }
    };

    const MAX_ATTEMPTS: usize = 3;
    let mut last_err: Option<String> = None;
    let mut resp: Option<reqwest::Response> = None;

    for attempt in 1..=MAX_ATTEMPTS {
        let body_bytes = body_json.clone().into_bytes();
        let body_len = body_bytes.len();
        let send_result = client
            .post(&api_url)
            .header("Content-Type", "application/json")
            .header("Authorization", format!("Bearer {}", api_key))
            .header("Content-Length", body_len.to_string())
            .body(body_bytes)
            .send()
            .await;

        match send_result {
            Ok(r) => {
                let status = r.status().as_u16();
                if status >= 500 {
                    let body_text = r.text().await.unwrap_or_default();
                    let snippet = if body_text.len() > 300 { &body_text[..300] } else { &body_text };
                    last_err = Some(format!("API {} HTTP {}: {}", api_url, status, snippet));
                    log::warn!("[LLM Proxy] attempt {}/{} got HTTP {}, will retry", attempt, MAX_ATTEMPTS, status);
                } else if status >= 400 {
                    let body_text = r.text().await.unwrap_or_default();
                    let snippet = if body_text.len() > 300 { &body_text[..300] } else { &body_text };
                    log::error!("[LLM Proxy] HTTP {} error. Sent body: {} chars. Response: {}", status, body_json.len(), snippet);
                    // 打印 body 中可能出问题的位置（invalid escaped character 通常在 byte 200 附近）
                    let preview_start = if body_json.len() > 250 { 150 } else { 0 };
                    let preview_end = std::cmp::min(preview_start + 200, body_json.len());
                    log::error!("[LLM Proxy] body around pos 200: bytes[{}..{}] = {:?}", preview_start, preview_end, &body_json.as_bytes()[preview_start..preview_end]);
                    return Err(format!("API {} HTTP {}: {}", api_url, status, snippet));
                } else {
                    resp = Some(r);
                    break;
                }
            }
            Err(e) => {
                let is_retryable = e.is_connect() || e.is_timeout();
                let msg = format!("API {}: {}", api_url, e);
                if !is_retryable || attempt == MAX_ATTEMPTS {
                    return Err(msg);
                }
                last_err = Some(msg);
                log::warn!("[LLM Proxy] attempt {}/{} network error ({}), will retry", attempt, MAX_ATTEMPTS, e);
            }
        }

        if attempt < MAX_ATTEMPTS {
            let backoff = std::time::Duration::from_secs(1u64 << (attempt - 1));
            log::info!("[LLM Proxy] retrying in {:?}", backoff);
            tokio::time::sleep(backoff).await;
        }
    }

    let resp = resp.ok_or_else(|| last_err.unwrap_or_else(|| "LLM proxy: all attempts failed".to_string()))?;

    // 检查响应类型 — 某些 API 在出错时返回非流式 JSON 而非 SSE，
    // 直接用 bytes_stream 读取会报 "error decoding response body"
    let content_type = resp.headers().get("content-type").and_then(|v| v.to_str().ok()).unwrap_or("").to_string();
    if !content_type.contains("text/event-stream") && !content_type.contains("stream") {
        // 非 SSE 响应 — 可能是 API 错误（如不支持 image_url 的 400 错误）
        let body_text = resp.text().await.map_err(|e| format!("Failed to read response: {}", e))?;
        let snippet = if body_text.len() > 500 { &body_text[..500] } else { &body_text };
        // 把响应体作为单行 SSE 发回前端，让前端的错误处理逻辑接管
        let _ = on_chunk.send(format!("data: {}", snippet));
        let _ = on_chunk.send("data: [DONE]".to_string());
        return Ok(());
    }

    let mut stream = resp.bytes_stream();
    let mut buffer = String::new();
    while let Some(chunk) = stream.next().await {
        // 用户点了停止 → 立即中断流读取，不再消耗后续 token
        if is_cancelled() {
            log::info!("[LLM Proxy] cancelled by user (run_id={}), aborting stream", rid);
            break;
        }
        let chunk = chunk.map_err(|e| format!("Stream error: {}", e))?;
        buffer.push_str(&String::from_utf8_lossy(&chunk));
        while let Some(nl) = buffer.find('\n') {
            let line: String = buffer[..=nl].to_string();
            let _ = on_chunk.send(line);
            buffer = buffer[nl + 1..].to_string();
        }
    }
    if !buffer.trim().is_empty() {
        let _ = on_chunk.send(buffer);
    }
    let _ = on_chunk.send("data: [DONE]".to_string());
    // 清理取消标志
    if !rid.is_empty() {
        if let Ok(mut flags) = get_cancel_flags().lock() {
            flags.remove(&rid);
        }
    }
    Ok(())
}

// ========== check_file_exists ==========
#[tauri::command]
pub fn check_file_exists(path: String) -> bool {
    std::path::Path::new(&path).exists()
}
