pub mod data;
pub mod favorites;
pub mod files;
pub mod history;
pub mod images;
pub mod library;
pub mod mcp;
pub mod prompts;
pub mod styles;
pub mod workflows;

#[tauri::command]
pub fn greet(name: &str) -> String {
    format!("Hello, {}! Prompt Muse is ready.", name)
}
