use crate::db::models::GeneratedImage;
use crate::AppState;
use rusqlite::{params, OptionalExtension};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::State;

fn now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis() as i64
}

#[tauri::command]
pub async fn save_generated_image(
    state: State<'_, AppState>,
    mut image: GeneratedImage,
) -> Result<GeneratedImage, String> {
    let db = state.db.lock().await;
    image.created_at = now();

    db.conn.execute(
        "INSERT INTO generated_images (id, prompt_id, workflow_id, seed, output_path, output_type, status, error_msg, is_saved, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params![
            image.id, image.prompt_id, image.workflow_id, image.seed, image.output_path, image.output_type,
            image.status, image.error_msg, image.is_saved, image.created_at
        ]
    ).map_err(|e| e.to_string())?;

    Ok(image)
}

#[tauri::command]
pub async fn get_generated_image(
    state: State<'_, AppState>,
    id: String,
) -> Result<Option<GeneratedImage>, String> {
    let db = state.db.lock().await;
    let mut stmt = db
        .conn
        .prepare("SELECT * FROM generated_images WHERE id = ?1")
        .map_err(|e| e.to_string())?;

    let image = stmt
        .query_row(params![id], |row| {
            Ok(GeneratedImage {
                id: row.get("id")?,
                prompt_id: row.get("prompt_id")?,
                workflow_id: row.get("workflow_id")?,
                seed: row.get("seed")?,
                output_path: row.get("output_path")?,
                output_type: row.get("output_type")?,
                status: row.get("status")?,
                error_msg: row.get("error_msg")?,
                is_saved: row.get("is_saved")?,
                created_at: row.get("created_at")?,
            })
        })
        .optional()
        .map_err(|e| e.to_string())?;

    Ok(image)
}

#[tauri::command]
pub async fn list_generated_images(
    state: State<'_, AppState>,
) -> Result<Vec<GeneratedImage>, String> {
    let db = state.db.lock().await;
    let mut stmt = db
        .conn
        .prepare("SELECT * FROM generated_images ORDER BY created_at DESC")
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(GeneratedImage {
                id: row.get("id")?,
                prompt_id: row.get("prompt_id")?,
                workflow_id: row.get("workflow_id")?,
                seed: row.get("seed")?,
                output_path: row.get("output_path")?,
                output_type: row.get("output_type")?,
                status: row.get("status")?,
                error_msg: row.get("error_msg")?,
                is_saved: row.get("is_saved")?,
                created_at: row.get("created_at")?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut images = Vec::new();
    for img in rows {
        images.push(img.map_err(|e| e.to_string())?);
    }

    Ok(images)
}

#[tauri::command]
pub async fn delete_generated_image(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let db = state.db.lock().await;
    let output_path: Option<String> = db
        .conn
        .query_row(
            "SELECT output_path FROM generated_images WHERE id = ?1",
            params![id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    db.conn
        .execute("DELETE FROM generated_images WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    drop(db);

    if let Some(path) = output_path {
        if let Err(error) = std::fs::remove_file(path) {
            if error.kind() != std::io::ErrorKind::NotFound {
                return Err(format!("历史记录已删除，但生成文件删除失败：{}", error));
            }
        }
    }
    Ok(())
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClearHistoryResult {
    pub records_deleted: usize,
    pub files_deleted: usize,
    pub files_failed: usize,
}

#[tauri::command]
pub async fn clear_generated_images(state: State<'_, AppState>) -> Result<ClearHistoryResult, String> {
    let db = state.db.lock().await;
    let mut stmt = db
        .conn
        .prepare("SELECT output_path FROM generated_images")
        .map_err(|e| e.to_string())?;
    let paths: Vec<String> = stmt
        .query_map([], |row| row.get(0))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<String>, _>>()
        .map_err(|e| e.to_string())?;
    drop(stmt);

    let records_deleted = db
        .conn
        .execute("DELETE FROM generated_images", [])
        .map_err(|e| e.to_string())?;
    drop(db);

    let mut files_deleted = 0;
    let mut files_failed = 0;
    for path in paths {
        match std::fs::remove_file(path) {
            Ok(()) => files_deleted += 1,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(_) => files_failed += 1,
        }
    }

    Ok(ClearHistoryResult { records_deleted, files_deleted, files_failed })
}

#[tauri::command]
pub async fn toggle_save_image(
    state: State<'_, AppState>,
    id: String,
    is_saved: bool,
) -> Result<(), String> {
    let db = state.db.lock().await;
    db.conn
        .execute(
            "UPDATE generated_images SET is_saved = ?1 WHERE id = ?2",
            params![is_saved, id],
        )
        .map_err(|e| e.to_string())?;
    Ok(())
}
