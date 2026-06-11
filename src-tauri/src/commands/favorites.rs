use tauri::State;
use crate::AppState;
use crate::db::models::FavoritePrompt;
use rusqlite::params;
use std::time::{SystemTime, UNIX_EPOCH};

fn now() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis() as i64
}

#[tauri::command]
pub async fn get_favorite_prompts(state: State<'_, AppState>, prompt_type: String) -> Result<Vec<FavoritePrompt>, String> {
    let db = state.db.lock().await;
    let mut stmt = db.conn.prepare("SELECT * FROM favorite_prompts WHERE type = ?1 ORDER BY created_at DESC")
        .map_err(|e| e.to_string())?;
    
    let rows = stmt.query_map(params![prompt_type], |row| {
        Ok(FavoritePrompt {
            id: row.get("id")?,
            content: row.get("content")?,
            prompt_type: row.get("type")?,
            label: row.get("label")?,
            created_at: row.get("created_at")?,
        })
    }).map_err(|e| e.to_string())?;

    let mut list = Vec::new();
    for r in rows {
        list.push(r.map_err(|e| e.to_string())?);
    }
    Ok(list)
}

#[tauri::command]
pub async fn add_favorite_prompt(
    state: State<'_, AppState>,
    content: String,
    prompt_type: String,
    label: Option<String>,
) -> Result<FavoritePrompt, String> {
    let db = state.db.lock().await;
    let id = uuid::Uuid::new_v4().to_string();
    let created_at = now();

    db.conn.execute(
        "INSERT INTO favorite_prompts (id, content, type, label, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![id, content, prompt_type, label, created_at]
    ).map_err(|e| e.to_string())?;

    Ok(FavoritePrompt {
        id,
        content,
        prompt_type,
        label,
        created_at,
    })
}

#[tauri::command]
pub async fn delete_favorite_prompt(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let db = state.db.lock().await;
    db.conn.execute("DELETE FROM favorite_prompts WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}
