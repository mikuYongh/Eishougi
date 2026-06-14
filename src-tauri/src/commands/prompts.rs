use tauri::State;
use crate::AppState;
use crate::db::models::{Prompt, PromptFilter, PromptImage};
use rusqlite::{params, OptionalExtension};
use std::time::{SystemTime, UNIX_EPOCH};

fn now() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis() as i64
}

#[tauri::command]
pub async fn create_prompt(state: State<'_, AppState>, mut prompt: Prompt) -> Result<Prompt, String> {
    let db = state.db.lock().await;
    prompt.created_at = now();
    prompt.updated_at = prompt.created_at;
    
    db.conn.execute(
        "INSERT INTO prompts (
            id, title, description, positive_prompt, negative_prompt, artist_prompt,
            seed, width, height, steps, cfg_scale, sampler_name, scheduler,
            base_model, lora_configs, vae_model, resolution, workflow_id, is_favorite, is_pinned, created_at, updated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22)",
        params![
            prompt.id, prompt.title, prompt.description, prompt.positive_prompt, prompt.negative_prompt, prompt.artist_prompt,
            prompt.seed, prompt.width, prompt.height, prompt.steps, prompt.cfg_scale, prompt.sampler_name, prompt.scheduler,
            prompt.base_model, prompt.lora_configs, prompt.vae_model, prompt.resolution, prompt.workflow_id, prompt.is_favorite, prompt.is_pinned, prompt.created_at, prompt.updated_at
        ]
    ).map_err(|e| e.to_string())?;

    if let Some(images) = &prompt.images {
        for img in images {
            db.conn.execute(
                "INSERT INTO prompt_images (id, prompt_id, file_path, file_name, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                params![img.id, img.prompt_id, img.file_path, img.file_name, img.created_at]
            ).map_err(|e| e.to_string())?;
        }
    }

    if let Some(tags) = &prompt.tags {
        for tag in tags {
            db.conn.execute(
                "INSERT OR IGNORE INTO tags (id, name, color, created_at) VALUES (?1, ?2, ?3, ?4)",
                params![tag.id, tag.name, tag.color, tag.created_at]
            ).map_err(|e| e.to_string())?;
            
            let actual_tag_id: String = db.conn.query_row(
                "SELECT id FROM tags WHERE name = ?1",
                params![tag.name],
                |row| row.get(0)
            ).unwrap_or(tag.id.clone());

            db.conn.execute(
                "INSERT INTO prompt_tag_cross (prompt_id, tag_id) VALUES (?1, ?2)",
                params![prompt.id, actual_tag_id]
            ).map_err(|e| e.to_string())?;
        }
    }

    Ok(prompt)
}

#[tauri::command]
pub async fn get_prompt(state: State<'_, AppState>, id: String) -> Result<Option<Prompt>, String> {
    let db = state.db.lock().await;
    
    let mut stmt = db.conn.prepare("SELECT * FROM prompts WHERE id = ?1 AND deleted_at IS NULL").map_err(|e| e.to_string())?;
    let prompt = stmt.query_row(params![id], |row| {
        Ok(Prompt {
            id: row.get("id")?,
            title: row.get("title")?,
            description: row.get("description")?,
            positive_prompt: row.get("positive_prompt")?,
            negative_prompt: row.get("negative_prompt")?,
            artist_prompt: row.get("artist_prompt")?,
            seed: row.get("seed")?,
            width: row.get("width")?,
            height: row.get("height")?,
            steps: row.get("steps")?,
            cfg_scale: row.get("cfg_scale")?,
            sampler_name: row.get("sampler_name")?,
            scheduler: row.get("scheduler")?,
            base_model: row.get("base_model")?,
            lora_configs: row.get("lora_configs")?,
            vae_model: row.get("vae_model")?,
            resolution: row.get("resolution")?,
            workflow_id: row.get("workflow_id")?,
            is_favorite: row.get("is_favorite")?,
            is_pinned: row.get("is_pinned")?,
            created_at: row.get("created_at")?,
            updated_at: row.get("updated_at")?,
            deleted_at: row.get("deleted_at")?,
            tags: None,
            images: None,
        })
    }).optional().map_err(|e| e.to_string())?;
    
    if let Some(mut p) = prompt {
        let mut img_stmt = db.conn.prepare("SELECT * FROM prompt_images WHERE prompt_id = ?1").map_err(|e| e.to_string())?;
        let img_rows = img_stmt.query_map(params![p.id], |row| {
            Ok(PromptImage {
                id: row.get("id")?,
                prompt_id: row.get("prompt_id")?,
                file_path: row.get("file_path")?,
                file_name: row.get("file_name")?,
                created_at: row.get("created_at")?,
            })
        }).map_err(|e| e.to_string())?;
        
        let mut images = Vec::new();
        for img in img_rows {
            images.push(img.map_err(|e| e.to_string())?);
        }
        p.images = Some(images);

        let mut tags = Vec::new();
        let mut tag_stmt = db.conn.prepare("SELECT t.* FROM tags t INNER JOIN prompt_tag_cross pt ON t.id = pt.tag_id WHERE pt.prompt_id = ?1").map_err(|e| e.to_string())?;
        let tag_rows = tag_stmt.query_map(params![p.id], |row| {
            Ok(crate::db::models::Tag {
                id: row.get("id")?,
                name: row.get("name")?,
                color: row.get("color")?,
                created_at: row.get("created_at")?,
            })
        }).map_err(|e| e.to_string())?;
        
        for tag in tag_rows {
            tags.push(tag.map_err(|e| e.to_string())?);
        }
        p.tags = Some(tags);
        
        Ok(Some(p))
    } else {
        Ok(None)
    }
}

