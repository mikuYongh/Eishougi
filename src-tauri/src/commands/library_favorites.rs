use crate::db::models::{FavoriteArtist, FavoriteCharacter, FavoriteCharacterTagCount};
use crate::AppState;
use rusqlite::params;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::State;

fn now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis() as i64
}

fn normalize_tag(tag: &str) -> String {
    tag.trim().to_string()
}

/// 用 character_tag 在 gallery characters 表里查记录，返回 (id, name_zh, name_en, trigger, img_url)。
/// 用于 add/relink 时自动补全元数据。查不到返回 None（图鉴外实体的正常情况）。
fn find_gallery_character(
    conn: &rusqlite::Connection,
    tag: &str,
) -> Option<(String, Option<String>, String, Option<String>, Option<String>)> {
    conn.query_row(
        "SELECT id, name_zh, name_en, \"trigger\", img_url FROM characters WHERE character_tag = ?1 LIMIT 1",
        params![tag],
        |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, Option<String>>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, Option<String>>(3)?,
                r.get::<_, Option<String>>(4)?,
            ))
        },
    )
    .ok()
}

fn find_gallery_artist(
    conn: &rusqlite::Connection,
    tag: &str,
) -> Option<(String, Option<String>, String, Option<String>, Option<String>)> {
    conn.query_row(
        "SELECT id, name_zh, name_en, \"trigger\", img_url FROM artists WHERE artist_tag = ?1 LIMIT 1",
        params![tag],
        |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, Option<String>>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, Option<String>>(3)?,
                r.get::<_, Option<String>>(4)?,
            ))
        },
    )
    .ok()
}

/// 计算 resolved_image：gallery img_url → example_image → null
fn resolve_character_image(
    conn: &rusqlite::Connection,
    gallery_character_id: Option<&str>,
    example_image: Option<&str>,
) -> Option<String> {
    if let Some(gid) = gallery_character_id {
        let g: Option<String> = conn
            .query_row(
                "SELECT img_url FROM characters WHERE id = ?1",
                params![gid],
                |r| r.get::<_, Option<String>>(0),
            )
            .ok()
            .flatten();
        if g.as_deref().map(|s| !s.trim().is_empty()).unwrap_or(false) {
            return g;
        }
    }
    example_image
        .map(|s| s.to_string())
        .filter(|s| !s.trim().is_empty())
}

fn resolve_artist_image(
    conn: &rusqlite::Connection,
    gallery_artist_id: Option<&str>,
    example_image: Option<&str>,
) -> Option<String> {
    if let Some(gid) = gallery_artist_id {
        let g: Option<String> = conn
            .query_row(
                "SELECT img_url FROM artists WHERE id = ?1",
                params![gid],
                |r| r.get::<_, Option<String>>(0),
            )
            .ok()
            .flatten();
        if g.as_deref().map(|s| !s.trim().is_empty()).unwrap_or(false) {
            return g;
        }
    }
    example_image
        .map(|s| s.to_string())
        .filter(|s| !s.trim().is_empty())
}

fn load_character_tags(conn: &rusqlite::Connection, character_id: &str) -> Vec<String> {
    let mut stmt = match conn.prepare(
        "SELECT tag FROM favorite_character_tags WHERE character_id = ?1 ORDER BY tag",
    ) {
        Ok(s) => s,
        Err(_) => return vec![],
    };
    let rows = stmt.query_map(params![character_id], |r| r.get::<_, String>(0));
    let mut out = vec![];
    if let Ok(rows) = rows {
        for r in rows {
            if let Ok(t) = r {
                out.push(t);
            }
        }
    }
    out
}

// ========== 收藏角色 CRUD ==========

