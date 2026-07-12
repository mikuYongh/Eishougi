use crate::db::models::Workflow;
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
pub async fn create_workflow(
    state: State<'_, AppState>,
    mut workflow: Workflow,
) -> Result<Workflow, String> {
    let db = state.db.lock().await;
    workflow.created_at = now();
    workflow.updated_at = workflow.created_at;
    // is_default 由 set_default_workflow 显式管理，禁止客户端在 create 时直写。
    // DB 有部分唯一索引 idx_workflows_default_per_type 强制约束。
    workflow.is_default = false;

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
pub async fn get_workflow(
    state: State<'_, AppState>,
    id: String,
) -> Result<Option<Workflow>, String> {
    let db = state.db.lock().await;
    let mut stmt = db
        .conn
        .prepare("SELECT * FROM workflows WHERE id = ?1")
        .map_err(|e| e.to_string())?;

    let workflow = stmt
        .query_row(params![id], |row| {
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
        })
        .optional()
        .map_err(|e| e.to_string())?;

    Ok(workflow)
}

#[tauri::command]
pub async fn update_workflow(
    state: State<'_, AppState>,
    mut workflow: Workflow,
) -> Result<Workflow, String> {
    let db = state.db.lock().await;
    workflow.updated_at = now();

    // 不允许通过 update 改 is_default：避免绕过 set_default_workflow 造成多默认。
    // type 字段也保持不变（改 type 应走新建+删旧，避免默认索引错位）。
    // 注意：不加 is_builtin = 0 过滤——内置默认工作流也需要允许用户修改 json_content
    // （比如换基础模型），否则 UPDATE 会静默匹配 0 行，用户改了重启后又被还原。
    db.conn.execute(
        "UPDATE workflows SET name = ?1, description = ?2, json_content = ?3, updated_at = ?4
         WHERE id = ?5",
        params![
            workflow.name, workflow.description, workflow.json_content,
            workflow.updated_at, workflow.id
        ]
    ).map_err(|e| e.to_string())?;

    Ok(workflow)
}

#[tauri::command]
pub async fn delete_workflow(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let db = state.db.lock().await;
    db.conn
        .execute(
            "DELETE FROM workflows WHERE id = ?1 AND is_builtin = 0",
            params![id],
        )
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn list_workflows(state: State<'_, AppState>) -> Result<Vec<Workflow>, String> {
    let db = state.db.lock().await;
    let mut stmt = db
        .conn
        .prepare("SELECT * FROM workflows ORDER BY created_at DESC")
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
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
        })
        .map_err(|e| e.to_string())?;

    let mut workflows = Vec::new();
    for w in rows {
        workflows.push(w.map_err(|e| e.to_string())?);
    }

    Ok(workflows)
}

#[tauri::command]
pub async fn set_default_workflow(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let mut db = state.db.lock().await;

    // 读目标的 type；不存在则报错
    let wf_type: String = db
        .conn
        .query_row(
            "SELECT type FROM workflows WHERE id = ?1",
            params![id],
            |row| row.get(0),
        )
        .map_err(|e| format!("workflow not found: {e}"))?;

    // 事务内：清零同 type 的所有默认 → 置一目标
    // 部分唯一索引 idx_workflows_default_per_type 保证不会出现多默认
    let tx = db.conn.transaction().map_err(|e| e.to_string())?;
    tx.execute(
        "UPDATE workflows SET is_default = 0 WHERE type = ?1",
        params![wf_type],
    )
    .map_err(|e| e.to_string())?;
    tx.execute(
        "UPDATE workflows SET is_default = 1 WHERE id = ?1",
        params![id],
    )
    .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;

    Ok(())
}
