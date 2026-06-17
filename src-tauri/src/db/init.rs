use rusqlite::Connection;
use serde_json::Value;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

/// Initialize library data (characters / artists) into the database on first run.
///
/// Strategy: try several locations at runtime because Android bundles resources
/// inside the APK assets/ directory (not accessible via std::fs), while desktop
/// builds use either dev-time paths or tauri.conf.json `bundle.resources`.
pub fn init_library_data(conn: &Connection, app_data_dir: &Path) -> Result<(), String> {
    let characters_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM characters", [], |row| row.get(0))
        .unwrap_or(0);

    if characters_count == 0 {
        if let Some(content) = read_resource("characters.json", app_data_dir) {
            insert_characters(conn, &content)?;
        } else {
            log::warn!("characters.json resource not found on this platform");
        }
    }

    let artists_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM artists", [], |row| row.get(0))
        .unwrap_or(0);

    if artists_count == 0 {
        if let Some(content) = read_resource("artists.json", app_data_dir) {
            insert_artists(conn, &content)?;
        } else {
            log::warn!("artists.json resource not found on this platform");
        }
    }

    Ok(())
}

/// Try multiple locations to find a packaged resource file.
fn read_resource(name: &str, app_data_dir: &Path) -> Option<String> {
    // Strategy 1: dev paths (desktop `cargo tauri dev` or running the binary from src-tauri/)
    for c in [format!("resources/{}", name), format!("src-tauri/resources/{}", name)] {
        if let Ok(content) = std::fs::read_to_string(&c) {
            log::info!("Loaded resource {} from {}", name, c);
            return Some(content);
        }
    }

    // Strategy 2: Android APK assets (must be packaged into assets/ at build time)
    #[cfg(target_os = "android")]
    {
        if let Some(content) = crate::jvm_plugin::read_asset_to_string(name) {
            log::info!("Loaded resource {} from Android assets", name);
            return Some(content);
        }
    }

    // Strategy 3: app_data_dir/resources (post-install desktop layout)
    let p = app_data_dir.join("resources").join(name);
    if let Ok(content) = std::fs::read_to_string(&p) {
        log::info!("Loaded resource {} from {:?}", name, p);
        return Some(content);
    }

    None
}

fn now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis() as i64
}

fn insert_characters(conn: &Connection, json_str: &str) -> Result<(), String> {
    let characters: Vec<Value> = serde_json::from_str(json_str).map_err(|e| e.to_string())?;

    conn.execute_batch("BEGIN TRANSACTION;")
        .map_err(|e| e.to_string())?;

    {
        let mut stmt = conn.prepare(
            "INSERT INTO characters (id, character_tag, name_en, name_zh, copyright, \"trigger\", core_tags, \"count\", img_url, is_favorite, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 0, ?10)"
        ).map_err(|e| e.to_string())?;

        for (i, char_val) in characters.iter().enumerate() {
            let id = format!("char_{}", i);
            let character_tag = char_val
                .get("character")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let name_en = char_val.get("name").and_then(|v| v.as_str()).unwrap_or("");
            let name_zh = char_val.get("name_zh").and_then(|v| v.as_str());
            let copyright = char_val.get("copyright").and_then(|v| v.as_str());
            let trigger = char_val
                .get("trigger")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let core_tags = char_val.get("core_tags").and_then(|v| v.as_str());
            let count = char_val.get("count").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
            let img_url = char_val.get("thumbname").and_then(|v| v.as_str());

            stmt.execute(rusqlite::params![
                id,
                character_tag,
                name_en,
                name_zh,
                copyright,
                trigger,
                core_tags,
                count,
                img_url,
                now()
            ])
            .map_err(|e| e.to_string())?;
        }
    }

    conn.execute_batch("COMMIT;").map_err(|e| e.to_string())?;

    Ok(())
}

fn insert_artists(conn: &Connection, json_str: &str) -> Result<(), String> {
    let artists: Vec<Value> = serde_json::from_str(json_str).map_err(|e| e.to_string())?;

    conn.execute_batch("BEGIN TRANSACTION;")
        .map_err(|e| e.to_string())?;

    {
        let mut stmt = conn.prepare(
            "INSERT INTO artists (id, artist_tag, name_en, name_zh, \"trigger\", \"count\", img_url, is_favorite, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 0, ?8)"
        ).map_err(|e| e.to_string())?;

        for (i, artist_val) in artists.iter().enumerate() {
            let id = format!("artist_{}", i);
            let artist_tag = artist_val
                .get("artist")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let name_en = artist_val
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let name_zh = artist_val.get("name_zh").and_then(|v| v.as_str());
            let trigger = artist_val
                .get("trigger")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let count = artist_val
                .get("count")
                .and_then(|v| v.as_i64())
                .unwrap_or(0) as i32;
            let img_url = artist_val.get("thumbname").and_then(|v| v.as_str());

            stmt.execute(rusqlite::params![
                id,
                artist_tag,
                name_en,
                name_zh,
                trigger,
                count,
                img_url,
                now()
            ])
            .map_err(|e| e.to_string())?;
        }
    }

    conn.execute_batch("COMMIT;").map_err(|e| e.to_string())?;

    Ok(())
}
