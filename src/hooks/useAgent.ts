import { useState, useRef, useEffect } from 'react';
import { useSettingsStore } from '../stores/settingsStore';
import { usePromptStore } from '../stores/promptStore';
import { useAgentStore } from '../stores/agentStore';
import { invoke, Channel } from '@tauri-apps/api/core';
import { useQueueStore } from '../stores/queueStore';
import { useWorkflowStore } from '../stores/workflowStore';
import { useFavoriteLibraryStore } from '../stores/favoriteLibraryStore';
import { useModelStore } from '../stores/modelStore';
import { comfyService } from '../services/comfyService';
import { buildOutputSpec, type PromptSyntax } from '../lib/agentPrompts';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';

const smartFetch = async (input: RequestInfo | URL | string, init?: RequestInit) => {
  const isAndroid = navigator.userAgent.toLowerCase().includes('android');
  if (isAndroid && typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
    try {
      return await tauriFetch(input as string, init);
    } catch (e: any) {
      if (e.message && e.message.includes('not allowed on the configured scope')) {
        console.warn('tauriFetch scope error, falling back to window.fetch', e);
      } else {
        throw e;
      }
    }
  }
  return window.fetch(input, init);
};

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  images?: string[];
  files?: ChatAttachment[];
  tool_calls?: any[];
  tool_call_id?: string;
  name?: string;
  // Reasoning models (deepseek-v4-flash etc.) require this to be passed back on multi-turn calls.
  reasoning_content?: string;
}

export interface ChatAttachment {
  path: string;       // Saved local path (from save_base64_file)
  name: string;       // Original filename
  mime: string;       // Mime type
  isImage: boolean;   // Convenience flag (legacy images[] still used for image-only viewers)
}

// 兜底解析被 LLM 文本化的 tool_call。两种格式：
//   1. 标准 Hermes JSON:  <tool_call>{"name":"x","arguments":{...}}</tool_call>
//   2. XML 风格:          <tool_call><function=name><parameter=k>v</parameter>...</function></tool_call>
// 返回解析出的 calls + 移除标签后的剩余文本。
function parseEmbeddedToolCalls(content: string): {
  calls: { id: string; type: 'function'; function: { name: string; arguments: string } }[];
  remaining: string;
} {
  const calls: { id: string; type: 'function'; function: { name: string; arguments: string } }[] = [];
  let remaining = content;

  const blockRe = /<tool_call>([\s\S]*?)<\/tool_call>/g;
  const blocks = [...content.matchAll(blockRe)];
  if (blocks.length === 0) return { calls, remaining };

  for (let i = 0; i < blocks.length; i++) {
    const raw = blocks[i][1].trim();
    let name = '';
    let argsObj: any = {};

    // 优先尝试 JSON 解析（标准 Hermes 格式）
    try {
      const json = JSON.parse(raw);
      if (json && typeof json === 'object') {
        name = String(json.name || json.function || '');
        if (json.arguments && typeof json.arguments === 'object') {
          argsObj = json.arguments;
        } else if (typeof json.arguments === 'string') {
          try { argsObj = JSON.parse(json.arguments); } catch { argsObj = {}; }
        } else if (json.parameters) {
          argsObj = json.parameters;
        }
      }
    } catch {
      // 不是 JSON，尝试 XML 风格：<function=NAME>...</function> + <parameter=K>V</parameter>
      const fnMatch = raw.match(/<function=([^>\s]+)>([\s\S]*?)<\/function>/);
      if (fnMatch) {
        name = fnMatch[1].trim();
        const inner = fnMatch[2] || '';
        const paramRe = /<parameter=([^>\s]+)>([\s\S]*?)<\/parameter>/g;
        const params = [...inner.matchAll(paramRe)];
        for (const p of params) {
          const key = p[1].trim();
          let val: any = p[2].trim();
          // 尝试转 JSON（数组/对象/数字/布尔/null）
          if (val === 'true') val = true;
          else if (val === 'false') val = false;
          else if (val === 'null') val = null;
          else {
            try {
              const parsed = JSON.parse(val);
              val = typeof parsed === 'number' || typeof parsed === 'object' ? parsed : val;
            } catch { /* 保持字符串 */ }
          }
          argsObj[key] = val;
        }
      }
    }

    if (name) {
      calls.push({
        id: `recovered_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 8)}`,
        type: 'function',
        function: { name, arguments: JSON.stringify(argsObj) },
      });
    }
  }

  remaining = content.replace(blockRe, '');
  return { calls, remaining };
}

