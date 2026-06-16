use std::fs;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

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
    let download_dir = app
        .path()
        .download_dir()
        .map_err(|e| format!("Failed to get download dir: {}", e))?;

    let target_dir = download_dir.join("Eishougi").join("photo");
    if !target_dir.exists() {
        fs::create_dir_all(&target_dir).map_err(|e| e.to_string())?;
    }

    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis();
    let dest_path = target_dir.join(format!("eishougi_{}.png", timestamp));

    let mut is_local = false;
    let mut source_path = url.clone();

    if source_path.starts_with("asset://localhost/") {
        source_path = source_path.replace("asset://localhost/", "");
        is_local = true;
    } else if source_path.starts_with("asset://localhost") {
        source_path = source_path.replace("asset://localhost", "");
        is_local = true;
    } else if source_path.starts_with("http://asset.localhost/") {
        source_path = source_path.replace("http://asset.localhost/", "");
        is_local = true;
    } else if source_path.starts_with("https://asset.localhost/") {
        source_path = source_path.replace("https://asset.localhost/", "");
        is_local = true;
    } else if source_path.starts_with("asset://") {
        source_path = source_path.replace("asset://", "");
        is_local = true;
    }

    if is_local {
        source_path = percent_encoding::percent_decode_str(&source_path).decode_utf8_lossy().to_string();
        
        #[cfg(target_os = "windows")]
        if source_path.starts_with("/") {
            source_path = source_path[1..].to_string();
        }

        let path = std::path::PathBuf::from(&source_path);
        std::fs::copy(&path, &dest_path)
            .map_err(|e| format!("Failed to copy from {:?} to {:?}: {}", path, dest_path, e))?;
    } else if url.starts_with("http") {
        let response = reqwest::get(&url).await.map_err(|e| e.to_string())?;
        let bytes = response.bytes().await.map_err(|e| e.to_string())?;
        std::fs::write(&dest_path, bytes).map_err(|e| e.to_string())?;
    } else if url.starts_with("data:") {
        return Err("Data URIs are not supported for export via backend".to_string());
    } else {
        // Fallback assuming it's a raw local path
        let path = std::path::PathBuf::from(&url);
        std::fs::copy(&path, &dest_path)
            .map_err(|e| format!("Failed to copy from {:?} to {:?}: {}", path, dest_path, e))?;
    }

    Ok(dest_path.to_string_lossy().to_string())
}
