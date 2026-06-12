use tauri::State;
use crate::AppState;
use std::fs;
use std::path::PathBuf;
use uuid::Uuid;
use base64::{Engine as _, engine::general_purpose};

#[tauri::command]
pub async fn save_base64_image(state: State<'_, AppState>, base64_data: String) -> Result<String, String> {
    let uploads_dir = state.app_data_dir.join("uploads");
    if !uploads_dir.exists() {
        fs::create_dir_all(&uploads_dir).map_err(|e| e.to_string())?;
    }

    // Strip data URI scheme if present (e.g., "data:image/png;base64,")
    let b64_str = if let Some(idx) = base64_data.find(',') {
        &base64_data[idx + 1..]
    } else {
        &base64_data
    };

    let decoded = general_purpose::STANDARD.decode(b64_str).map_err(|e| e.to_string())?;
    
    let file_name = format!("{}.png", Uuid::new_v4());
    let file_path = uploads_dir.join(&file_name);
    
    fs::write(&file_path, decoded).map_err(|e| e.to_string())?;
    
    Ok(file_path.to_string_lossy().into_owned())
}

#[tauri::command]
pub async fn read_image_base64(path: String) -> Result<String, String> {
    let data = fs::read(&path).map_err(|e| e.to_string())?;
    let b64 = general_purpose::STANDARD.encode(&data);
    
    // Simple extension check
    let ext = std::path::Path::new(&path)
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("png");
        
    let mime_type = match ext.to_lowercase().as_str() {
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "gif" => "image/gif",
        _ => "image/png",
    };
    
    Ok(format!("data:{};base64,{}", mime_type, b64))
}

#[tauri::command]
pub async fn read_text_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn write_bytes_to_file(path: String, data: Vec<u8>) -> Result<(), String> {
    fs::write(&path, data).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn read_file_as_bytes(path: String) -> Result<Vec<u8>, String> {
    fs::read(&path).map_err(|e| e.to_string())
}