#[tauri::command]
pub async fn update_prompt(state: State<'_, AppState>, mut prompt: Prompt) -> Result<Prompt, String> {
    let db = state.db.lock().await;
    prompt.updated_at = now();
    
    println!("[Rust] update_prompt id={}, positive_prompt(first 80)={}, steps={}", 
        prompt.id, 
        &prompt.positive_prompt.chars().take(80).collect::<String>(),
        prompt.steps
    );
    
    let rows = db.conn.execute(
        "UPDATE prompts SET 
            title = ?1, description = ?2, positive_prompt = ?3, negative_prompt = ?4, artist_prompt = ?5,
            seed = ?6, width = ?7, height = ?8, steps = ?9, cfg_scale = ?10, sampler_name = ?11, scheduler = ?12,
            base_model = ?13, lora_configs = ?14, vae_model = ?15, resolution = ?16, workflow_id = ?17, is_favorite = ?18, is_pinned = ?19, updated_at = ?20
        WHERE id = ?21 AND deleted_at IS NULL",
        params![
            prompt.title, prompt.description, prompt.positive_prompt, prompt.negative_prompt, prompt.artist_prompt,
            prompt.seed, prompt.width, prompt.height, prompt.steps, prompt.cfg_scale, prompt.sampler_name, prompt.scheduler,
            prompt.base_model, prompt.lora_configs, prompt.vae_model, prompt.resolution, prompt.workflow_id, prompt.is_favorite, prompt.is_pinned, prompt.updated_at,
            prompt.id
        ]
    ).map_err(|e| e.to_string())?;
    
    println!("[Rust] update_prompt affected {} rows", rows);

    db.conn.execute("DELETE FROM prompt_images WHERE prompt_id = ?1", params![prompt.id.clone()]).map_err(|e| e.to_string())?;
    
    if let Some(images) = &prompt.images {
        for img in images {
            db.conn.execute(
                "INSERT INTO prompt_images (id, prompt_id, file_path, file_name, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                params![img.id, img.prompt_id, img.file_path, img.file_name, img.created_at]
            ).map_err(|e| e.to_string())?;
        }
    }

    db.conn.execute("DELETE FROM prompt_tag_cross WHERE prompt_id = ?1", params![prompt.id.clone()]).map_err(|e| e.to_string())?;
    
    if let Some(tags) = &prompt.tags {
        for tag in tags {
            db.conn.execute(
                "INSERT OR IGNORE INTO tags (id, name, color, created_at) VALUES (?1, ?2, ?3, ?4)",
                params![tag.id, tag.name, tag.color, tag.created_at]
            ).map_err(|e| e.to_string())?;
            
            let actual_tag_id: String = db.conn.query_row(
                "SELECT id FROM tags WHERE name = ?1",
                params![tag.name],
                |row| row.get(0)
            ).unwrap_or(tag.id.clone());

            db.conn.execute(
                "INSERT INTO prompt_tag_cross (prompt_id, tag_id) VALUES (?1, ?2)",
                params![prompt.id, actual_tag_id]
            ).map_err(|e| e.to_string())?;
        }
    }

    Ok(prompt)
}

