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
pub mod picencrypt;
pub mod prompts;
pub mod styles;
pub mod workflows;

#[tauri::command]
pub fn greet(name: &str) -> String {
    format!("Hello, {}! Prompt Muse is ready.", name)
}

#[tauri::command]
pub async fn fetch_llm_models(provider: String, base_url: String, api_key: Option<String>) -> Result<Vec<String>, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;

    match provider.as_str() {
        "ollama" => {
            // Ollama: GET {baseUrl}/api/tags  →  models[].name
            let url = format!("{}/api/tags", base_url.trim_end_matches('/')
                .trim_end_matches("/v1"));
            let resp = client.get(&url).send().await.map_err(|e| e.to_string())?;
            let text = resp.text().await.map_err(|e| e.to_string())?;
            #[derive(serde::Deserialize)]
            struct OllamaResp { models: Vec<OllamaModel> }
            #[derive(serde::Deserialize)]
            struct OllamaModel { name: String }
            let parsed: OllamaResp = serde_json::from_str(&text).map_err(|e| e.to_string())?;
            Ok(parsed.models.into_iter().map(|m| m.name).collect())
        }
        _ => {
            // OpenAI-compatible (OpenAI, Agnes, etc.): GET {baseUrl}/models  →  data[].id
            let base = base_url.trim_end_matches('/');
            let url = format!("{}/models", base);
            let mut req = client.get(&url);
            if let Some(key) = &api_key {
                req = req.header("Authorization", format!("Bearer {}", key));
            }
            let resp = req.send().await.map_err(|e| e.to_string())?;
            if !resp.status().is_success() {
                let status = resp.status();
                let body = resp.text().await.unwrap_or_default();
                return Err(format!("HTTP {}: {}", status, body.chars().take(200).collect::<String>()));
            }
            let text = resp.text().await.map_err(|e| e.to_string())?;
            #[derive(serde::Deserialize)]
            struct OpenaiResp { data: Vec<OpenaiModel> }
            #[derive(serde::Deserialize)]
            struct OpenaiModel { id: String }
            let parsed: OpenaiResp = serde_json::from_str(&text).map_err(|e| e.to_string())?;
            Ok(parsed.data.into_iter().map(|m| m.id).collect())
        }
    }
}
