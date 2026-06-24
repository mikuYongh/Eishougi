pub mod auto_deploy;
pub mod data;
pub mod favorites;
pub mod files;
pub mod history;
pub mod images;
pub mod library;
pub mod library_favorites;
pub mod logging;
pub mod mcp;
pub mod prompts;
pub mod styles;
pub mod workflows;

#[tauri::command]
pub fn greet(name: &str) -> String {
    format!("Hello, {}! Prompt Muse is ready.", name)
}

#[tauri::command]
pub async fn fetch_ollama_models(url: String) -> Result<String, String> {
    reqwest::get(&url)
        .await
        .map_err(|e| e.to_string())?
        .text()
        .await
        .map_err(|e| e.to_string())
}
