use tauri::{State, AppHandle, Emitter};
use crate::AppState;
use serde::{Deserialize, Serialize};
use rusqlite::params;
use std::collections::HashSet;
use std::io::{Read as IoRead, Write as IoWrite};

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ExportData {
    pub version: i32,
    pub exported_at: i64,
    pub prompts: Vec<serde_json::Value>,
    pub tags: Vec<serde_json::Value>,
    pub prompt_tag_cross: Vec<serde_json::Value>,
    pub prompt_images: Vec<serde_json::Value>,
    pub workflows: Vec<serde_json::Value>,
    pub generated_images: Vec<serde_json::Value>,
    pub chat_messages: Vec<serde_json::Value>,
    pub favorite_prompts: Vec<serde_json::Value>,
    pub custom_styles: Vec<serde_json::Value>,
}

fn now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as i64
}

fn dump_table(conn: &rusqlite::Connection, table: &str) -> Result<Vec<serde_json::Value>, String> {
    let mut stmt = conn.prepare(&format!("SELECT * FROM {}", table))
        .map_err(|e| format!("Failed to query {}: {}", table, e))?;
    let col_names: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();

    let rows = stmt.query_map([], |row| {
        let mut map = serde_json::Map::new();
        for (i, col) in col_names.iter().enumerate() {
            let val: serde_json::Value = match row.get_ref(i) {
                Ok(rusqlite::types::ValueRef::Null) => serde_json::Value::Null,
                Ok(rusqlite::types::ValueRef::Integer(n)) => serde_json::json!(n),
                Ok(rusqlite::types::ValueRef::Real(f)) => serde_json::json!(f),
                Ok(rusqlite::types::ValueRef::Text(s)) => {
                    let s = String::from_utf8_lossy(s).to_string();
                    serde_json::json!(s)
                }
                Ok(rusqlite::types::ValueRef::Blob(_)) => serde_json::Value::Null,
                Err(_) => serde_json::Value::Null,
            };
            let camel_key = to_camel_case(col);
            map.insert(camel_key, val);
        }
        Ok(serde_json::Value::Object(map))
    }).map_err(|e| format!("Failed to map rows from {}: {}", table, e))?;

    let mut result = Vec::new();
    for r in rows {
        result.push(r.map_err(|e| format!("Row error in {}: {}", table, e))?);
    }
    Ok(result)
}

fn to_camel_case(s: &str) -> String {
    let mut result = String::new();
    let mut upper_next = false;
    for c in s.chars() {
        if c == '_' {
            upper_next = true;
        } else if upper_next {
            result.push(c.to_ascii_uppercase());
            upper_next = false;
        } else {
            result.push(c);
        }
    }
    result
}

fn from_camel_case(s: &str) -> String {
    let mut result = String::new();
    for c in s.chars() {
        if c.is_ascii_uppercase() {
            result.push('_');
            result.push(c.to_ascii_lowercase());
        } else {
            result.push(c);
        }
    }
    result
}

/// Collect all image paths/URLs from database rows.
/// Returns both local paths and HTTP URLs.
fn collect_all_image_paths(rows: &[serde_json::Value], field: &str) -> Vec<String> {
    let mut paths = Vec::new();
    for row in rows {
        if let Some(obj) = row.as_object() {
            if let Some(val) = obj.get(field) {
                if let Some(s) = val.as_str() {
                    let s = s.trim();
                    if !s.is_empty() {
                        paths.push(s.to_string());
                    }
                }
            }
        }
    }
    paths
}

