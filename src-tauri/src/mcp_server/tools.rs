//! MCP tool definitions and their execution dispatch.
//!
//! Each tool maps a public MCP name to an existing Tauri command implementation. The handler
//! accesses `AppState` via the `AppHandle` (same pattern as `comfy_ws::process_executed`), so it
//! shares the same SQLite database — no IPC round-trip is needed.
//!
//! Tools are grouped so the frontend settings can toggle whole categories:
//!   - `core`:  the creative workflow (search/create prompts, generate, history)
//!   - `query`: read-only lookups (characters, artists, workflows, models)
//!   - `write`: mutating operations (update prompts, add favorites, create workflows)

use crate::commands;
use crate::db::models::PromptFilter;
use crate::AppState;
use once_cell::sync::Lazy;
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager};

/// Which category a tool belongs to. Controls default-on behaviour in settings.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ToolGroup {
    Core,
    Query,
    Write,
}

impl ToolGroup {
    pub fn as_str(self) -> &'static str {
        match self {
            ToolGroup::Core => "core",
            ToolGroup::Query => "query",
            ToolGroup::Write => "write",
        }
    }
}

/// A static tool definition (name + schema + group). The execute logic lives in `execute_tool`.
pub struct ToolDef {
    pub name: &'static str,
    pub description: &'static str,
    pub group: ToolGroup,
    pub input_schema: Value,
}

/// The full tool catalogue. Order is stable so `tools/list` output is deterministic.
/// Built once via `once_cell` because `json!` cannot live in a true `static`.

