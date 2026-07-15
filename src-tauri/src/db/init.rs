use rusqlite::Connection;
use serde_json::Value;
use std::time::{SystemTime, UNIX_EPOCH};

/// Increment this when characters.json or artists.json content changes.
const LIBRARY_DATA_VERSION: u32 = 7;

/// Sync library data from compile-time embedded JSON into the database.
/// Safe to call from any thread with its own Connection.
pub fn sync_library_data(conn: &Connection) {
    let _ = conn.execute_batch("CREATE TABLE IF NOT EXISTS _meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)");

    let current: u32 = conn
        .query_row(
            "SELECT CAST(value AS INTEGER) FROM _meta WHERE key = 'library_data_version'",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);

    if current >= LIBRARY_DATA_VERSION {
        log::info!("Library data up-to-date (DB v{} >= code v{})", current, LIBRARY_DATA_VERSION);
        return;
    }

    log::info!("Syncing library data: DB v{} → v{}", current, LIBRARY_DATA_VERSION);

    if let Some(content) = load_resource("characters.json") {
        match replace_characters(conn, &content) {
            Ok((inserted, updated)) => log::info!("characters: {} new, {} fav restored", inserted, updated),
            Err(e) => log::error!("characters sync failed: {}", e),
        }
    } else {
        log::warn!("characters.json not found in embedded binary");
    }

    if let Some(content) = load_resource("artists.json") {
        match replace_artists(conn, &content) {
            Ok((inserted, updated)) => log::info!("artists: {} new, {} fav restored", inserted, updated),
            Err(e) => log::error!("artists sync failed: {}", e),
        }
    } else {
        log::warn!("artists.json not found in embedded binary");
    }

    let _ = conn.execute(
        "INSERT OR REPLACE INTO _meta (key, value) VALUES ('library_data_version', ?1)",
        rusqlite::params![LIBRARY_DATA_VERSION],
    );

    log::info!("Library data synced to v{}", LIBRARY_DATA_VERSION);

    // 在同一线程/连接里顺势种入默认工作流（仅首次安装或该 type 还无默认时）
    seed_default_workflows(conn);
}

/// 为 text2img 和 img2video 各种入一条内置默认工作流。
/// 仅当该 type 当前没有任何 is_default=1 的工作流时才种入 ——
/// 这样既能让新装用户开箱即用，也避免覆盖老用户的自定义默认。
fn seed_default_workflows(conn: &Connection) {
    let now = now_millis();

    let has_t2i: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM workflows WHERE type='text2img' AND is_default=1",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    if has_t2i == 0 {
        let json = include_str!("../../resources/default_workflows/text2img.json");
        let inserted = conn.execute(
            "INSERT OR IGNORE INTO workflows (id, name, description, json_content, type, is_default, is_builtin, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, 'text2img', 1, 1, ?5, ?5)",
            rusqlite::params!["seed_text2img_default", "默认文生图工作流", "Anima Preview3 文本生图工作流", json, now],
        );
        match inserted {
            Ok(_) => log::info!("Seeded default text2img workflow"),
            Err(e) => log::error!("Failed to seed text2img workflow: {}", e),
        }
    } else {
        let json = include_str!("../../resources/default_workflows/text2img.json");
        if let Err(e) = conn.execute(
            "UPDATE workflows SET json_content = ?1, updated_at = ?2
             WHERE id = 'seed_text2img_default' AND is_builtin = 1 AND is_default = 1",
            rusqlite::params![json, now],
        ) {
            log::error!("Failed to refresh text2img workflow: {}", e);
        }
    }

    let has_i2v: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM workflows WHERE type='img2video' AND is_default=1",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    if has_i2v == 0 {
        let json = include_str!("../../resources/default_workflows/img2video.json");
        let inserted = conn.execute(
            "INSERT OR IGNORE INTO workflows (id, name, description, json_content, type, is_default, is_builtin, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, 'img2video', 1, 1, ?5, ?5)",
            rusqlite::params!["seed_img2video_default", "默认图生视频工作流", "LTX 2.3 图生视频工作流", json, now],
        );
        match inserted {
            Ok(_) => log::info!("Seeded default img2video workflow"),
            Err(e) => log::error!("Failed to seed img2video workflow: {}", e),
        }
    } else {
        let json = include_str!("../../resources/default_workflows/img2video.json");
        if let Err(e) = conn.execute(
            "UPDATE workflows SET json_content = ?1, updated_at = ?2
             WHERE id = 'seed_img2video_default' AND is_builtin = 1 AND is_default = 1",
            rusqlite::params![json, now],
        ) {
            log::error!("Failed to refresh img2video workflow: {}", e);
        }
    }
}

