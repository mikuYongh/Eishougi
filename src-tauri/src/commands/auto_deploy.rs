use tauri::{AppHandle, Emitter};
use tokio::process::Command;
use std::sync::Mutex;
use once_cell::sync::Lazy;
use futures_util::StreamExt;
use std::io::Write;

static COMFY_CHILD: Lazy<Mutex<Option<tokio::process::Child>>> = Lazy::new(|| Mutex::new(None));

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

fn venv_python_path(comfy_dir: &str) -> String {
    #[cfg(target_os = "windows")]
    { format!("{}\\venv\\Scripts\\python.exe", comfy_dir) }
    #[cfg(not(target_os = "windows"))]
    { format!("{}/venv/bin/python", comfy_dir) }
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

async fn detect_nvidia() -> bool {
    matches!(run_cmd("nvidia-smi", &["--query-gpu=name", "--format=csv,noheader"], None).await,
        Ok(o) if !o.trim().is_empty())
}

async fn detect_cuda_version() -> Option<String> {
    // Get GPU compute capability to determine right CUDA version
    let caps = run_cmd("nvidia-smi", &["--query-gpu=compute_cap", "--format=csv,noheader"], None).await.ok()?;
    let cap: f64 = caps.trim().parse().ok()?;
    // RTX 50 series (CC 10.0+) needs cu128
    // RTX 30/40 series (CC 8.0+) needs cu124 or newer
    // Older GPUs need cu121
    // Fallback to cu124 for unknown
    if cap >= 12.0 { Some("cu130".to_string()) }
    else if cap >= 10.0 { Some("cu128".to_string()) }
    else if cap >= 8.0 { Some("cu124".to_string()) }
    else { Some("cu121".to_string()) }
}

fn create_run_script(comfy_dir: &str, venv_python: &str) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let bat = format!("@echo off\r\ncd /d \"{}\"\r\n\"{}\" main.py --listen 0.0.0.0 --port 8188 --enable-cors-header\r\npause\r\n", comfy_dir, venv_python);
        std::fs::write(format!("{}\\run_api.bat", comfy_dir), bat).map_err(|e| e.to_string())?;
    }
    #[cfg(not(target_os = "windows"))]
    {
        let sh = format!("#!/bin/bash\ncd '{}'\n'{}' main.py --listen 0.0.0.0 --port 8188 --enable-cors-header\n", comfy_dir, venv_python);
        std::fs::write(format!("{}/run_api.sh", comfy_dir), sh).map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn load_default_workflow() -> String {
    let paths = [
        "docs/workflows/Anima+Preview3_Txt2Img_Example.json",
        "../docs/workflows/Anima+Preview3_Txt2Img_Example.json",
        "../../docs/workflows/Anima+Preview3_Txt2Img_Example.json",
    ];
    for p in &paths {
        if let Ok(content) = std::fs::read_to_string(p) {
            return content;
        }
    }
    r#"{"last_node_id":1,"nodes":[]}"#.to_string()
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

fn extract_workflow_models(workflow_json: &str) -> Vec<String> {
    let v: serde_json::Value = match serde_json::from_str(workflow_json) { Ok(v) => v, Err(_) => return vec![] };
    let nodes = match v.get("nodes") { Some(n) => n.as_array(), None => return vec![] };
    let Some(nodes) = nodes else { return vec![] };
    let loader_types = ["VAELoader", "UNETLoader", "CLIPLoader", "CheckpointLoaderSimple",
        "LoraLoader", "ControlNetLoader", "UpscaleModelLoader"];
    let mut models = Vec::new();
    for node in nodes {
        let Some(nt) = node.get("type").and_then(|t| t.as_str()) else { continue };
        if !loader_types.contains(&nt) { continue }
        if let Some(wv) = node.get("widgets_values").and_then(|w| w.as_array()) {
            for val in wv {
                if let Some(s) = val.as_str() {
                    let s = s.trim();
                    if s.ends_with(".safetensors") || s.ends_with(".pt") || s.ends_with(".ckpt") || s.ends_with(".pth") {
                        if !models.contains(&s.to_string()) { models.push(s.to_string()); }
                    }
                }
            }
        }
        if let Some(inputs) = node.get("inputs").and_then(|i| i.as_array()) {
            for input in inputs {
                if let Some(w) = input.get("widget") {
                    if let Some(v) = w.get("value").and_then(|v| v.as_str()) {
                        let v = v.trim();
                        if (v.ends_with(".safetensors") || v.ends_with(".pt")) && !models.contains(&v.to_string()) {
                            models.push(v.to_string());
                        }
                    }
                }
            }
        }
    }
    models
}

fn generate_download_script(comfy_dir: &str, wf_models: &[String]) -> Result<(), String> {
    let known = known_model_urls();
    #[cfg(target_os = "windows")]
    {
        let mut ps = format!("# ComfyUI Model Download Script\r\n# Run in PowerShell: .\\download_models.ps1\r\n$ComfyDir = \"{}\"\r\n$ProgressPreference = 'SilentlyContinue'\r\n\r\nWrite-Host \"=== Downloading known models ===\" -ForegroundColor Cyan\r\n\r\n", comfy_dir);
        for (fname, subdir, url) in &known {
            ps.push_str(&format!("$out = \"$ComfyDir\\{}\\{}\"\r\nif (Test-Path $out) {{\r\n  Write-Host \"  SKIP: {}\" -ForegroundColor Gray\r\n}}\r\nelse {{\r\n  Write-Host \"  DOWNLOAD: {}...\" -ForegroundColor Yellow\r\n  New-Item -ItemType Directory -Force -Path \"$ComfyDir\\{}\" | Out-Null\r\n  try {{ Invoke-WebRequest -Uri \"{}\" -OutFile $out; Write-Host \"    OK\" -ForegroundColor Green }} catch {{ Write-Host \"    FAILED: $_\" -ForegroundColor Red }}\r\n}}\r\n\r\n",
                subdir, fname, fname, fname, subdir, url));
        }
        let missing: Vec<_> = wf_models.iter().filter(|m| !known.iter().any(|(n,_,_)| *n == m.as_str())).collect::<Vec<_>>();
        if !missing.is_empty() {
            ps.push_str("Write-Host \"=== Missing models (no URL) ===\" -ForegroundColor Magenta\r\n");
            for m in &missing {
                ps.push_str(&format!("Write-Host \"  NEED: {}\" -ForegroundColor Magenta\r\nWrite-Host \"    Place in: $ComfyDir\\models\\\" -ForegroundColor Gray -NoNewline\r\nWrite-Host \"{}\" -ForegroundColor Gray\r\n\r\n", m, m));
            }
        }
        std::fs::write(format!("{}\\download_models.ps1", comfy_dir), ps).map_err(|e| e.to_string())?;
    }
    #[cfg(not(target_os = "windows"))]
    {
        let mut sh = format!("#!/bin/bash\nCOMFY_DIR=\"{}\"\necho \"=== Downloading known models ===\"\n", comfy_dir);
        for (fname, subdir, url) in &known {
            sh.push_str(&format!("if [ -f \"$COMFY_DIR/{}/{}\" ]; then\n  echo \"  SKIP: {}\"\nelse\n  echo \"  DOWNLOAD: {}...\"\n  mkdir -p \"$COMFY_DIR/{}\"\n  curl -L -o \"$COMFY_DIR/{}/{}\" \"{}\" && echo \"    OK\" || echo \"    FAILED\"\nfi\n\n",
                subdir, fname, fname, fname, subdir, subdir, fname, url));
        }
        std::fs::write(format!("{}/download_models.sh", comfy_dir), sh).map_err(|e| e.to_string())?;
    }
    Ok(())
}

// ========== deploy_comfyui ==========
#[tauri::command]
pub async fn deploy_comfyui(
    app: AppHandle, target_dir: Option<String>, use_mirror: Option<bool>,
) -> Result<serde_json::Value, String> {
    let total = 10;
    let mirror = use_mirror.unwrap_or(true);
    let comfy_dir = target_dir.unwrap_or_else(get_default_comfy_dir);

    emit_progress(&app, 1, total, "running", "检查环境 (git, python)...");
    run_cmd("git", &["--version"], None).await?;
    let python_cmd = if cfg!(target_os = "windows") { "python" } else { "python3" };
    let py_ver = run_cmd(python_cmd, &["--version"], None).await?;
    emit_progress(&app, 1, total, "success", &format!("Ready: {}", py_ver.trim()));

    emit_progress(&app, 2, total, "running", "克隆 ComfyUI...");
    if std::path::Path::new(&comfy_dir).join(".git").exists() {
        let _ = run_cmd("git", &["pull"], Some(&comfy_dir)).await;
        emit_progress(&app, 2, total, "success", "已存在，已拉取最新");
    } else {
        let parent = std::path::Path::new(&comfy_dir).parent().ok_or("无效的目标路径")?.display().to_string();
        let name = std::path::Path::new(&comfy_dir).file_name().ok_or("无效的目录名")?.to_str().ok_or("UTF-8 错误")?;
        let url = if mirror { "https://ghfast.top/https://github.com/comfyanonymous/ComfyUI.git" } else { "https://github.com/comfyanonymous/ComfyUI.git" };
        std::fs::create_dir_all(&comfy_dir).map_err(|e| e.to_string())?;
        run_cmd("git", &["clone", url, name], Some(&parent)).await?;
        emit_progress(&app, 2, total, "success", "ComfyUI 克隆完成");
    }

    emit_progress(&app, 3, total, "running", "创建虚拟环境...");
    let vp = venv_python_path(&comfy_dir);
    if !std::path::Path::new(&vp).exists() {
        run_cmd(python_cmd, &["-m", "venv", "venv"], Some(&comfy_dir)).await?;
        emit_progress(&app, 3, total, "success", "虚拟环境创建完成");
    } else {
        emit_progress(&app, 3, total, "success", "虚拟环境已存在");
    }

    emit_progress(&app, 4, total, "running", "安装 PyTorch...");
    let nvidia = detect_nvidia().await;
    if nvidia {
        let cuda_ver = detect_cuda_version().await.unwrap_or_else(|| "cu124".to_string());
        emit_progress(&app, 4, total, "running", &format!("安装 CUDA PyTorch ({})...", cuda_ver));
        let index_url = format!("https://download.pytorch.org/whl/{}", cuda_ver);
        let cu_args = vec!["-m", "pip", "install", "--no-cache-dir", "torch", "torchvision", "torchaudio",
            "--index-url", index_url.as_str()];
        if run_cmd(&vp, &cu_args, Some(&comfy_dir)).await.is_err() {
            emit_progress(&app, 4, total, "running", "CUDA 安装失败，降级到 CPU 版...");
            let cpu_args = vec!["-m", "pip", "install", "--no-cache-dir", "torch", "torchvision", "torchaudio"];
            if mirror {
                run_cmd(&vp, &["-m", "pip", "install", "--no-cache-dir", "torch", "torchvision", "torchaudio",
                    "-i", "https://pypi.tuna.tsinghua.edu.cn/simple"], Some(&comfy_dir)).await?;
            } else {
                run_cmd(&vp, &cpu_args, Some(&comfy_dir)).await?;
            }
            emit_progress(&app, 4, total, "success", "CPU PyTorch 已安装 (CUDA 不可用)");
        } else {
            emit_progress(&app, 4, total, "success", "CUDA PyTorch 安装完成");
        }
    } else {
        emit_progress(&app, 4, total, "running", "Installing CPU PyTorch...");
        if mirror {
            run_cmd(&vp, &["-m", "pip", "install", "--no-cache-dir", "torch", "torchvision", "torchaudio",
                "-i", "https://pypi.tuna.tsinghua.edu.cn/simple"], Some(&comfy_dir)).await?;
        } else {
            run_cmd(&vp, &["-m", "pip", "install", "--no-cache-dir", "torch", "torchvision", "torchaudio"], Some(&comfy_dir)).await?;
        }
        emit_progress(&app, 4, total, "success", "CPU PyTorch installed");
    }

    emit_progress(&app, 5, total, "running", "安装依赖包...");
    if mirror {
        run_cmd(&vp, &["-m", "pip", "install", "-r", "requirements.txt", "-i", "https://pypi.tuna.tsinghua.edu.cn/simple"], Some(&comfy_dir)).await?;
    } else {
        run_cmd(&vp, &["-m", "pip", "install", "-r", "requirements.txt"], Some(&comfy_dir)).await?;
    }
    emit_progress(&app, 5, total, "success", "依赖包安装完成");

    emit_progress(&app, 6, total, "running", "安装自定义节点...");
    let cn_dir = std::path::Path::new(&comfy_dir).join("custom_nodes");
    std::fs::create_dir_all(&cn_dir).map_err(|e| e.to_string())?;
    let cn_str = cn_dir.to_str().ok_or("Invalid path")?;
    let nodes = known_custom_nodes();
    let node_count = nodes.len();
    for (idx, (name, url)) in nodes.iter().enumerate() {
        let node_path = cn_dir.join(name);
        emit_progress(&app, 6, total, "running", &format!("安装节点 [{}/{}]: {}...", idx + 1, node_count, name));
        if node_path.exists() {
            let _ = run_cmd("git", &["pull"], Some(node_path.to_str().unwrap())).await;
        } else {
            run_cmd("git", &["clone", url, name], Some(cn_str)).await?;
        }
        // Install node dependencies if requirements.txt exists
        let req_file = node_path.join("requirements.txt");
        if req_file.exists() {
            emit_progress(&app, 6, total, "running", &format!("  ↳ 安装 {} 的依赖...", name));
            let _ = run_cmd(&vp, &["-m", "pip", "install", "-r", "requirements.txt",
                "-i", "https://pypi.tuna.tsinghua.edu.cn/simple"], Some(node_path.to_str().unwrap())).await;
        }
    }
    emit_progress(&app, 6, total, "success", &format!("{} 个自定义节点安装完成", node_count));

    emit_progress(&app, 7, total, "running", "创建启动脚本...");
    create_run_script(&comfy_dir, &vp)?;
    emit_progress(&app, 7, total, "success", "启动脚本创建完成");

    emit_progress(&app, 8, total, "running", "创建模型目录...");
    for sub in &["checkpoints", "vae", "clip", "loras", "text_encoders", "diffusion_models", "controlnet", "upscale_models", "latent_upscale_models", "unet"] {
        let _ = std::fs::create_dir_all(std::path::Path::new(&comfy_dir).join("models").join(sub));
    }
    emit_progress(&app, 8, total, "success", "模型目录创建完成");

    emit_progress(&app, 9, total, "running", "导入默认工作流...");
    let wf_dir = std::path::Path::new(&comfy_dir).join("user").join("default").join("workflows");
    std::fs::create_dir_all(&wf_dir).map_err(|e| e.to_string())?;
    std::fs::write(wf_dir.join("Anima_Txt2Img_Example.json"), &load_default_workflow()).map_err(|e| e.to_string())?;
    emit_progress(&app, 9, total, "success", "工作流导入完成");

    emit_progress(&app, 10, total, "running", "生成模型下载指引...");
    generate_download_script(&comfy_dir, &[])?;
    let known = known_model_urls();
    let models_with_urls: Vec<serde_json::Value> = known.iter().map(|(name, subdir, url)| {
        serde_json::json!({ "name": name, "subdir": subdir, "url": url })
    }).collect();
    emit_progress(&app, 10, total, "success", "模型下载指引生成完毕");

    Ok(serde_json::json!({
        "comfy_dir": comfy_dir, "venv_python": vp, "nvidia_detected": nvidia,
        "models_needed": models_with_urls, "models_count": known.len(),
        "message": "部署完成！运行 download_models.ps1 下载模型，然后双击 run_api.bat 启动"
    }))
}

// ========== start_comfyui ==========
#[tauri::command]
pub async fn start_comfyui(
    app: AppHandle, comfy_dir: Option<String>, port: Option<u16>,
) -> Result<String, String> {
    let dir = comfy_dir.unwrap_or_else(get_default_comfy_dir);
    let p = port.unwrap_or(8188);
    {
        let mut guard = COMFY_CHILD.lock().unwrap();
        if let Some(ref mut child) = *guard {
            if let Ok(None) = child.try_wait() { return Ok(format!("http://127.0.0.1:{}", p)); }
        }
    }
    let vp = venv_python_path(&dir);
    if !std::path::Path::new(&vp).exists() { return Err(format!("未找到虚拟环境: {}。请先部署", vp)); }
    let port_s = p.to_string();
    let mut cmd = Command::new(&vp);
    cmd.args(&["main.py", "--listen", "0.0.0.0", "--port", &port_s, "--enable-cors-header"]).current_dir(&dir);
    let child = cmd.spawn().map_err(|e| format!("启动失败: {}", e))?;
    { let mut guard = COMFY_CHILD.lock().unwrap(); *guard = Some(child); }
    let url = format!("http://127.0.0.1:{}", p);
    let client = reqwest::Client::new();
    for _ in 1..=30 {
        tokio::time::sleep(std::time::Duration::from_secs(2)).await;
        if let Ok(resp) = client.get(format!("{}/system_stats", &url)).send().await {
            if resp.status().is_success() { let _ = app.emit("comfy-status", "connected"); return Ok(url); }
        }
        let mut guard = COMFY_CHILD.lock().unwrap();
        if let Some(ref mut child) = *guard { if let Ok(Some(_)) = child.try_wait() { return Err("ComfyUI 意外退出".to_string()); } }
    }
    Err(format!("ComfyUI 60秒内未响应: {}", url))
}

// ========== stop_comfyui ==========
#[tauri::command]
pub async fn stop_comfyui(app: AppHandle) -> Result<(), String> {
    let child = { let mut guard = COMFY_CHILD.lock().unwrap(); guard.take() };
    match child {
        Some(mut c) => { let _ = c.kill(); let _ = c.wait().await; let _ = app.emit("comfy-status", "disconnected"); Ok(()) }
        None => Err("ComfyUI 未运行".to_string()),
    }
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

// ========== 6. download_model_file (streaming with progress) ==========
#[tauri::command]
pub async fn download_model_file(
    app: AppHandle,
    url: String,
    dest_path: String,
    model_name: String,
) -> Result<String, String> {
    // Create parent directory
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

// ========== run_auto_deploy (legacy compat) ==========
#[tauri::command]
pub async fn run_auto_deploy(
    app: AppHandle, _api_key: Option<String>, use_mirror: Option<bool>,
) -> Result<String, String> {
    let result = deploy_comfyui(app, None, use_mirror).await?;
    Ok(result["message"].as_str().unwrap_or("部署完成").to_string())
}

// ========== call_llm_proxy (HTTP proxy for webview CORS bypass) ==========
#[tauri::command]
pub async fn call_llm_proxy(
    api_url: String,
    api_key: String,
    body_json: String,
    on_chunk: tauri::ipc::Channel<String>,
) -> Result<(), String> {
    let client = reqwest::Client::new();
    let resp = client
        .post(&api_url)
        .header("Content-Type", "application/json")
        .header("Authorization", format!("Bearer {}", api_key))
        .body(body_json)
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;
    let status = { let s = resp.status().as_u16(); s };
    if status >= 400 {
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("HTTP {}: {}", status, if body.len() > 300 { &body[..300] } else { &body }));
    }
    let mut stream = resp.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Stream error: {}", e))?;
        let text = String::from_utf8_lossy(&chunk).to_string();
        let _ = on_chunk.send(text);
    }
    let _ = on_chunk.send("data: [DONE]".to_string());
    Ok(())
}

// ========== check_file_exists ==========
#[tauri::command]
pub fn check_file_exists(path: String) -> bool {
    std::path::Path::new(&path).exists()
}