static TOOLS: Lazy<Vec<ToolDef>> = Lazy::new(|| vec![
    // ---- core ----
    ToolDef {
        name: "search_prompts",
        description: "Search prompt projects by keyword, tags, or type. Returns matching projects with their full content.",
        group: ToolGroup::Core,
        input_schema: json!({
            "type": "object",
            "properties": {
                "search": { "type": "string", "description": "Keyword to search in title/positive/negative prompts" },
                "tags": { "type": "array", "items": { "type": "string" }, "description": "Tags to filter by" },
                "limit": { "type": "number", "description": "Max results (default 50)" }
            }
        }),
    },
    ToolDef {
        name: "get_prompt",
        description: "Get a single prompt project by its ID, including tags and instance images.",
        group: ToolGroup::Core,
        input_schema: json!({
            "type": "object",
            "properties": { "prompt_id": { "type": "string" } },
            "required": ["prompt_id"]
        }),
    },
    ToolDef {
        name: "create_prompt",
        description: "Create a new prompt project. Pass the positive prompt text and optional generation parameters.",
        group: ToolGroup::Core,
        input_schema: json!({
            "type": "object",
            "properties": {
                "title": { "type": "string", "description": "Project title" },
                "content": { "type": "string", "description": "Positive prompt text (English Danbooru tags recommended)" },
                "negative_prompt": { "type": "string" },
                "artist_prompt": { "type": "string", "description": "Artist/style trigger words" },
                "base_model": { "type": "string" },
                "width": { "type": "number" },
                "height": { "type": "number" },
                "steps": { "type": "number" },
                "cfg_scale": { "type": "number" },
                "seed": { "type": "string", "description": "Use -1 for random" }
            },
            "required": ["title", "content"]
        }),
    },
    ToolDef {
        name: "generate_image",
        description: "Generate image(s) using an existing prompt project. Triggers the app's bound ComfyUI workflow. Returns when generation completes (may take 10-60s). Requires the app window to be reachable.",
        group: ToolGroup::Core,
        input_schema: json!({
            "type": "object",
            "properties": {
                "prompt_id": { "type": "string" },
                "batch_count": { "type": "number", "description": "Number of images (default 1)" }
            },
            "required": ["prompt_id"]
        }),
    },
    ToolDef {
        name: "get_generated_images",
        description: "List recently generated images from history (newest first).",
        group: ToolGroup::Core,
        input_schema: json!({
            "type": "object",
            "properties": {
                "limit": { "type": "number", "description": "Max results (default 20)" }
            }
        }),
    },
    // ---- query ----
    ToolDef {
        name: "search_characters",
        description: "Search the character library (50k+ characters with English/Chinese names, series, trigger tags). Useful for finding the correct character tag before generating.",
        group: ToolGroup::Query,
        input_schema: json!({
            "type": "object",
            "properties": {
                "search": { "type": "string", "description": "Name keyword (Chinese or English)" },
                "series": { "type": "string", "description": "Series/copyright filter" },
                "limit": { "type": "number" },
                "offset": { "type": "number" }
            }
        }),
    },
    ToolDef {
        name: "get_character_series",
        description: "List all character series/copyrights with their character counts, for browsing.",
        group: ToolGroup::Query,
        input_schema: json!({ "type": "object", "properties": {} }),
    },
    ToolDef {
        name: "search_artists",
        description: "Search the artist library for style trigger tags.",
        group: ToolGroup::Query,
        input_schema: json!({
            "type": "object",
            "properties": {
                "search": { "type": "string" },
                "limit": { "type": "number" },
                "offset": { "type": "number" }
            }
        }),
    },
    ToolDef {
        name: "list_favorite_characters",
        description: "List the user's saved favorite characters (with custom tags/notes).",
        group: ToolGroup::Query,
        input_schema: json!({
            "type": "object",
            "properties": {
                "tags": { "type": "array", "items": { "type": "string" } },
                "tag_match": { "type": "string", "enum": ["and", "or"], "description": "Multi-tag match mode (default and)" },
                "search": { "type": "string" }
            }
        }),
    },
    ToolDef {
        name: "list_favorite_artists",
        description: "List the user's saved favorite artists.",
        group: ToolGroup::Query,
        input_schema: json!({
            "type": "object",
            "properties": {
                "search": { "type": "string" },
                "limit": { "type": "number" }
            }
        }),
    },
    ToolDef {
        name: "list_workflows",
        description: "List all ComfyUI workflows saved in the app.",
        group: ToolGroup::Query,
        input_schema: json!({ "type": "object", "properties": {} }),
    },
    ToolDef {
        name: "get_workflow",
        description: "Get a single workflow by ID, including its JSON content.",
        group: ToolGroup::Query,
        input_schema: json!({
            "type": "object",
            "properties": { "workflow_id": { "type": "string" } },
            "required": ["workflow_id"]
        }),
    },
    ToolDef {
        name: "check_comfyui_status",
        description: "Check whether the configured ComfyUI backend is online and reachable.",
        group: ToolGroup::Query,
        input_schema: json!({
            "type": "object",
            "properties": { "url": { "type": "string", "description": "Override ComfyUI URL (defaults to app setting)" } }
        }),
    },
    ToolDef {
        name: "list_local_models",
        description: "List checkpoint and LoRA models available in the connected ComfyUI.",
        group: ToolGroup::Query,
        input_schema: json!({
            "type": "object",
            "properties": { "url": { "type": "string", "description": "Override ComfyUI URL" } }
        }),
    },
    // ---- write (default off) ----
    ToolDef {
        name: "update_prompt_content",
        description: "Update the textual content (title, positive/negative/artist prompts, syntax) of an existing prompt project.",
        group: ToolGroup::Write,
        input_schema: json!({
            "type": "object",
            "properties": {
                "prompt_id": { "type": "string" },
                "title": { "type": "string" },
                "positive_prompt": { "type": "string" },
                "negative_prompt": { "type": "string" },
                "artist_prompt": { "type": "string" },
                "prompt_syntax": { "type": "string", "enum": ["danbooru", "natural", "xml"] }
            },
            "required": ["prompt_id"]
        }),
    },
    ToolDef {
        name: "update_prompt_settings",
        description: "Update generation settings (model, LoRAs, resolution, sampler) of an existing prompt project.",
        group: ToolGroup::Write,
        input_schema: json!({
            "type": "object",
            "properties": {
                "prompt_id": { "type": "string" },
                "base_model": { "type": "string" },
                "vae_model": { "type": "string" },
                "sampler_name": { "type": "string" },
                "scheduler": { "type": "string" },
                "width": { "type": "number" },
                "height": { "type": "number" },
                "steps": { "type": "number" },
                "cfg_scale": { "type": "number" }
            },
            "required": ["prompt_id"]
        }),
    },
    ToolDef {
        name: "add_favorite_character",
        description: "Add a character to the user's favorites.",
        group: ToolGroup::Write,
        input_schema: json!({
            "type": "object",
            "properties": {
                "character_tag": { "type": "string" },
                "display_name": { "type": "string" },
                "trigger": { "type": "string" },
                "example_image": { "type": "string" },
                "notes": { "type": "string" }
            },
            "required": ["character_tag"]
        }),
    },
    ToolDef {
        name: "add_favorite_artist",
        description: "Add an artist to the user's favorites.",
        group: ToolGroup::Write,
        input_schema: json!({
            "type": "object",
            "properties": {
                "artist_tag": { "type": "string" },
                "display_name": { "type": "string" },
                "trigger": { "type": "string" },
                "example_image": { "type": "string" },
                "notes": { "type": "string" }
            },
            "required": ["artist_tag"]
        }),
    },
    ToolDef {
        name: "create_workflow",
        description: "Create a new ComfyUI workflow from raw JSON content.",
        group: ToolGroup::Write,
        input_schema: json!({
            "type": "object",
            "properties": {
                "name": { "type": "string", "description": "Workflow name" },
                "description": { "type": "string" },
                "json_content": { "type": "string", "description": "The ComfyUI API-format workflow JSON" },
                "type": { "type": "string", "enum": ["text2img", "img2video", "tagger", "upscale", "custom"], "description": "Workflow category (default text2img)" }
            },
            "required": ["name", "json_content"]
        }),
    },
]);
/// `{name, description, inputSchema}` shape the MCP `tools/list` method expects.
pub fn tools_list_payload(core: bool, query: bool, write: bool) -> Vec<Value> {
    TOOLS
        .iter()
        .filter(|t| match t.group {
            ToolGroup::Core => core,
            ToolGroup::Query => query,
            ToolGroup::Write => write,
        })
        .map(|t| {
            json!({
                "name": t.name,
                "description": t.description,
                "inputSchema": t.input_schema,
            })
        })
        .collect()
}