/// Export all data as a zip archive (Vec<u8>).
/// Structure: data.json + images/* (local image files bundled in)
#[tauri::command]
pub async fn export_all_data(state: State<'_, AppState>, app: AppHandle) -> Result<Vec<u8>, String> {
    let _ = app.emit("export-progress", serde_json::json!({ "stage": "reading_db", "message": "正在读取数据库..." }));
    let db = state.db.lock().await;

    // 1. Dump all tables
    let data = ExportData {
        version: 1,
        exported_at: now(),
        prompts: dump_table(&db.conn, "prompts")?,
        tags: dump_table(&db.conn, "tags")?,
        prompt_tag_cross: dump_table(&db.conn, "prompt_tag_cross")?,
        prompt_images: dump_table(&db.conn, "prompt_images")?,
        workflows: dump_table(&db.conn, "workflows")?,
        generated_images: dump_table(&db.conn, "generated_images")?,
        chat_messages: dump_table(&db.conn, "chat_messages")?,
        favorite_prompts: dump_table(&db.conn, "favorite_prompts")?,
        custom_styles: dump_table(&db.conn, "custom_styles")?,
    };

    // 2. Collect all image paths/URLs from relevant tables
    let mut image_paths: Vec<String> = Vec::new();
    image_paths.extend(collect_all_image_paths(&data.prompt_images, "filePath"));
    image_paths.extend(collect_all_image_paths(&data.generated_images, "outputPath"));

    // Deduplicate
    let mut seen = HashSet::new();
    image_paths.retain(|p| seen.insert(p.clone()));

    let total_images = image_paths.len();
    let _ = app.emit("export-progress", serde_json::json!({
        "stage": "preparing_images",
        "message": format!("准备打包 {} 张图片...", total_images),
        "current": 0,
        "total": total_images
    }));

    // 3. Build zip in memory
    let buf = std::io::Cursor::new(Vec::new());
    let mut zip = zip::ZipWriter::new(buf);
    let options = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);

    // Write data.json
    let json_str = serde_json::to_string_pretty(&data)
        .map_err(|e| format!("Failed to serialize data: {}", e))?;
    zip.start_file("data.json", options)
        .map_err(|e| format!("Zip write error: {}", e))?;
    zip.write_all(json_str.as_bytes())
        .map_err(|e| format!("Zip write error: {}", e))?;

    // Bundle image files (local files + HTTP downloads)
    let mut bundled = 0u32;
    let mut skipped = 0u32;
    let mut used_names: HashSet<String> = HashSet::new();

    // Prepare (final_name, bytes) pairs — download in parallel for HTTP URLs
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    // Collect download tasks
    let mut download_tasks: Vec<(String, std::pin::Pin<Box<dyn std::future::Future<Output = Option<Vec<u8>>> + Send>>) >= Vec::new();
    let mut local_tasks: Vec<(String, Option<Vec<u8>>)> = Vec::new();

    for path in &image_paths {
        let is_http = path.starts_with("http://") || path.starts_with("https://");
        let file_name = if is_http {
            if let Some(idx) = path.find("filename=") {
                let start = idx + 9;
                let rest = &path[start..];
                let end = rest.find('&').unwrap_or(rest.len());
                rest[..end].to_string()
            } else {
                path.rsplit('/').next().unwrap_or("unknown").to_string()
            }
        } else {
            std::path::Path::new(path)
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("unknown")
                .to_string()
        };

        let mut final_name = format!("images/{}", file_name);
        if used_names.contains(&final_name) {
            let mut idx = 1u32;
            loop {
                let candidate = format!("images/{}_{}", idx, file_name);
                if !used_names.contains(&candidate) {
                    final_name = candidate;
                    break;
                }
                idx += 1;
            }
        }
        used_names.insert(final_name.clone());

        if is_http {
            let url = path.clone();
            let c = client.clone();
            let fut = Box::pin(async move {
                match c.get(&url).send().await {
                    Ok(resp) if resp.status().is_success() => {
                        resp.bytes().await.ok().map(|b| b.to_vec())
                    }
                    Ok(resp) => {
                        eprintln!("[Export] HTTP {} for {}", resp.status(), url);
                        None
                    }
                    Err(e) => {
                        eprintln!("[Export] HTTP download failed for {}: {}", url, e);
                        None
                    }
                }
            });
            download_tasks.push((final_name, fut));
        } else {
            let bytes = std::fs::read(path).ok();
            if bytes.is_none() {
                eprintln!("[Export] Local file not found: {}", path);
            }
            local_tasks.push((final_name, bytes));
        }
    }

    // Write local files immediately
    let mut processed: usize = 0;
    for (name, bytes) in &local_tasks {
        if let Some(bytes) = bytes {
            zip.start_file(name, options)
                .map_err(|e| format!("Zip write error: {}", e))?;
            zip.write_all(bytes)
                .map_err(|e| format!("Zip write error: {}", e))?;
            bundled += 1;
        } else {
            skipped += 1;
        }
        processed += 1;
        let _ = app.emit("export-progress", serde_json::json!({
            "stage": "downloading",
            "message": format!("打包本地图片 {}/{}", processed, total_images),
            "current": processed,
            "total": total_images
        }));
    }

    // Download HTTP images (sequentially to show progress)
    for (name, fut) in download_tasks {
        match fut.await {
            Some(bytes) => {
                zip.start_file(&name, options)
                    .map_err(|e| format!("Zip write error: {}", e))?;
                zip.write_all(&bytes)
                    .map_err(|e| format!("Zip write error: {}", e))?;
                bundled += 1;
            }
            None => {
                skipped += 1;
            }
        }
        processed += 1;
        let _ = app.emit("export-progress", serde_json::json!({
            "stage": "downloading",
            "message": format!("下载图片 {}/{}", processed, total_images),
            "current": processed,
            "total": total_images
        }));
    }

    let result = zip.finish()
        .map_err(|e| format!("Zip finalize error: {}", e))?;

    eprintln!("[Export] Bundled {} images, skipped {} (not found on disk)", bundled, skipped);

    Ok(result.into_inner())
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportPayload {
    pub prompts: Vec<serde_json::Value>,
    pub tags: Vec<serde_json::Value>,
    pub prompt_tag_cross: Vec<serde_json::Value>,
    pub prompt_images: Vec<serde_json::Value>,
    pub workflows: Vec<serde_json::Value>,
    pub generated_images: Vec<serde_json::Value>,
    pub chat_messages: Vec<serde_json::Value>,
    pub favorite_prompts: Vec<serde_json::Value>,
    pub custom_styles: Vec<serde_json::Value>,
}

