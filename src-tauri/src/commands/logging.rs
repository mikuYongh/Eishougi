// 前端业务日志转发到 app.log
//
// 前端无法直接写入 app.log（浏览器 console 与 Rust log 是两个独立系统）。
// 这个命令让前端把关键错误/信息转发到 tauri_plugin_log，自动写入 app.log。
//
// level: "info" | "warn" | "error"
// prefix: 业务模块标签，例如 "ComfyHTTP" / "ComfyModel" / "Agent"
// message: 具体内容
//
// 用法示例：
//   invoke('write_log', { level: 'error', prefix: 'ComfyModel', message: '...' })

use log::{info, warn, error};

#[tauri::command]
pub fn write_log(level: String, prefix: String, message: String) {
    let line = format!("[{}] {}", prefix, message);
    match level.to_lowercase().as_str() {
        "error" => error!("{}", line),
        "warn" => warn!("{}", line),
        _ => info!("{}", line),
    }
}