/// Look up a tool by name and, if enabled, run it.
///
/// Returns the MCP `content` array (a vec of `{type:"text", text:"..."}` objects).
/// On unknown/disabled tool or execution error, returns a single text content describing it.
pub async fn execute_tool(
    app: &AppHandle,
    name: &str,
    arguments: &Value,
    core: bool,
    query: bool,
    write: bool,
) -> Vec<Value> {
    let tool = TOOLS.iter().find(|t| t.name == name);
    let Some(tool) = tool else {
        return text_content(format!("Unknown tool: {}", name));
    };
    let enabled = match tool.group {
        ToolGroup::Core => core,
        ToolGroup::Query => query,
        ToolGroup::Write => write,
    };
    if !enabled {
        return text_content(format!(
            "Tool '{}' is disabled in the server's settings (group: {}).",
            name,
            tool.group.as_str()
        ));
    }

    // `generate_image` needs the frontend to run workflow injection, so it is delegated via event.
    // All other tools run fully in the backend.
    if name == "generate_image" {
        return handle_generate_image(app, arguments).await;
    }

    let Some(state) = app.try_state::<AppState>() else {
        return text_content("Internal error: AppState unavailable.".to_string());
    };

    let result = match name {
        // ===== core =====
        "search_prompts" => {
            let filter = build_prompt_filter(arguments);
            let rows = commands::prompts::list_prompts(state, filter).await;
            rows_to_text(rows)
        }
        "get_prompt" => {
            let id = arg_str(arguments, "prompt_id");
            let row = commands::prompts::get_prompt(state, id).await;
            rows_to_text(row)
        }
        "create_prompt" => {
            let prompt = build_prompt_from_args(arguments);
            match commands::prompts::create_prompt(state, prompt).await {
                Ok(p) => Ok(json!({"status": "created", "prompt": p}).to_string()),
                Err(e) => Err(e),
            }
            .map(text_content)
            .unwrap_or_else(text_content)
        }
        "get_generated_images" => {
            let rows = commands::history::list_generated_images(state).await;
            rows_to_text(rows)
        }
        // ===== query =====
        "search_characters" => {
            let rows = commands::library::search_characters(
                state,
                arg_opt_string(arguments, "search"),
                arg_opt_string(arguments, "series"),
                arg_usize(arguments, "limit", 20),
                arg_usize(arguments, "offset", 0),
                arg_opt_bool(arguments, "favorite"),
            )
            .await;
            rows_to_text(rows)
        }
        "get_character_series" => {
            let rows = commands::library::get_character_series(state).await;
            rows_to_text(rows)
        }
        "search_artists" => {
            let rows = commands::library::search_artists(
                state,
                arg_opt_string(arguments, "search"),
                arg_opt_string(arguments, "series"),
                arg_usize(arguments, "limit", 20),
                arg_usize(arguments, "offset", 0),
                arg_opt_bool(arguments, "favorite"),
            )
            .await;
            rows_to_text(rows)
        }
        "list_favorite_characters" => {
            let rows = commands::library_favorites::list_favorite_characters(
                state,
                arg_opt_string_array(arguments, "tags"),
                arg_opt_string(arguments, "tag_match"),
                arg_opt_string(arguments, "search"),
                arg_opt_usize(arguments, "limit"),
                arg_opt_usize(arguments, "offset"),
            )
            .await;
            rows_to_text(rows)
        }
        "list_favorite_artists" => {
            let rows = commands::library_favorites::list_favorite_artists(
                state,
                arg_opt_string(arguments, "search"),
                arg_opt_usize(arguments, "limit"),
                arg_opt_usize(arguments, "offset"),
            )
            .await;
            rows_to_text(rows)
        }
        "list_workflows" => {
            let rows = commands::workflows::list_workflows(state).await;
            rows_to_text(rows)
        }
        "get_workflow" => {
            let id = arg_str(arguments, "workflow_id");
            let row = commands::workflows::get_workflow(state, id).await;
            rows_to_text(row)
        }
        "check_comfyui_status" => {
            let url = arg_opt_string(arguments, "url");
            match commands::auto_deploy::check_comfyui_status(url).await {
                Ok(v) => Ok(v.to_string()),
                Err(e) => Err(e),
            }
            .map(text_content)
            .unwrap_or_else(text_content)
        }
        "list_local_models" => {
            let url = arg_opt_string(arguments, "url");
            match commands::auto_deploy::fetch_comfy_models(url).await {
                Ok(v) => Ok(v.to_string()),
                Err(e) => Err(e),
            }
            .map(text_content)
            .unwrap_or_else(text_content)
        }
        // ===== write =====
        "update_prompt_content" | "update_prompt_settings" => {
            // Both update paths go through update_prompt with a full Prompt struct.
            // For the MCP surface we require the caller to pass prompt_id plus the fields they
            // want to change; we read the existing row first, merge, then write.
            let id = arg_str(arguments, "prompt_id");
            let existing = match commands::prompts::get_prompt(state.clone(), id.clone()).await {
                Ok(Some(p)) => p,
                Ok(None) => {
                    return text_content(format!("Prompt {} not found.", id));
                }
                Err(e) => return text_content(format!("Failed to load prompt: {}", e)),
            };
            let merged = merge_prompt_updates(existing, arguments, name == "update_prompt_settings");
            match commands::prompts::update_prompt(state, merged).await {
                Ok(p) => Ok(json!({"status": "updated", "prompt": p}).to_string()),
                Err(e) => Err(e),
            }
            .map(text_content)
            .unwrap_or_else(text_content)
        }
        "add_favorite_character" => {
            let character_tag = arg_str(arguments, "character_tag");
            let source = arg_opt_string(arguments, "source");
            let display_name = arg_opt_string(arguments, "display_name");
            let trigger = arg_opt_string(arguments, "trigger");
            let example_image = arg_opt_string(arguments, "example_image");
            let notes = arg_opt_string(arguments, "notes");
            let tags = arg_opt_string_array(arguments, "tags");
            match commands::library_favorites::add_favorite_character(
                state,
                character_tag,
                source,
                display_name,
                trigger,
                example_image,
                notes,
                tags,
            )
            .await
            {
                Ok(r) => Ok(json!({"status": "added", "favorite": r}).to_string()),
                Err(e) => Err(e),
            }
            .map(text_content)
            .unwrap_or_else(text_content)
        }
        "add_favorite_artist" => {
            let artist_tag = arg_str(arguments, "artist_tag");
            let source = arg_opt_string(arguments, "source");
            let display_name = arg_opt_string(arguments, "display_name");
            let trigger = arg_opt_string(arguments, "trigger");
            let example_image = arg_opt_string(arguments, "example_image");
            let notes = arg_opt_string(arguments, "notes");
            match commands::library_favorites::add_favorite_artist(
                state,
                artist_tag,
                source,
                display_name,
                trigger,
                example_image,
                notes,
            )
            .await
            {
                Ok(r) => Ok(json!({"status": "added", "favorite": r}).to_string()),
                Err(e) => Err(e),
            }
            .map(text_content)
            .unwrap_or_else(text_content)
        }
        "create_workflow" => {
            let wf = build_workflow_from_args(arguments);
            match commands::workflows::create_workflow(state, wf).await {
                Ok(w) => Ok(json!({"status": "created", "workflow": w}).to_string()),
                Err(e) => Err(e),
            }
            .map(text_content)
            .unwrap_or_else(text_content)
        }
        _ => text_content(format!("Tool '{}' is defined but not implemented.", name)),
    };

    // `result` for the rows_to_text path is already a Vec<Value>; the match arms above that
    // returned text_content(...) are already final. The non-rows arms went through map/unwrap.
    // Re-bind to make the control flow explicit for the compiler.
    result
}

