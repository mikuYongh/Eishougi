import { useState, useRef } from 'react';
import { useSettingsStore } from '../stores/settingsStore';
import { usePromptStore } from '../stores/promptStore';
import { useAgentStore } from '../stores/agentStore';
import { invoke } from '@tauri-apps/api/core';
import { useQueueStore } from '../stores/queueStore';
import { useWorkflowStore } from '../stores/workflowStore';

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
  const { sessions, activeSessionId, addMessage, setMessages, settings: agentSettings } = useAgentStore();
  const activeSession = sessions.find(s => s.id === activeSessionId);
  const messages = activeSession?.messages || [];

  const [isGenerating, setIsGenerating] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

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
            cfg_scale: { type: "number", description: "CFG scale / guidance scale (default 7.0)" },
            seed: { type: "string", description: "Seed value, use '-1' for random" }
          },
          required: ["content"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "update_prompt",
        description: "Update an existing prompt project.",
        parameters: {
          type: "object",
          properties: {
            prompt_id: { type: "string", description: "The ID of the prompt to update" },
            title: { type: "string", description: "Updated title" },
            content: { type: "string", description: "Updated positive prompt text" },
            negative_prompt: { type: "string", description: "Updated negative prompt text" },
            tags: { type: "array", items: { type: "string" }, description: "Updated tags" },
            instance_images: { type: "array", items: { type: "string" }, description: "URLs or file paths to instance reference images" },
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
            seed: { type: "string" }
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
        description: "Generate an image using a specific prompt and workflow.",
        parameters: {
          type: "object",
          properties: {
            prompt_id: { type: "string", description: "The ID of the prompt to use" },
            workflow_id: { type: "string", description: "The ID of the workflow to use (optional)" },
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
        description: "Get the status of the generation queue.",
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
            workflow_json: { type: "string", description: "The raw ComfyUI JSON string." },
            tags: { type: "array", items: { type: "string" } }
          },
          required: ["title", "workflow_json"]
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
            workflow_json: { type: "string" },
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

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${llm.apiKey}`
        },
        body: JSON.stringify({
          model: llm.model || 'agnes-2.0-flash',
          messages: [
            { role: 'system', content: agentSettings.systemPrompt },
            ...mappedMessages
          ],
          tools: ALL_TOOLS,
          stream: true,
        }),
        signal: abortController.signal
      });

      if (!response.ok) {
        throw new Error(`API Error: ${response.status} ${response.statusText}`);
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
          try {
            const parsedArgs = JSON.parse(call.function.arguments || '{}');
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
                  cfgScale: parsedArgs.cfg_scale || 7.0,
                  seed: parsedArgs.seed || "-1",
                  samplerName: "euler",
                  scheduler: "normal",
                  baseModel: parsedArgs.base_model || "sd_xl_base_1.0.safetensors",
                  vaeModel: parsedArgs.vae_model || "auto",
                  loraConfigs: parsedArgs.lora_configs || null,
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
              } else if (fnName === 'update_prompt') {
                const currentPrompt = await invoke('get_prompt', { id: parsedArgs.prompt_id }) as any;
                if (!currentPrompt) throw new Error(`Prompt with ID ${parsedArgs.prompt_id} not found.`);
                
                const updatedPrompt = {
                  ...currentPrompt,
                  title: parsedArgs.title !== undefined ? parsedArgs.title : currentPrompt.title,
                  positivePrompt: parsedArgs.content !== undefined ? parsedArgs.content : currentPrompt.positivePrompt,
                  negativePrompt: parsedArgs.negative_prompt !== undefined ? parsedArgs.negative_prompt : currentPrompt.negativePrompt,
                  baseModel: parsedArgs.base_model !== undefined ? parsedArgs.base_model : currentPrompt.baseModel,
                  vaeModel: parsedArgs.vae_model !== undefined ? parsedArgs.vae_model : currentPrompt.vaeModel,
                  loraConfigs: parsedArgs.lora_configs !== undefined ? parsedArgs.lora_configs : currentPrompt.loraConfigs,
                  width: parsedArgs.width !== undefined ? parsedArgs.width : currentPrompt.width,
                  height: parsedArgs.height !== undefined ? parsedArgs.height : currentPrompt.height,
                  steps: parsedArgs.steps !== undefined ? parsedArgs.steps : currentPrompt.steps,
                  cfgScale: parsedArgs.cfg_scale !== undefined ? parsedArgs.cfg_scale : currentPrompt.cfgScale,
                  seed: parsedArgs.seed !== undefined ? parsedArgs.seed : currentPrompt.seed,
                  tags: parsedArgs.tags !== undefined ? parsedArgs.tags.map((t: string, i: number) => ({
                    id: "tag_" + Date.now() + i,
                    name: t,
                    color: "#ff6b9d",
                    createdAt: Date.now()
                  })) : currentPrompt.tags,
                  instanceImages: parsedArgs.instance_images !== undefined ? parsedArgs.instance_images : currentPrompt.instanceImages,
                  updatedAt: Date.now()
                };
                await invoke('update_prompt', { prompt: updatedPrompt });
                usePromptStore.getState().fetchPrompts();
                res = { status: "success", message: `Prompt ${parsedArgs.prompt_id} updated.` };
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
                
                let wfId = parsedArgs.workflow_id;
                if (!wfId) {
                  const workflows = useWorkflowStore.getState().workflows;
                  if (workflows.length > 0) {
                    const sortedWfs = [...workflows].sort((a, b) => b.updatedAt - a.updatedAt);
                    wfId = sortedWfs[0].id;
                  }
                }
                
                const batchCount = parsedArgs.batch_count || 1;
                await useQueueStore.getState().addJob(project, wfId, batchCount);
                res = { status: "queued", message: `Generation request added for prompt ${parsedArgs.prompt_id} using workflow ${wfId || 'default'}. Please check the queue or Generate page.` };
              } else if (fnName === 'get_queue_status') {
                const state = useQueueStore.getState();
                const active_jobs = state.jobs.filter(j => j.status === 'pending' || j.status === 'generating').length;
                res = { status: state.isConnected ? "connected" : "disconnected", active_jobs, total_jobs_in_history: state.jobs.length };
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
                  jsonContent: parsedArgs.workflow_json,
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
                  jsonContent: parsedArgs.workflow_json !== undefined ? parsedArgs.workflow_json : currentWf.jsonContent,
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
                throw new Error("Unknown tool: " + fnName);
              }
              resultStr = JSON.stringify(res);
            } catch (invokeErr: any) {
              resultStr = JSON.stringify({ error: invokeErr.toString() });
            }
          } catch (e: any) {
            resultStr = JSON.stringify({ error: e.toString() });
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
