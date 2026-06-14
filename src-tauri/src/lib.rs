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
    let app_data_dir = get_app_data_dir();
    std::fs::create_dir_all(&app_data_dir).ok();
    let state = AppState::new(app_data_dir).expect("Failed to initialize app state");

    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            commands::greet,
            commands::prompts::create_prompt,
            commands::prompts::get_prompt,
            commands::prompts::update_prompt,
            commands::prompts::delete_prompt,
            commands::prompts::list_prompts,
            commands::workflows::create_workflow,
            commands::workflows::get_workflow,
            commands::workflows::update_workflow,
            commands::workflows::delete_workflow,
            commands::workflows::list_workflows,
            commands::workflows::set_default_workflow,
            commands::history::save_generated_image,
            commands::history::get_generated_image,
            commands::history::list_generated_images,
            commands::history::delete_generated_image,
            commands::history::toggle_save_image,
            commands::files::save_base64_image,

            commands::files::read_image_base64,
            commands::files::read_text_file,
            commands::files::write_bytes_to_file,
            commands::files::read_file_as_bytes,
            commands::favorites::get_favorite_prompts,
            commands::favorites::add_favorite_prompt,
            commands::images::download_comfyui_image,
            commands::images::export_image_to_downloads,
            commands::favorites::delete_favorite_prompt,
            commands::styles::get_custom_styles,
            commands::styles::add_custom_style,
            commands::styles::delete_custom_style,
            commands::mcp::list_mcp_tools,
            commands::mcp::call_mcp_tool,
            commands::data::export_all_data,
            commands::data::import_all_data,
            commands::library::search_characters,
            commands::library::search_artists,
            commands::library::toggle_favorite_character,
            commands::library::toggle_favorite_artist,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn get_app_data_dir() -> PathBuf {
    #[cfg(target_os = "windows")]
    {
        let mut dir = std::env::var("APPDATA").ok().map(PathBuf::from).unwrap_or_else(|| PathBuf::from("."));
        dir.push("prompt-muse");
        dir
    }
    #[cfg(target_os = "macos")]
    {
        let mut dir = std::env::var("HOME").ok().map(|h| PathBuf::from(h).join("Library/Application Support")).unwrap_or_else(|| PathBuf::from("."));
        dir.push("prompt-muse");
        dir
    }
    #[cfg(target_os = "linux")]
    {
        let mut dir = std::env::var("XDG_DATA_HOME").ok().map(PathBuf::from).or_else(|| std::env::var("HOME").ok().map(|h| PathBuf::from(h).join(".local/share"))).unwrap_or_else(|| PathBuf::from("."));
        dir.push("prompt-muse");
        dir
    }
    #[cfg(target_os = "android")]
    {
        PathBuf::from("/data/data/com.promptmuse.app/files")
    }
}