export function useAgent() {
  const { sessions, activeSessionId, addMessage, setMessages, settings: agentSettings, isGenerating, setIsGenerating } = useAgentStore();
  const activeSession = sessions.find(s => s.id === activeSessionId);
  const messages = activeSession?.messages || [];
  const abortControllerRef = useRef<AbortController | null>(null);
  const [mcpTools, setMcpTools] = useState<any[]>([]);
  const [mcpEnabled, setMcpEnabled] = useState(false);

  const sanitizeSchema = (schema: any): any => {
    if (!schema || typeof schema !== 'object') return { type: "object", properties: {} };
    if (Array.isArray(schema)) {
      return schema.map(sanitizeSchema);
    }
    const cleaned: any = {};
    for (const key of Object.keys(schema)) {
      if (key === '$defs' || key === '$ref' || key === '$schema') continue;
      const val = schema[key];
      if (key === 'anyOf' && Array.isArray(val)) {
        cleaned.type = 'string';
      } else if (key === 'allOf' && Array.isArray(val)) {
        Object.assign(cleaned, sanitizeSchema(val.find((v: any) => v.type) || val[0] || {}));
      } else if (key === 'enum' && Array.isArray(val)) {
        cleaned[key] = val.filter((v: any) => typeof v === 'string').slice(0, 50);
        if (cleaned[key].length === 0) delete cleaned[key];
      } else if (typeof val === 'object' && val !== null) {
        cleaned[key] = sanitizeSchema(val);
      } else {
        cleaned[key] = val;
      }
    }
    if (!cleaned.type) cleaned.type = "object";
    return cleaned;
  };

  useEffect(() => {
    let cancelled = false;

    const fetchMcpTools = async () => {
      const { mcpServers } = useSettingsStore.getState().settings;
      const enabledServers = mcpServers?.filter(s => s.enabled) || [];
      if (enabledServers.length === 0) {
        setMcpTools([]);
        setMcpEnabled(false);
        return;
      }

      const allTools: any[] = [];
      for (const server of enabledServers) {
        try {
          const rustTools = await invoke<any[]>('list_mcp_tools', { url: server.url });
          for (const t of rustTools) {
            allTools.push({
              type: "function",
              function: {
                name: t.name,
                description: (t.description || "").substring(0, 1024),
                parameters: sanitizeSchema(t.input_schema) || { type: "object", properties: {} }
              },
              _mcp: { url: server.url }
            });
          }
        } catch (e) {
          console.warn(`[Agent] MCP server "${server.name}" failed to connect:`, e);
        }
      }
      if (!cancelled) {
        setMcpTools(allTools);
        setMcpEnabled(allTools.length > 0);
      }
    };

    fetchMcpTools();

    const unsub = useSettingsStore.subscribe((s, prev) => {
      if (s.settings.mcpServers !== prev.settings.mcpServers) {
        fetchMcpTools();
      }
    });

    return () => { cancelled = true; unsub(); };
  }, []);

  // Tools definition
  const ALL_TOOLS = [
    {
      type: "function",
      function: {
        name: "search_prompts",
        description: "Search for prompts by tags, keywords, or filters.",
        parameters: {
          type: "object",
          properties: {
            tags: { type: "array", items: { type: "string" }, description: "Tags to filter by (e.g., '日系', '战斗')" },
            limit: { type: "number", description: "Maximum number of prompts to return" }
          }
        }
      }
    },
    {
      type: "function",
      function: {
        name: "get_prompt",
        description: "Get a specific prompt by ID.",
        parameters: {
          type: "object",
          properties: {
            prompt_id: { type: "string", description: "The ID of the prompt" }
          },
          required: ["prompt_id"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "create_prompt",
        description: "Create a new prompt project. CHARACTER PROTECTION (CRITICAL — violating this is the #1 cause of bad generations): (1) NAMED CHARACTERS: If the scene mentions a known character (e.g. Hatsune Miku, Genshin/原神, Blue Archive/蔚蓝档案 characters), DO NOT add hair_color/eye_color/hairstyle/body_type tags — use ONLY the character name tag. The image model already knows their appearance; guessing wrong traits ruins generation. (2) UNSURE? VERIFY FIRST: If unsure whether a name is a known character, call search_tags with category='character' to check before adding ANY appearance tags. (3) ORIGINAL CHARACTERS: For unnamed/original characters, freely describe appearance. (4) MULTI-CHARACTER: Group each character's tags as a contiguous block — NEVER interleave tags of different characters (WRONG: 'blue_hair, red_hair, short_hair, long_hair'; RIGHT: 'blue_hair, short_hair, [all char A], red_hair, long_hair, [all char B]').",
        parameters: {
          type: "object",
          properties: {
            title: { type: "string", description: "Project title" },
            content: { type: "string", description: "The positive prompt text (English keywords)" },
            negative_prompt: { type: "string", description: "The negative prompt text" },
            artist_prompt: { type: "string", description: "Artist or style trigger words (comma-separated, e.g. @artist_name)" },
            prompt_syntax: { type: "string", enum: ["danbooru", "natural", "xml"], description: "The syntax mode of the prompt (danbooru, natural, xml)" },
            tags: { type: "array", items: { type: "string" }, description: "Tags for the prompt" },
            instance_images: { type: "array", items: { type: "string" }, description: "URLs or file paths to instance reference images" },
            base_model: { type: "string", description: "The base checkpoint model filename, e.g. 'sd_xl_base_1.0.safetensors'" },
            vae_model: { type: "string", description: "VAE model, default 'auto'" },
            lora_configs: {
              type: "array",
              description: "List of LoRA configs to apply",
              items: {
                type: "object",
                properties: {
                  name: { type: "string", description: "LoRA filename" },
                  strength: { type: "number", description: "LoRA strength, 0.0 to 2.0" },
                  enabled: { type: "boolean", description: "Whether this LoRA is enabled" }
                },
                required: ["name", "strength", "enabled"]
              }
            },
            width: { type: "number", description: "Image width in pixels (default 1024)" },
            height: { type: "number", description: "Image height in pixels (default 1024)" },
            steps: { type: "number", description: "Sampling steps (default 25)" },
            cfg_scale: { type: "number", description: "CFG scale / guidance scale (default 5.0)" },
            seed: { type: "string", description: "Seed value, use '-1' for random" },
            sampler_name: { type: "string", description: "Sampler name (e.g. euler, euler_ancestral, dpmpp_2m)" },
            scheduler: { type: "string", description: "Scheduler name (e.g. normal, karras, beta57)" }
          },
          required: ["content"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "update_prompt_content",
        description: "Update the textual content (prompts, title, tags) of an existing project. CHARACTER PROTECTION: Same critical rules as create_prompt — do NOT invent appearance tags (hair/eye/body) for NAMED characters; group multi-character tags contiguously; verify unknown character names via search_tags category='character' before adding appearance tags.",
        parameters: {
          type: "object",
          properties: {
            prompt_id: { type: "string", description: "The ID of the prompt to update" },
            title: { type: "string", description: "Updated title" },
            positive_prompt: { type: "string", description: "Updated positive prompt text" },
            negative_prompt: { type: "string", description: "Updated negative prompt text" },
            artist_prompt: { type: "string", description: "Updated artist or style trigger words" },
            prompt_syntax: { type: "string", enum: ["danbooru", "natural", "xml"], description: "Updated syntax mode" },
            tags: { type: "array", items: { type: "string" }, description: "Updated tags" },
          },
          required: ["prompt_id"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "update_prompt_settings",
        description: "Update the configuration settings (model, LoRAs, resolution, etc) of an existing project.",
        parameters: {
          type: "object",
          properties: {
            prompt_id: { type: "string", description: "The ID of the prompt to update" },
            base_model: { type: "string", description: "Base checkpoint model filename" },
            vae_model: { type: "string", description: "VAE model" },
            lora_configs: {
              type: "array",
              description: "List of LoRA configs to apply",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  strength: { type: "number" },
                  enabled: { type: "boolean" }
                },
                required: ["name", "strength", "enabled"]
              }
            },
            width: { type: "number" },
            height: { type: "number" },
            steps: { type: "number" },
            cfg_scale: { type: "number" },
            seed: { type: "string" },
            sampler_name: { type: "string" },
            scheduler: { type: "string" },
            workflow_id: { type: "string", description: "The ID of the default workflow to bind to this prompt" }
          },
          required: ["prompt_id"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "delete_prompt",
        description: "Delete an existing prompt.",
        parameters: {
          type: "object",
          properties: {
            prompt_id: { type: "string", description: "The ID of the prompt to delete" }
          },
          required: ["prompt_id"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "generate_image",
        description: "Generate an image using a specific prompt project. It will automatically rely on the bound workflow. This function WAITS for generation to complete and returns the generated image URLs directly. You do NOT need to poll get_queue_status after calling this.",
        parameters: {
          type: "object",
          properties: {
            prompt_id: { type: "string", description: "The ID of the prompt to use" },
            batch_count: { type: "number", description: "Number of images to generate (default 1)" }
          },
          required: ["prompt_id"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "generate_video_from_image",
        description: "Generate a video from an image using an img2video workflow. The source image is taken AUTOMATICALLY from the most recent image in the conversation (user-attached or generation result) — do NOT ask the user for a path. You should write a vivid prompt describing the MOTION, camera language, and atmosphere for the video based on the image content you can see. The workflow has a built-in translation LLM, so you may write in Chinese or English. Parameters: duration is in SECONDS (default 5). fps default 25.",
        parameters: {
          type: "object",
          properties: {
            prompt: { type: "string", description: "Description of desired video motion, camera movement, and atmosphere. Can be Chinese or English." },
            duration: { type: "number", description: "Video duration in SECONDS (default 5)" },
            fps: { type: "number", description: "Frames per second (default 25)" },
            base_model: { type: "string", description: "Optional. Override the workflow's default checkpoint model." },
            workflow_id: { type: "string", description: "Optional. Specific img2video workflow ID." }
          },
          required: ["prompt"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "get_queue_status",
        description: "Get the status of the generation queue, including recent completed jobs with their image URLs. Use this ONLY to check queue state — do NOT poll repeatedly. generate_image already returns results directly.",
        parameters: {
          type: "object",
          properties: {}
        }
      }
    },
    {
      type: "function",
      function: {
        name: "search_workflows",
        description: "Search for workflows by tags or limit.",
        parameters: {
          type: "object",
          properties: {
            tags: { type: "array", items: { type: "string" } },
            limit: { type: "number" }
          }
        }
      }
    },
    {
      type: "function",
      function: {
        name: "get_workflow",
        description: "Get a specific workflow by ID.",
        parameters: {
          type: "object",
          properties: {
            workflow_id: { type: "string" }
          },
          required: ["workflow_id"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "create_workflow",
        description: "Create a new workflow.",
        parameters: {
          type: "object",
          properties: {
            title: { type: "string" },
            description: { type: "string" },
            workflow_json: { type: "object", description: "The ComfyUI workflow JSON object. IMPORTANT: If the user pasted a large JSON block in their chat message, OMIT this parameter completely! The system will automatically extract it." },
            tags: { type: "array", items: { type: "string" } }
          },
          required: ["title"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "update_workflow",
        description: "Update an existing workflow.",
        parameters: {
          type: "object",
          properties: {
            workflow_id: { type: "string" },
            title: { type: "string" },
            description: { type: "string" },
            workflow_json: { type: "object", description: "The updated ComfyUI workflow JSON object. IMPORTANT: If the user pasted a large JSON block in their chat message, OMIT this parameter completely!" },
            tags: { type: "array", items: { type: "string" } }
          },
          required: ["workflow_id"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "delete_workflow",
        description: "Delete an existing workflow.",
        parameters: {
          type: "object",
          properties: {
            workflow_id: { type: "string" }
          },
          required: ["workflow_id"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "get_generated_images",
        description: "Get the list of generated images from the history. Can filter by prompt_id to get images generated from a specific project.",
        parameters: {
          type: "object",
          properties: {
            prompt_id: { type: "string", description: "Optional: filter to only show images generated from this prompt project" },
            limit: { type: "number", description: "Maximum number of images to return (default 10)" }
          }
        }
      }
    },
    {
      type: "function",
      function: {
        name: "add_instance_image",
        description: "Add a generated history image (or any URL) to a prompt project's instance/reference images. Use this when the user wants to use a generated image as a reference for a project.",
        parameters: {
          type: "object",
          properties: {
            prompt_id: { type: "string", description: "The ID of the prompt project to add the image to" },
            image_url: { type: "string", description: "The URL of the image to add (e.g. from get_generated_images results)" }
          },
          required: ["prompt_id", "image_url"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "auto_tag_all_prompts",
        description: "Batch auto-generate Chinese tags for all prompts based on their positive prompts using the configured LLM API. Does this silently in the background.",
        parameters: {
          type: "object",
          properties: {}
        }
      }
    },
    {
      type: "function",
      function: {
        name: "list_local_models",
        description: "List all local models (checkpoints, loras, vaes) available in the system so you can assign valid model names when creating or updating prompts.",
        parameters: {
          type: "object",
          properties: {}
        }
      }
    },
    {
      type: "function",
      function: {
        name: "install_custom_node",
        description: "Install a ComfyUI custom node by git cloning it into custom_nodes/.",
        parameters: {
          type: "object",
          properties: {
            node_url: { type: "string", description: "Git URL of the custom node to install (e.g. https://github.com/ltdrdata/ComfyUI-Manager.git)" },
            comfy_dir: { type: "string", description: "ComfyUI installation directory. Default: C:\\ComfyUI" }
          },
          required: ["node_url"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "check_comfyui_status",
        description: "Check if a ComfyUI server is online and return its system stats.",
        parameters: {
          type: "object",
          properties: {
            url: { type: "string", description: "ComfyUI URL. Default: http://127.0.0.1:8188" }
          }
        }
      }
    },
    // ===== 全库角色/画师查询（非收藏，搜整个 36k+ 角色 / 15k+ 画师库）=====
    {
      type: "function",
      function: {
        name: "list_character_series",
        description: "List character series/copyrights (e.g. Genshin Impact/原神, Arknights/明日方舟) with character counts, paginated. Use this FIRST to discover which series exist, then call search_characters_in_series with the series name. Each result returns BOTH `series` (English tag) and `seriesZh` (Chinese name). Always page (default 30, max 100).",
        parameters: {
          type: "object",
          properties: {
            search: { type: "string", description: "Optional. Fuzzy-match series name (English or Chinese)." },
            limit: { type: "number", description: "Page size. Default 30, max 100." },
            offset: { type: "number", description: "Pagination offset. Default 0." }
          }
        }
      }
    },
    {
      type: "function",
      function: {
        name: "search_characters_in_series",
        description: "Search for characters WITHIN a specific series (e.g. all characters in 原神). `series` is REQUIRED — pass the seriesZh (e.g. \"原神\") or series (e.g. \"mihoyo\") value. Returns trigger (put in positive prompt) and coreTags (appearance reference only — do NOT dump into prompt for named characters). Default limit 20, max 50.",
        parameters: {
          type: "object",
          properties: {
            series: { type: "string", description: "REQUIRED. Series name (Chinese or English) from list_character_series." },
            search: { type: "string", description: "Optional. Further filter by character name." },
            limit: { type: "number", description: "Page size. Default 20, max 50." },
            offset: { type: "number", description: "Pagination offset. Default 0." }
          },
          required: ["series"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "search_artists",
        description: "Search the artist library (15k+ artists with trigger tags). Returns trigger (e.g. \"wlop\") to put in the positive prompt. Ordered by popularity. Default limit 20, max 50. Pass search to filter by name.",
        parameters: {
          type: "object",
          properties: {
            search: { type: "string", description: "Optional. Artist name keyword (English or Chinese)." },
            limit: { type: "number", description: "Page size. Default 20, max 50." },
            offset: { type: "number", description: "Pagination offset. Default 0." }
          }
        }
      }
    },
    {
      type: "function",
      function: {
        name: "random_character_and_artist",
        description: "Pick a RANDOM character (with trigger + coreTags) and a RANDOM artist (with trigger) from the library. A creativity springboard for 'surprise me' / '随便来一张'. Returns the picked info so you can imagine a scene and call generate_image. Pure random.",
        parameters: {
          type: "object",
          properties: {
            series: { type: "string", description: "Optional. Restrict character to a series." },
            use_artist: { type: "boolean", description: "Optional. Also pick random artist (default true)." }
          }
        }
      }
    },
    // ===== 收藏角色 / 收藏画师 CRUD =====
    // 收藏是一等实体，独立于 gallery。gallery_*_id 仅作软链，用于图片/元数据自动补全。
    // 角色支持 tag 分组；画师无 tag。
    {
      type: "function",
      function: {
        name: "view_bookmarks",
        description: "⚠️ ONLY use when user explicitly says \"收藏\"/\"bookmark\"/\"favorite\". Shows the user's BOOKMARKED characters (not the full library). For browsing ALL characters use browse_characters instead. Supports tag filter and search.",
        parameters: {
          type: "object",
          properties: {
            tags: { type: "array", items: { type: "string" }, description: "Optional tag filter. Empty/omitted = no tag filter." },
            tag_match: { type: "string", enum: ["or", "and"], description: "Tag filter mode. 'or' = any tag matches (default), 'and' = all tags must match." },
            search: { type: "string", description: "Optional free-text search across character_tag/display_name/notes/trigger." },
            limit: { type: "number", description: "Max results (default 50, cap 500)." },
            offset: { type: "number", description: "Pagination offset (default 0)." }
          }
        }
      }
    },
    {
      type: "function",
      function: {
        name: "add_favorite_character",
        description: "⚠️ ONLY use when the user EXPLICITLY says they want to 收藏/favorite a specific character (e.g. '收藏雷电将军', 'add X to favorites'). Do NOT use this tool when the user says '生成角色' / 'generate characters' / 'create characters' — that means use create_prompt + generate_image. This tool does NOT generate any image; it only registers a bookmark. The example_image field requires an EXISTING image path/URL (e.g. from a previous generate_image result) — it does not trigger generation.\n\nAdd a character to favorites, or update if the character_tag already exists (upsert). Source can be 'gallery' (from built-in character library), 'lora' (from a LoRA file), 'custom' (user-defined), or 'unknown'. The system auto-matches against the gallery by character_tag to fill gallery_character_id/trigger/display_name when possible. Tags are appended on upsert (not replaced).",
        parameters: {
          type: "object",
          properties: {
            character_tag: { type: "string", description: "Canonical character tag, e.g. 'hatsune_miku'. Must be unique." },
            source: { type: "string", enum: ["gallery", "lora", "custom", "unknown"], description: "Where this favorite came from. Default 'unknown' (auto-upgraded to 'gallery' if tag matches gallery)." },
            display_name: { type: "string", description: "Optional display name override. If omitted and gallery matches, gallery name_zh/name_en is used." },
            trigger: { type: "string", description: "Optional trigger words. If omitted and gallery matches, gallery trigger is used." },
            example_image: { type: "string", description: "Optional local file path or URL to a reference image. Used when gallery has no image." },
            notes: { type: "string", description: "Optional free-form notes." },
            tags: { type: "array", items: { type: "string" }, description: "Optional user tags to attach (e.g. ['vocaloid', 'cyberpunk']). Appended on upsert." }
          },
          required: ["character_tag"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "update_favorite_character",
        description: "Update editable fields of a favorite character. Only display_name/trigger/example_image/notes can be changed — source/character_tag/gallery_character_id are immutable through this tool. At least one field must be provided.",
        parameters: {
          type: "object",
          properties: {
            id: { type: "string", description: "Favorite character ID." },
            display_name: { type: "string" },
            trigger: { type: "string" },
            example_image: { type: "string" },
            notes: { type: "string" }
          },
          required: ["id"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "remove_favorite_character",
        description: "Remove a favorite character by id or character_tag. Provide one of the two.",
        parameters: {
          type: "object",
          properties: {
            id: { type: "string", description: "Favorite character ID." },
            character_tag: { type: "string", description: "Alternative locator: the character tag." }
          }
        }
      }
    },
    {
      type: "function",
      function: {
        name: "relink_favorite_character",
        description: "Re-attempt gallery match for a favorite character. Use after the gallery is updated (e.g. characters.json reimported) to re-link gallery_character_id and refresh trigger/display_name. Returns the updated record.",
        parameters: {
          type: "object",
          properties: {
            id: { type: "string", description: "Favorite character ID." }
          },
          required: ["id"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "add_tags_to_favorite_character",
        description: "Append tags to a favorite character. Idempotent — existing tags are kept, duplicates ignored.",
        parameters: {
          type: "object",
          properties: {
            character_id: { type: "string", description: "Favorite character ID." },
            tags: { type: "array", items: { type: "string" }, description: "Tags to add." }
          },
          required: ["character_id", "tags"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "remove_tag_from_favorite_character",
        description: "Remove a single tag from a favorite character.",
        parameters: {
          type: "object",
          properties: {
            character_id: { type: "string", description: "Favorite character ID." },
            tag: { type: "string", description: "Tag to remove." }
          },
          required: ["character_id", "tag"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "set_favorite_character_tags",
        description: "Overwrite all tags of a favorite character. Pass empty array to clear all tags.",
        parameters: {
          type: "object",
          properties: {
            character_id: { type: "string", description: "Favorite character ID." },
            tags: { type: "array", items: { type: "string" }, description: "Complete new tag list." }
          },
          required: ["character_id", "tags"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "list_favorite_character_tags",
        description: "List all distinct tags used across favorite characters, with reference counts. Useful for building filter UI or showing tag clouds.",
        parameters: { type: "object", properties: {} }
      }
    },
    {
      type: "function",
      function: {
        name: "view_bookmarked_artists",
        description: "⚠️ ONLY use when user explicitly says \"收藏画师\"/\"bookmark artist\". Shows the user's BOOKMARKED artists (not the full library). For searching ALL artists use search_artists instead.",
        parameters: {
          type: "object",
          properties: {
            search: { type: "string", description: "Optional free-text search across artist_tag/display_name/notes/trigger." },
            limit: { type: "number", description: "Max results (default 50, cap 500)." },
            offset: { type: "number", description: "Pagination offset (default 0)." }
          }
        }
      }
    },
    {
      type: "function",
      function: {
        name: "add_favorite_artist",
        description: "⚠️ ONLY use when the user EXPLICITLY says they want to 收藏/favorite a specific artist (e.g. '收藏画师X', 'add artist Y to favorites'). Do NOT use this tool to 'add' an artist to a prompt — for that use update_prompt_content/update_prompt_settings with artist_prompt. This tool only registers a bookmark; it does NOT generate anything.\n\nAdd an artist to favorites, or update if the artist_tag already exists (upsert). Source can be 'gallery'/'lora'/'custom'/'unknown'. Auto-matches gallery to fill gallery_artist_id/trigger/display_name when possible.",
        parameters: {
          type: "object",
          properties: {
            artist_tag: { type: "string", description: "Canonical artist tag, e.g. 'kantoku'. Must be unique." },
            source: { type: "string", enum: ["gallery", "lora", "custom", "unknown"], description: "Default 'unknown' (auto-upgraded to 'gallery' if tag matches gallery)." },
            display_name: { type: "string" },
            trigger: { type: "string" },
            example_image: { type: "string", description: "Optional local file path or URL." },
            notes: { type: "string" }
          },
          required: ["artist_tag"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "update_favorite_artist",
        description: "Update editable fields of a favorite artist. Only display_name/trigger/example_image/notes can be changed.",
        parameters: {
          type: "object",
          properties: {
            id: { type: "string", description: "Favorite artist ID." },
            display_name: { type: "string" },
            trigger: { type: "string" },
            example_image: { type: "string" },
            notes: { type: "string" }
          },
          required: ["id"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "remove_favorite_artist",
        description: "Remove a favorite artist by id or artist_tag. Provide one of the two.",
        parameters: {
          type: "object",
          properties: {
            id: { type: "string" },
            artist_tag: { type: "string" }
          }
        }
      }
    }
  ];

  // Pre-check ref: holds the result of the lightweight character-detection +
  // query-rewrite pre-check, injected into the system prompt for the main LLM call.
  const precheckRef = useRef<string>("");

  const roundCounterRef = useRef<number>(0);
  const duplicateTrackerRef = useRef<Map<string, number>>(new Map());
  // 历史 image_path → base64 缓存。每轮 callLLM 会把所有历史图片重读一遍，
  // 长 session 下 N² 的 IO；缓存后只有第一次 read，之后命中内存。
  // data: URL 不缓存（已内存）。session 切换不需要清——同张图路径不变。
  const imageBase64CacheRef = useRef<Map<string, string>>(new Map());

  /**
   * Lightweight pre-check call before the main agent loop.
   * Detects named characters and rewrites the query into search dimensions,
   * so even weak LLMs know which concepts to protect / search.
   * Returns a context string to inject into the system prompt, or "" on failure.
   */
  const rewriteQueryAndDetectCharacters = async (userText: string): Promise<string> => {
    const { llm } = useSettingsStore.getState().settings;
    if (!llm.apiKey) return "";

    const precheckPrompt = `Analyze the user's image-generation request and extract structured information.
Output ONLY a valid JSON object, no markdown fences, no explanation:
{
  "has_named_character": boolean,
  "character_names": ["..."],
  "provided_tags": ["1girl", "white_hair"],
  "search_dimensions": ["维度1", "维度2"]
}

Rules:
1. has_named_character: true ONLY if the text mentions a known IP character (e.g. Hatsune Miku, Genshin/原神 characters, Blue Archive characters, etc.). A generic description like "一个蓝发少女" is NOT a named character.
2. character_names: detected character names in their original language.
3. provided_tags: English Danbooru tags explicitly provided by the user (comma-separated English words/underscores found in the input, e.g. "1girl,white_hair,serafuku").
4. search_dimensions: split the remaining scene description into 2-4 concise Chinese search dimensions (人设/表情动作/环境). Skip any dimension already covered by provided_tags. If the input is entirely already-provided English tags, return an empty array.

User input: ${userText}`;

    let apiUrl = llm.apiUrl || 'https://apihub.agnes-ai.com/v1';
    if (!apiUrl.endsWith('/chat/completions')) {
      apiUrl = apiUrl.replace(/\/$/, '') + '/chat/completions';
    }

    try {
      const resp = await smartFetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${llm.apiKey}`
        },
        body: JSON.stringify({
          model: llm.model || 'agnes-2.0-flash',
          messages: [{ role: 'user', content: precheckPrompt }],
          temperature: 0.2,
          max_tokens: 400,
        }),
        signal: abortControllerRef.current?.signal,
      });
      if (!resp.ok) return "";
      const data = await resp.json();
      const content = (data.choices?.[0]?.message?.content || "").replace(/```json/gi, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(content);

      const parts: string[] = [];
      if (parsed.has_named_character && Array.isArray(parsed.character_names) && parsed.character_names.length > 0) {
        parts.push(
          `⚠ NAMED CHARACTERS DETECTED: ${parsed.character_names.join(', ')}\n` +
          `CRITICAL: DO NOT add ANY appearance tags (hair_color, eye_color, hairstyle, body_type) for these characters. ` +
          `Use ONLY their name tags. The model already knows their appearance — wrong guesses ruin generation.`
        );
      }
      if (Array.isArray(parsed.provided_tags) && parsed.provided_tags.length > 0) {
        parts.push(
          `📋 USER-PROVIDED TAGS (trust directly, DO NOT search these again): ${parsed.provided_tags.join(', ')}`
        );
      }
      if (Array.isArray(parsed.search_dimensions) && parsed.search_dimensions.length > 0) {
        parts.push(
          `🔍 SEARCH DIMENSIONS (call search_tags for each of these, in Chinese):\n` +
          parsed.search_dimensions.map((d: string, i: number) => `  ${i + 1}. ${d}`).join('\n')
        );
      }
      return parts.length > 0
        ? "\n\n[PRE-CHECK ANALYSIS — follow these strictly when building the prompt:]\n" + parts.join('\n\n')
        : "";
    } catch {
      return "";
    }
  };

  const callLLM = async (currentMessages: ChatMessage[]) => {
    const { llm } = useSettingsStore.getState().settings;
    const { effort, maxRounds } = agentSettings;

    roundCounterRef.current += 1;
    const currentRound = roundCounterRef.current;
    const effectiveMaxRounds = effort === 'low' ? 1 : (maxRounds || 8);
    const budgetExceeded = currentRound > effectiveMaxRounds;

    let apiUrl = llm.apiUrl || 'https://apihub.agnes-ai.com/v1';
    if (!apiUrl.endsWith('/chat/completions')) {
      apiUrl = apiUrl.replace(/\/$/, '') + '/chat/completions';
    }

    // 复用 sendMessage 入口创建的 AbortController，避免 stopGenerating abort 错实例。
    // 仅当 ref 上没有时（理论上不该发生）才新建一个。
    const abortController = abortControllerRef.current || new AbortController();
    abortControllerRef.current = abortController;
    // 若调用方请求停止（ref 已被 abort 且替换），本轮直接退出
    if (abortController.signal.aborted) return;

    try {
      // Pre-process messages to fetch base64 for images.
      // Skip video files — LLM Vision API can only consume static images.
      const VIDEO_EXTS = new Set(['mp4', 'webm', 'avi', 'mov', 'mkv', 'm4v']);
      const isVideoExt = (p: string) => VIDEO_EXTS.has((p.split('?')[0].split('.').pop() || '').toLowerCase());
      const mappedMessages = await Promise.all(currentMessages.map(async (msg) => {
        const m: any = { role: msg.role };
        // Tool messages: don't send images back to LLM. The text content already
        // contains the JSON result (status/images). Sending base64 images to a
        // non-multimodal model causes "model does not support multimodal requests".
        const imageOnly = msg.role === 'tool' ? [] : (msg.images || []).filter(p => !isVideoExt(p));
        if (imageOnly.length > 0) {
          const b64Images = await Promise.all(imageOnly.map(async (urlOrPath) => {
            if (urlOrPath.startsWith('data:')) return urlOrPath;
            // 命中缓存直接返回，避免每轮重复 IO / fetch
            const cached = imageBase64CacheRef.current.get(urlOrPath);
            if (cached) return cached;
            let result: string;
            if (urlOrPath.startsWith('http')) {
              try {
                const res = await fetch(urlOrPath);
                const blob = await res.blob();
                result = await new Promise<string>((resolve) => {
                  const reader = new FileReader();
                  reader.onloadend = () => resolve(reader.result as string);
                  reader.readAsDataURL(blob);
                });
              } catch(e) { return urlOrPath; }
            } else {
              try {
                result = await invoke('read_image_base64', { path: urlOrPath });
              } catch(e) { return urlOrPath; }
            }
            if (result && result.startsWith('data:')) {
              imageBase64CacheRef.current.set(urlOrPath, result);
            }
            return result;
          }));
          
          m.content = [
            { type: "text", text: msg.content || "" },
            ...b64Images.map(img => ({
              type: "image_url",
              image_url: { url: img }
            }))
          ];
        } else {
          m.content = msg.content || "";
        }
        
        if (msg.tool_calls && msg.tool_calls.length > 0) m.tool_calls = msg.tool_calls;
        if (msg.tool_call_id) m.tool_call_id = msg.tool_call_id;
        if (msg.name) m.name = msg.name;
        // Preserve reasoning_content for thinking-mode models (deepseek-v4-flash etc.) — the API
        // requires it to be passed back on subsequent turns or it rejects with 400.
        if (msg.reasoning_content) m.reasoning_content = msg.reasoning_content;
        return m;
      }));

      // === 消息历史消毒 ===
      // OpenAI API 严格要求：
      //   1. assistant.tool_calls 中每个 id 必须有对应 tool message（同 tool_call_id）
      //   2. 每个 tool message 必须对应 assistant.tool_calls 中的某个 id
      //   3. tool_calls[i].function.arguments 必须是合法 JSON
      // 中断/网络异常/流式截断会留下：
      //   - arguments 是空串或半个 JSON 的 tool_call
      //   - 声明了 tool_calls 但没来得及执行（无对应 tool message）
      //   - tool message 但对应 assistant.tool_calls 已丢失
      // 这些都会让后续每次请求 API 都 400 Bad Request，对话彻底报废。
      // 发送前过滤一次，保证发给 API 的 history 总是干净的。

      // Step 1: 修复 arguments 是无效 JSON 的 tool_calls（替换为 "{}"）
      const repairedMessages = mappedMessages.map((m: any) => {
        if (m.role === 'assistant' && Array.isArray(m.tool_calls)) {
          const repairedCalls = m.tool_calls.map((tc: any) => {
            if (!tc || !tc.function) return null;
            const args = tc.function.arguments;
            if (typeof args !== 'string' || args.trim() === '') {
              return { ...tc, function: { ...tc.function, arguments: '{}' } };
            }
            try {
              JSON.parse(args);
              return tc;
            } catch (e) {
              return { ...tc, function: { ...tc.function, arguments: '{}' } };
            }
          }).filter((tc: any) => tc !== null);
          return { ...m, tool_calls: repairedCalls };
        }
        return m;
      });

      // Step 2: 收集 assistant 声明的 tool_call_ids 和 tool message 提供的 tool_call_ids
      const assistantToolCallIds = new Set<string>();
      const toolMessageIds = new Set<string>();
      for (const m of repairedMessages) {
        if (m.role === 'assistant' && Array.isArray(m.tool_calls)) {
          for (const tc of m.tool_calls) {
            if (tc.id) assistantToolCallIds.add(tc.id);
          }
        } else if (m.role === 'tool' && m.tool_call_id) {
          toolMessageIds.add(m.tool_call_id);
        }
      }
      // 只有双向匹配（assistant 声明 + tool 提供）的 id 才算有效
      const validIds = new Set<string>();
      for (const id of assistantToolCallIds) {
        if (toolMessageIds.has(id)) validIds.add(id);
      }

      // Step 3: 过滤消息
      // - assistant.tool_calls 只保留 validIds 中的
      // - tool message 只保留 validIds 中的
      // - 完全空的 assistant（无 content 且 tool_calls 过滤后为空）整条移除
      const finalMessages = repairedMessages
        .map((m: any) => {
          if (m.role === 'assistant' && Array.isArray(m.tool_calls)) {
            const filtered = m.tool_calls.filter((tc: any) => tc.id && validIds.has(tc.id));
            return { ...m, tool_calls: filtered.length > 0 ? filtered : undefined };
          }
          return m;
        })
        .filter((m: any) => {
          if (m.role === 'tool') {
            return m.tool_call_id && validIds.has(m.tool_call_id);
          }
          if (m.role === 'assistant') {
            const hasContent = typeof m.content === 'string'
              ? m.content.trim().length > 0
              : Array.isArray(m.content) && m.content.length > 0;
            const hasToolCalls = Array.isArray(m.tool_calls) && m.tool_calls.length > 0;
            // 过滤掉历史遗留的 [Error]: xxx 消息——这类消息是把 API 报错
            // 当成 assistant content 存了进去，会让上游 LLM 拒绝处理整个会话。
            // 新逻辑已经改成友好化提示，但旧污染数据需要从这里剥掉。
            const isLegacyError = typeof m.content === 'string'
              && m.content.startsWith('[Error]:');
            return (hasContent || hasToolCalls) && !isLegacyError;
          }
          return true;
        });

      const droppedCount = mappedMessages.length - finalMessages.length;
      if (droppedCount > 0) {
        console.warn(`[Agent] message history sanitization: dropped ${droppedCount} invalid message(s), sending ${finalMessages.length}/${mappedMessages.length}`);
      }

      const allTools = [...ALL_TOOLS, ...mcpTools];
      const mcpToolsPrompt = Object.entries(mcpTools).length > 0 
        ? `\n\n## AVAILABLE MCP TOOLS\nYou can use the following MCP tools:\n${Object.values(mcpTools).map(t => 
            `- ${t.name}(${Object.keys(t.inputSchema?.properties || {}).join(', ')}): ${t.description}`
          ).join('\n')}`
        : '';

      // Determine active context from URL
      let systemContext = `\n\n[System Context]`;
      const match = window.location.pathname.match(/\/prompts\/(p_[a-zA-Z0-9_-]+)/);
      if (match) {
        const activePromptId = match[1];
        systemContext += `\nThe user is currently viewing/editing Prompt Project ID: ${activePromptId}.\nCRITICAL: You MUST USE update_prompt_content or update_prompt_settings on this ID if the user asks to modify the scene or settings. DO NOT create a new prompt.`;
        
        const activePrompt = usePromptStore.getState().prompts.find(p => p.id === activePromptId);
        if (activePrompt) {
          systemContext += `\n\n## SYNTAX MODE RESTRICTION (${activePrompt.promptSyntax.toUpperCase()})\nThe current project is using '${activePrompt.promptSyntax}' syntax mode. You must format your prompts accordingly:`;
          if (activePrompt.promptSyntax === 'danbooru') {
            systemContext += `\n- Strictly use Danbooru tags (comma-separated, underscores). Use MCP tools to find tags. Artist tags must start with @. Example: '1girl, white_hair, @artist_name, masterpiece'`;
          } else if (activePrompt.promptSyntax === 'natural') {
            systemContext += `\n- Use beautifully constructed natural language English sentences. Do NOT use comma-separated Danbooru tags. Focus on composition, lighting, camera angles, and detailed narrative descriptions.`;
          } else if (activePrompt.promptSyntax === 'xml') {
            systemContext += `\n- Output a structured XML block containing <character>, <general_tags>, <background>, etc., and an English <caption> element. Follow NewBie standard.`;
          }
          systemContext += buildOutputSpec(activePrompt.promptSyntax as PromptSyntax);
        }
      } else {
        systemContext += `\nThe user is NOT viewing a specific prompt. If they ask to generate a scene, you can use create_prompt.`;
        systemContext += buildOutputSpec('danbooru');
      }

      let bodyJson: string;
      try {
        const precheckContext = precheckRef.current;

        let budgetContext = "";
        if (budgetExceeded) {
          budgetContext = `\n\n[ROUND BUDGET EXHAUSTED] You have used all ${effectiveMaxRounds} tool-call rounds. Output final answer directly — do NOT call any more tools.`;
        } else if (effort === 'low') {
          budgetContext = `\n\n[EFFORT: LOW] You have 1 tool-call round. Call search_tags in parallel for all dimensions from the pre-check, then assemble and output the final prompt. Do NOT do multi-turn exploration.`;
        } else {
          const remaining = effectiveMaxRounds - currentRound;
          budgetContext = `\n\n[ROUND PROGRESS] Round ${currentRound}/${effectiveMaxRounds} (${remaining} remaining).`;
        }

        const systemMessage = {
          role: "system",
          content: agentSettings.systemPrompt + mcpToolsPrompt + systemContext + precheckContext + budgetContext
            + "\n\n## 工具路由规则（必须遵守）"
            + "\n用户问\"有什么角色\"/\"有哪些角色\" → `list_character_series`（全库36000+角色）。`view_bookmarks` 只返回收藏夹（仅用户明确说\"收藏\"时用）"
            + "\n用户问\"有什么画师\"/\"有什么风格\" → `search_artists`（不是 get_custom_styles！那工具不存在）"
            + "\n用户说\"随便来一张\"/\"给我个惊喜\" → `random_character_and_artist`"
            + "\n用户要创建角色图片 → 直接用你的 Danbooru 知识构建 tag 调 create_prompt，不需要先搜索"
            + "\n搜索返回空 → 继续用你的知识创建，不要卡住或重复搜索"
            + "\n⚠️ search_tags/get_related_tags/get_artist_recommendations/get_custom_styles 这些工具不存在，不要尝试调用"
        };
        
        const payload: any = {
          model: llm.model || 'agnes-2.0-flash',
          messages: [
            systemMessage,
            ...finalMessages
          ],
          stream: true,
          temperature: llm.temperature !== undefined ? llm.temperature : 0.7,
          max_tokens: llm.maxTokens !== undefined ? llm.maxTokens : 4096,
        };
        if (!budgetExceeded) {
          payload.tools = allTools.map((t: any) => {
            const { _mcp, ...rest } = t;
            return rest;
          });
        }
        
        const modelName = (llm.model || '').toLowerCase();
        if (modelName.includes('o1') || modelName.includes('o3') || modelName.includes('reason')) {
          payload.reasoning_effort = agentSettings.reasoningEffort || 'medium';
        }

        if (llm.provider === 'ollama') {
          payload.options = { num_ctx: 32768 };
        }
        bodyJson = JSON.stringify(payload);
      } catch (e) {
        console.error("[Agent] JSON.stringify failed:", e);
        throw e;
      }

      const channel = new Channel<string>();
      let streamError: string | null = null;
      let streamDone = false;
      // SSE event 边界缓冲：reqwest 的 bytes_stream() 不保证按 \n 切，
      // 必须在前端拼接，否则跨 chunk 的 partial JSON 会被 catch 吞掉
      let sseBuffer = "";

      // Stream processing: same logic as before, now receiving chunks from Rust proxy
      let assistantMessage: ChatMessage = {
        id: Date.now().toString(),
        role: 'assistant',
        content: '',
        tool_calls: []
      };
      const baseMessages = [...currentMessages];
      setMessages([...baseMessages, assistantMessage]);
      let toolCallState: any = null;
      let rafScheduled = false;
      let rafId: number | null = null;
      const flushRender = () => {
        rafScheduled = false;
        rafId = null;
        setMessages([...baseMessages, { ...assistantMessage }]);
      };
      const scheduleRender = () => {
        if (!rafScheduled) {
          rafScheduled = true;
          if (typeof requestAnimationFrame === 'function') {
            rafId = requestAnimationFrame(flushRender);
          } else {
            rafId = setTimeout(flushRender, 16) as unknown as number;
          }
        }
      };

      channel.onmessage = (chunk: string) => {
        // 用户已请求停止 → 丢弃后续 chunk，避免停止后消息继续累积
        if (abortController.signal.aborted) return;
        sseBuffer += chunk;
        // 按 \n 切，最后一段可能是不完整行，留在 buffer 等下次拼接
        const lines = sseBuffer.split('\n');
        sseBuffer = lines.pop() || '';
        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (line === '') continue;
          if (line === 'data: [DONE]') { streamDone = true; return; }
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              const delta = data.choices?.[0]?.delta;
              if (!delta) continue;
              if (delta.content) assistantMessage.content += delta.content;
              // Reasoning models (e.g. deepseek-v4-flash) return reasoning_content in the delta.
              // We must preserve it and pass it back on subsequent multi-turn calls, or the API
              // will reject with 400 "reasoning_content in thinking mode must be passed back".
              if (delta.reasoning_content) {
                assistantMessage.reasoning_content = (assistantMessage.reasoning_content || '') + delta.reasoning_content;
              }
              if (delta.tool_calls) {
                for (const tc of delta.tool_calls) {
                  if (tc.id) {
                    assistantMessage.tool_calls = assistantMessage.tool_calls || [];
                    assistantMessage.tool_calls.push({ id: tc.id, type: 'function', function: { name: tc.function.name, arguments: tc.function.arguments || '' } });
                    toolCallState = assistantMessage.tool_calls[assistantMessage.tool_calls.length - 1];
                  } else if (tc.function?.arguments && toolCallState) {
                    toolCallState.function.arguments += tc.function.arguments;
                  }
                }
              }
              scheduleRender();
            } catch {}
          }
        }
      };

      try {
        await invoke('call_llm_proxy', { apiUrl, apiKey: llm.apiKey || '', bodyJson, onChunk: channel });
      } catch (e: any) {
        streamError = e.toString();
      }

      // Final flush
      if (rafId !== null) {
        if (typeof cancelAnimationFrame === 'function' && rafScheduled) cancelAnimationFrame(rafId);
        else if (typeof clearTimeout === 'function' && rafScheduled) clearTimeout(rafId);
        rafId = null; rafScheduled = false;
      }
      setMessages([...baseMessages, { ...assistantMessage }]);

      if (streamError) throw new Error(streamError);

      // === Hermes-style tool_call 文本化兜底解析 ===
      // 某些 LLM (尤其 agnes-2.0-flash 在长上下文+重复模式下) 会把 tool_call
      // 当成纯文本写进 content，而不是走结构化 tool_calls 字段。常见两种格式：
      //   1. 标准 Hermes JSON:  <tool_call>\n{"name":"x","arguments":{...}}\n</tool_call>
      //   2. XML 风格:          <tool_call><function=name><parameter=key>val</parameter>...</function></tool_call>
      // 这里兜底解析出来填进 tool_calls，让工具循环正常执行。否则 agent 会
      // 认为"我说完了"直接结束，工具永远不会被调用 (上一轮卡死的原因)。
      if ((!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0)
          && typeof assistantMessage.content === 'string'
          && assistantMessage.content.includes('<tool_call>')) {
        const parsed = parseEmbeddedToolCalls(assistantMessage.content);
        if (parsed.calls.length > 0) {
          assistantMessage.tool_calls = parsed.calls;
          assistantMessage.content = parsed.remaining.trim();
          setMessages([...baseMessages, { ...assistantMessage }]);
          console.warn(`[Agent] recovered ${parsed.calls.length} embedded tool_call(s) from content text`);
        }
      }

      if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
        const newMessages = [...currentMessages, assistantMessage];
        
        for (const call of assistantMessage.tool_calls) {
          // 用户已请求停止 → 不再执行后续工具，跳出循环
          if (abortController.signal.aborted) break;
          let resultStr = "";
          let rawArgs = "";
          let res: any = undefined;
          try {
            // Clean up backslashes or trailing content in argument string if LLM outputted slightly malformed json
            rawArgs = (call.function.arguments || '{}').trim();
            call.function.arguments = rawArgs; // MUST write back so history has valid JSON for subsequent API calls
            const parsedArgs = JSON.parse(rawArgs);

            // Duplicate detection: skip identical calls after 3 repeats
            const dupKey = call.function.name + ":" + JSON.stringify(parsedArgs, Object.keys(parsedArgs).sort());
            const dupCount = (duplicateTrackerRef.current.get(dupKey) || 0) + 1;
            duplicateTrackerRef.current.set(dupKey, dupCount);
            if (dupCount > 3) {
              resultStr = JSON.stringify({ skipped: "duplicate", message: `This exact call has been made ${dupCount} times. Stop repeating and produce final answer.` });
              const toolMsg: ChatMessage = {
                id: Date.now().toString() + Math.random().toString().slice(2, 6),
                role: 'tool', content: resultStr, tool_call_id: call.id, name: call.function.name,
              };
              newMessages.push(toolMsg);
              setMessages([...newMessages]);
              continue;
            }

            try {
              const fnName = call.function.name;
              if (fnName === 'create_prompt') {
                // Resolve workflow first so we can pull base_model / loras from its JSON.
                // (create_prompt 服务的后续是 generate_image —— 都是文本生图场景)
                const workflows = useWorkflowStore.getState().workflows;
                const defaultWf = workflows.find(w => w.type === 'text2img' && w.isDefault);
                const resolvedWorkflowId: string | null =
                  parsedArgs.workflow_id
                  || (defaultWf ? defaultWf.id : null)
                  || null;

                // 从绑定的 workflow JSON 解析所有模型/采样参数（跟 PromptEdit 新建模式完全对齐）。
                // workflow 是配置的真实来源——agent 不知道用户本地装了什么 checkpoint / LoRA，
                // 也不知道 workflow 里 KSampler 节点用的 steps/cfg/sampler。agent 传的值只作无 workflow 时的回退。
                let workflowParsedBaseModel: string | null = null;
                let workflowParsedVaeModel: string | null = null;
                let workflowParsedSampler: string | null = null;
                let workflowParsedScheduler: string | null = null;
                let workflowParsedWidth: number | null = null;
                let workflowParsedHeight: number | null = null;
                let workflowParsedSteps: number | null = null;
                let workflowParsedCfg: number | null = null;
                let workflowParsedLoras: any[] = [];
                if (resolvedWorkflowId) {
                  const wf = workflows.find(w => w.id === resolvedWorkflowId);
                  if (wf && wf.jsonContent) {
                    try {
                      const analysis = comfyService.analyzeWorkflow(wf.jsonContent);
                      workflowParsedBaseModel = analysis.baseModel || null;
                      workflowParsedVaeModel = analysis.vaeModel || null;
                      workflowParsedSampler = analysis.samplerName || null;
                      workflowParsedScheduler = analysis.scheduler || null;
                      workflowParsedWidth = analysis.width || null;
                      workflowParsedHeight = analysis.height || null;
                      workflowParsedSteps = analysis.steps || null;
                      workflowParsedCfg = analysis.cfgScale || null;
                      workflowParsedLoras = analysis.loras || [];
                    } catch (e) {
                      console.warn("[Agent] create_prompt: failed to parse workflow JSON:", e);
                    }
                  }
                }

                // base_model 优先级（跟 PromptEdit 一致）：
                // 1. workflow 解析出的 baseModel（即使不在本地列表也信——可能还没加载）
                // 2. 本地第一个 checkpoint 兜底
                // 3. 空串
                // agent 传的 base_model 完全忽略——它只会抄 schema 示例里的 "sd_xl_base_1.0.safetensors"。
                const localCheckpoints = useModelStore.getState().checkpoints || [];
                let resolvedBaseModel: string;
                if (workflowParsedBaseModel) {
                  resolvedBaseModel = workflowParsedBaseModel;
                } else if (localCheckpoints.length > 0) {
                  resolvedBaseModel = localCheckpoints[0];
                } else {
                  resolvedBaseModel = "";
                }

                // 其他采样参数：workflow 优先，agent 传值仅作无 workflow 或 workflow 没解析出来时的回退。
                const resolvedWidth = workflowParsedWidth ?? parsedArgs.width ?? 1024;
                const resolvedHeight = workflowParsedHeight ?? parsedArgs.height ?? 1024;
                const resolvedSteps = workflowParsedSteps ?? parsedArgs.steps ?? 25;
                const resolvedCfg = workflowParsedCfg ?? parsedArgs.cfg_scale ?? 5.0;
                const resolvedSampler = workflowParsedSampler ?? parsedArgs.sampler_name ?? "euler";
                const resolvedScheduler = workflowParsedScheduler ?? parsedArgs.scheduler ?? "beta57";
                const resolvedVae = workflowParsedVaeModel ?? parsedArgs.vae_model ?? "auto";

                // LoRA 总是从绑定的 workflow JSON 解析，忽略 agent 传的 lora_configs。
                // 原因：agent 不可能知道用户本地装了什么 LoRA，agent 编出来的 lora_configs 是错的，
                // 保存到数据库后会污染 Generate 页面（Generate 的逻辑是项目有 loraConfigs 就用项目的）。
                const resolvedLoraConfigs: string | null = workflowParsedLoras.length > 0
                  ? JSON.stringify(workflowParsedLoras)
                  : null;

                const newPrompt = {
                  id: "p_" + Date.now().toString(),
                  title: parsedArgs.title || parsedArgs.tags?.[0] || "Agent Generated",
                  description: "Generated by AI Agent",
                  positivePrompt: parsedArgs.content,
                  negativePrompt: parsedArgs.negative_prompt || "",
                  artistPrompt: parsedArgs.artist_prompt || "",
                  promptSyntax: parsedArgs.prompt_syntax || "danbooru",
                  width: resolvedWidth,
                  height: resolvedHeight,
                  steps: resolvedSteps,
                  cfgScale: resolvedCfg,
                  seed: parsedArgs.seed || "-1",
                  samplerName: resolvedSampler,
                  scheduler: resolvedScheduler,
                  baseModel: resolvedBaseModel,
                  vaeModel: resolvedVae,
                  workflowId: resolvedWorkflowId,
                  loraConfigs: resolvedLoraConfigs,
                  tags: (parsedArgs.tags || []).map((t: string, i: number) => ({
                    id: "tag_" + Date.now() + i,
                    name: t,
                    color: "#ff6b9d",
                    createdAt: Date.now()
                  })),
                  isFavorite: false,
                  isPinned: false,
                  instanceImages: parsedArgs.instance_images || [],
                  createdAt: Date.now(),
                  updatedAt: Date.now()
                };
                await invoke('create_prompt', { prompt: newPrompt });
                usePromptStore.getState().fetchPrompts();
                res = { status: "success", prompt_id: newPrompt.id };
              } else if (fnName === 'update_prompt_content') {
                const currentPrompt = await invoke('get_prompt', { id: parsedArgs.prompt_id }) as any;
                if (!currentPrompt) throw new Error(`Prompt with ID ${parsedArgs.prompt_id} not found.`);
                
                const updatedPrompt = {
                  ...currentPrompt,
                  title: parsedArgs.title !== undefined ? parsedArgs.title : currentPrompt.title,
                  positivePrompt: parsedArgs.positive_prompt !== undefined ? parsedArgs.positive_prompt : currentPrompt.positivePrompt,
                  negativePrompt: parsedArgs.negative_prompt !== undefined ? parsedArgs.negative_prompt : currentPrompt.negativePrompt,
                  artistPrompt: parsedArgs.artist_prompt !== undefined ? parsedArgs.artist_prompt : currentPrompt.artistPrompt,
                  tags: parsedArgs.tags !== undefined ? parsedArgs.tags.map((t: string, i: number) => ({
                    id: "tag_" + Date.now() + i,
                    name: t,
                    color: "#ff6b9d",
                    createdAt: Date.now()
                  })) : currentPrompt.tags,
                  updatedAt: Date.now()
                };
                await invoke('update_prompt', { prompt: updatedPrompt });
                usePromptStore.getState().fetchPrompts();
                res = { status: "success", message: `Prompt content ${parsedArgs.prompt_id} updated.` };
              } else if (fnName === 'update_prompt_settings') {
                const currentPrompt = await invoke('get_prompt', { id: parsedArgs.prompt_id }) as any;
                if (!currentPrompt) throw new Error(`Prompt with ID ${parsedArgs.prompt_id} not found.`);
                
                const updatedPrompt = { ...currentPrompt };
                
                if (parsedArgs.base_model !== undefined) {
                  const checkpoints = useModelStore.getState().checkpoints || [];
                  if (checkpoints.length > 0 && !checkpoints.includes(parsedArgs.base_model)) {
                    throw new Error(`Invalid base_model: '${parsedArgs.base_model}'. It is not a valid checkpoint (it might be a lora). Use list_local_models to check available checkpoints.`);
                  }
                  updatedPrompt.baseModel = parsedArgs.base_model;
                }
                
                if (parsedArgs.vae_model !== undefined) updatedPrompt.vaeModel = parsedArgs.vae_model;
                if (parsedArgs.lora_configs !== undefined) updatedPrompt.loraConfigs = parsedArgs.lora_configs ? JSON.stringify(parsedArgs.lora_configs) : null;
                if (parsedArgs.width !== undefined) updatedPrompt.width = parsedArgs.width;
                if (parsedArgs.height !== undefined) updatedPrompt.height = parsedArgs.height;
                if (parsedArgs.steps !== undefined) updatedPrompt.steps = parsedArgs.steps;
                if (parsedArgs.cfg_scale !== undefined) updatedPrompt.cfgScale = parsedArgs.cfg_scale;
                if (parsedArgs.seed !== undefined) updatedPrompt.seed = parsedArgs.seed;
                if (parsedArgs.sampler_name !== undefined) updatedPrompt.samplerName = parsedArgs.sampler_name;
                if (parsedArgs.scheduler !== undefined) updatedPrompt.scheduler = parsedArgs.scheduler;
                if (parsedArgs.workflow_id !== undefined) updatedPrompt.workflowId = parsedArgs.workflow_id;
                updatedPrompt.updatedAt = Date.now();
                await invoke('update_prompt', { prompt: updatedPrompt });
                usePromptStore.getState().fetchPrompts();
                res = { status: "success", message: `Prompt settings ${parsedArgs.prompt_id} updated.` };
              } else if (fnName === 'delete_prompt') {
                await invoke('delete_prompt', { id: parsedArgs.prompt_id });
                usePromptStore.getState().fetchPrompts();
                res = { status: "success", message: `Prompt ${parsedArgs.prompt_id} deleted.` };
               } else if (fnName === 'search_prompts') {
                // Refresh from DB so newly created/deleted prompts are reflected immediately.
                await usePromptStore.getState().fetchPrompts();
                const prompts = usePromptStore.getState().prompts;
                res = prompts.filter(p => {
                  if (!parsedArgs.tags || parsedArgs.tags.length === 0) return true;
                  return parsedArgs.tags.every((t: string) => {
                    const searchStr = t.toLowerCase();
                    return (
                      p.tags?.some(tag => tag.toLowerCase() === searchStr) ||
                      p.title?.toLowerCase().includes(searchStr) ||
                      p.description?.toLowerCase().includes(searchStr)
                    );
                  });
                }).slice(0, parsedArgs.limit || 5);
              } else if (fnName === 'get_prompt') {
                res = await invoke('get_prompt', { id: parsedArgs.prompt_id });
              } else if (fnName === 'generate_image') {
                const project = await invoke('get_prompt', { id: parsedArgs.prompt_id }) as any;
                if (!project) throw new Error(`Prompt ID ${parsedArgs.prompt_id} not found`);
                
                let wfId = project.workflowId;
                if (!wfId) {
                  const workflows = useWorkflowStore.getState().workflows;
                  // generate_image 走文本生图：优先 text2img 类型的默认
                  const defaultWf = workflows.find((w: any) => w.type === 'text2img' && w.isDefault)
                    || workflows.find((w: any) => w.type === 'text2img');
                  if (defaultWf) {
                    wfId = defaultWf.id;
                  } else if (workflows.length > 0) {
                    wfId = workflows[0].id;
                  }
                }
                
                const batchCount = parsedArgs.batch_count || 1;
                const results = await useQueueStore.getState().addJob(project, wfId, batchCount);
                const allImages = results ? results.flat() : [];
                res = {
                  status: "completed",
                  images: allImages,
                  message: `Successfully generated ${allImages.length} image(s).`
                };
              } else if (fnName === 'generate_video_from_image') {
                const prompt = typeof parsedArgs.prompt === 'string' ? parsedArgs.prompt : '';
                if (!prompt) throw new Error("prompt is required for video generation");

                const fps = typeof parsedArgs.fps === 'number' ? parsedArgs.fps : 25;
                const durationSec = typeof parsedArgs.duration === 'number' ? parsedArgs.duration : 5;
                const baseModel = typeof parsedArgs.base_model === 'string' ? parsedArgs.base_model : '';

                const workflows = useWorkflowStore.getState().workflows;
                let img2videoWorkflow = workflows.find((w: any) => w.id === parsedArgs.workflow_id);
                if (!img2videoWorkflow) {
                  img2videoWorkflow = workflows.find((w: any) => w.type === 'img2video' && w.isDefault) || workflows.find((w: any) => w.type === 'img2video');
                }
                if (!img2videoWorkflow || !img2videoWorkflow.jsonContent) {
                  throw new Error("未找到图生视频工作流，请先在系统中导入一个 img2video 工作流。");
                }

                // Auto-extract the most recent image from the conversation
                let imagePath: string | null = null;
                for (let i = currentMessages.length - 1; i >= 0; i--) {
                  const msg = currentMessages[i];
                  if (msg.images && msg.images.length > 0) {
                    imagePath = msg.images[msg.images.length - 1];
                    break;
                  }
                }
                if (!imagePath) {
                  throw new Error("没有找到可用的图片。请先发送一张图片或用 generate_image 生成一张。");
                }

                addMessage({
                  id: "sys_" + Date.now(),
                  role: "assistant",
                  content: `🎬 正在将图片转换为视频...\n\n**提示词**: ${prompt}\n**时长**: ${durationSec} 秒\n**FPS**: ${fps}\n**工作流**: ${img2videoWorkflow.name}`
                });

                // Read image as base64 (Tauri: use invoke, not fetch on asset URLs)
                let rawB64: string;
                if (imagePath.startsWith('data:')) {
                  rawB64 = imagePath;
                } else if (imagePath.startsWith('http')) {
                  const resp = await fetch(imagePath);
                  const blob = await resp.blob();
                  rawB64 = await new Promise<string>((resolve) => {
                    const r = new FileReader();
                    r.onloadend = () => resolve(r.result as string);
                    r.readAsDataURL(blob);
                  });
                } else {
                  rawB64 = await invoke<string>('read_image_base64', { path: imagePath });
                }
                const imageBase64 = rawB64.includes(',') ? rawB64.split(',')[1] : rawB64;
                const byteChars = atob(imageBase64);
                const byteArr = new Uint8Array(byteChars.length);
                for (let j = 0; j < byteChars.length; j++) byteArr[j] = byteChars.charCodeAt(j);
                const imgBlob = new Blob([byteArr], { type: 'image/png' });
                const uploadName = `upload_agent_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.png`;
                const uploadedFilename = await comfyService.uploadImage(imgBlob, uploadName);

                // Read dimensions from base64 data URL
                const imgObj = new Image();
                imgObj.src = `data:image/png;base64,${imageBase64}`;
                try {
                  await new Promise<void>((resolve, reject) => {
                    imgObj.onload = () => resolve();
                    imgObj.onerror = () => reject(new Error('image decode failed'));
                  });
                } catch { /* use fallback */ }
                const imgW = imgObj.naturalWidth || 832;
                const imgH = imgObj.naturalHeight || 1216;

                const tempProject = {
                  id: 'video_' + Date.now(),
                  title: '图生视频 (Agent)',
                  positivePrompt: prompt,
                  negativePrompt: '',
                  width: imgW, height: imgH,
                  seed: Math.floor(Math.random() * 1000000000),
                };
                const generatedVideos = await useQueueStore.getState().addVideoJob(
                  tempProject, img2videoWorkflow.id, uploadedFilename, fps, durationSec, imgW, imgH, prompt, baseModel
                );

                res = {
                  status: "completed",
                  videos: generatedVideos,
                  message: `视频生成完成，共 ${generatedVideos.length} 个视频。`
                };
              } else if (fnName === 'auto_tag_all_prompts') {
            const { aiService } = await import('../services/aiService');
            // Run in background, return immediate response
            aiService.batchAutoTagPrompts();
            resultStr = JSON.stringify({ status: "success", message: "后台批量打标已启动，将自动为所有提示词生成标签" });
          } else if (fnName === 'list_local_models') {
            // Always fetch fresh — the user may have added/removed LoRAs since the last call.
            await useModelStore.getState().fetchModels(true);
            const { checkpoints, loras } = useModelStore.getState();
            res = { checkpoints, loras };
          } else if (fnName === 'list_character_series') {
            res = await invoke('get_character_series', {
              search: parsedArgs.search || null,
              limit: Math.min(parsedArgs.limit || 30, 100),
              offset: parsedArgs.offset || 0,
            });
          } else if (fnName === 'search_characters_in_series') {
            const series = parsedArgs.series;
            if (!series) throw new Error("series is required");
            res = await invoke('search_characters', {
              search: parsedArgs.search || null,
              series: series,
              limit: Math.min(parsedArgs.limit || 20, 50),
              offset: parsedArgs.offset || 0,
              favorite: null,
            });
          } else if (fnName === 'search_artists') {
            res = await invoke('search_artists', {
              search: parsedArgs.search || null,
              series: null,
              limit: Math.min(parsedArgs.limit || 20, 50),
              offset: parsedArgs.offset || 0,
              favorite: null,
            });
          } else if (fnName === 'random_character_and_artist') {
            // Query DB directly for a random character + artist.
            const char = await invoke<any[]>('search_characters', {
              search: null, series: parsedArgs.series || null,
              limit: 1, offset: 0, favorite: null,
            });
            // search_characters orders by count DESC, not random — but for the agent a "popular"
            // pick is fine as a starting point. Real random is in the MCP tool only.
            const artists = await invoke<any[]>('search_artists', {
              search: null, series: null,
              limit: 1, offset: parsedArgs.use_artist === false ? 0 : Math.floor(Math.random() * 100),
              favorite: null,
            });
            res = {
              character: char?.[0] || null,
              artist: parsedArgs.use_artist === false ? null : (artists?.[0] || null),
            };
          } else if (fnName === 'get_queue_status') {
                const state = useQueueStore.getState();
                const activeJobs = state.jobs.filter(j => j.status === 'pending' || j.status === 'generating');
                const recentCompleted = state.jobs
                  .filter(j => j.status === 'completed' && j.images && j.images.length > 0)
                  .slice(-3)
                  .map(j => ({
                    job_id: j.id,
                    project_title: j.projectTitle,
                    images: j.images
                  }));
                res = {
                  status: state.isConnected ? "connected" : "disconnected",
                  active_jobs: activeJobs.length,
                  total_jobs_in_history: state.jobs.length,
                  recent_completed: recentCompleted
                };
               } else if (fnName === 'search_workflows') {
                // Refresh from DB so newly created/deleted workflows are reflected immediately.
                await useWorkflowStore.getState().fetchWorkflows();
                const workflows = useWorkflowStore.getState().workflows;
                res = workflows.filter(w => {
                  if (!parsedArgs.tags || parsedArgs.tags.length === 0) return true;
                  return parsedArgs.tags.every((t: string) => {
                    const searchStr = t.toLowerCase();
                    return (
                      w.tags?.some(tag => tag.toLowerCase() === searchStr) ||
                      w.name?.toLowerCase().includes(searchStr) ||
                      w.description?.toLowerCase().includes(searchStr)
                    );
                  });
                }).slice(0, parsedArgs.limit || 5);
              } else if (fnName === 'get_workflow') {
                res = await invoke('get_workflow', { id: parsedArgs.workflow_id });
              } else if (fnName === 'create_workflow') {
                const newWf = {
                  id: "wf_" + Date.now().toString(),
                  name: parsedArgs.title,
                  description: parsedArgs.description || "Generated by AI Agent",
                  type: "custom" as const,
                  jsonContent: (() => {
                    let j = typeof parsedArgs.workflow_json === 'string' ? parsedArgs.workflow_json : (parsedArgs.workflow_json ? JSON.stringify(parsedArgs.workflow_json, null, 2) : undefined);
                    if (!j || j === '{}') {
                      const lastUserMsg = currentMessages.slice().reverse().find(m => m.role === 'user');
                      if (lastUserMsg && typeof lastUserMsg.content === 'string') {
                        const s = lastUserMsg.content.indexOf('{');
                        const e = lastUserMsg.content.lastIndexOf('}');
                        if (s !== -1 && e !== -1 && e > s) j = lastUserMsg.content.substring(s, e + 1);
                      }
                    }
                    return j || '{}';
                  })(),
                  tags: (parsedArgs.tags || []),
                  createdAt: Date.now(),
                  updatedAt: Date.now()
                };
                await useWorkflowStore.getState().addWorkflow(newWf);
                res = { status: "success", workflow_id: newWf.id };
              } else if (fnName === 'update_workflow') {
                const workflows = useWorkflowStore.getState().workflows;
                let currentWf = workflows.find(w => w.id === parsedArgs.workflow_id);
                if (!currentWf) {
                  // Fallback: try fetching to see if it's there but not in store (though store should be synced)
                  const allWf = await invoke('list_workflows') as any[];
                  const r = allWf.find((w: any) => w.id === parsedArgs.workflow_id);
                  if (!r) throw new Error(`Workflow with ID ${parsedArgs.workflow_id} not found.`);
                  currentWf = {
                    id: r.id,
                    name: r.name,
                    description: r.description,
                    type: r.type,
                    jsonContent: r.jsonContent,
                    tags: [],
                    createdAt: r.createdAt,
                    updatedAt: r.updatedAt
                  };
                }
                
                const updatedWf = {
                  name: parsedArgs.title !== undefined ? parsedArgs.title : currentWf.name,
                  description: parsedArgs.description !== undefined ? parsedArgs.description : currentWf.description,
                  jsonContent: (() => {
                    if (parsedArgs.workflow_json === undefined) return currentWf.jsonContent;
                    let j = typeof parsedArgs.workflow_json === 'string' ? parsedArgs.workflow_json : JSON.stringify(parsedArgs.workflow_json, null, 2);
                    if (!j || j === '{}') {
                      const lastUserMsg = currentMessages.slice().reverse().find(m => m.role === 'user');
                      if (lastUserMsg && typeof lastUserMsg.content === 'string') {
                        const s = lastUserMsg.content.indexOf('{');
                        const e = lastUserMsg.content.lastIndexOf('}');
                        if (s !== -1 && e !== -1 && e > s) j = lastUserMsg.content.substring(s, e + 1);
                      }
                    }
                    return j && j !== '{}' ? j : currentWf.jsonContent;
                  })(),
                  tags: parsedArgs.tags !== undefined ? parsedArgs.tags : currentWf.tags,
                  updatedAt: Date.now()
                };
                await useWorkflowStore.getState().updateWorkflow(parsedArgs.workflow_id, updatedWf);
                res = { status: "success", message: `Workflow ${parsedArgs.workflow_id} updated.` };
              } else if (fnName === 'delete_workflow') {
                await invoke('delete_workflow', { id: parsedArgs.workflow_id });
                useWorkflowStore.getState().fetchWorkflows();
                res = { status: "success", message: `Workflow ${parsedArgs.workflow_id} deleted.` };
              } else if (fnName === 'get_generated_images') {
                const allImages = await invoke<any[]>('list_generated_images');
                const limit = parsedArgs.limit || 10;
                let filtered = allImages.filter(img => img.status === 'completed');
                if (parsedArgs.prompt_id) {
                  filtered = filtered.filter(img => img.promptId === parsedArgs.prompt_id);
                }
                const prompts = usePromptStore.getState().prompts;
                res = filtered.slice(0, limit).map(img => {
                  const p = prompts.find(p => p.id === img.promptId);
                  return {
                    id: img.id,
                    url: img.outputPath,
                    prompt_id: img.promptId,
                    prompt_title: p?.title || 'Unknown',
                    created_at: new Date(img.createdAt).toLocaleString()
                  };
                });
              } else if (fnName === 'add_instance_image') {
                const currentPrompt = await invoke('get_prompt', { id: parsedArgs.prompt_id }) as any;
                if (!currentPrompt) throw new Error(`Prompt ID ${parsedArgs.prompt_id} not found`);
                const existing: any[] = currentPrompt.images || [];
                const existingUrls = existing.map((img: any) => img.filePath);
                if (!existingUrls.includes(parsedArgs.image_url)) {
                  const updatedPrompt = {
                    ...currentPrompt,
                    images: [...existing, { id: "img_" + Date.now(), promptId: parsedArgs.prompt_id, filePath: parsedArgs.image_url, fileName: "", createdAt: Date.now() }],
                    updatedAt: Date.now()
                  };
                  await invoke('update_prompt', { prompt: updatedPrompt });
                  usePromptStore.getState().fetchPrompts();
                }
                res = { status: "success", message: `Image added to prompt ${parsedArgs.prompt_id} instance images.` };
              } else if (fnName === 'install_custom_node') {
                // 安全：custom node 是 Python 代码，clone 后会被 ComfyUI 自动加载执行。
                // 限制只允许主流代码托管域名，防止 LLM 被 prompt injection 诱导 clone 恶意仓库。
                const allowedHosts = ['github.com', 'gitlab.com', 'gitee.com', 'cnb.cool'];
                const nodeUrl = String(parsedArgs.node_url || '');
                let urlHost = '';
                try {
                  urlHost = new URL(nodeUrl).hostname;
                } catch { /* invalid url */ }
                if (!urlHost || !allowedHosts.includes(urlHost)) {
                  throw new Error(`Refused: node_url host must be one of ${allowedHosts.join(', ')}. Got: "${urlHost}".`);
                }
                await invoke('install_custom_node', {
                  nodeUrl,
                  comfyDir: parsedArgs.comfy_dir || useSettingsStore.getState().settings.comfyDir || null
                });
                res = { status: "success", message: `Custom node installed: ${nodeUrl}` };
              } else if (fnName === 'check_comfyui_status') {
                res = await invoke<any>('check_comfyui_status', {
                  url: parsedArgs.url || null
                });
              } else if (fnName === 'view_bookmarks') {
                res = await invoke<any[]>('list_favorite_characters', {
                  tags: parsedArgs.tags || null,
                  tagMatch: parsedArgs.tag_match || null,
                  search: parsedArgs.search || null,
                  limit: parsedArgs.limit ?? null,
                  offset: parsedArgs.offset ?? null,
                });
              } else if (fnName === 'add_favorite_character') {
                res = await invoke<any>('add_favorite_character', {
                  characterTag: parsedArgs.character_tag,
                  source: parsedArgs.source || null,
                  displayName: parsedArgs.display_name || null,
                  trigger: parsedArgs.trigger || null,
                  exampleImage: parsedArgs.example_image || null,
                  notes: parsedArgs.notes || null,
                  tags: parsedArgs.tags || null,
                });
              } else if (fnName === 'update_favorite_character') {
                await invoke('update_favorite_character', {
                  id: parsedArgs.id,
                  displayName: parsedArgs.display_name ?? null,
                  trigger: parsedArgs.trigger ?? null,
                  exampleImage: parsedArgs.example_image ?? null,
                  notes: parsedArgs.notes ?? null,
                });
                res = { status: "success", id: parsedArgs.id };
              } else if (fnName === 'remove_favorite_character') {
                const removed = await invoke<boolean>('remove_favorite_character', {
                  id: parsedArgs.id || null,
                  characterTag: parsedArgs.character_tag || null,
                });
                res = { status: removed ? "success" : "not_found" };
              } else if (fnName === 'relink_favorite_character') {
                res = await invoke<any>('relink_favorite_character', { id: parsedArgs.id });
                  useFavoriteLibraryStore.getState().refreshFavorites();
              } else if (fnName === 'add_tags_to_favorite_character') {
                const added = await invoke<number>('add_tags_to_favorite_character', {
                  characterId: parsedArgs.character_id,
                  tags: parsedArgs.tags,
                });
                res = { status: "success", added };
              } else if (fnName === 'remove_tag_from_favorite_character') {
                const removed = await invoke<boolean>('remove_tag_from_favorite_character', {
                  characterId: parsedArgs.character_id,
                  tag: parsedArgs.tag,
                });
                res = { status: removed ? "success" : "not_found" };
              } else if (fnName === 'set_favorite_character_tags') {
                const count = await invoke<number>('set_favorite_character_tags', {
                  characterId: parsedArgs.character_id,
                  tags: parsedArgs.tags,
                });
                res = { status: "success", count };
              } else if (fnName === 'list_favorite_character_tags') {
                res = await invoke<any[]>('list_favorite_character_tags', {});
              } else if (fnName === 'view_bookmarked_artists') {
                res = await invoke<any[]>('list_favorite_artists', {
                  search: parsedArgs.search || null,
                  limit: parsedArgs.limit ?? null,
                  offset: parsedArgs.offset ?? null,
                });
              } else if (fnName === 'add_favorite_artist') {
                res = await invoke<any>('add_favorite_artist', {
                  artistTag: parsedArgs.artist_tag,
                  source: parsedArgs.source || null,
                  displayName: parsedArgs.display_name || null,
                  trigger: parsedArgs.trigger || null,
                  exampleImage: parsedArgs.example_image || null,
                  notes: parsedArgs.notes || null,
                });
              } else if (fnName === 'update_favorite_artist') {
                await invoke('update_favorite_artist', {
                  id: parsedArgs.id,
                  displayName: parsedArgs.display_name ?? null,
                  trigger: parsedArgs.trigger ?? null,
                  exampleImage: parsedArgs.example_image ?? null,
                  notes: parsedArgs.notes ?? null,
                });
                res = { status: "success", id: parsedArgs.id };
              } else if (fnName === 'remove_favorite_artist') {
                const removed = await invoke<boolean>('remove_favorite_artist', {
                  id: parsedArgs.id || null,
                  artistTag: parsedArgs.artist_tag || null,
                });
                res = { status: removed ? "success" : "not_found" };
              } else {
                const mcpTool = mcpTools.find((t: any) => t.function.name === fnName);
                if (mcpTool?._mcp?.url) {
                  try {
                    const result = await invoke<string>('call_mcp_tool', {
                      url: mcpTool._mcp.url,
                      name: fnName,
                      arguments: parsedArgs
                    });
                    resultStr = result;
                  } catch (mcpErr: any) {
                    resultStr = JSON.stringify({ error: "MCP tool call failed: " + mcpErr.toString() });
                  }
                } else {
                  throw new Error("Unknown tool: " + fnName);
                }
              }
              if (!resultStr) resultStr = JSON.stringify(res);
            } catch (invokeErr: any) {
              resultStr = JSON.stringify({ error: invokeErr.toString() });
            }
          } catch (e: any) {
            console.error(`[Agent] Tool ${call.function.name} argument parsing error:`, e, rawArgs);
            // Replace invalid JSON with valid JSON so OpenAI API doesn't reject the message history with 400 Bad Request
            call.function.arguments = "{}";
            resultStr = JSON.stringify({ 
              error: `Invalid JSON arguments provided to tool: ${e.toString()}. Your raw input was: ${rawArgs}. Please revise the arguments and call the tool again.` 
            });
          }

          let toolImages: string[] | undefined = undefined;
          if (res && res.images && Array.isArray(res.images)) {
            toolImages = res.images
              .map((img: any) => typeof img === 'string' ? img : (img.url || img.filePath || img.outputPath || img.path))
              .filter((s: any) => typeof s === 'string' && s.length > 0);
          } else if (res && res.videos && Array.isArray(res.videos)) {
            toolImages = res.videos
              .map((v: any) => typeof v === 'string' ? v : (v.url || v.filePath || v.outputPath || v.path))
              .filter((s: any) => typeof s === 'string' && s.length > 0);
          } else if (Array.isArray(res) && res.length > 0 && res[0].url) {
            toolImages = res.map((item: any) => item.url).filter(Boolean);
          }
          
          const toolMsg: ChatMessage = {
            id: Date.now().toString() + Math.random().toString().slice(2, 6),
            role: 'tool',
            content: resultStr,
            tool_call_id: call.id,
            name: call.function.name,
            images: toolImages
          };
          newMessages.push(toolMsg);
          setMessages([...newMessages]);
        }

        await callLLM(newMessages);
      }

    } catch (error: any) {
      if (error.name !== 'AbortError') {
        console.error("Agent error:", error);
        // 错误消息友好化：原样把 HTTP 500 + JSON 扔回 history 会让上游 LLM
        // 拒绝处理（agnes-2.0-flash 是推理模型，对历史消息格式敏感），
        // 进而每次新请求都失败、错误消息继续堆积，形成死循环。
        // 改为简短中文提示，既对用户友好也不会污染后续 LLM 请求。
        const raw = error.message || String(error);
        let friendly: string;
        if (/HTTP 5\d\d/.test(raw)) {
          friendly = "AI 服务暂时不可用，请稍后重试。";
        } else if (/Failed to fetch|NetworkError|timeout|ETIMEDOUT|ECONNRESET/i.test(raw)) {
          friendly = "网络连接失败，请检查网络后重试。";
        } else if (/HTTP 4\d\d/.test(raw)) {
          friendly = "请求参数有误，请检查 LLM 配置或稍后重试。";
        } else {
          friendly = "AI 处理失败，请稍后重试。";
        }
        setMessages([
          ...currentMessages,
          { id: Date.now().toString(), role: 'assistant', content: friendly }
        ]);
      }
    }
  };

  const sendMessage = async (text: string, imagesOrAttachments?: string[] | ChatAttachment[]) => {
    // Normalize: callers may pass either plain path strings (legacy images)
    // or fully-described ChatAttachment objects (file uploads).
    const attachments: ChatAttachment[] = [];
    if (imagesOrAttachments && imagesOrAttachments.length > 0) {
      for (const item of imagesOrAttachments) {
        if (typeof item === 'string') {
          attachments.push({ path: item, name: 'image', mime: '', isImage: true });
        } else {
          attachments.push(item);
        }
      }
    }

    if (!text.trim() && attachments.length === 0) return;

    // Text files: inline their content so the LLM can read them directly.
    // Binary files: just give the LLM a description of what was attached.
    const inlineTextExtensions = ['txt', 'md', 'json', 'yaml', 'yml', 'csv', 'html', 'css', 'js', 'ts', 'tsx', 'jsx', 'py', 'rs', 'java', 'c', 'cpp', 'h', 'sh', 'xml', 'svg', 'log'];
    let finalContent = text;
    const imagePaths: string[] = [];

    for (const att of attachments) {
      if (att.isImage) {
        imagePaths.push(att.path);
        continue;
      }
      const ext = att.name.split('.').pop()?.toLowerCase() || '';
      if (inlineTextExtensions.includes(ext)) {
        try {
          const fileContent = await invoke<string>('read_text_file', { path: att.path });
          // Truncate very large files to avoid blowing up the context window.
          const truncated = fileContent.length > 20000
            ? fileContent.substring(0, 20000) + `\n... [truncated, ${fileContent.length - 20000} more chars]`
            : fileContent;
          finalContent += `\n\n--- ${att.name} ---\n\`\`\`\n${truncated}\n\`\`\`\n`;
        } catch (e) {
          finalContent += `\n\n[Attachment ${att.name} could not be read: ${String(e)}]`;
        }
      } else {
        finalContent += `\n\n[Attached file: ${att.name} (binary, ${att.mime || ext})]`;
      }
    }

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: finalContent,
      images: imagePaths.length > 0 ? imagePaths : undefined,
      files: attachments.filter(a => !a.isImage).length > 0 ? attachments.filter(a => !a.isImage) : undefined,
    };

    addMessage(userMsg);
    const newMessages = [...messages, userMsg];
    setIsGenerating(true);

    // 立即插入一个空 assistant 占位气泡，让用户看到"思考中..."反馈
    // （尤其重要：pre-check 会阻塞几秒，没有这个占位期间画面毫无反应）
    const placeholderId = 'pending_' + Date.now().toString();
    setMessages([...newMessages, {
      id: placeholderId,
      role: 'assistant',
      content: '',
      tool_calls: [],
    }]);

    roundCounterRef.current = 0;
    duplicateTrackerRef.current = new Map();

    // AbortController must exist before pre-check so user can cancel it
    abortControllerRef.current = new AbortController();

    // Pre-check: only run for substantive prompts (likely scene descriptions),
    // skip short commands / greetings to avoid unnecessary latency
    const trimmed = finalContent.trim();
    const looksLikeSceneRequest = trimmed.length > 12
      && !/^(你好|hello|hi|删除|生成图片|列表|帮助|help|谢谢|再见|bye|ok|好的|嗯|是|否)/i.test(trimmed.toLowerCase());

    try {
      if (looksLikeSceneRequest) {
        precheckRef.current = await rewriteQueryAndDetectCharacters(finalContent);
      } else {
        precheckRef.current = "";
      }

      await callLLM(newMessages);
    } finally {
      setIsGenerating(false);
      abortControllerRef.current = null;
      precheckRef.current = "";
    }
  };

  const stopGenerating = () => {
    // 只 abort，不清空 ref。清空后递归 callLLM 入口会 new 一个全新的、未 abort 的
    // controller，行 622 的 abort 检查失效，agent 变得无法停止。
    // 留着已 abort 的 controller，递归入口才能命中检查并 return。
    // sendMessage 的 finally 块会在本轮结束后清空 ref，不影响下一条消息。
    if (abortControllerRef.current && !abortControllerRef.current.signal.aborted) {
      abortControllerRef.current.abort();
    }
    // 删除"空 assistant 占位气泡"——content 空且无 tool_calls 的 pending 消息。
    // UI 显示"思考中..."只看占位气泡是否存在，不查 isGenerating；不删的话即使
    // 后台停了，气泡还挂着，用户看起来"停不下来"。
    const sess = useAgentStore.getState();
    if (sess.activeSessionId) {
      const current = sess.sessions.find(s => s.id === sess.activeSessionId);
      if (current) {
        const cleaned = current.messages.filter(m =>
          !(m.role === 'assistant' && (m.content ?? '') === '' && (!m.tool_calls || m.tool_calls.length === 0))
        );
        if (cleaned.length !== current.messages.length) {
          useAgentStore.getState().setMessages(cleaned);
        }
      }
    }
    setIsGenerating(false);
  };

  return {
    messages,
    isGenerating,
    sendMessage,
    stopGenerating
  };
}