#[tauri::command]
pub async fn list_favorite_characters(
    state: State<'_, AppState>,
    tags: Option<Vec<String>>,
    tag_match: Option<String>, // "or" (默认) | "and"
    search: Option<String>,
    limit: Option<usize>,
    offset: Option<usize>,
) -> Result<Vec<FavoriteCharacter>, String> {
    let db = state.db.lock().await;

    let limit = limit.unwrap_or(50).min(500);
    let offset = offset.unwrap_or(0);
    let mode = tag_match.unwrap_or_else(|| "or".to_string());
    let tags_clean: Vec<String> = tags
        .unwrap_or_default()
        .into_iter()
        .map(|t| normalize_tag(&t))
        .filter(|t| !t.is_empty())
        .collect();

    // 基础 SQL：搜 favorite_characters，可选关键字过滤 tag/character_tag/display_name
    let mut sql = String::from(
        "SELECT id, character_tag, display_name, source, gallery_character_id, \"trigger\", example_image, notes, created_at, updated_at \
         FROM favorite_characters",
    );
    let mut args: Vec<String> = Vec::new();
    let mut where_clauses: Vec<String> = Vec::new();

    if let Some(s) = &search {
        if !s.trim().is_empty() {
            where_clauses.push(
                "(character_tag LIKE ? OR display_name LIKE ? OR notes LIKE ? OR \"trigger\" LIKE ?)".to_string(),
            );
            let p = format!("%{}%", s.trim());
            for _ in 0..4 {
                args.push(p.clone());
            }
        }
    }

    if !tags_clean.is_empty() {
        // 子查询：匹配 tag 集合的 character_id
        let placeholders = (0..tags_clean.len()).map(|_| "?").collect::<Vec<_>>().join(",");
        let having = if mode.eq_ignore_ascii_case("and") {
            // AND: 必须命中所有 tag
            format!("COUNT(DISTINCT tag) = {}", tags_clean.len())
        } else {
            // OR: 命中至少 1 个
            format!("COUNT(DISTINCT tag) >= 1")
        };
        where_clauses.push(format!(
            "id IN (SELECT character_id FROM favorite_character_tags WHERE tag IN ({}) GROUP BY character_id HAVING {})",
            placeholders, having
        ));
        for t in &tags_clean {
            args.push(t.clone());
        }
    }

    if !where_clauses.is_empty() {
        sql.push_str(" WHERE ");
        sql.push_str(&where_clauses.join(" AND "));
    }
    sql.push_str(" ORDER BY created_at DESC LIMIT ? OFFSET ?");

    let mut rusqlite_args: Vec<&dyn rusqlite::ToSql> = Vec::new();
    for a in &args {
        rusqlite_args.push(a);
    }
    let limit_i64 = limit as i64;
    let offset_i64 = offset as i64;
    rusqlite_args.push(&limit_i64);
    rusqlite_args.push(&offset_i64);

    let mut stmt = db.conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(rusqlite_args.as_slice(), |row| {
            Ok((
                row.get::<_, String>(0)?,       // id
                row.get::<_, String>(1)?,       // character_tag
                row.get::<_, Option<String>>(2)?, // display_name
                row.get::<_, String>(3)?,       // source
                row.get::<_, Option<String>>(4)?, // gallery_character_id
                row.get::<_, Option<String>>(5)?, // trigger
                row.get::<_, Option<String>>(6)?, // example_image
                row.get::<_, Option<String>>(7)?, // notes
                row.get::<_, i64>(8)?,          // created_at
                row.get::<_, i64>(9)?,          // updated_at
            ))
        })
        .map_err(|e| e.to_string())?;

    let mut out = Vec::new();
    for r in rows {
        let (id, character_tag, display_name, source, gallery_character_id, trigger, example_image, notes, created_at, updated_at) =
            r.map_err(|e| e.to_string())?;
        let resolved_image = resolve_character_image(
            &db.conn,
            gallery_character_id.as_deref(),
            example_image.as_deref(),
        );
        let tags_vec = load_character_tags(&db.conn, &id);
        out.push(FavoriteCharacter {
            id,
            character_tag,
            display_name,
            source,
            gallery_character_id,
            trigger,
            example_image,
            notes,
            created_at,
            updated_at,
            resolved_image,
            tags: Some(tags_vec),
        });
    }
    Ok(out)
}

