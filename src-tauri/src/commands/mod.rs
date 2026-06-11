pub mod prompts;
pub mod workflows;
pub mod history;
pub mod files;

#[tauri::command]
pub fn greet(name: &str) -> String {
    format!("Hello, {}! Prompt Muse is ready.", name)
}