#[tauri::command]
pub async fn delete_prompt(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let db = state.db.lock().await;
    db.conn.execute("UPDATE prompts SET deleted_at = ?1 WHERE id = ?2", params![now(), id]).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn list_prompts(state: State<'_, AppState>, filter: Option<PromptFilter>) -> Result<Vec<Prompt>, String> {
    let db = state.db.lock().await;
    let mut query = "SELECT * FROM prompts WHERE deleted_at IS NULL".to_string();
    
    if let Some(f) = &filter {
        if let Some(fav) = f.favorite {
            if fav { query.push_str(" AND is_favorite = 1"); }
        }
        if let Some(pin) = f.pinned {
            if pin { query.push_str(" AND is_pinned = 1"); }
        }
    }
    
    query.push_str(" ORDER BY created_at DESC");
    
    if let Some(f) = &filter {
        if let Some(l) = f.limit {
            query.push_str(&format!(" LIMIT {}", l));
            if let Some(o) = f.offset {
                query.push_str(&format!(" OFFSET {}", o));
            }
        }
    }

    let mut stmt = db.conn.prepare(&query).map_err(|e| e.to_string())?;
    
    let rows = stmt.query_map([], |row| {
        Ok(Prompt {
            id: row.get("id")?,
            title: row.get("title")?,
            description: row.get("description")?,
            positive_prompt: row.get("positive_prompt")?,
            negative_prompt: row.get("negative_prompt")?,
            artist_prompt: row.get("artist_prompt")?,
            seed: row.get("seed")?,
            width: row.get("width")?,
            height: row.get("height")?,
            steps: row.get("steps")?,
            cfg_scale: row.get("cfg_scale")?,
            sampler_name: row.get("sampler_name")?,
            scheduler: row.get("scheduler")?,
            base_model: row.get("base_model")?,
            lora_configs: row.get("lora_configs")?,
            vae_model: row.get("vae_model")?,
            resolution: row.get("resolution")?,
            workflow_id: row.get("workflow_id")?,
            is_favorite: row.get("is_favorite")?,
            is_pinned: row.get("is_pinned")?,
            created_at: row.get("created_at")?,
            updated_at: row.get("updated_at")?,
            deleted_at: row.get("deleted_at")?,
            tags: None,
            images: None,
        })
    }).map_err(|e| e.to_string())?;

    let mut prompts = Vec::new();
    for prompt_result in rows {
        let mut p = prompt_result.map_err(|e| e.to_string())?;
        p.images = Some(Vec::new());
        p.tags = Some(Vec::new());
        prompts.push(p);
    }

    if prompts.is_empty() {
        return Ok(prompts);
    }

    // Prepare an IN clause for all prompt IDs
    let id_list = prompts.iter()
        .map(|p| format!("'{}'", p.id.replace('\'', "''")))
        .collect::<Vec<String>>()
        .join(",");

    // 1. Bulk fetch all images for these prompts
    let img_query = format!("SELECT * FROM prompt_images WHERE prompt_id IN ({})", id_list);
    let mut img_stmt = db.conn.prepare(&img_query).map_err(|e| e.to_string())?;
    
    let img_rows = img_stmt.query_map([], |row| {
        Ok(PromptImage {
            id: row.get("id")?,
            prompt_id: row.get("prompt_id")?,
            file_path: row.get("file_path")?,
            file_name: row.get("file_name")?,
            created_at: row.get("created_at")?,
        })
    }).map_err(|e| e.to_string())?;

    use std::collections::HashMap;
    let mut images_map: HashMap<String, Vec<PromptImage>> = HashMap::new();
    for img_result in img_rows {
        if let Ok(img) = img_result {
            images_map.entry(img.prompt_id.clone()).or_default().push(img);
        }
    }

    // 2. Bulk fetch all tags for these prompts
    let tag_query = format!(
        "SELECT t.*, pt.prompt_id FROM tags t INNER JOIN prompt_tag_cross pt ON t.id = pt.tag_id WHERE pt.prompt_id IN ({})",
        id_list
    );
    let mut tag_stmt = db.conn.prepare(&tag_query).map_err(|e| e.to_string())?;
    
    let tag_rows = tag_stmt.query_map([], |row| {
        Ok((
            row.get::<_, String>("prompt_id")?,
            crate::db::models::Tag {
                id: row.get("id")?,
                name: row.get("name")?,
                color: row.get("color")?,
                created_at: row.get("created_at")?,
            }
        ))
    }).map_err(|e| e.to_string())?;

    let mut tags_map: HashMap<String, Vec<crate::db::models::Tag>> = HashMap::new();
    for tag_result in tag_rows {
        if let Ok((prompt_id, tag)) = tag_result {
            tags_map.entry(prompt_id).or_default().push(tag);
        }
    }

    // Assign back to prompts
    for p in prompts.iter_mut() {
        if let Some(imgs) = images_map.remove(&p.id) {
            p.images = Some(imgs);
        }
        if let Some(tgs) = tags_map.remove(&p.id) {
            p.tags = Some(tgs);
        }
    }

    Ok(prompts)
}