#[tauri::command]
pub async fn add_favorite_character(
    state: State<'_, AppState>,
    character_tag: String,
    source: Option<String>,
    display_name: Option<String>,
    trigger: Option<String>,
    example_image: Option<String>,
    notes: Option<String>,
    tags: Option<Vec<String>>,
) -> Result<FavoriteCharacter, String> {
    let db = state.db.lock().await;
    let tag = normalize_tag(&character_tag);
    if tag.is_empty() {
        return Err("character_tag 不能为空".to_string());
    }
    let source = source.unwrap_or_else(|| "unknown".to_string());
    let now = now();

    // 尝试 gallery 自动补全：若 agent 没传 trigger/display_name/gallery_id，
    // 用 tag 在 characters 表查；查到就回填。agent 显式传的 trigger/display_name 优先。
    let mut gallery_character_id: Option<String> = None;
    let mut auto_trigger: Option<String> = None;
    let mut auto_display: Option<String> = None;
    if let Some((gid, name_zh, name_en, trig, _img)) = find_gallery_character(&db.conn, &tag) {
        gallery_character_id = Some(gid);
        auto_trigger = trig;
        auto_display = name_zh.filter(|s| !s.is_empty()).or_else(|| Some(name_en));
    }

    let final_trigger = trigger.or(auto_trigger);
    let final_display = display_name.or(auto_display);
    let final_source = if gallery_character_id.is_some() && source == "unknown" {
        "gallery".to_string()
    } else {
        source
    };

    // upsert：tag 已存在则更新（仅追加式更新，不覆盖 source/gallery_id 防止 agent 误改身份）
    let id = uuid::Uuid::new_v4().to_string();
    let inserted = db.conn.execute(
        "INSERT INTO favorite_characters (id, character_tag, display_name, source, gallery_character_id, \"trigger\", example_image, notes, created_at, updated_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9) \
         ON CONFLICT(character_tag) DO UPDATE SET \
             display_name = COALESCE(excluded.display_name, favorite_characters.display_name), \
             \"trigger\"   = COALESCE(excluded.\"trigger\", favorite_characters.\"trigger\"), \
             example_image = COALESCE(excluded.example_image, favorite_characters.example_image), \
             notes        = COALESCE(excluded.notes, favorite_characters.notes), \
             updated_at   = excluded.updated_at",
        params![id, tag, final_display, final_source, gallery_character_id, final_trigger, example_image, notes, now],
    ).map_err(|e| e.to_string())?;

    // 取出最终行（可能是新插入也可能是已存在的）
    let row: (String, String, Option<String>, String, Option<String>, Option<String>, Option<String>, Option<String>, i64, i64) = db.conn.query_row(
        "SELECT id, character_tag, display_name, source, gallery_character_id, \"trigger\", example_image, notes, created_at, updated_at \
         FROM favorite_characters WHERE character_tag = ?1",
        params![tag],
        |r| Ok((
            r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?, r.get(6)?, r.get(7)?, r.get(8)?, r.get(9)?,
        )),
    ).map_err(|e| e.to_string())?;

    // 追加 tag（INSERT OR IGNORE 保证重复 idempotent）
    if let Some(tags_in) = tags {
        for t in tags_in {
            let tn = normalize_tag(&t);
            if tn.is_empty() {
                continue;
            }
            let _ = db.conn.execute(
                "INSERT OR IGNORE INTO favorite_character_tags (character_id, tag) VALUES (?1, ?2)",
                params![row.0, tn],
            );
        }
    } else if inserted == 0 {
        // upsert 命中已有行且没传 tags：保留现有 tags
    }

    let resolved_image = resolve_character_image(&db.conn, row.4.as_deref(), row.6.as_deref());
    let tags_vec = load_character_tags(&db.conn, &row.0);
    Ok(FavoriteCharacter {
        id: row.0,
        character_tag: row.1,
        display_name: row.2,
        source: row.3,
        gallery_character_id: row.4,
        trigger: row.5,
        example_image: row.6,
        notes: row.7,
        created_at: row.8,
        updated_at: row.9,
        resolved_image,
        tags: Some(tags_vec),
    })
}

