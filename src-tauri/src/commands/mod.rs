pub mod prompts;
pub mod workflows;
pub mod history;
pub mod files;
pub mod favorites;
pub mod styles;
pub mod mcp;
pub mod data;
pub mod library;

#[tauri::command]
pub fn greet(name: &str) -> String {
    format!("Hello, {}! Prompt Muse is ready.", name)
}
