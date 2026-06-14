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

#[tauri::command]
pub async fn export_image_to_downloads(app: AppHandle, url: String) -> Result<String, String> {
    let download_dir = app.path().download_dir().map_err(|e| format!("Failed to get download dir: {}", e))?;
    
    let timestamp = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis();
    let dest_path = download_dir.join(format!("eishougi_{}.png", timestamp));

    if url.starts_with("http") {
        let response = reqwest::get(&url).await.map_err(|e| e.to_string())?;
        let bytes = response.bytes().await.map_err(|e| e.to_string())?;
        fs::write(&dest_path, bytes).map_err(|e| e.to_string())?;
    } else if url.starts_with("data:") {
        return Err("Data URIs are not supported for export via backend".to_string());
    } else {
        // Local path
        #[cfg(target_os = "windows")]
        let mut source_path = url.replace("asset://localhost/", "").replace("%20", " ");
        
        #[cfg(not(target_os = "windows"))]
        let mut source_path = url.replace("asset://localhost", "").replace("%20", " ");
        
        // Handle tauri convertFileSrc path formatting
        if source_path.starts_with("asset://") {
            source_path = source_path.replace("asset://", "");
        }
        
        let path = PathBuf::from(&source_path);
        fs::copy(&path, &dest_path).map_err(|e| format!("Failed to copy from {:?} to {:?}: {}", path, dest_path, e))?;
    }
    
    Ok(dest_path.to_string_lossy().to_string())
}
