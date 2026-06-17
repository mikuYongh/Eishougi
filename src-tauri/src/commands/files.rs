use crate::AppState;
use base64::{engine::general_purpose, Engine as _};
use std::fs;
use tauri::State;
use uuid::Uuid;

#[tauri::command]
pub async fn save_base64_image(
    state: State<'_, AppState>,
    base64_data: String,
) -> Result<String, String> {
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

    let decoded = general_purpose::STANDARD
        .decode(b64_str)
        .map_err(|e| e.to_string())?;

    let file_name = format!("{}.png", Uuid::new_v4());
    let file_path = uploads_dir.join(&file_name);

    fs::write(&file_path, decoded).map_err(|e| e.to_string())?;

    Ok(file_path.to_string_lossy().into_owned())
}

/// Save a base64-encoded file of any type to the uploads directory.
/// Detects extension from the data URI mime type, falling back to the provided filename hint.
/// Returns the absolute saved path.
#[tauri::command]
pub async fn save_base64_file(
    state: State<'_, AppState>,
    base64_data: String,
    original_name: Option<String>,
) -> Result<String, String> {
    let uploads_dir = state.app_data_dir.join("uploads");
    if !uploads_dir.exists() {
        fs::create_dir_all(&uploads_dir).map_err(|e| e.to_string())?;
    }

    // Split "data:<mime>;base64,<payload>" if present
    let (mime_hint, b64_str) = if let Some(idx) = base64_data.find(',') {
        let header = &base64_data[..idx];
        // extract mime between "data:" and ";base64"
        let mime = header
            .strip_prefix("data:")
            .and_then(|s| s.split(';').next())
            .unwrap_or("");
        (mime.to_string(), &base64_data[idx + 1..])
    } else {
        (String::new(), base64_data.as_str())
    };

    let decoded = general_purpose::STANDARD
        .decode(b64_str)
        .map_err(|e| e.to_string())?;

    let ext = extension_for(&original_name, &mime_hint);

    let safe_name = original_name
        .as_deref()
        .map(sanitize_filename)
        .unwrap_or_else(|| format!("file_{}", chrono::Utc::now().timestamp()));

    let file_name = format!("{}_{}.{}", safe_name, &Uuid::new_v4().to_string()[..8], ext);
    let file_path = uploads_dir.join(&file_name);

    fs::write(&file_path, &decoded).map_err(|e| e.to_string())?;

    Ok(file_path.to_string_lossy().into_owned())
}

fn extension_for(original_name: &Option<String>, mime: &str) -> String {
    // Prefer explicit extension from the original filename
    if let Some(n) = original_name {
        if let Some(ext) = std::path::Path::new(n).extension().and_then(|s| s.to_str()) {
            return ext.to_lowercase();
        }
    }
    // Fall back to mime -> ext mapping
    match mime {
        "image/png" => "png",
        "image/jpeg" => "jpg",
        "image/webp" => "webp",
        "image/gif" => "gif",
        "image/bmp" => "bmp",
        "text/plain" => "txt",
        "text/markdown" => "md",
        "application/json" => "json",
        "application/pdf" => "pdf",
        "application/zip" => "zip",
        "application/x-yaml" | "text/yaml" => "yaml",
        "text/html" => "html",
        "text/css" => "css",
        "text/javascript" | "application/javascript" => "js",
        "application/typescript" => "ts",
        "application/python" | "text/x-python" => "py",
        "application/rust" => "rs",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" => "docx",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" => "xlsx",
        _ => "bin",
    }
    .to_string()
}

/// Strip path separators and other unsafe characters so the original filename
/// can be used as part of the saved filename without escaping the uploads dir.
fn sanitize_filename(name: &str) -> String {
    let base = std::path::Path::new(name)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("file");
    base.chars()
        .map(|c| {
            if c.is_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect()
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