/// generate_image is delegated to the frontend, which owns the workflow-injection logic
/// (comfyService.injectParameters) and the generation queue. The backend emits an event; the
/// frontend picks it up, runs addJob, and replies via a follow-up event the handler awaits.
async fn handle_generate_image(app: &AppHandle, arguments: &Value) -> Vec<Value> {
    use tauri::Listener;

    let prompt_id = arg_str(arguments, "prompt_id");
    let batch_count = arg_u64(arguments, "batch_count", 1);

    // One-shot reply channel. The frontend emits a uniquely-keyed event when generation finishes.
    let (tx, rx) = tokio::sync::oneshot::channel::<Value>();
    // Wrap tx in a Mutex<Option> so the listen closure (Fn, not FnOnce) can send exactly once.
    let tx = std::sync::Arc::new(tokio::sync::Mutex::new(Some(tx)));
    let reply_key = format!("mcp-generate-reply::{}", uuid::Uuid::new_v4());

    // Register a listener for the frontend's reply. The closure stays registered for the whole
    // app lifetime, but the unique reply_key guarantees only our one reply matches; we unlisten
    // right after receiving it.
    let app_for_listen = app.clone();
    let tx_clone = tx.clone();
    let reply_key_for_unlisten = reply_key.clone();
    let event_id = app_for_listen.listen(reply_key.clone(), move |evt| {
        let payload: Value = serde_json::from_str(evt.payload())
            .unwrap_or_else(|_| json!({"status": "error", "message": "invalid reply payload"}));
        // Try to send; if already sent (duplicate event), this is a no-op.
        if let Ok(mut guard) = tx_clone.try_lock() {
            if let Some(sender) = guard.take() {
                let _ = sender.send(payload);
            }
        }
    });

    // Ask the frontend to run the generation.
    let _ = app.emit(
        "mcp-generate-request",
        json!({
            "prompt_id": prompt_id,
            "batch_count": batch_count,
            "reply_key": reply_key,
        }),
    );

    // Wait for the reply, with a generous timeout for slow generations.
    let payload = match tokio::time::timeout(std::time::Duration::from_secs(180), rx).await {
        Ok(Ok(v)) => v,
        Ok(Err(_)) => json!({"status": "error", "message": "Internal: reply channel closed."}),
        Err(_) => json!({"status": "timeout", "message": "Generation timed out waiting for the frontend (is the app window open?)."}),
    };

    app_for_listen.unlisten(event_id);
    let _ = reply_key_for_unlisten;
    text_content(payload.to_string())
}

