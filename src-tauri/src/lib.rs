mod db;
mod commands;

use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::Mutex;

use db::connection::Database;

pub struct AppState {
    pub db: Arc<Mutex<Database>>,
    pub app_data_dir: PathBuf,
}

impl AppState {
    pub fn new(app_data_dir: PathBuf) -> Result<Self, String> {
        let db = Database::open(&app_data_dir).map_err(|e| format!("数据库初始化失败: {}", e))?;
        Ok(Self {
            db: Arc::new(Mutex::new(db)),
            app_data_dir,
        })
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Tauri app data dir will be set by Tauri automatically
    let app_data_dir = {
        let mut dir = dirs_next().unwrap_or_else(|| PathBuf::from("."));
        dir.push("prompt-muse");
        dir
    };
    // Ensure dir exists
    std::fs::create_dir_all(&app_data_dir).ok();

    let state = AppState::new(app_data_dir).expect("Failed to initialize app state");

    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            commands::greet,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn dirs_next() -> Option<PathBuf> {
    // Simple cross-platform data directory resolution
    #[cfg(target_os = "windows")]
    {
        std::env::var("APPDATA").ok().map(PathBuf::from)
    }
    #[cfg(target_os = "macos")]
    {
        std::env::var("HOME").ok().map(|h| PathBuf::from(h).join("Library/Application Support"))
    }
    #[cfg(target_os = "linux")]
    {
        std::env::var("XDG_DATA_HOME")
            .ok()
            .map(PathBuf::from)
            .or_else(|| std::env::var("HOME").ok().map(|h| PathBuf::from(h).join(".local/share")))
    }
}
