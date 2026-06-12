use tauri::State;
use crate::AppState;
use crate::db::models::{Character, Artist};
use rusqlite::params;

#[tauri::command]
pub async fn search_characters(
    state: State<'_, AppState>,
    search: Option<String>,
    limit: usize,
    offset: usize,
    favorite: Option<bool>,
) -> Result<Vec<Character>, String> {
    let db = state.db.lock().await;

    let mut query = "SELECT * FROM characters WHERE 1=1".to_string();
    let mut args: Vec<String> = Vec::new();

    if let Some(s) = search {
        if !s.trim().is_empty() {
            query.push_str(" AND (character_tag LIKE ? OR name_en LIKE ? OR name_zh LIKE ? OR \"trigger\" LIKE ?)");
            let pattern = format!("%{}%", s);
            args.push(pattern.clone());
            args.push(pattern.clone());
            args.push(pattern.clone());
            args.push(pattern);
        }
    }

    if let Some(fav) = favorite {
        query.push_str(if fav { " AND is_favorite = 1" } else { " AND is_favorite = 0" });
    }

    query.push_str(" ORDER BY \"count\" DESC, character_tag ASC LIMIT ? OFFSET ?");
    
    let mut rusqlite_args: Vec<&dyn rusqlite::ToSql> = Vec::new();
    for arg in &args {
        rusqlite_args.push(arg);
    }
    
    let limit_i64 = limit as i64;
    let offset_i64 = offset as i64;
    rusqlite_args.push(&limit_i64);
    rusqlite_args.push(&offset_i64);

    let mut stmt = db.conn.prepare(&query).map_err(|e| e.to_string())?;

    let rows = stmt.query_map(rusqlite_args.as_slice(), |row| {
        Ok(Character {
            id: row.get("id")?,
            character_tag: row.get("character_tag")?,
            name_en: row.get("name_en")?,
            name_zh: row.get("name_zh")?,
            copyright: row.get("copyright")?,
            trigger: row.get("trigger")?,
            core_tags: row.get("core_tags")?,
            count: row.get("count")?,
            img_url: row.get("img_url")?,
            is_favorite: row.get("is_favorite")?,
            created_at: row.get("created_at")?,
        })
    }).map_err(|e| e.to_string())?;

    let mut characters = Vec::new();
    for row in rows {
        characters.push(row.map_err(|e| e.to_string())?);
    }

    Ok(characters)
}

#[tauri::command]
pub async fn search_artists(
    state: State<'_, AppState>,
    search: Option<String>,
    limit: usize,
    offset: usize,
    favorite: Option<bool>,
) -> Result<Vec<Artist>, String> {
    let db = state.db.lock().await;

    let mut query = "SELECT * FROM artists WHERE 1=1".to_string();
    let mut args: Vec<String> = Vec::new();

    if let Some(s) = search {
        if !s.trim().is_empty() {
            query.push_str(" AND (artist_tag LIKE ? OR name_en LIKE ? OR name_zh LIKE ? OR \"trigger\" LIKE ?)");
            let pattern = format!("%{}%", s);
            args.push(pattern.clone());
            args.push(pattern.clone());
            args.push(pattern.clone());
            args.push(pattern);
        }
    }

    if let Some(fav) = favorite {
        query.push_str(if fav { " AND is_favorite = 1" } else { " AND is_favorite = 0" });
    }

    query.push_str(" ORDER BY \"count\" DESC, artist_tag ASC LIMIT ? OFFSET ?");
    
    let mut rusqlite_args: Vec<&dyn rusqlite::ToSql> = Vec::new();
    for arg in &args {
        rusqlite_args.push(arg);
    }
    
    let limit_i64 = limit as i64;
    let offset_i64 = offset as i64;
    rusqlite_args.push(&limit_i64);
    rusqlite_args.push(&offset_i64);

    let mut stmt = db.conn.prepare(&query).map_err(|e| e.to_string())?;

    let rows = stmt.query_map(rusqlite_args.as_slice(), |row| {
        Ok(Artist {
            id: row.get("id")?,
            artist_tag: row.get("artist_tag")?,
            name_en: row.get("name_en")?,
            name_zh: row.get("name_zh")?,
            trigger: row.get("trigger")?,
            count: row.get("count")?,
            img_url: row.get("img_url")?,
            is_favorite: row.get("is_favorite")?,
            created_at: row.get("created_at")?,
        })
    }).map_err(|e| e.to_string())?;

    let mut artists = Vec::new();
    for row in rows {
        artists.push(row.map_err(|e| e.to_string())?);
    }

    Ok(artists)
}

#[tauri::command]
pub async fn toggle_favorite_character(state: State<'_, AppState>, id: String) -> Result<bool, String> {
    let db = state.db.lock().await;

    let is_fav: bool = db.conn.query_row(
        "SELECT is_favorite FROM characters WHERE id = ?",
        params![id],
        |row| row.get(0)
    ).map_err(|e| e.to_string())?;

    let new_fav = !is_fav;

    db.conn.execute(
        "UPDATE characters SET is_favorite = ? WHERE id = ?",
        params![new_fav, id]
    ).map_err(|e| e.to_string())?;

    Ok(new_fav)
}

#[tauri::command]
pub async fn toggle_favorite_artist(state: State<'_, AppState>, id: String) -> Result<bool, String> {
    let db = state.db.lock().await;

    let is_fav: bool = db.conn.query_row(
        "SELECT is_favorite FROM artists WHERE id = ?",
        params![id],
        |row| row.get(0)
    ).map_err(|e| e.to_string())?;

    let new_fav = !is_fav;

    db.conn.execute(
        "UPDATE artists SET is_favorite = ? WHERE id = ?",
        params![new_fav, id]
    ).map_err(|e| e.to_string())?;

    Ok(new_fav)
}