fn insert_table(
    conn: &rusqlite::Connection,
    table: &str,
    rows: &[serde_json::Value],
) -> Result<usize, String> {
    if rows.is_empty() {
        return Ok(0);
    }

    let first = rows[0].as_object()
        .ok_or_else(|| format!("Row in {} is not an object", table))?;
    let camel_cols: Vec<String> = first.keys().cloned().collect();
    let snake_cols: Vec<String> = camel_cols.iter().map(|c| from_camel_case(c)).collect();

    let placeholders: Vec<String> = (1..=snake_cols.len()).map(|i| format!("?{}", i)).collect();
    let sql = format!(
        "INSERT OR REPLACE INTO {} ({}) VALUES ({})",
        table,
        snake_cols.join(", "),
        placeholders.join(", ")
    );

    let mut count = 0;
    for row in rows {
        let obj = row.as_object()
            .ok_or_else(|| format!("Row in {} is not an object", table))?;

        let mut param_values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
        for camel_key in &camel_cols {
            let val = obj.get(camel_key).unwrap_or(&serde_json::Value::Null);
            match val {
                serde_json::Value::Null => param_values.push(Box::new(Option::<String>::None)),
                serde_json::Value::Bool(b) => param_values.push(Box::new(if *b { 1i32 } else { 0i32 })),
                serde_json::Value::Number(n) => {
                    if let Some(i) = n.as_i64() {
                        param_values.push(Box::new(i as i32));
                    } else if let Some(f) = n.as_f64() {
                        param_values.push(Box::new(f));
                    } else {
                        param_values.push(Box::new(n.to_string()));
                    }
                }
                serde_json::Value::String(s) => param_values.push(Box::new(s.clone())),
                _ => param_values.push(Box::new(val.to_string())),
            }
        }

        let param_refs: Vec<&dyn rusqlite::types::ToSql> = param_values.iter().map(|p| p.as_ref()).collect();
        match conn.execute(&sql, param_refs.as_slice()) {
            Ok(_) => count += 1,
            Err(e) => {
                eprintln!("[Import] Failed to insert row into {}: {}", table, e);
            }
        }
    }
    Ok(count)
}

