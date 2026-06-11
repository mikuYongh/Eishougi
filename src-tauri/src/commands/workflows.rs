use tauri::State;
use crate::AppState;
use crate::db::models::Workflow;
use rusqlite::{params, OptionalExtension};
use std::time::{SystemTime, UNIX_EPOCH};

fn now() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis() as i64
}

#[tauri::command]
pub async fn create_workflow(state: State<'_, AppState>, mut workflow: Workflow) -> Result<Workflow, String> {
    let db = state.db.lock().await;
    workflow.created_at = now();
    workflow.updated_at = workflow.created_at;

    db.conn.execute(
        "INSERT INTO workflows (id, name, description, json_content, type, is_default, is_builtin, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![
            workflow.id, workflow.name, workflow.description, workflow.json_content, workflow.workflow_type,
            workflow.is_default, workflow.is_builtin, workflow.created_at, workflow.updated_at
        ]
    ).map_err(|e| e.to_string())?;

    Ok(workflow)
}

#[tauri::command]
pub async fn get_workflow(state: State<'_, AppState>, id: String) -> Result<Option<Workflow>, String> {
    let db = state.db.lock().await;
    let mut stmt = db.conn.prepare("SELECT * FROM workflows WHERE id = ?1").map_err(|e| e.to_string())?;
    
    let workflow = stmt.query_row(params![id], |row| {
        Ok(Workflow {
            id: row.get("id")?,
            name: row.get("name")?,
            description: row.get("description")?,
            json_content: row.get("json_content")?,
            workflow_type: row.get("type")?,
            is_default: row.get("is_default")?,
            is_builtin: row.get("is_builtin")?,
            created_at: row.get("created_at")?,
            updated_at: row.get("updated_at")?,
        })
    }).optional().map_err(|e| e.to_string())?;

    Ok(workflow)
}

#[tauri::command]
pub async fn update_workflow(state: State<'_, AppState>, mut workflow: Workflow) -> Result<Workflow, String> {
    let db = state.db.lock().await;
    workflow.updated_at = now();

    db.conn.execute(
        "UPDATE workflows SET name = ?1, description = ?2, json_content = ?3, type = ?4, is_default = ?5, updated_at = ?6
         WHERE id = ?7 AND is_builtin = 0",
        params![
            workflow.name, workflow.description, workflow.json_content, workflow.workflow_type,
            workflow.is_default, workflow.updated_at, workflow.id
        ]
    ).map_err(|e| e.to_string())?;

    Ok(workflow)
}

#[tauri::command]
pub async fn delete_workflow(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let db = state.db.lock().await;
    db.conn.execute("DELETE FROM workflows WHERE id = ?1 AND is_builtin = 0", params![id]).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn list_workflows(state: State<'_, AppState>) -> Result<Vec<Workflow>, String> {
    let db = state.db.lock().await;
    let mut stmt = db.conn.prepare("SELECT * FROM workflows ORDER BY created_at DESC").map_err(|e| e.to_string())?;
    
    let rows = stmt.query_map([], |row| {
        Ok(Workflow {
            id: row.get("id")?,
            name: row.get("name")?,
            description: row.get("description")?,
            json_content: row.get("json_content")?,
            workflow_type: row.get("type")?,
            is_default: row.get("is_default")?,
            is_builtin: row.get("is_builtin")?,
            created_at: row.get("created_at")?,
            updated_at: row.get("updated_at")?,
        })
    }).map_err(|e| e.to_string())?;

    let mut workflows = Vec::new();
    for w in rows {
        workflows.push(w.map_err(|e| e.to_string())?);
    }
    
    Ok(workflows)
}