// ============================ helpers ============================

fn text_content(text: String) -> Vec<Value> {
    vec![json!({ "type": "text", "text": text })]
}

/// Serialise any serialisable result (or an error) into the MCP text content shape.
fn rows_to_text<T: serde::Serialize>(res: Result<T, String>) -> Vec<Value> {
    match res {
        Ok(v) => {
            let pretty = serde_json::to_string_pretty(&v).unwrap_or_else(|_| "{}".to_string());
            text_content(pretty)
        }
        Err(e) => text_content(format!("Error: {}", e)),
    }
}

fn arg_str(args: &Value, key: &str) -> String {
    args.get(key)
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .unwrap_or_default()
}

fn arg_opt_string(args: &Value, key: &str) -> Option<String> {
    args.get(key)
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .filter(|s| !s.is_empty())
}

fn arg_opt_bool(args: &Value, key: &str) -> Option<bool> {
    args.get(key).and_then(|v| v.as_bool())
}

fn arg_usize(args: &Value, key: &str, default: usize) -> usize {
    args.get(key)
        .and_then(|v| v.as_u64())
        .map(|n| n as usize)
        .unwrap_or(default)
}

fn arg_u64(args: &Value, key: &str, default: u64) -> u64 {
    args.get(key)
        .and_then(|v| v.as_u64())
        .unwrap_or(default)
}

