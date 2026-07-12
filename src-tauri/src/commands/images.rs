use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager, State};

/// Download a ComfyUI `/view?...` image into the app's uploads dir and return the absolute path.
///
/// `app_data_dir` MUST be the canonical app data dir (`state.app_data_dir`, which on Android is the
/// hardcoded `/data/data/<pkg>/files`). It is passed in explicitly rather than read via
/// `app.path().app_data_dir()` because that Tauri runtime API depends on the JNI/ndk_context being
/// initialized, which is unreliable on Android worker threads — using it caused downloads to fail
/// silently there, dropping generated images out of history and the completion toast.
pub async fn download_comfyui_image(app_data_dir: PathBuf, url: String) -> Result<String, String> {
    // Extract original filename from ComfyUI URL to preserve correct extension.
    // Video workflows produce .mp4/.webm files, image workflows produce .png/.jpg;
    // using the original filename prevents videos being saved as .png.
    let original_name = url
        .split("filename=")
        .nth(1)
        .and_then(|rest| rest.split('&').next())
        .filter(|s| !s.is_empty())
        .unwrap_or("output.png");
    let safe_name = original_name.replace(['/', '\\', ':', '*', '?', '"', '<', '>', '|'], "_");
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis();
    // gen_ prefix for traceability, timestamp for uniqueness, original extension preserved
    let filename = format!("gen_{}_{}", timestamp, safe_name);

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

/// Sanitize a user-supplied subfolder name into a single safe path component.
/// Strips path separators, drive letters, and other characters that are illegal in Windows/Mac/Linux
/// directory names, so it can never escape the parent Pictures/Downloads root.
fn sanitize_folder(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            c if c.is_control() => '_',
            c => c,
        })
        .collect();
    let trimmed = cleaned.trim().trim_matches('.');
    if trimmed.is_empty() {
        "Eishougi".to_string()
    } else {
        trimmed.to_string()
    }
}

#[tauri::command]
pub async fn export_image_to_downloads(
    app: AppHandle,
    state: State<'_, crate::AppState>,
    url: String,
    save_folder: Option<String>,
) -> Result<String, String> {
    let folder = sanitize_folder(save_folder.as_deref().unwrap_or("Eishougi"));

    #[cfg(target_os = "android")]
    {
        use std::time::{SystemTime, UNIX_EPOCH};
        let _ = &app; // app currently unused on Android; kept for signature stability.
        // Use the canonical state dir (hardcoded on Android) instead of app.path().app_data_dir(),
        // which is unreliable on Android worker/foreground threads (see download_comfyui_image).
        let tmp_dir = state.app_data_dir.join("tmp");
        if !tmp_dir.exists() {
            std::fs::create_dir_all(&tmp_dir).map_err(|e| e.to_string())?;
        }
        let timestamp = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis();
        let file_name = format!("eishougi_{}.png", timestamp);
        let dest_path = tmp_dir.join(&file_name);

        write_image_bytes(&url, &dest_path).await?;

        // Pass the sanitized subfolder so the Kotlin side writes to Pictures/<folder>/ instead of
        // the hardcoded "Eishougi".
        let res = crate::jvm_plugin::save_image_to_gallery(
            &dest_path.to_string_lossy(),
            &file_name,
            &folder,
        );
        let _ = std::fs::remove_file(&dest_path);

        return match res {
            Ok(msg) if msg.starts_with("Error") => Err(msg),
            Ok(msg) => Ok(msg),
            Err(e) => Err(e),
        };
    }

    #[cfg(not(target_os = "android"))]
    {
        use std::time::{SystemTime, UNIX_EPOCH};
        let _ = &state; // state only used for the Android tmp dir; desktop uses the OS download dir.
        let download_dir = app
            .path()
            .download_dir()
            .map_err(|e| format!("Failed to get download dir: {}", e))?;

        let target_dir = download_dir.join(&folder).join("photo");
        if !target_dir.exists() {
            fs::create_dir_all(&target_dir).map_err(|e| e.to_string())?;
        }

        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_millis();
        let dest_path = target_dir.join(format!("eishougi_{}.png", timestamp));

        write_image_bytes(&url, &dest_path).await?;

        Ok(dest_path.to_string_lossy().to_string())
    }
}

/// Decode any supported URL/path scheme into image bytes and write to `dest`.
/// Supports: asset://, asset.localhost, http(s)://, data: (base64), and raw filesystem paths.
async fn write_image_bytes(url: &str, dest: &std::path::Path) -> Result<(), String> {
    // Strip Tauri asset:// protocol variants (both localhost forms on desktop + mobile)
    let mut source_path = url.to_string();
    let mut is_local = false;
    for prefix in [
        "asset://localhost/",
        "asset://localhost",
        "http://asset.localhost/",
        "https://asset.localhost/",
        "asset://",
    ] {
        if source_path.starts_with(prefix) {
            source_path = source_path.replace(prefix, "");
            is_local = true;
            break;
        }
    }

    if is_local {
        source_path = percent_encoding::percent_decode_str(&source_path)
            .decode_utf8_lossy()
            .to_string();

        #[cfg(target_os = "windows")]
        if source_path.starts_with('/') {
            source_path = source_path[1..].to_string();
        }

        let path = std::path::PathBuf::from(&source_path);
        std::fs::copy(&path, dest)
            .map_err(|e| format!("Failed to copy from {:?} to {:?}: {}", path, dest, e))?;
        return Ok(());
    }

    if url.starts_with("http://") || url.starts_with("https://") {
        let response = reqwest::get(url).await.map_err(|e| e.to_string())?;
        let bytes = response.bytes().await.map_err(|e| e.to_string())?;
        std::fs::write(dest, bytes).map_err(|e| e.to_string())?;
        return Ok(());
    }

    if url.starts_with("data:") {
        let bytes = decode_data_uri(url)?;
        std::fs::write(dest, bytes).map_err(|e| e.to_string())?;
        return Ok(());
    }

    // Fallback: treat as raw filesystem path
    let path = std::path::PathBuf::from(url);
    std::fs::copy(&path, dest)
        .map_err(|e| format!("Failed to copy from {:?} to {:?}: {}", path, dest, e))?;
    Ok(())
}

/// Decode a `data:[<mediatype>][;base64],<data>` URI into raw bytes.
/// Supports both base64 and URL-encoded payloads.
fn decode_data_uri(uri: &str) -> Result<Vec<u8>, String> {
    use base64::{engine::general_purpose, Engine as _};

    let comma = uri.find(',').ok_or("Invalid data URI: no comma")?;
    let header = &uri[..comma];
    let payload = &uri[comma + 1..];

    if header.contains("base64") {
        general_purpose::STANDARD
            .decode(payload)
            .map_err(|e| format!("Invalid base64 in data URI: {}", e))
    } else {
        // URL-encoded payload (percent encoded) - decode to UTF-8 bytes
        let decoded = percent_encoding::percent_decode_str(payload)
            .decode_utf8_lossy()
            .into_owned();
        Ok(decoded.into_bytes())
    }
}
