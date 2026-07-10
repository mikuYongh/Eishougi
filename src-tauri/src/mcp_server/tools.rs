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
        description: "Create a new prompt project. Pass the positive prompt text and optional generation parameters.\n\nCHARACTER PROTECTION (CRITICAL — violating this is the #1 cause of bad generations):\n(1) NAMED CHARACTERS: When the user mentions a known character (e.g. Hatsune Miku, Genshin/原神 characters, Blue Archive characters), use ONLY their character trigger tag (e.g. \"nahida (genshin impact)\"). DO NOT add hair_color, eye_color, hairstyle, or body_type tags for them — the model ALREADY KNOWS their appearance, and guessing wrong traits ruins the image. If you called search_characters_in_series and got coreTags, those are for YOUR reference to understand what the character looks like — do NOT blindly dump them into the prompt unless the user specifically asks to change an appearance trait.\n(2) ORIGINAL CHARACTERS: For unnamed / original characters, freely describe appearance.\n(3) MULTI-CHARACTER: When describing multiple characters, group each character's tags as a contiguous block. NEVER interleave tags from different characters.",
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
        description: "Generate an image either from an existing prompt project (pass prompt_id) OR directly from parameters (omit prompt_id and pass positive_prompt). Triggers the app's bound ComfyUI workflow. Each call blocks for 10-60 seconds while the GPU renders — it is NOT a fast query. Requires the app window to be reachable.\n\nUSAGE RULE (important): Call this tool AT MOST ONCE per user request. Do NOT call it repeatedly to \"try again\" or generate variations — if the result is unsatisfactory, tell the user and let THEM decide whether to regenerate. Use batch_count (not repeated calls) if the user wants multiple images.\n\nCHARACTER PROTECTION (CRITICAL — violating this is the #1 cause of bad generations): When the user mentions a known character (e.g. Hatsune Miku, Genshin/原神 characters, Blue Archive characters), use ONLY their character trigger tag (e.g. \"nahida (genshin impact)\"). DO NOT add hair_color, eye_color, hairstyle, or body_type tags — the model ALREADY KNOWS their appearance; guessing wrong traits ruins the image. The coreTags returned by search_characters_in_series are for YOUR reference only — do NOT dump them into the prompt unless the user explicitly asks to change a specific appearance trait. For unnamed/original characters, freely describe appearance.\n\nRESOLUTION RULE: Keep width/height at the model's native ~1024 range by default (e.g. 832x1216 portrait, 1024x1024 square, 1216x832 landscape). The default when omitted is portrait 832x1216 (most common for character illustration). ONLY use a larger size (up to 1536 max) when the user EXPLICITLY asks for a bigger/high-resolution/4K image. Never exceed 1536 on either edge — very large sizes can crash the GPU. When unsure, omit width/height.",
        group: ToolGroup::Core,
        input_schema: json!({
            "type": "object",
            "properties": {
                "prompt_id": { "type": "string", "description": "Optional. ID of an existing prompt project to generate from. If omitted, generates directly from the provided parameters (no project is created)." },
                "positive_prompt": { "type": "string", "description": "REQUIRED when prompt_id is omitted (ignored when prompt_id is given). The positive prompt text, English Danbooru tags recommended." },
                "negative_prompt": { "type": "string", "description": "Optional override. Default: standard low-quality negatives." },
                "artist_prompt": { "type": "string", "description": "Optional. Artist/style trigger words." },
                "base_model": { "type": "string", "description": "Optional. Override the workflow's checkpoint." },
                "vae_model": { "type": "string", "description": "Optional. Override the workflow's VAE. Use 'auto' to let the workflow decide." },
                "lora_configs": {
                    "type": "array",
                    "description": "Optional. LoRAs to apply in direct-generation mode. Each entry: { name: string (checkpoint filename), strength: number (0-2, default 1), enabled: boolean (default true) }. When omitted in direct mode, the default workflow's bound LoRAs are used.",
                    "items": {
                        "type": "object",
                        "properties": {
                            "name": { "type": "string" },
                            "strength": { "type": "number" },
                            "enabled": { "type": "boolean" }
                        }
                    }
                },
                "width": { "type": "number", "description": "Optional. Image width in px. Default: the workflow's native width, or 832 if unknown. Do NOT set this above 1024 unless the user explicitly requests a larger image; never exceed 1536." },
                "height": { "type": "number", "description": "Optional. Image height in px. Default: the workflow's native height, or 1216 if unknown. Do NOT set this above 1024 unless the user explicitly requests a larger image; never exceed 1536." },
                "steps": { "type": "number", "description": "Optional. Default 25." },
                "cfg_scale": { "type": "number", "description": "Optional. Default 5.0." },
                "seed": { "type": "string", "description": "Optional. Use -1 for random (default)." },
                "sampler_name": { "type": "string", "description": "Optional, e.g. euler, euler_ancestral, dpmpp_2m." },
                "scheduler": { "type": "string", "description": "Optional, e.g. normal, karras, beta57." },
                "workflow_id": { "type": "string", "description": "Optional. Specific workflow to use; defaults to the app's default text2img workflow." },
                "batch_count": { "type": "number", "description": "Number of images (default 1)" }
            },
            "required": []
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
        name: "list_character_series",
        description: "List character series/copyrights (e.g. Genshin Impact/原神, Arknights/明日方舟) with their character counts, paginated. Use this FIRST to discover which series exist and pick one, then call search_characters_in_series with that series. Each result returns BOTH `series` (English tag, e.g. \"mihoyo\") and `seriesZh` (Chinese name, e.g. \"原神\") — prefer passing `seriesZh` to search_characters_in_series since it is unambiguous and matches the user's language. The full library has thousands of series — always page; do not request huge limits.",
        group: ToolGroup::Query,
        input_schema: json!({
            "type": "object",
            "properties": {
                "search": { "type": "string", "description": "Optional. Fuzzy-match series name (English or Chinese) to narrow results before paging." },
                "limit": { "type": "number", "description": "Page size. Default 30, max 100." },
                "offset": { "type": "number", "description": "Pagination offset. Default 0." }
            }
        }),
    },
    ToolDef {
        name: "search_characters_in_series",
        description: "Search for characters WITHIN a specific series (e.g. all characters in '原神'/Genshin). `series` is REQUIRED — pass the `seriesZh` (Chinese, e.g. \"原神\") or `series` (English, e.g. \"mihoyo\") value returned by list_character_series; both are accepted. This constraint keeps the result set small (a single series usually has tens to low-hundreds of characters). Each returned character includes `trigger` (the activation phrase to put in the positive prompt, e.g. \"nahida (genshin impact), genshin impact\") and `coreTags` (their canonical appearance tags).\n\nIMPORTANT: `trigger` is what you put in the positive prompt to summon the character. `coreTags` is for YOUR REFERENCE only — so you understand what the character looks like (to describe the scene, pose, etc.). Do NOT blindly copy coreTags into the prompt. The model already knows the character's appearance from the trigger; adding redundant appearance tags (especially wrong ones) degrades the result.",
        group: ToolGroup::Query,
        input_schema: json!({
            "type": "object",
            "properties": {
                "series": { "type": "string", "description": "REQUIRED. Series name — the `seriesZh` (e.g. \"原神\") or `series` (e.g. \"mihoyo\") value from list_character_series. Both accepted." },
                "search": { "type": "string", "description": "Optional. Further filter characters within the series by name (Chinese or English)." },
                "limit": { "type": "number", "description": "Page size. Default 20, max 50." },
                "offset": { "type": "number", "description": "Pagination offset. Default 0." }
            },
            "required": ["series"]
        }),
    },
    ToolDef {
        name: "search_artists",
        description: "Search the artist library (15k+ artists with style trigger tags). Use this to find an artist's trigger phrase to put in the positive prompt (e.g. \"by wlop\"). `search` is optional — omit it to page through popular artists (ordered by usage count), or pass a name keyword to narrow down. Results are paginated to keep the payload small. Each artist includes `trigger` (the activation phrase, e.g. \"wlop (artist)\") and `artistTag`.",
        group: ToolGroup::Query,
        input_schema: json!({
            "type": "object",
            "properties": {
                "search": { "type": "string", "description": "Optional. Artist name keyword (English or Chinese) to narrow results." },
                "limit": { "type": "number", "description": "Page size. Default 20, max 50." },
                "offset": { "type": "number", "description": "Pagination offset. Default 0." }
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
        description: "Update the textual content (title, description, positive/negative/artist prompts, syntax) of an existing prompt project.",
        group: ToolGroup::Write,
        input_schema: json!({
            "type": "object",
            "properties": {
                "prompt_id": { "type": "string" },
                "title": { "type": "string" },
                "description": { "type": "string" },
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
        description: "Update generation settings (model, LoRAs, resolution, sampler, seed) of an existing prompt project.",
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
                "cfg_scale": { "type": "number" },
                "seed": { "type": "string", "description": "Use -1 for random" }
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
        name: "remove_favorite_character",
        description: "Remove a character from the user's favorites. Pass EITHER character_id (the favorite row id from list_favorite_characters) OR character_tag.",
        group: ToolGroup::Write,
        input_schema: json!({
            "type": "object",
            "properties": {
                "character_id": { "type": "string", "description": "Favorite row id (from list_favorite_characters). Preferred when known." },
                "character_tag": { "type": "string", "description": "The character's Danbooru tag. Used if id is unknown." }
            }
        }),
    },
    ToolDef {
        name: "remove_favorite_artist",
        description: "Remove an artist from the user's favorites. Pass EITHER artist_id (the favorite row id from list_favorite_artists) OR artist_tag.",
        group: ToolGroup::Write,
        input_schema: json!({
            "type": "object",
            "properties": {
                "artist_id": { "type": "string", "description": "Favorite row id (from list_favorite_artists). Preferred when known." },
                "artist_tag": { "type": "string", "description": "The artist's Danbooru tag. Used if id is unknown." }
            }
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
    ToolDef {
        name: "random_character_and_artist",
        description: "Pick a RANDOM character (with its trigger + appearance core tags) and a RANDOM artist (with its style trigger) from the library — a creativity springboard when the user wants a surprise (\"随便来一张\", \"给我个惊喜\", \"随机一个\"). Returns the picked character + artist so you can imagine a scene/outfit/pose yourself, add those tags, and call generate_image. Optionally restrict the character to a series. Pure random (not popularity-weighted).",
        group: ToolGroup::Query,
        input_schema: json!({
            "type": "object",
            "properties": {
                "series": { "type": "string", "description": "Optional. Restrict the random character to a specific series (e.g. \"原神\", \"pokemon\"). Omit for any series." },
                "use_artist": { "type": "boolean", "description": "Optional. Whether to also pick a random artist (default true)." }
            }
        }),
    },
    // ---- favorite character tag management (write) ----
    ToolDef {
        name: "list_favorite_character_tags",
        description: "List all tags the user has assigned to their favorite characters, with how many characters use each tag. Useful for understanding the user's organization scheme before filtering or recommending.",
        group: ToolGroup::Query,
        input_schema: json!({ "type": "object", "properties": {} }),
    },
    ToolDef {
        name: "update_favorite_character",
        description: "Update a saved favorite character's metadata (display name, trigger phrase, example image, or notes). Only the fields you pass are changed.",
        group: ToolGroup::Write,
        input_schema: json!({
            "type": "object",
            "properties": {
                "character_id": { "type": "string", "description": "The favorite character id (from list_favorite_characters)." },
                "display_name": { "type": "string", "description": "Optional. New display name." },
                "trigger": { "type": "string", "description": "Optional. New trigger phrase." },
                "example_image": { "type": "string", "description": "Optional. New example image path/URL." },
                "notes": { "type": "string", "description": "Optional. New notes." }
            },
            "required": ["character_id"]
        }),
    },
    ToolDef {
        name: "add_tags_to_favorite_character",
        description: "Add one or more tags to a saved favorite character.",
        group: ToolGroup::Write,
        input_schema: json!({
            "type": "object",
            "properties": {
                "character_id": { "type": "string", "description": "The favorite character id." },
                "tags": { "type": "array", "items": { "type": "string" }, "description": "Tags to add." }
            },
            "required": ["character_id", "tags"]
        }),
    },
    ToolDef {
        name: "remove_tag_from_favorite_character",
        description: "Remove a single tag from a saved favorite character.",
        group: ToolGroup::Write,
        input_schema: json!({
            "type": "object",
            "properties": {
                "character_id": { "type": "string", "description": "The favorite character id." },
                "tag": { "type": "string", "description": "The tag to remove." }
            },
            "required": ["character_id", "tag"]
        }),
    },
    ToolDef {
        name: "set_favorite_character_tags",
        description: "Replace ALL tags on a saved favorite character with the given list (overwrites existing tags).",
        group: ToolGroup::Write,
        input_schema: json!({
            "type": "object",
            "properties": {
                "character_id": { "type": "string", "description": "The favorite character id." },
                "tags": { "type": "array", "items": { "type": "string" }, "description": "The complete set of tags to set." }
            },
            "required": ["character_id", "tags"]
        }),
    },
    ToolDef {
        name: "relink_favorite_character",
        description: "Re-link a saved favorite character to the gallery (re-resolves its gallery_character_id and trigger from the latest character data). Use after the gallery is updated.",
        group: ToolGroup::Write,
        input_schema: json!({
            "type": "object",
            "properties": {
                "character_id": { "type": "string", "description": "The favorite character id to re-link." }
            },
            "required": ["character_id"]
        }),
    },
    ToolDef {
        name: "update_favorite_artist",
        description: "Update a saved favorite artist's metadata (display name, trigger phrase, example image, or notes). Only the fields you pass are changed.",
        group: ToolGroup::Write,
        input_schema: json!({
            "type": "object",
            "properties": {
                "artist_id": { "type": "string", "description": "The favorite artist id (from list_favorite_artists)." },
                "display_name": { "type": "string", "description": "Optional. New display name." },
                "trigger": { "type": "string", "description": "Optional. New trigger phrase." },
                "example_image": { "type": "string", "description": "Optional. New example image path/URL." },
                "notes": { "type": "string", "description": "Optional. New notes." }
            },
            "required": ["artist_id"]
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
) -> (Vec<Value>, bool) {
    let tool = TOOLS.iter().find(|t| t.name == name);
    let Some(tool) = tool else {
        return text_err(format!("Unknown tool: {}", name));
    };
    let enabled = match tool.group {
        ToolGroup::Core => core,
        ToolGroup::Query => query,
        ToolGroup::Write => write,
    };
    if !enabled {
        return text_err(format!(
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
        return text_err("Internal error: AppState unavailable.".to_string());
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
            optional_row_to_text("Prompt", row)
        }
        "create_prompt" => {
            let prompt = build_prompt_from_args(arguments);
            match commands::prompts::create_prompt(state, prompt).await {
                Ok(p) => text_ok(json!({"status": "created", "prompt": p}).to_string()),
                Err(e) => text_err(e),
            }
        }
        "get_generated_images" => {
            let rows = commands::history::list_generated_images(state).await;
            rows_to_text(rows)
        }
        // ===== query =====
        "list_character_series" => {
            // Clamp limit so an over-easy LLM can't pull thousands of series at once.
            let limit = arg_usize(arguments, "limit", 30).min(100);
            let rows = commands::library::get_character_series(
                state,
                arg_opt_string(arguments, "search"),
                Some(limit),
                Some(arg_usize(arguments, "offset", 0)),
            )
            .await;
            rows_to_text(rows)
        }
        "search_characters_in_series" => {
            // `series` is REQUIRED per schema; empty means the caller skipped it.
            let series = arg_str(arguments, "series");
            if series.is_empty() {
                return text_err(
                    "series is required. Call list_character_series first to find the exact name."
                        .to_string(),
                );
            }
            let limit = arg_usize(arguments, "limit", 20).min(50);
            let rows = commands::library::search_characters(
                state,
                arg_opt_string(arguments, "search"),
                Some(series),
                limit,
                arg_usize(arguments, "offset", 0),
                None,
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
        "search_artists" => {
            // Clamp the page size so a careless caller (or LLM) can't pull the whole 15k table in
            // one request. Default 20, hard cap 50.
            let limit = arg_usize(arguments, "limit", 20).min(50).max(1);
            let rows = commands::library::search_artists(
                state,
                arg_opt_string(arguments, "search"),
                None, // series — artists don't have a meaningful series filter; keep it null
                limit,
                arg_usize(arguments, "offset", 0),
                None,
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
        "random_character_and_artist" => {
            // Pure-random pick from the library. We query the DB directly (ORDER BY RANDOM()) rather
            // than going through search_characters/search_artists, because those always ORDER BY
            // popularity — we want a genuine surprise, not the same hot characters every time.
            use crate::db::models::{Character, Artist};
            let db = state.db.lock().await;

            // Character: prefer ones that have core_tags (so the AI gets appearance hints). Optional
            // series filter narrows the pool. Only one row, randomly ordered.
            let series_filter = arg_opt_string(arguments, "series");
            let char_sql = if series_filter.is_some() {
                "SELECT * FROM characters WHERE core_tags IS NOT NULL AND core_tags != '' AND (series LIKE ? OR series_zh LIKE ?) ORDER BY RANDOM() LIMIT 1"
            } else {
                "SELECT * FROM characters WHERE core_tags IS NOT NULL AND core_tags != '' ORDER BY RANDOM() LIMIT 1"
            };
            let character: Option<Character> = {
                let mut stmt = match db.conn.prepare(char_sql) { Ok(s) => s, Err(e) => return text_err(format!("DB prepare failed: {}", e)) };
                if let Some(ref s) = series_filter {
                    let pat = format!("%{}%", s);
                    stmt.query_row(rusqlite::params![pat, pat], |row| Ok(Character {
                        id: row.get("id")?, character_tag: row.get("character_tag")?, name_en: row.get("name_en")?,
                        name_zh: row.get("name_zh")?, series: row.get("series")?, series_zh: row.get("series_zh")?,
                        copyright: row.get("copyright")?, trigger: row.get("trigger")?, core_tags: row.get("core_tags")?,
                        count: row.get("count")?, img_url: row.get("img_url")?, is_favorite: row.get("is_favorite")?,
                        created_at: row.get("created_at")?,
                    })).ok()
                } else {
                    stmt.query_row([], |row| Ok(Character {
                        id: row.get("id")?, character_tag: row.get("character_tag")?, name_en: row.get("name_en")?,
                        name_zh: row.get("name_zh")?, series: row.get("series")?, series_zh: row.get("series_zh")?,
                        copyright: row.get("copyright")?, trigger: row.get("trigger")?, core_tags: row.get("core_tags")?,
                        count: row.get("count")?, img_url: row.get("img_url")?, is_favorite: row.get("is_favorite")?,
                        created_at: row.get("created_at")?,
                    })).ok()
                }
            };

            // Artist: optional (use_artist, default true).
            let use_artist = arguments.get("use_artist").and_then(|v| v.as_bool()).unwrap_or(true);
            let artist: Option<Artist> = if use_artist {
                let sql = "SELECT * FROM artists WHERE trigger IS NOT NULL AND trigger != '' ORDER BY RANDOM() LIMIT 1";
                let mut stmt = match db.conn.prepare(sql) { Ok(s) => s, Err(e) => return text_err(format!("DB prepare failed: {}", e)) };
                stmt.query_row([], |row| Ok(Artist {
                    id: row.get("id")?, artist_tag: row.get("artist_tag")?, name_en: row.get("name_en")?,
                    name_zh: row.get("name_zh")?, trigger: row.get("trigger")?, count: row.get("count")?,
                    img_url: row.get("img_url")?, is_favorite: row.get("is_favorite")?, created_at: row.get("created_at")?,
                })).ok()
            } else {
                None
            };
            drop(db);

            // Build a structured result the AI can use to compose a prompt + describe to the user.
            let result = json!({
                "character": character.as_ref().map(|c| json!({
                    "nameZh": c.name_zh, "nameEn": c.name_en, "series": c.series, "seriesZh": c.series_zh,
                    "characterTag": c.character_tag, "trigger": c.trigger, "coreTags": c.core_tags,
                })),
                "artist": artist.as_ref().map(|a| json!({
                    "nameEn": a.name_en, "nameZh": a.name_zh, "artistTag": a.artist_tag, "trigger": a.trigger,
                })),
                "suggestedPromptStart": match (&character, &artist) {
                    (Some(c), Some(a)) => format!("{}, {}, {}", c.trigger, c.core_tags.as_deref().unwrap_or(""), a.trigger),
                    (Some(c), None) => format!("{}, {}", c.trigger, c.core_tags.as_deref().unwrap_or("")),
                    _ => "No character found".to_string(),
                },
            });
            text_ok(serde_json::to_string_pretty(&result).unwrap_or_else(|_| "{}".to_string()))
        }
        "list_workflows" => {
            let rows = commands::workflows::list_workflows(state).await;
            rows_to_text(rows)
        }
        "get_workflow" => {
            let id = arg_str(arguments, "workflow_id");
            let row = commands::workflows::get_workflow(state, id).await;
            optional_row_to_text("Workflow", row)
        }
        "check_comfyui_status" => {
            let url = arg_opt_string(arguments, "url");
            match commands::auto_deploy::check_comfyui_status(url).await {
                Ok(v) => text_ok(v.to_string()),
                Err(e) => text_err(e),
            }
        }
        "list_local_models" => {
            let url = arg_opt_string(arguments, "url");
            match commands::auto_deploy::fetch_comfy_models(url).await {
                Ok(v) => text_ok(v.to_string()),
                Err(e) => text_err(e),
            }
        }
        // ===== write =====
        "update_prompt_content" | "update_prompt_settings" => {
            let id = arg_str(arguments, "prompt_id");
            let existing = match commands::prompts::get_prompt(state.clone(), id.clone()).await {
                Ok(Some(p)) => p,
                Ok(None) => {
                    return text_err(format!("Prompt {} not found.", id));
                }
                Err(e) => return text_err(format!("Failed to load prompt: {}", e)),
            };
            let merged = merge_prompt_updates(existing, arguments, name == "update_prompt_settings");
            match commands::prompts::update_prompt(state, merged).await {
                Ok(p) => text_ok(json!({"status": "updated", "prompt": p}).to_string()),
                Err(e) => text_err(e),
            }
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
                Ok(r) => text_ok(json!({"status": "added", "favorite": r}).to_string()),
                Err(e) => text_err(e),
            }
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
                Ok(r) => text_ok(json!({"status": "added", "favorite": r}).to_string()),
                Err(e) => text_err(e),
            }
        }
        "remove_favorite_character" => {
            // Either id or tag; backend errors if neither is supplied.
            let id = arg_opt_string(arguments, "character_id");
            let tag = arg_opt_string(arguments, "character_tag");
            match commands::library_favorites::remove_favorite_character(state, id, tag).await {
                Ok(true) => text_ok(json!({"status": "removed"}).to_string()),
                Ok(false) => text_err("Favorite not found.".to_string()),
                Err(e) => text_err(e),
            }
        }
        "remove_favorite_artist" => {
            let id = arg_opt_string(arguments, "artist_id");
            let tag = arg_opt_string(arguments, "artist_tag");
            match commands::library_favorites::remove_favorite_artist(state, id, tag).await {
                Ok(true) => text_ok(json!({"status": "removed"}).to_string()),
                Ok(false) => text_err("Favorite not found.".to_string()),
                Err(e) => text_err(e),
            }
        }
        "list_favorite_character_tags" => {
            let rows = commands::library_favorites::list_favorite_character_tags(state).await;
            rows_to_text(rows)
        }
        "update_favorite_character" => {
            let id = arg_str(arguments, "character_id");
            match commands::library_favorites::update_favorite_character(
                state, id,
                arg_opt_string(arguments, "display_name"),
                arg_opt_string(arguments, "trigger"),
                arg_opt_string(arguments, "example_image"),
                arg_opt_string(arguments, "notes"),
            ).await {
                Ok(_) => text_ok(json!({"status": "updated"}).to_string()),
                Err(e) => text_err(e),
            }
        }
        "add_tags_to_favorite_character" => {
            let id = arg_str(arguments, "character_id");
            let tags = arg_opt_string_array(arguments, "tags").unwrap_or_default();
            match commands::library_favorites::add_tags_to_favorite_character(state, id, tags).await {
                Ok(n) => text_ok(json!({"status": "added", "count": n}).to_string()),
                Err(e) => text_err(e),
            }
        }
        "remove_tag_from_favorite_character" => {
            let id = arg_str(arguments, "character_id");
            let tag = arg_str(arguments, "tag");
            match commands::library_favorites::remove_tag_from_favorite_character(state, id, tag).await {
                Ok(true) => text_ok(json!({"status": "removed"}).to_string()),
                Ok(false) => text_err("Tag not found on this character.".to_string()),
                Err(e) => text_err(e),
            }
        }
        "set_favorite_character_tags" => {
            let id = arg_str(arguments, "character_id");
            let tags = arg_opt_string_array(arguments, "tags").unwrap_or_default();
            match commands::library_favorites::set_favorite_character_tags(state, id, tags).await {
                Ok(n) => text_ok(json!({"status": "set", "count": n}).to_string()),
                Err(e) => text_err(e),
            }
        }
        "relink_favorite_character" => {
            let id = arg_str(arguments, "character_id");
            match commands::library_favorites::relink_favorite_character(state, id).await {
                Ok(r) => text_ok(json!({"status": "relinked", "favorite": r}).to_string()),
                Err(e) => text_err(e),
            }
        }
        "update_favorite_artist" => {
            let id = arg_str(arguments, "artist_id");
            match commands::library_favorites::update_favorite_artist(
                state, id,
                arg_opt_string(arguments, "display_name"),
                arg_opt_string(arguments, "trigger"),
                arg_opt_string(arguments, "example_image"),
                arg_opt_string(arguments, "notes"),
            ).await {
                Ok(_) => text_ok(json!({"status": "updated"}).to_string()),
                Err(e) => text_err(e),
            }
        }
        "create_workflow" => {
            let wf = build_workflow_from_args(arguments);
            match commands::workflows::create_workflow(state, wf).await {
                Ok(w) => text_ok(json!({"status": "created", "workflow": w}).to_string()),
                Err(e) => text_err(e),
            }
        }
        _ => text_err(format!("Tool '{}' is defined but not implemented.", name)),
    };

    result
}

/// generate_image is delegated to the frontend, which owns the workflow-injection logic
/// (comfyService.injectParameters) and the generation queue. The backend emits an event; the
/// frontend picks it up, runs addJob, and replies via a follow-up event the handler awaits.
///
/// Two modes:
///   - `prompt_id` given: load that project and generate from it (other params override its values).
///   - `prompt_id` omitted: generate directly from the supplied parameters (no project created).
///     In this mode `positive_prompt` is required.
async fn handle_generate_image(app: &AppHandle, arguments: &Value) -> (Vec<Value>, bool) {
    use tauri::Listener;

    let prompt_id = arg_str(arguments, "prompt_id");
    let batch_count = arg_u64(arguments, "batch_count", 1);

    // Direct-generation mode validation: without a prompt_id the caller MUST supply a positive
    // prompt — otherwise we'd inject an empty prompt into the workflow and produce garbage.
    if prompt_id.is_empty() {
        let positive = arg_opt_string(arguments, "positive_prompt");
        if positive.is_none() {
            return text_err(
                "When prompt_id is omitted, positive_prompt is required.".to_string(),
            );
        }
    }

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

    // Forward the WHOLE arguments object so the frontend can build a temp project in direct mode
    // or apply per-field overrides on top of a loaded project.
    let _ = app.emit(
        "mcp-generate-request",
        json!({
            "prompt_id": prompt_id,
            "batch_count": batch_count,
            "reply_key": reply_key,
            "params": arguments,
        }),
    );

    // Wait for the reply, with a generous timeout for slow generations.
    let mut payload = match tokio::time::timeout(std::time::Duration::from_secs(180), rx).await {
        Ok(Ok(v)) => v,
        Ok(Err(_)) => json!({"status": "error", "message": "Internal: reply channel closed."}),
        Err(_) => json!({"status": "timeout", "message": "Generation timed out waiting for the frontend (is the app window open?)."}),
    };

    app_for_listen.unlisten(event_id);
    let _ = reply_key_for_unlisten;

    // The frontend returns local filesystem paths in `images`. External MCP clients can't read
    // those, so rewrite each into an HTTP URL served by this server's /image/<filename> endpoint.
    // The token is appended as ?token= so rendered <img src="..."> tags can authenticate without
    // being able to set Authorization headers.
    let port = crate::mcp_server::current_port().await;
    let token = crate::mcp_server::current_token().await;
    crate::mcp_server::handler::rewrite_image_urls(&mut payload, port, token.as_deref());

    let is_error = payload.get("status").and_then(|s| s.as_str()) != Some("completed");
    (vec![json!({ "type": "text", "text": payload.to_string() })], is_error)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tools_list_payload_core_only() {
        let tools = tools_list_payload(true, false, false);
        assert!(!tools.is_empty());
        for t in &tools {
            assert_eq!(t["name"].as_str().unwrap(), "search_prompts");
            break;
        }
        let names: Vec<&str> = tools.iter().filter_map(|t| t["name"].as_str()).collect();
        // Only core tools
        assert!(names.contains(&"search_prompts"));
        assert!(names.contains(&"get_prompt"));
        assert!(names.contains(&"create_prompt"));
        assert!(names.contains(&"generate_image"));
        assert!(names.contains(&"get_generated_images"));
        assert!(!names.contains(&"search_characters"));
        assert!(!names.contains(&"list_workflows"));
        assert!(!names.contains(&"update_prompt_content"));
    }

    #[test]
    fn test_tools_list_payload_query_only() {
        let tools = tools_list_payload(false, true, false);
        let names: Vec<&str> = tools.iter().filter_map(|t| t["name"].as_str()).collect();
        assert!(names.contains(&"list_character_series"));
        assert!(names.contains(&"search_characters_in_series"));
        assert!(names.contains(&"list_favorite_characters"));
        assert!(names.contains(&"list_favorite_artists"));
        assert!(names.contains(&"list_workflows"));
        assert!(names.contains(&"get_workflow"));
        assert!(names.contains(&"check_comfyui_status"));
        assert!(names.contains(&"list_local_models"));
        // Removed browsability tools must NOT come back.
        assert!(!names.contains(&"search_characters"));
        assert!(!names.contains(&"get_character_series"));
        assert!(!names.contains(&"search_prompts"));
        assert!(!names.contains(&"update_prompt_content"));
        // search_artists is back (artists have no series dimension, so the series-drilldown
        // refactor doesn't apply to them — they need a direct paginated search).
        assert!(names.contains(&"search_artists"));
    }

    #[test]
    fn test_tools_list_payload_write_only() {
        let tools = tools_list_payload(false, false, true);
        let names: Vec<&str> = tools.iter().filter_map(|t| t["name"].as_str()).collect();
        assert!(names.contains(&"update_prompt_content"));
        assert!(names.contains(&"update_prompt_settings"));
        assert!(names.contains(&"add_favorite_character"));
        assert!(names.contains(&"add_favorite_artist"));
        assert!(names.contains(&"remove_favorite_character"));
        assert!(names.contains(&"remove_favorite_artist"));
        assert!(names.contains(&"create_workflow"));
        assert!(!names.contains(&"search_prompts"));
    }

    #[test]
    fn test_tools_list_payload_all_disabled() {
        let tools = tools_list_payload(false, false, false);
        assert!(tools.is_empty());
    }

    #[test]
    fn test_tools_list_payload_schema_format() {
        let tools = tools_list_payload(true, false, false);
        let t = &tools[0];
        // MCP expects "inputSchema" key (not "input_schema")
        assert!(t.get("inputSchema").is_some(), "MCP spec requires inputSchema");
        assert!(t.get("name").is_some());
        assert!(t.get("description").is_some());
    }

    /// Verify the post-refactor tool table shape: the old browsability tools are gone, the new
    /// drill-down + remove tools exist and land in the right group, and their schemas are legal.
    /// This guards against accidental regressions when tools are added/removed later.
    #[test]
    fn test_tool_table_shape_after_refactor() {
        let all_tools = tools_list_payload(true, true, true);
        let names: Vec<&str> = all_tools.iter().filter_map(|t| t["name"].as_str()).collect();

        // Removed browsability tools must NOT come back. (search_artists is intentionally kept —
        // artists have no series dimension, unlike characters.)
        for removed in ["search_characters", "get_character_series"] {
            assert!(
                !names.contains(&removed),
                "{} should have been removed in the refactor",
                removed
            );
        }
        assert!(names.contains(&"search_artists"));

        // New drill-down tools present.
        assert!(names.contains(&"list_character_series"), "missing list_character_series");
        assert!(names.contains(&"search_characters_in_series"), "missing search_characters_in_series");
        // New remove tools present.
        assert!(names.contains(&"remove_favorite_character"), "missing remove_favorite_character");
        assert!(names.contains(&"remove_favorite_artist"), "missing remove_favorite_artist");

        // Group placement: drill-down in Query-only, remove in Write-only.
        let query_only = tools_list_payload(false, true, false);
        let q_names: Vec<&str> = query_only.iter().filter_map(|t| t["name"].as_str()).collect();
        assert!(q_names.contains(&"list_character_series"));
        assert!(q_names.contains(&"search_characters_in_series"));
        assert!(!q_names.contains(&"remove_favorite_character"));

        let write_only = tools_list_payload(false, false, true);
        let w_names: Vec<&str> = write_only.iter().filter_map(|t| t["name"].as_str()).collect();
        assert!(w_names.contains(&"remove_favorite_character"));
        assert!(w_names.contains(&"remove_favorite_artist"));
        assert!(!w_names.contains(&"list_character_series"));
    }

    /// `search_characters_in_series` MUST declare `series` as required — without it the LLM could
    /// call the tool with no series and pull an unbounded slice of the 50k+ character table.
    #[test]
    fn test_search_characters_in_series_requires_series() {
        let tools = tools_list_payload(false, true, false);
        let t = tools
            .iter()
            .find(|t| t["name"].as_str() == Some("search_characters_in_series"))
            .expect("tool not found");
        let required: Vec<&str> = t["inputSchema"]["required"]
            .as_array()
            .expect("required must be an array")
            .iter()
            .filter_map(|v| v.as_str())
            .collect();
        assert!(required.contains(&"series"), "series must be required");
    }

    /// `remove_favorite_*` schemas must accept EITHER id or tag — neither should be required
    /// (the backend errors if both are missing, but the schema must not force one).
    #[test]
    fn test_remove_favorite_schemas_allow_id_or_tag() {
        let tools = tools_list_payload(false, false, true);
        for tool_name in ["remove_favorite_character", "remove_favorite_artist"] {
            let t = tools
                .iter()
                .find(|t| t["name"].as_str() == Some(tool_name))
                .expect("tool not found");
            // No "required" field, or an empty one — both id and tag are optional.
            let required = t["inputSchema"].get("required");
            assert!(
                required.is_none() || required.unwrap().as_array().map(|a| a.is_empty()).unwrap_or(true),
                "{} must not require id or tag",
                tool_name
            );
            let props = &t["inputSchema"]["properties"];
            let id_key = if tool_name == "remove_favorite_character" { "character_id" } else { "artist_id" };
            let tag_key = if tool_name == "remove_favorite_character" { "character_tag" } else { "artist_tag" };
            assert!(props.get(id_key).is_some(), "{} missing {}", tool_name, id_key);
            assert!(props.get(tag_key).is_some(), "{} missing {}", tool_name, tag_key);
        }
    }

    #[test]
    fn test_arg_str() {
        let v = json!({"name": "test", "count": 42, "empty": ""});
        assert_eq!(arg_str(&v, "name"), "test");
        assert_eq!(arg_str(&v, "missing"), "");
        assert_eq!(arg_str(&v, "count"), "");
        assert_eq!(arg_str(&v, "empty"), "");
    }

    #[test]
    fn test_arg_opt_string() {
        let v = json!({"name": "test", "empty": "", "null_val": null});
        assert_eq!(arg_opt_string(&v, "name"), Some("test".to_string()));
        assert_eq!(arg_opt_string(&v, "missing"), None);
        assert_eq!(arg_opt_string(&v, "empty"), None);
        assert_eq!(arg_opt_string(&v, "null_val"), None);
    }

    #[test]
    fn test_arg_usize() {
        let v = json!({"count": 42, "zero": 0, "str": "42"});
        assert_eq!(arg_usize(&v, "count", 10), 42);
        assert_eq!(arg_usize(&v, "missing", 10), 10);
        assert_eq!(arg_usize(&v, "zero", 10), 0);
        assert_eq!(arg_usize(&v, "str", 10), 10); // string returns default
    }

    #[test]
    fn test_arg_u64_default() {
        let v = json!({"count": 1.0});
        // JSON number 1.0 as float → as_u64 returns None → defaults to 1
        // This is a known edge case: some MCP clients send integers as floats
        assert_eq!(arg_u64(&v, "count", 1), 1);
    }

    #[test]
    fn test_arg_opt_string_array() {
        let v = json!({"tags": ["a", "b", "c"]});
        let result = arg_opt_string_array(&v, "tags");
        assert_eq!(result, Some(vec!["a".into(), "b".into(), "c".into()]));

        let v2 = json!({"tags": []});
        assert_eq!(arg_opt_string_array(&v2, "tags"), None);

        let v3 = json!({});
        assert_eq!(arg_opt_string_array(&v3, "tags"), None);
    }

    #[test]
    fn test_build_prompt_filter() {
        let v = json!({"search": "test", "tags": ["tag1"], "limit": 10});
        let filter = build_prompt_filter(&v);
        assert!(filter.is_some());
        let f = filter.unwrap();
        assert_eq!(f.search, Some("test".into()));
        assert_eq!(f.limit, Some(10));
    }

    #[test]
    fn test_build_prompt_filter_empty_returns_none() {
        let v = json!({});
        assert!(build_prompt_filter(&v).is_none());
    }
}

// ============================ helpers ============================

/// Success text content (is_error = false).
fn text_ok(text: String) -> (Vec<Value>, bool) {
    (vec![json!({ "type": "text", "text": text })], false)
}

/// Error text content (is_error = true).
fn text_err(text: String) -> (Vec<Value>, bool) {
    (vec![json!({ "type": "text", "text": text })], true)
}

/// Serialise any serialisable result (or an error) into the MCP text content shape.
fn rows_to_text<T: serde::Serialize>(res: Result<T, String>) -> (Vec<Value>, bool) {
    match res {
        Ok(v) => {
            let pretty = serde_json::to_string_pretty(&v).unwrap_or_else(|_| "{}".to_string());
            text_ok(pretty)
        }
        Err(e) => text_err(format!("Error: {}", e)),
    }
}

/// For lookup-by-id tools: a `None` result means "not found", which the MCP client should treat
/// as an error (otherwise an LLM will happily consume `null` as a valid payload and hallucinate).
/// `Some(x)` serialises normally; `Err` stays an error.
fn optional_row_to_text<T: serde::Serialize>(label: &str, res: Result<Option<T>, String>) -> (Vec<Value>, bool) {
    match res {
        Ok(Some(v)) => {
            let pretty = serde_json::to_string_pretty(&v).unwrap_or_else(|_| "{}".to_string());
            text_ok(pretty)
        }
        Ok(None) => text_err(format!("{} not found.", label)),
        Err(e) => text_err(format!("Error: {}", e)),
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
        if let Some(d) = arg_opt_string(args, "description") {
            existing.description = d;
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
        if let Some(s) = arg_opt_string(args, "seed") {
            existing.seed = s;
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

