use crate::AppState;
use base64::{engine::general_purpose, Engine as _};
use std::fs;
use tauri::State;
use uuid::Uuid;

#[cfg(target_os = "android")]
extern crate ndk_context;

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

/// Copy a file from a content:// URI (Android file picker) or regular path
/// to the app's internal temp directory. Returns the internal path.
/// On desktop, just returns the original path if it's already a regular file.
#[tauri::command]
pub async fn copy_to_internal(
    state: State<'_, AppState>,
    source: String,
) -> Result<String, String> {
    // Desktop: regular paths work as-is
    #[cfg(not(target_os = "android"))]
    {
        if std::path::Path::new(&source).exists() {
            return Ok(source);
        }
        return Err(format!("File not found: {}", source));
    }

    // Android: content:// URIs need JNI ContentResolver
    #[cfg(target_os = "android")]
    {
        use std::io::Write;

        let tmp_dir = state.app_data_dir.join("tmp");
        if !tmp_dir.exists() {
            fs::create_dir_all(&tmp_dir).map_err(|e| e.to_string())?;
        }
        let dest = tmp_dir.join(format!("import_{}.dat", chrono::Utc::now().timestamp_millis()));

        // Use JNI to open content:// URI via ContentResolver
        let result: Result<(), String> = {
            let context = ndk_context::android_context();
            let vm_ptr = context.vm();
            let context_ptr = context.context();
            if vm_ptr.is_null() || context_ptr.is_null() {
                return Err("JNI context not available".to_string());
            }

            let vm = unsafe { jni::JavaVM::from_raw(vm_ptr) }.map_err(|e| e.to_string())?;
            let mut env = vm.attach_current_thread().map_err(|e| e.to_string())?;

            // Get ContentResolver: context.getContentResolver()
            let resolver = env
                .call_method(
                    context_ptr as jni::sys::jobject,
                    "getContentResolver",
                    "()Landroid/content/ContentResolver;",
                    &[],
                )
                .map_err(|e| format!("getContentResolver: {}", e))?
                .l()
                .map_err(|e| format!("cast resolver: {}", e))?;

            // Parse URI: Uri.parse(source)
            let uri_class = env.find_class("android/net/Uri").map_err(|e| e.to_string())?;
            let jsource = env.new_string(&source).map_err(|e| e.to_string())?;
            let uri = env
                .call_static_method(
                    &uri_class,
                    "parse",
                    "(Ljava/lang/String;)Landroid/net/Uri;",
                    &[jni::objects::JValue::from(&jsource)],
                )
                .map_err(|e| format!("Uri.parse: {}", e))?
                .l()
                .map_err(|e| format!("cast uri: {}", e))?;

            // Open input stream: resolver.openInputStream(uri)
            let input_stream = env
                .call_method(
                    &resolver,
                    "openInputStream",
                    "(Landroid/net/Uri;)Ljava/io/InputStream;",
                    &[jni::objects::JValue::from(&uri)],
                )
                .map_err(|e| format!("openInputStream: {}", e))?
                .l()
                .map_err(|e| format!("cast stream: {}", e))?;

            // Read bytes via ByteArrayOutputStream
            let baos_class = env.find_class("java/io/ByteArrayOutputStream").map_err(|e| e.to_string())?;
            let baos = env.new_object(&baos_class, "()V", &[]).map_err(|e| e.to_string())?;
            let buf = env.new_byte_array(8192).map_err(|e| e.to_string())?;

            loop {
                let n = env
                    .call_method(
                        &input_stream,
                        "read",
                        "([B)I",
                        &[jni::objects::JValue::from(&buf)],
                    )
                    .map_err(|e| format!("read: {}", e))?
                    .i()
                    .map_err(|e| format!("cast int: {}", e))?;
                if n < 0 { break; }
                env.call_method(
                    &baos, "write", "([BII)V",
                    &[jni::objects::JValue::from(&buf), jni::objects::JValue::Int(0), jni::objects::JValue::Int(n)],
                ).map_err(|e| format!("write: {}", e))?;
            }

            let _ = env.call_method(&input_stream, "close", "()V", &[]);

            let bytes = env.call_method(&baos, "toByteArray", "()[B", &[])
                .map_err(|e| format!("toByteArray: {}", e))?
                .l()
                .map_err(|e| format!("cast bytes: {}", e))?;
            let bytes_array: jni::objects::JByteArray = bytes.into();
            let len = env.get_array_length(&bytes_array).map_err(|e| e.to_string())?;
            let mut data = vec![0i8; len as usize];
            env.get_byte_array_region(&bytes_array, 0, &mut data).map_err(|e| e.to_string())?;

            // Write to file
            let mut file = fs::File::create(&dest).map_err(|e| e.to_string())?;
            for chunk in data.chunks(8192) {
                let bytes: Vec<u8> = chunk.iter().map(|&b| b as u8).collect();
                file.write_all(&bytes).map_err(|e| e.to_string())?;
            }
            Ok(())
        };

        match result {
            Ok(()) => Ok(dest.to_string_lossy().to_string()),
            Err(e) => Err(e),
        }
    }
}