fn arg_opt_usize(args: &Value, key: &str) -> Option<usize> {
    args.get(key).and_then(|v| v.as_u64()).map(|n| n as usize)
}

fn arg_opt_string_array(args: &Value, key: &str) -> Option<Vec<String>> {
    args.get(key)
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|x| x.as_str().map(|s| s.to_string()))
                .collect()
        })
        .filter(|v: &Vec<String>| !v.is_empty())
}

fn build_prompt_filter(args: &Value) -> Option<PromptFilter> {
    let search = arg_opt_string(args, "search");
    let tags = arg_opt_string_array(args, "tags");
    let prompt_type = arg_opt_string(args, "prompt_type");
    let limit = arg_opt_usize(args, "limit").map(|n| n as i32);
    let offset = arg_opt_usize(args, "offset").map(|n| n as i32);
    if search.is_none() && tags.is_none() && prompt_type.is_none() && limit.is_none() {
        return None;
    }
    Some(PromptFilter {
        search,
        tags,
        prompt_type,
        favorite: None,
        pinned: None,
        limit,
        offset,
    })
}

/// Build a Prompt from create_prompt arguments, filling sensible defaults.
fn build_prompt_from_args(args: &Value) -> crate::db::models::Prompt {
    use crate::db::models::Prompt;
    let now = chrono::Utc::now().timestamp_millis();
    Prompt {
        id: format!("p_{}", now),
        title: arg_str(args, "title"),
        description: arg_str(args, "description"),
        positive_prompt: arg_str(args, "content"),
        negative_prompt: arg_opt_string(args, "negative_prompt").unwrap_or_default(),
        artist_prompt: arg_opt_string(args, "artist_prompt").unwrap_or_default(),
        prompt_syntax: arg_opt_string(args, "prompt_syntax").unwrap_or_else(|| "danbooru".to_string()),
        seed: arg_opt_string(args, "seed").unwrap_or_else(|| "-1".to_string()),
        width: args.get("width").and_then(|v| v.as_i64()).unwrap_or(1024) as i32,
        height: args.get("height").and_then(|v| v.as_i64()).unwrap_or(1024) as i32,
        steps: args.get("steps").and_then(|v| v.as_i64()).unwrap_or(25) as i32,
        cfg_scale: args.get("cfg_scale").and_then(|v| v.as_f64()).unwrap_or(5.0),
        sampler_name: arg_opt_string(args, "sampler_name").unwrap_or_else(|| "euler".to_string()),
        scheduler: arg_opt_string(args, "scheduler").unwrap_or_else(|| "normal".to_string()),
        base_model: arg_opt_string(args, "base_model"),
        vae_model: arg_opt_string(args, "vae_model"),
        resolution: arg_opt_string(args, "resolution"),
        workflow_id: arg_opt_string(args, "workflow_id"),
        lora_configs: args
            .get("lora_configs")
            .and_then(|v| serde_json::to_string(v).ok()),
        is_favorite: false,
        is_pinned: false,
        created_at: now,
        updated_at: now,
        deleted_at: None,
        tags: None,
        images: None,
    }
}