#[tauri::command]
pub async fn update_favorite_character(
    state: State<'_, AppState>,
    id: String,
    display_name: Option<String>,
    trigger: Option<String>,
    example_image: Option<String>,
    notes: Option<String>,
) -> Result<(), String> {
    let db = state.db.lock().await;
    // 仅允许改 display_name/trigger/example_image/notes。
    // source / character_tag / gallery_character_id 不允许通过此接口改。
    db.conn.execute(
        "UPDATE favorite_characters SET \
            display_name  = COALESCE(?1, display_name), \
            \"trigger\"   = COALESCE(?2, \"trigger\"), \
            example_image = COALESCE(?3, example_image), \
            notes         = COALESCE(?4, notes), \
            updated_at    = ?5 \
         WHERE id = ?6",
        params![display_name, trigger, example_image, notes, now(), id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn remove_favorite_character(
    state: State<'_, AppState>,
    id: Option<String>,
    character_tag: Option<String>,
) -> Result<bool, String> {
    let db = state.db.lock().await;
    let n = if let Some(id) = id {
        db.conn.execute(
            "DELETE FROM favorite_characters WHERE id = ?1",
            params![id],
        )
    } else if let Some(t) = character_tag {
        let t = normalize_tag(&t);
        db.conn.execute(
            "DELETE FROM favorite_characters WHERE character_tag = ?1",
            params![t],
        )
    } else {
        return Err("必须提供 id 或 character_tag".to_string());
    };
    match n {
        Ok(rows) => Ok(rows > 0),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub async fn relink_favorite_character(
    state: State<'_, AppState>,
    id: String,
) -> Result<FavoriteCharacter, String> {
    let db = state.db.lock().await;
    let tag: String = db
        .conn
        .query_row(
            "SELECT character_tag FROM favorite_characters WHERE id = ?1",
            params![id],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;

    let mut new_gid: Option<String> = None;
    let mut auto_trigger: Option<String> = None;
    let mut auto_display: Option<String> = None;
    if let Some((gid, name_zh, name_en, trig, _img)) = find_gallery_character(&db.conn, &tag) {
        new_gid = Some(gid);
        auto_trigger = trig;
        auto_display = name_zh.filter(|s| !s.is_empty()).or_else(|| Some(name_en));
    }

    db.conn.execute(
        "UPDATE favorite_characters SET \
            gallery_character_id = ?1, \
            \"trigger\" = COALESCE(?2, \"trigger\"), \
            display_name = COALESCE(?3, display_name), \
            source = CASE WHEN ?1 IS NOT NULL THEN 'gallery' ELSE source END, \
            updated_at = ?4 \
         WHERE id = ?5",
        params![new_gid, auto_trigger, auto_display, now(), id],
    ).map_err(|e| e.to_string())?;

    let row: (String, String, Option<String>, String, Option<String>, Option<String>, Option<String>, Option<String>, i64, i64) = db.conn.query_row(
        "SELECT id, character_tag, display_name, source, gallery_character_id, \"trigger\", example_image, notes, created_at, updated_at \
         FROM favorite_characters WHERE id = ?1",
        params![id],
        |r| Ok((
            r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?, r.get(6)?, r.get(7)?, r.get(8)?, r.get(9)?,
        )),
    ).map_err(|e| e.to_string())?;

    let resolved_image = resolve_character_image(&db.conn, row.4.as_deref(), row.6.as_deref());
    let tags_vec = load_character_tags(&db.conn, &row.0);
    Ok(FavoriteCharacter {
        id: row.0,
        character_tag: row.1,
        display_name: row.2,
        source: row.3,
        gallery_character_id: row.4,
        trigger: row.5,
        example_image: row.6,
        notes: row.7,
        created_at: row.8,
        updated_at: row.9,
        resolved_image,
        tags: Some(tags_vec),
    })
}

// ========== 收藏角色 Tag CRUD ==========

#[tauri::command]
pub async fn add_tags_to_favorite_character(
    state: State<'_, AppState>,
    character_id: String,
    tags: Vec<String>,
) -> Result<usize, String> {
    let db = state.db.lock().await;
    let mut added = 0usize;
    for t in tags {
        let tn = normalize_tag(&t);
        if tn.is_empty() {
            continue;
        }
        let n = db.conn.execute(
            "INSERT OR IGNORE INTO favorite_character_tags (character_id, tag) VALUES (?1, ?2)",
            params![character_id, tn],
        ).map_err(|e| e.to_string())?;
        added += n;
    }
    Ok(added)
}

#[tauri::command]
pub async fn remove_tag_from_favorite_character(
    state: State<'_, AppState>,
    character_id: String,
    tag: String,
) -> Result<bool, String> {
    let db = state.db.lock().await;
    let tn = normalize_tag(&tag);
    let n = db.conn.execute(
        "DELETE FROM favorite_character_tags WHERE character_id = ?1 AND tag = ?2",
        params![character_id, tn],
    ).map_err(|e| e.to_string())?;
    Ok(n > 0)
}

#[tauri::command]
pub async fn set_favorite_character_tags(
    state: State<'_, AppState>,
    character_id: String,
    tags: Vec<String>,
) -> Result<usize, String> {
    let db = state.db.lock().await;
    // 整批覆盖：先清后插
    db.conn.execute(
        "DELETE FROM favorite_character_tags WHERE character_id = ?1",
        params![character_id],
    ).map_err(|e| e.to_string())?;
    let mut count = 0usize;
    let mut seen = std::collections::HashSet::new();
    for t in tags {
        let tn = normalize_tag(&t);
        if tn.is_empty() || !seen.insert(tn.clone()) {
            continue;
        }
        db.conn.execute(
            "INSERT OR IGNORE INTO favorite_character_tags (character_id, tag) VALUES (?1, ?2)",
            params![character_id, tn],
        ).map_err(|e| e.to_string())?;
        count += 1;
    }
    Ok(count)
}

#[tauri::command]
pub async fn list_favorite_character_tags(
    state: State<'_, AppState>,
) -> Result<Vec<FavoriteCharacterTagCount>, String> {
    let db = state.db.lock().await;
    let mut stmt = db.conn.prepare(
        "SELECT tag, COUNT(*) AS cnt FROM favorite_character_tags GROUP BY tag ORDER BY cnt DESC, tag ASC",
    ).map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |r| {
        Ok(FavoriteCharacterTagCount {
            tag: r.get(0)?,
            count: r.get(1)?,
        })
    }).map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

// ========== 收藏画师 CRUD ==========

#[tauri::command]
pub async fn list_favorite_artists(
    state: State<'_, AppState>,
    search: Option<String>,
    limit: Option<usize>,
    offset: Option<usize>,
) -> Result<Vec<FavoriteArtist>, String> {
    let db = state.db.lock().await;
    let limit = limit.unwrap_or(50).min(500);
    let offset = offset.unwrap_or(0);

    let mut sql = String::from(
        "SELECT id, artist_tag, display_name, source, gallery_artist_id, \"trigger\", example_image, notes, created_at, updated_at \
         FROM favorite_artists",
    );
    let mut args: Vec<String> = Vec::new();
    if let Some(s) = &search {
        if !s.trim().is_empty() {
            sql.push_str(" WHERE (artist_tag LIKE ? OR display_name LIKE ? OR notes LIKE ? OR \"trigger\" LIKE ?)");
            let p = format!("%{}%", s.trim());
            for _ in 0..4 {
                args.push(p.clone());
            }
        }
    }
    sql.push_str(" ORDER BY created_at DESC LIMIT ? OFFSET ?");

    let mut rusqlite_args: Vec<&dyn rusqlite::ToSql> = Vec::new();
    for a in &args {
        rusqlite_args.push(a);
    }
    let limit_i64 = limit as i64;
    let offset_i64 = offset as i64;
    rusqlite_args.push(&limit_i64);
    rusqlite_args.push(&offset_i64);

    let mut stmt = db.conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt.query_map(rusqlite_args.as_slice(), |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, Option<String>>(2)?,
            row.get::<_, String>(3)?,
            row.get::<_, Option<String>>(4)?,
            row.get::<_, Option<String>>(5)?,
            row.get::<_, Option<String>>(6)?,
            row.get::<_, Option<String>>(7)?,
            row.get::<_, i64>(8)?,
            row.get::<_, i64>(9)?,
        ))
    }).map_err(|e| e.to_string())?;

    let mut out = Vec::new();
    for r in rows {
        let (id, artist_tag, display_name, source, gallery_artist_id, trigger, example_image, notes, created_at, updated_at) =
            r.map_err(|e| e.to_string())?;
        let resolved_image = resolve_artist_image(
            &db.conn,
            gallery_artist_id.as_deref(),
            example_image.as_deref(),
        );
        out.push(FavoriteArtist {
            id,
            artist_tag,
            display_name,
            source,
            gallery_artist_id,
            trigger,
            example_image,
            notes,
            created_at,
            updated_at,
            resolved_image,
        });
    }
    Ok(out)
}

#[tauri::command]
pub async fn add_favorite_artist(
    state: State<'_, AppState>,
    artist_tag: String,
    source: Option<String>,
    display_name: Option<String>,
    trigger: Option<String>,
    example_image: Option<String>,
    notes: Option<String>,
) -> Result<FavoriteArtist, String> {
    let db = state.db.lock().await;
    let tag = normalize_tag(&artist_tag);
    if tag.is_empty() {
        return Err("artist_tag 不能为空".to_string());
    }
    let source = source.unwrap_or_else(|| "unknown".to_string());
    let now = now();

    let mut gallery_artist_id: Option<String> = None;
    let mut auto_trigger: Option<String> = None;
    let mut auto_display: Option<String> = None;
    if let Some((gid, name_zh, name_en, trig, _img)) = find_gallery_artist(&db.conn, &tag) {
        gallery_artist_id = Some(gid);
        auto_trigger = trig;
        auto_display = name_zh.filter(|s| !s.is_empty()).or_else(|| Some(name_en));
    }
    let final_trigger = trigger.or(auto_trigger);
    let final_display = display_name.or(auto_display);
    let final_source = if gallery_artist_id.is_some() && source == "unknown" {
        "gallery".to_string()
    } else {
        source
    };

    let id = uuid::Uuid::new_v4().to_string();
    db.conn.execute(
        "INSERT INTO favorite_artists (id, artist_tag, display_name, source, gallery_artist_id, \"trigger\", example_image, notes, created_at, updated_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9) \
         ON CONFLICT(artist_tag) DO UPDATE SET \
             display_name  = COALESCE(excluded.display_name, favorite_artists.display_name), \
             \"trigger\"    = COALESCE(excluded.\"trigger\", favorite_artists.\"trigger\"), \
             example_image = COALESCE(excluded.example_image, favorite_artists.example_image), \
             notes         = COALESCE(excluded.notes, favorite_artists.notes), \
             updated_at    = excluded.updated_at",
        params![id, tag, final_display, final_source, gallery_artist_id, final_trigger, example_image, notes, now],
    ).map_err(|e| e.to_string())?;

    let row: (String, String, Option<String>, String, Option<String>, Option<String>, Option<String>, Option<String>, i64, i64) = db.conn.query_row(
        "SELECT id, artist_tag, display_name, source, gallery_artist_id, \"trigger\", example_image, notes, created_at, updated_at \
         FROM favorite_artists WHERE artist_tag = ?1",
        params![tag],
        |r| Ok((
            r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?, r.get(6)?, r.get(7)?, r.get(8)?, r.get(9)?,
        )),
    ).map_err(|e| e.to_string())?;

    let resolved_image = resolve_artist_image(&db.conn, row.4.as_deref(), row.6.as_deref());
    Ok(FavoriteArtist {
        id: row.0,
        artist_tag: row.1,
        display_name: row.2,
        source: row.3,
        gallery_artist_id: row.4,
        trigger: row.5,
        example_image: row.6,
        notes: row.7,
        created_at: row.8,
        updated_at: row.9,
        resolved_image,
    })
}

#[tauri::command]
pub async fn update_favorite_artist(
    state: State<'_, AppState>,
    id: String,
    display_name: Option<String>,
    trigger: Option<String>,
    example_image: Option<String>,
    notes: Option<String>,
) -> Result<(), String> {
    let db = state.db.lock().await;
    db.conn.execute(
        "UPDATE favorite_artists SET \
            display_name  = COALESCE(?1, display_name), \
            \"trigger\"   = COALESCE(?2, \"trigger\"), \
            example_image = COALESCE(?3, example_image), \
            notes         = COALESCE(?4, notes), \
            updated_at    = ?5 \
         WHERE id = ?6",
        params![display_name, trigger, example_image, notes, now(), id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn remove_favorite_artist(
    state: State<'_, AppState>,
    id: Option<String>,
    artist_tag: Option<String>,
) -> Result<bool, String> {
    let db = state.db.lock().await;
    let n = if let Some(id) = id {
        db.conn.execute("DELETE FROM favorite_artists WHERE id = ?1", params![id])
    } else if let Some(t) = artist_tag {
        let t = normalize_tag(&t);
        db.conn.execute("DELETE FROM favorite_artists WHERE artist_tag = ?1", params![t])
    } else {
        return Err("必须提供 id 或 artist_tag".to_string());
    };
    match n {
        Ok(rows) => Ok(rows > 0),
        Err(e) => Err(e.to_string()),
    }
}
