use tauri::{AppHandle, Manager};
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

#[tauri::command]
pub async fn download_comfyui_image(app: AppHandle, url: String) -> Result<String, String> {
    // Generate a unique filename
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis();
    let filename = format!("gen_{}.png", timestamp);

    // Get the uploads directory
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let uploads_dir = app_data_dir.join("uploads");

    // Ensure the uploads directory exists
    if !uploads_dir.exists() {
        fs::create_dir_all(&uploads_dir).map_err(|e| e.to_string())?;
    }

    let file_path = uploads_dir.join(&filename);

    // Download the image
    let response = reqwest::get(&url).await.map_err(|e| e.to_string())?;
    
    if !response.status().is_success() {
        return Err(format!("Failed to download image: {}", response.status()));
    }

    let bytes = response.bytes().await.map_err(|e| e.to_string())?;

    // Save to file
    fs::write(&file_path, bytes).map_err(|e| e.to_string())?;

    // Return absolute path so frontend can use convertFileSrc
    Ok(file_path.to_string_lossy().to_string())
}