/// Merge MCP update arguments into an existing Prompt. When `settings_only` is true we only
/// touch model/resolution/seed fields; otherwise only textual content fields.
fn merge_prompt_updates(
    mut existing: crate::db::models::Prompt,
    args: &Value,
    settings_only: bool,
) -> crate::db::models::Prompt {
    if !settings_only {
        if let Some(t) = arg_opt_string(args, "title") {
            existing.title = t;
        }
        if let Some(p) = arg_opt_string(args, "positive_prompt") {
            existing.positive_prompt = p;
        }
        if let Some(n) = arg_opt_string(args, "negative_prompt") {
            existing.negative_prompt = n;
        }
        if let Some(a) = arg_opt_string(args, "artist_prompt") {
            existing.artist_prompt = a;
        }
        if let Some(s) = arg_opt_string(args, "prompt_syntax") {
            existing.prompt_syntax = s;
        }
    } else {
        if let Some(b) = arg_opt_string(args, "base_model") {
            existing.base_model = Some(b);
        }
        if let Some(v) = arg_opt_string(args, "vae_model") {
            existing.vae_model = Some(v);
        }
        if let Some(s) = arg_opt_string(args, "sampler_name") {
            existing.sampler_name = s;
        }
        if let Some(s) = arg_opt_string(args, "scheduler") {
            existing.scheduler = s;
        }
        if let Some(w) = args.get("width").and_then(|v| v.as_i64()) {
            existing.width = w as i32;
        }
        if let Some(h) = args.get("height").and_then(|v| v.as_i64()) {
            existing.height = h as i32;
        }
        if let Some(s) = args.get("steps").and_then(|v| v.as_i64()) {
            existing.steps = s as i32;
        }
        if let Some(c) = args.get("cfg_scale").and_then(|v| v.as_f64()) {
            existing.cfg_scale = c;
        }
        if let Some(r) = arg_opt_string(args, "resolution") {
            existing.resolution = Some(r);
        }
        if let Some(w) = arg_opt_string(args, "workflow_id") {
            existing.workflow_id = Some(w);
        }
        if let Some(l) = args.get("lora_configs") {
            existing.lora_configs = serde_json::to_string(l).ok();
        }
    }
    existing.updated_at = chrono::Utc::now().timestamp_millis();
    existing
}

fn build_workflow_from_args(args: &Value) -> crate::db::models::Workflow {
    use crate::db::models::Workflow;
    let now = chrono::Utc::now().timestamp_millis();
    Workflow {
        id: format!("wf_{}", now),
        name: arg_str(args, "name"),
        description: arg_opt_string(args, "description").unwrap_or_default(),
        json_content: arg_str(args, "json_content"),
        workflow_type: arg_opt_string(args, "type").unwrap_or_else(|| "text2img".to_string()),
        is_default: false,
        is_builtin: false,
        created_at: now,
        updated_at: now,
    }
}