fn now_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// Replace all character rows with fresh data, preserving is_favorite.
fn replace_characters(conn: &Connection, json_str: &str) -> Result<(usize, usize), String> {
    let characters: Vec<Value> = serde_json::from_str(json_str).map_err(|e| e.to_string())?;

    conn.execute_batch("BEGIN TRANSACTION;").map_err(|e| e.to_string())?;

    // Step 1: save existing favorites
    let mut fav_tags = Vec::new();
    {
        let mut stmt = conn
            .prepare("SELECT character_tag FROM characters WHERE is_favorite = 1")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| r.get::<_, String>(0))
            .map_err(|e| e.to_string())?;
        for row in rows {
            if let Ok(tag) = row {
                fav_tags.push(tag);
            }
        }
    }

    // Step 2: clear table
    conn.execute("DELETE FROM characters", [])
        .map_err(|e| e.to_string())?;

    // Step 3: insert all from JSON
    {
        let mut stmt = conn
            .prepare(
            "INSERT INTO characters (id, character_tag, name_en, name_zh, copyright, \"trigger\", core_tags, \"count\", img_url, is_favorite, created_at, series, series_zh)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 0, ?10, ?11, ?12)",
            )
            .map_err(|e| e.to_string())?;

        let ts = now();

        for (i, val) in characters.iter().enumerate() {
            let id = format!("char_{}", i);
            let tag = val.get("character").and_then(|v| v.as_str()).unwrap_or("");
            let name_en = val.get("name").and_then(|v| v.as_str()).unwrap_or("");
            let name_zh = val.get("name_zh").and_then(|v| v.as_str());
            let copyright = val.get("copyright").and_then(|v| v.as_str());
            let trigger = val.get("trigger").and_then(|v| v.as_str()).unwrap_or("");
            let core_tags = val.get("core_tags").and_then(|v| v.as_str());
            let count = val.get("count").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
            let img_url = val.get("thumbname").and_then(|v| v.as_str());
            let series = val.get("series").and_then(|v| v.as_str());
            let series_zh = val.get("series_zh").and_then(|v| v.as_str());

            stmt.execute(rusqlite::params![
                id, tag, name_en, name_zh, copyright, trigger, core_tags, count, img_url, ts, series, series_zh
            ])
            .map_err(|e| format!("row {}: {}", i, e))?;
        }
    }

    // Step 4: restore favorites (only for tags that still exist in new data)
    let restored = if !fav_tags.is_empty() {
        let placeholders: Vec<String> = fav_tags.iter().map(|t| format!("'{}'", t.replace('\'', "''"))).collect();
        let sql = format!(
            "UPDATE characters SET is_favorite = 1 WHERE character_tag IN ({})",
            placeholders.join(",")
        );
        conn.execute(&sql, []).map_err(|e| e.to_string())? as usize
    } else {
        0
    };

    conn.execute_batch("COMMIT;").map_err(|e| e.to_string())?;
    Ok((characters.len() - restored, restored))
}

/// Replace all artist rows with fresh data, preserving is_favorite.
fn replace_artists(conn: &Connection, json_str: &str) -> Result<(usize, usize), String> {
    let artists: Vec<Value> = serde_json::from_str(json_str).map_err(|e| e.to_string())?;

    conn.execute_batch("BEGIN TRANSACTION;").map_err(|e| e.to_string())?;

    let mut fav_tags = Vec::new();
    {
        let mut stmt = conn
            .prepare("SELECT artist_tag FROM artists WHERE is_favorite = 1")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| r.get::<_, String>(0))
            .map_err(|e| e.to_string())?;
        for row in rows {
            if let Ok(tag) = row {
                fav_tags.push(tag);
            }
        }
    }

    conn.execute("DELETE FROM artists", [])
        .map_err(|e| e.to_string())?;

    {
        let mut stmt = conn
            .prepare(
                "INSERT INTO artists (id, artist_tag, name_en, name_zh, \"trigger\", \"count\", img_url, is_favorite, created_at, series, series_zh)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 0, ?8, ?9, ?10)",
            )
            .map_err(|e| e.to_string())?;

        let ts = now();

        for (i, val) in artists.iter().enumerate() {
            let id = format!("artist_{}", i);
            let tag = val.get("artist").and_then(|v| v.as_str()).unwrap_or("");
            let name_en = val.get("name").and_then(|v| v.as_str()).unwrap_or("");
            let name_zh = val.get("name_zh").and_then(|v| v.as_str());
            let trigger = val.get("trigger").and_then(|v| v.as_str()).unwrap_or("");
            let count = val.get("count").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
            let img_url = val.get("thumbname").and_then(|v| v.as_str());
            let series = val.get("series").and_then(|v| v.as_str());
            let series_zh = val.get("series_zh").and_then(|v| v.as_str());

            stmt.execute(rusqlite::params![
                id, tag, name_en, name_zh, trigger, count, img_url, ts, series, series_zh
            ])
            .map_err(|e| format!("row {}: {}", i, e))?;
        }
    }

    let restored = if !fav_tags.is_empty() {
        let placeholders: Vec<String> = fav_tags.iter().map(|t| format!("'{}'", t.replace('\'', "''"))).collect();
        let sql = format!(
            "UPDATE artists SET is_favorite = 1 WHERE artist_tag IN ({})",
            placeholders.join(",")
        );
        conn.execute(&sql, []).map_err(|e| e.to_string())? as usize
    } else {
        0
    };

    conn.execute_batch("COMMIT;").map_err(|e| e.to_string())?;
    Ok((artists.len() - restored, restored))
}

/// Load resource from compile-time embedding (desktop) or Android assets.
/// Android uses assets/ to avoid duplicating ~48MB across 4 CPU architectures.
fn load_resource(name: &str) -> Option<String> {
    match name {
        #[cfg(not(target_os = "android"))]
        "characters.json" => Some(include_str!("../../resources/characters.json").to_string()),
        #[cfg(not(target_os = "android"))]
        "artists.json" => Some(include_str!("../../resources/artists.json").to_string()),
        #[cfg(target_os = "android")]
        "characters.json" | "artists.json" => {
            crate::jvm_plugin::read_asset_to_string(name)
        }
        _ => None,
    }
}

fn now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis() as i64
}