/// Import data from a zip archive (Vec<u8>).
/// Extracts data.json for DB records and restores images from images/*.
#[tauri::command]
pub async fn import_all_data(state: State<'_, AppState>, zip_bytes: Vec<u8>) -> Result<String, String> {
    let reader = std::io::Cursor::new(zip_bytes);
    let mut archive = zip::ZipArchive::new(reader)
        .map_err(|e| format!("Invalid zip file: {}", e))?;

    // 1. Read data.json from zip
    let mut json_str = String::new();
    archive.by_name("data.json")
        .map_err(|e| format!("data.json not found in zip: {}", e))?
        .read_to_string(&mut json_str)
        .map_err(|e| format!("Failed to read data.json: {}", e))?;
    let data: ImportPayload = serde_json::from_str(&json_str)
        .map_err(|e| format!("Invalid data.json format: {}", e))?;

    // 2. Restore image files from zip to app uploads dir
    let uploads_dir = state.app_data_dir.join("uploads");
    std::fs::create_dir_all(&uploads_dir).map_err(|e| format!("Failed to create uploads dir: {}", e))?;

    let mut restored_images = 0u32;
    let file_indices: Vec<usize> = (0..archive.len()).collect();
    for i in file_indices {
        let mut file = archive.by_index(i).map_err(|e| e.to_string())?;
        let name = file.name().to_string();
        if name.starts_with("images/") && !file.is_dir() {
            let file_name = std::path::Path::new(&name)
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("unknown");
            let dest = uploads_dir.join(file_name);
            let mut buf = Vec::new();
            file.read_to_end(&mut buf).map_err(|e| e.to_string())?;
            std::fs::write(&dest, &buf).map_err(|e| format!("Failed to write image {}: {}", file_name, e))?;
            restored_images += 1;
        }
    }

    // 3. Update image paths in data to point to restored local files
    let uploads_dir_str = uploads_dir.to_string_lossy();
    let fix_path = |rows: &mut Vec<serde_json::Value>, field: &str| {
        for row in rows.iter_mut() {
            if let Some(obj) = row.as_object_mut() {
                if let Some(val) = obj.get_mut(field) {
                    if let Some(s) = val.as_str() {
                        let path = s.trim();
                        if !path.is_empty() {
                            // Extract original filename
                            // For ComfyUI URLs: extract from ?filename=xxx or last path segment
                            // For local paths: use file_name()
                            let file_name = if path.starts_with("http://") || path.starts_with("https://") {
                                if let Some(idx) = path.find("filename=") {
                                    let start = idx + 9;
                                    let rest = &path[start..];
                                    let end = rest.find('&').unwrap_or(rest.len());
                                    rest[..end].to_string()
                                } else {
                                    path.rsplit('/').next().unwrap_or("unknown").to_string()
                                }
                            } else {
                                std::path::Path::new(path)
                                    .file_name()
                                    .and_then(|n| n.to_str())
                                    .unwrap_or("unknown")
                                    .to_string()
                            };
                            *val = serde_json::json!(format!("{}{}{}", uploads_dir_str, std::path::MAIN_SEPARATOR, file_name));
                        }
                    }
                }
            }
        }
    };

    let mut data = data;
    fix_path(&mut data.prompt_images, "filePath");
    fix_path(&mut data.generated_images, "outputPath");

    // 4. Import into database
    let db = state.db.lock().await;

    let tables = [
        "prompt_tag_cross",
        "prompt_images",
        "generated_images",
        "chat_messages",
        "favorite_prompts",
        "custom_styles",
        "prompts",
        "tags",
        "workflows",
    ];
    for t in &tables {
        db.conn.execute(&format!("DELETE FROM {}", t), [])
            .map_err(|e| format!("Failed to clear {}: {}", t, e))?;
    }

    let mut total = 0;
    total += insert_table(&db.conn, "tags", &data.tags)?;
    total += insert_table(&db.conn, "prompts", &data.prompts)?;
    total += insert_table(&db.conn, "prompt_tag_cross", &data.prompt_tag_cross)?;
    total += insert_table(&db.conn, "prompt_images", &data.prompt_images)?;
    total += insert_table(&db.conn, "workflows", &data.workflows)?;
    total += insert_table(&db.conn, "generated_images", &data.generated_images)?;
    total += insert_table(&db.conn, "chat_messages", &data.chat_messages)?;
    total += insert_table(&db.conn, "favorite_prompts", &data.favorite_prompts)?;
    total += insert_table(&db.conn, "custom_styles", &data.custom_styles)?;

    Ok(format!(
        "导入完成：{} 条数据库记录，{} 张图片已还原。",
        total, restored_images
    ))
}
