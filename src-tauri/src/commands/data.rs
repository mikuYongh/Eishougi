use crate::AppState;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::io::{Read as IoRead, Write as IoWrite};
use tauri::{AppHandle, Emitter, State};

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
    let mut stmt = conn
        .prepare(&format!("SELECT * FROM {}", table))
        .map_err(|e| format!("Failed to query {}: {}", table, e))?;
    let col_names: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();

    let rows = stmt
        .query_map([], |row| {
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
        })
        .map_err(|e| format!("Failed to map rows from {}: {}", table, e))?;

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

/// Export all data as a zip archive directly to a user-specified file path.
/// Returns the number of records/images bundled. Avoids IPC serialization of
/// large byte arrays which causes OOM (exit code 0xe0000008).
#[tauri::command]
pub async fn export_all_data(
    state: State<'_, AppState>,
    app: AppHandle,
    output_path: String,
    frontend_json: Option<String>,
) -> Result<String, String> {
    let _ = app.emit(
        "export-progress",
        serde_json::json!({ "stage": "reading_db", "message": "正在读取数据库..." }),
    );
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
    drop(db); // release DB lock early

    // 2. Collect all image paths/URLs from relevant tables
    let mut image_paths: Vec<String> = Vec::new();
    image_paths.extend(collect_all_image_paths(&data.prompt_images, "filePath"));
    image_paths.extend(collect_all_image_paths(
        &data.generated_images,
        "outputPath",
    ));

    // Deduplicate + filter out invalid paths
    let mut seen = HashSet::new();
    let valid_paths: Vec<String> = image_paths
        .into_iter()
        .filter(|p| {
            if !seen.insert(p.clone()) { return false; }
            if p.starts_with("/data/user/0/com.") && !p.starts_with("/data/user/0/com.promptmuse") {
                return false;
            }
            !p.trim().is_empty()
        })
        .collect();

    let total_images = valid_paths.len();
    let _ = app.emit(
        "export-progress",
        serde_json::json!({
            "stage": "preparing_images",
            "message": format!("准备打包 {} 张图片...", total_images),
            "current": 0,
            "total": total_images
        }),
    );

    // 3. Write zip directly to the output file (not memory)
    let file = std::fs::File::create(&output_path)
        .map_err(|e| format!("Failed to create output file: {}", e))?;
    let mut zip = zip::ZipWriter::new(file);
    let options = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);

    // Write data.json
    let json_str = serde_json::to_string(&data)
        .map_err(|e| format!("Failed to serialize data: {}", e))?;
    zip.start_file("data.json", options)
        .map_err(|e| format!("Zip write error: {}", e))?;
    zip.write_all(json_str.as_bytes())
        .map_err(|e| format!("Zip write error: {}", e))?;

    // Bundle images
    let mut bundled = 0u32;
    let mut skipped = 0u32;
    let mut used_names: HashSet<String> = HashSet::new();

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    for (idx, path) in valid_paths.iter().enumerate() {
        let is_http = path.starts_with("http://") || path.starts_with("https://");

        let file_name = if is_http {
            if let Some(qidx) = path.find("filename=") {
                let rest = &path[qidx + 9..];
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
            let mut i = 1u32;
            loop {
                let candidate = format!("images/{}_{}", i, file_name);
                if !used_names.contains(&candidate) {
                    final_name = candidate;
                    break;
                }
                i += 1;
            }
        }
        used_names.insert(final_name.clone());

        let image_bytes: Option<Vec<u8>> = if is_http {
            match client.get(path).send().await {
                Ok(resp) if resp.status().is_success() => {
                    resp.bytes().await.ok().map(|b| b.to_vec())
                }
                _ => None,
            }
        } else {
            std::fs::read(path).ok()
        };

        if let Some(bytes) = image_bytes {
            zip.start_file(&final_name, options)
                .map_err(|e| format!("Zip write error: {}", e))?;
            zip.write_all(&bytes)
                .map_err(|e| format!("Zip write error: {}", e))?;
            bundled += 1;
        } else {
            skipped += 1;
        }

        if idx % 10 == 0 || idx == total_images - 1 {
            let _ = app.emit(
                "export-progress",
                serde_json::json!({
                    "stage": "bundling",
                    "message": format!("打包图片 {}/{}", idx + 1, total_images),
                    "current": idx + 1,
                    "total": total_images
                }),
            );
        }
    }

    zip.finish()
        .map_err(|e| format!("Zip finalize error: {}", e))?;

    // Write frontend localStorage sidecar JSON next to the backup file
    if let Some(json) = &frontend_json {
        if !json.is_empty() {
            let sidecar_path = format!("{}.frontend.json", output_path);
            if let Err(e) = std::fs::write(&sidecar_path, json.as_bytes()) {
                eprintln!("[Export] Failed to write sidecar: {}", e);
            }
        }
    }

    let msg = format!("导出完成：打包 {} 张图片，跳过 {}", bundled, skipped);
    let _ = app.emit(
        "export-progress",
        serde_json::json!({ "stage": "done", "message": &msg }),
    );
    Ok(msg)
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

/// Like insert_table but uses INSERT OR IGNORE to skip rows that already exist
/// (matched by primary key), preserving existing data during import.
fn insert_table_ignore(
    conn: &rusqlite::Connection,
    table: &str,
    rows: &[serde_json::Value],
) -> Result<usize, String> {
    if rows.is_empty() {
        return Ok(0);
    }

    let first = rows[0]
        .as_object()
        .ok_or_else(|| format!("Row in {} is not an object", table))?;
    let camel_cols: Vec<String> = first.keys().cloned().collect();
    let snake_cols: Vec<String> = camel_cols.iter().map(|c| from_camel_case(c)).collect();

    let placeholders: Vec<String> = (1..=snake_cols.len()).map(|i| format!("?{}", i)).collect();
    let sql = format!(
        "INSERT OR IGNORE INTO {} ({}) VALUES ({})",
        table,
        snake_cols.join(", "),
        placeholders.join(", ")
    );

    let mut count = 0;
    for row in rows {
        let obj = row
            .as_object()
            .ok_or_else(|| format!("Row in {} is not an object", table))?;

        let mut param_values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
        for camel_key in &camel_cols {
            let val = obj.get(camel_key).unwrap_or(&serde_json::Value::Null);
            match val {
                serde_json::Value::Null => param_values.push(Box::new(Option::<String>::None)),
                serde_json::Value::Bool(b) => {
                    param_values.push(Box::new(if *b { 1i32 } else { 0i32 }))
                }
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

        let param_refs: Vec<&dyn rusqlite::types::ToSql> =
            param_values.iter().map(|p| p.as_ref()).collect();
        match conn.execute(&sql, param_refs.as_slice()) {
            Ok(c) if c > 0 => count += 1,
            Ok(_) => {} // ignored (duplicate PK)
            Err(e) => {
                eprintln!("[Import] Failed to insert row into {}: {}", table, e);
            }
        }
    }
    Ok(count)
}

/// Like insert_table_ignore but for INSERT OR REPLACE (overwrites existing).
#[allow(dead_code)]
fn insert_table(
    conn: &rusqlite::Connection,
    table: &str,
    rows: &[serde_json::Value],
) -> Result<usize, String> {
    if rows.is_empty() {
        return Ok(0);
    }

    let first = rows[0]
        .as_object()
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
        let obj = row
            .as_object()
            .ok_or_else(|| format!("Row in {} is not an object", table))?;

        let mut param_values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
        for camel_key in &camel_cols {
            let val = obj.get(camel_key).unwrap_or(&serde_json::Value::Null);
            match val {
                serde_json::Value::Null => param_values.push(Box::new(Option::<String>::None)),
                serde_json::Value::Bool(b) => {
                    param_values.push(Box::new(if *b { 1i32 } else { 0i32 }))
                }
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

        let param_refs: Vec<&dyn rusqlite::types::ToSql> =
            param_values.iter().map(|p| p.as_ref()).collect();
        match conn.execute(&sql, param_refs.as_slice()) {
            Ok(_) => count += 1,
            Err(e) => {
                eprintln!("[Import] Failed to insert row into {}: {}", table, e);
            }
        }
    }
    Ok(count)
}

/// Import data from a zip archive file path.
/// Reads the file directly in Rust — no IPC byte transfer.
#[tauri::command]
pub async fn import_all_data(
    state: State<'_, AppState>,
    input_path: String,
) -> Result<String, String> {
    let reader = std::io::BufReader::new(
        std::fs::File::open(&input_path)
            .map_err(|e| format!("Failed to open backup file: {}", e))?,
    );
    let mut archive =
        zip::ZipArchive::new(reader).map_err(|e| format!("Invalid zip file: {}", e))?;

    // 1. Read data.json from zip
    let mut json_str = String::new();
    archive
        .by_name("data.json")
        .map_err(|e| format!("data.json not found in zip: {}", e))?
        .read_to_string(&mut json_str)
        .map_err(|e| format!("Failed to read data.json: {}", e))?;
    let data: ImportPayload =
        serde_json::from_str(&json_str).map_err(|e| format!("Invalid data.json format: {}", e))?;

    // 2. Restore image files from zip to app uploads dir
    let uploads_dir = state.app_data_dir.join("uploads");
    std::fs::create_dir_all(&uploads_dir)
        .map_err(|e| format!("Failed to create uploads dir: {}", e))?;

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
            std::fs::write(&dest, &buf)
                .map_err(|e| format!("Failed to write image {}: {}", file_name, e))?;
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
                            let file_name =
                                if path.starts_with("http://") || path.starts_with("https://") {
                                    if let Some(idx) = path.find("filename=") {
                                        let start = idx + 9;
                                        let rest = &path[start..];
                                        let end = rest.find('&').unwrap_or(rest.len());
                                        rest[..end].to_string()
                                    } else {
                                        path.rsplit('/').next().unwrap_or("unknown").to_string()
                                    }
                                } else {
                                    let normalized = path.replace('\\', "/");
                                    normalized
                                        .rsplit('/')
                                        .next()
                                        .unwrap_or("unknown")
                                        .to_string()
                                };
                            *val = serde_json::json!(format!(
                                "{}{}{}",
                                uploads_dir_str,
                                std::path::MAIN_SEPARATOR,
                                file_name
                            ));
                        }
                    }
                }
            }
        }
    };

    let mut data = data;
    fix_path(&mut data.prompt_images, "filePath");
    fix_path(&mut data.generated_images, "outputPath");

    // 4. Import into database — use INSERT OR IGNORE to skip existing rows
    // (keeps existing data, only adds new records)
    let db = state.db.lock().await;

    let mut total = 0;
    total += insert_table_ignore(&db.conn, "tags", &data.tags)?;
    total += insert_table_ignore(&db.conn, "prompts", &data.prompts)?;
    total += insert_table_ignore(&db.conn, "prompt_tag_cross", &data.prompt_tag_cross)?;
    total += insert_table(&db.conn, "prompt_images", &data.prompt_images)?;
    total += insert_table_ignore(&db.conn, "workflows", &data.workflows)?;
    total += insert_table(&db.conn, "generated_images", &data.generated_images)?;
    total += insert_table_ignore(&db.conn, "chat_messages", &data.chat_messages)?;
    total += insert_table_ignore(&db.conn, "favorite_prompts", &data.favorite_prompts)?;
    total += insert_table_ignore(&db.conn, "custom_styles", &data.custom_styles)?;

    Ok(format!(
        "导入完成：{} 条数据库记录，{} 张图片已还原。",
        total, restored_images
    ))
}
