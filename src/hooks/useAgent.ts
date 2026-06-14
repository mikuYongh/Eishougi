import { useState, useRef, useEffect } from 'react';
import { useSettingsStore } from '../stores/settingsStore';
import { usePromptStore } from '../stores/promptStore';
import { useAgentStore } from '../stores/agentStore';
import { invoke } from '@tauri-apps/api/core';
import { useQueueStore } from '../stores/queueStore';
import { useWorkflowStore } from '../stores/workflowStore';
import { useModelStore } from '../stores/modelStore';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  images?: string[];
  tool_calls?: any[];
  tool_call_id?: string;
  name?: string;
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
          console.log(`[Agent] MCP server "${server.name}" loaded ${rustTools.length} tools`);
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
        description: "Create a new prompt project.",
        parameters: {
          type: "object",
          properties: {
            title: { type: "string", description: "Project title" },
            content: { type: "string", description: "The positive prompt text (English keywords)" },
            negative_prompt: { type: "string", description: "The negative prompt text" },
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
        description: "Update the textual content (prompts, title, tags) of an existing project.",
        parameters: {
          type: "object",
          properties: {
            prompt_id: { type: "string", description: "The ID of the prompt to update" },
            title: { type: "string", description: "Updated title" },
            positive_prompt: { type: "string", description: "Updated positive prompt text" },
            negative_prompt: { type: "string", description: "Updated negative prompt text" },
            artist_prompt: { type: "string", description: "Updated artist or style trigger words" },
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
    }
  ];

  const callLLM = async (currentMessages: ChatMessage[]) => {
    const { llm } = useSettingsStore.getState().settings;
    
    let apiUrl = llm.apiUrl || 'https://apihub.agnes-ai.com/v1';
    if (!apiUrl.endsWith('/chat/completions')) {
      apiUrl = apiUrl.replace(/\/$/, '') + '/chat/completions';
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      // Pre-process messages to fetch base64 for images
      const mappedMessages = await Promise.all(currentMessages.map(async (msg) => {
        const m: any = { role: msg.role };
        if (msg.images && msg.images.length > 0) {
          const b64Images = await Promise.all(msg.images.map(async (urlOrPath) => {
            if (urlOrPath.startsWith('data:')) return urlOrPath;
            if (urlOrPath.startsWith('http')) {
              try {
                const res = await fetch(urlOrPath);
                const blob = await res.blob();
                return new Promise<string>((resolve) => {
                  const reader = new FileReader();
                  reader.onloadend = () => resolve(reader.result as string);
                  reader.readAsDataURL(blob);
                });
              } catch(e) { return urlOrPath; }
            }
            try {
              return await invoke('read_image_base64', { path: urlOrPath });
            } catch(e) { return urlOrPath; }
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
        return m;
      }));

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
        systemContext += `\nThe user is currently viewing/editing Prompt Project ID: ${match[1]}.\nCRITICAL: You MUST USE update_prompt_content or update_prompt_settings on this ID if the user asks to modify the scene or settings. DO NOT create a new prompt.`;
      } else {
        systemContext += `\nThe user is NOT viewing a specific prompt. If they ask to generate a scene, you can use create_prompt.`;
      }

      let bodyJson: string;
      try {
        const systemMessage = {
          role: "system",
          content: agentSettings.systemPrompt + mcpToolsPrompt + systemContext + "\n\nCRITICAL RULE FOR WORKFLOWS: You HAVE the `create_workflow`, `update_workflow`, and `delete_workflow` tools. If the user provides a JSON for a workflow or asks to create/manage a workflow, you MUST use these tools! DO NOT tell the user they need to import it manually." 
        };
        
        const payload: any = {
          model: llm.model || 'agnes-2.0-flash',
          messages: [
            systemMessage,
            ...mappedMessages
          ],
          tools: allTools.map((t: any) => {
            const { _mcp, ...rest } = t;
            return rest;
          }),
          stream: true,
          temperature: llm.temperature !== undefined ? llm.temperature : 0.7,
          max_tokens: llm.maxTokens !== undefined ? llm.maxTokens : 2048,
        };
        if (llm.provider === 'ollama') {
          payload.options = { num_ctx: 32768 };
        }
        bodyJson = JSON.stringify(payload);
      } catch (e) {
        console.error("[Agent] JSON.stringify failed:", e);
        throw e;
      }

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${llm.apiKey}`
        },
        body: bodyJson,
        signal: abortController.signal
      });

      if (!response.ok) {
        let errorMsg = response.statusText;
        try {
          const errorBody = await response.json();
          if (errorBody.error && errorBody.error.message) {
            errorMsg = errorBody.error.message;
          } else if (typeof errorBody.error === 'string') {
            errorMsg = errorBody.error;
          } else {
            errorMsg = JSON.stringify(errorBody);
          }
        } catch (e) {
          try {
            errorMsg = await response.text();
          } catch (e2) {}
        }
        throw new Error(`API Error: ${response.status} ${errorMsg}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder('utf-8');
      
      let assistantMessage: ChatMessage = {
        id: Date.now().toString(),
        role: 'assistant',
        content: '',
        tool_calls: []
      };

      const baseMessages = [...currentMessages];
      setMessages([...baseMessages, assistantMessage]);

      let done = false;
      let toolCallState: any = null;

      while (!done && reader) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        if (value) {
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n').filter(line => line.trim() !== '');
          
          for (const line of lines) {
            if (line === 'data: [DONE]') break;
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                const delta = data.choices[0].delta;
                
                if (delta.content) {
                  assistantMessage.content += delta.content;
                }
                
                if (delta.tool_calls) {
                  for (const toolCall of delta.tool_calls) {
                    if (toolCall.id) {
                      assistantMessage.tool_calls = assistantMessage.tool_calls || [];
                      assistantMessage.tool_calls.push({
                        id: toolCall.id,
                        type: 'function',
                        function: {
                          name: toolCall.function.name,
                          arguments: toolCall.function.arguments || ''
                        }
                      });
                      toolCallState = assistantMessage.tool_calls[assistantMessage.tool_calls.length - 1];
                    } else if (toolCall.function && toolCall.function.arguments && toolCallState) {
                      toolCallState.function.arguments += toolCall.function.arguments;
                    }
                  }
                }

                setMessages([...baseMessages, { ...assistantMessage }]);
              } catch (e) {
                // Ignore parse errors on partial chunks
              }
            }
          }
        }
      }

      if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
        const newMessages = [...currentMessages, assistantMessage];
        
        for (const call of assistantMessage.tool_calls) {
          let resultStr = "";
          let rawArgs = "";
          try {
            // Clean up backslashes or trailing content in argument string if LLM outputted slightly malformed json
            rawArgs = (call.function.arguments || '{}').trim();
            call.function.arguments = rawArgs; // MUST write back so history has valid JSON for subsequent API calls
            const parsedArgs = JSON.parse(rawArgs);
            try {
              let res: any;
              const fnName = call.function.name;
              if (fnName === 'create_prompt') {
                const newPrompt = {
                  id: "p_" + Date.now().toString(),
                  title: parsedArgs.title || parsedArgs.tags?.[0] || "Agent Generated",
                  description: "Generated by AI Agent",
                  positivePrompt: parsedArgs.content,
                  negativePrompt: parsedArgs.negative_prompt || "",
                  artistPrompt: "",
                  width: parsedArgs.width || 1024,
                  height: parsedArgs.height || 1024,
                  steps: parsedArgs.steps || 25,
                  cfgScale: parsedArgs.cfg_scale || 5.0,
                  seed: parsedArgs.seed || "-1",
                  samplerName: parsedArgs.sampler_name || "euler",
                  scheduler: parsedArgs.scheduler || "beta57",
                  baseModel: parsedArgs.base_model || "sd_xl_base_1.0.safetensors",
                  vaeModel: parsedArgs.vae_model || "auto",
                  loraConfigs: parsedArgs.lora_configs ? JSON.stringify(parsedArgs.lora_configs) : null,
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
                
                const updatedPrompt = {
                  ...currentPrompt,
                  baseModel: parsedArgs.base_model !== undefined ? parsedArgs.base_model : currentPrompt.baseModel,
                  vaeModel: parsedArgs.vae_model !== undefined ? parsedArgs.vae_model : currentPrompt.vaeModel,
                  loraConfigs: parsedArgs.lora_configs !== undefined ? (parsedArgs.lora_configs ? JSON.stringify(parsedArgs.lora_configs) : null) : currentPrompt.loraConfigs,
                  width: parsedArgs.width !== undefined ? parsedArgs.width : currentPrompt.width,
                  height: parsedArgs.height !== undefined ? parsedArgs.height : currentPrompt.height,
                  steps: parsedArgs.steps !== undefined ? parsedArgs.steps : currentPrompt.steps,
                  cfgScale: parsedArgs.cfg_scale !== undefined ? parsedArgs.cfg_scale : currentPrompt.cfgScale,
                  seed: parsedArgs.seed !== undefined ? parsedArgs.seed : currentPrompt.seed,
                  samplerName: parsedArgs.sampler_name !== undefined ? parsedArgs.sampler_name : currentPrompt.samplerName,
                  scheduler: parsedArgs.scheduler !== undefined ? parsedArgs.scheduler : currentPrompt.scheduler,
                  workflowId: parsedArgs.workflow_id !== undefined ? parsedArgs.workflow_id : currentPrompt.workflowId,
                  updatedAt: Date.now()
                };
                await invoke('update_prompt', { prompt: updatedPrompt });
                usePromptStore.getState().fetchPrompts();
                res = { status: "success", message: `Prompt settings ${parsedArgs.prompt_id} updated.` };
              } else if (fnName === 'delete_prompt') {
                await invoke('delete_prompt', { id: parsedArgs.prompt_id });
                usePromptStore.getState().fetchPrompts();
                res = { status: "success", message: `Prompt ${parsedArgs.prompt_id} deleted.` };
              } else if (fnName === 'search_prompts') {
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
                  const defaultWf = workflows.find((w: any) => w.isDefault);
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
              } else if (fnName === 'auto_tag_all_prompts') {
            const { aiService } = await import('../services/aiService');
            // Run in background, return immediate response
            aiService.batchAutoTagPrompts(
              (curr, total) => console.log(`[AutoTag] ${curr}/${total}`),
              (msg) => console.log(`[AutoTag] ${msg}`)
            );
            resultStr = JSON.stringify({ status: "success", message: "后台批量打标已启动，将自动为所有提示词生成标签" });
          } else if (fnName === 'list_local_models') {
            const store = useModelStore.getState();
            if (store.checkpoints.length === 0 && store.loras.length === 0) {
              await store.fetchModels();
            }
            const { checkpoints, loras } = useModelStore.getState();
            res = { checkpoints, loras };
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

          const toolMsg: ChatMessage = {
            id: Date.now().toString() + Math.random().toString().slice(2, 6),
            role: 'tool',
            content: resultStr,
            tool_call_id: call.id,
            name: call.function.name
          };
          newMessages.push(toolMsg);
          setMessages([...newMessages]);
        }

        await callLLM(newMessages);
      }

    } catch (error: any) {
      if (error.name !== 'AbortError') {
        console.error("Agent error:", error);
        setMessages([
          ...currentMessages, 
          { id: Date.now().toString(), role: 'assistant', content: `[Error]: ${error.message}` }
        ]);
      }
    }
  };

  const sendMessage = async (text: string, images?: string[]) => {
    if (!text.trim() && (!images || images.length === 0)) return;
    
    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
      images: images && images.length > 0 ? images : undefined
    };
    
    addMessage(userMsg);
    const newMessages = [...messages, userMsg];
    setIsGenerating(true);
    
    try {
      await callLLM(newMessages);
    } finally {
      setIsGenerating(false);
      abortControllerRef.current = null;
    }
  };

  const stopGenerating = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
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
