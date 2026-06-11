use tauri::State;
use crate::AppState;
use crate::db::models::CustomStyle;
use rusqlite::params;
use std::time::{SystemTime, UNIX_EPOCH};

fn now() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis() as i64
}

#[tauri::command]
pub async fn get_custom_styles(state: State<'_, AppState>) -> Result<Vec<CustomStyle>, String> {
    let db = state.db.lock().await;
    let mut stmt = db.conn.prepare("SELECT * FROM custom_styles ORDER BY created_at DESC")
        .map_err(|e| e.to_string())?;

    let rows = stmt.query_map([], |row| {
        Ok(CustomStyle {
            id: row.get("id")?,
            name: row.get("name")?,
            trigger: row.get("trigger")?,
            category: row.get("category")?,
            preview: row.get("preview")?,
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
pub async fn add_custom_style(
    state: State<'_, AppState>,
    name: String,
    trigger: String,
    category: String,
    preview: Option<String>,
) -> Result<CustomStyle, String> {
    let db = state.db.lock().await;
    let id = uuid::Uuid::new_v4().to_string();
    let created_at = now();

    db.conn.execute(
        "INSERT INTO custom_styles (id, name, trigger, category, preview, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![id, name, trigger, category, preview, created_at]
    ).map_err(|e| e.to_string())?;

    Ok(CustomStyle {
        id,
        name,
        trigger,
        category,
        preview,
        created_at,
    })
}

#[tauri::command]
pub async fn delete_custom_style(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let db = state.db.lock().await;
    db.conn.execute("DELETE FROM custom_styles WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}
