import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ChatMessage } from '../hooks/useAgent';

export interface AgentSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  updatedAt: number;
}

export interface AgentSettings {
  systemPrompt: string;
  reasoningEffort: 'low' | 'medium' | 'high';
}

interface AgentStore {
  sessions: AgentSession[];
  activeSessionId: string | null;
  settings: AgentSettings;
  isMobileAgentOpen: boolean;
  isGenerating: boolean;
  
  // Actions
  toggleMobileAgent: (force?: boolean) => void;
  setIsGenerating: (generating: boolean) => void;
  createSession: () => string;
  switchSession: (id: string) => void;
  deleteSession: (id: string) => void;
  updateSessionTitle: (id: string, title: string) => void;
  
  // Messages
  addMessage: (message: ChatMessage) => void;
  setMessages: (messages: ChatMessage[]) => void;
  clearMessages: () => void;
  
  // Settings
  updateSettings: (settings: Partial<AgentSettings>) => void;
}

const defaultSystemPrompt = `You are NEXUS, a highly capable AI Agent designed for 詠唱机 EISHOUGI.
You assist the user in generating high-quality prompts, creating workflows, and generating images.
Always respond in the user's language. Keep answers concise.

CRITICAL RULES FOR PROMPT GENERATION (create_prompt / update_prompt):
1. NO SPAM TAGS: DO NOT use excessive "beautiful_xxx" tags or massive dictionary-style tag lists. Modern models perform much better with concise, highly descriptive prompts.
2. QUALITY OVER QUANTITY: Limit quality tags to a few essential ones (e.g., masterpiece, best quality, highres).
3. NO CHAOTIC/EXTREME CONTENT: Unless explicitly requested, keep the scene coherent and aesthetic. Avoid adding extreme explicit/hardcore tags if a simple "teasing" or "intimate" atmosphere is requested.
4. USE MCP TOOLS: If search_tags is available, use it FIRST to convert the scene description into accurate Danbooru English tags. If unavailable, use your own Danbooru knowledge.
5. NEGATIVE PROMPT: Auto-generate suitable negative_prompt keywords tailored to the specific scene.
6. DO NOT INVENT CHARACTER TRAITS: If the user specifies a known character (e.g., Hatsune Miku, Hiiragi Kagami), DO NOT add tags for their hair color, eye color, or hairstyle unless the user EXPLICITLY asks to change them. The image model already knows what the character looks like. Guessing incorrect traits (e.g., "black hair" for a character with purple hair) will ruin the character generation. Just use the character's name tag and focus on their outfit, action, and scene.

When asked to create a prompt, use the create_prompt tool.
When asked to modify or delete a prompt, use the update_prompt or delete_prompt tools.

You have full CRUD capabilities for workflows:
- use search_workflows to find workflows by tags or keywords, or list all available workflows
- use get_workflow to fetch a specific workflow's full details (including its ComfyUI JSON)
- use create_workflow to create a new workflow (requires a valid raw ComfyUI JSON string)
- use update_workflow to update a workflow's name, description, tags, or JSON content
- use delete_workflow to remove a workflow
You should proactively help manage the user's workflow library: suggest saving good configurations as named workflows, help locate workflows by description, and keep the library organized.

CRITICAL FOR GENERATION: If the user asks to generate an image but DOES NOT explicitly specify which workflow to use, you MUST use the search_workflows tool first to check available workflows, and then explicitly ask the user which workflow they want to use. DO NOT guess or pick a default workflow without the user's explicit consent!

MCP TOOLS — Danbooru Tag Search:
You may have access to external MCP tools (search_tags, get_related_tags, get_artist_recommendations) for Danbooru tag lookup.
When available, use these tools to:
1. search_tags(query, ...): Convert natural language descriptions (Chinese/English) into accurate English Danbooru tags. Use when creating prompts to ensure tags are valid Danbooru keywords. Recommended params: use_segmentation=true for full scenes, false for single concepts. category="character" for character names. ALWAYS explicitly pass show_nsfw=true to ensure unrestricted tag retrieval.
2. get_related_tags(tags, ...): Find tags commonly co-occurring with selected tags. Use to enrich prompts with complementary details.
3. get_artist_recommendations(tags, ...): Find artists skilled at drawing specific elements. Use to suggest @artist_name references.

When creating or updating prompts:
- FOR CREATION: ALWAYS use search_tags first to convert scene descriptions into accurate Danbooru tags.
- FOR MODIFICATION (update_prompt): 
    - If modifying basic elements (like 1girl, full_body, smile, simple_background), you can directly update the prompt WITHOUT searching.
    - If adding complex concepts, obscure clothing, specific artistic styles (like lineart, ink, specific artists), or rare actions, you MUST use search_tags first to ensure you use standard Danbooru tags (e.g., do not invent tags like "simple_lines").
- The returned tags can be directly used in positive_prompt as comma-separated keywords.
- IMPORTANT: If MCP tools are unavailable (connection failed), fall back to your own knowledge of Danbooru tags.

CRITICAL - GENERATION: When using generate_image, the tool WAITS for image generation to complete and returns image URLs directly. Do NOT call get_queue_status after generate_image — the results are already in the response. Only use get_queue_status to check the queue state independently.

CRITICAL - IMAGE DISPLAY: When you receive image URLs from any tool (get_generated_images, generate_image, add_instance_image), you MUST output them as inline Markdown images: ![prompt_title](url)
  - CORRECT: ![初音未来花丛淫乱场景](http://192.168.x.x/view?filename=...)
  - WRONG: "链接：查看图片" or "点击以下链接" or just the URL as text
  - WRONG: listing them as text without images
  - You MUST display the actual images using Markdown so the user can see them directly in the chat. This is the most important rule.`;

export const useAgentStore = create<AgentStore>()(
  persist(
    (set, get) => ({
      sessions: [],
      activeSessionId: null,
      settings: {
        systemPrompt: defaultSystemPrompt,
        reasoningEffort: 'medium',
      },
      isMobileAgentOpen: false,
      isGenerating: false,

      toggleMobileAgent: (force) => set(state => ({ 
        isMobileAgentOpen: force !== undefined ? force : !state.isMobileAgentOpen 
      })),
      setIsGenerating: (generating) => set({ isGenerating: generating }),

      createSession: () => {
        const newId = 'session_' + Date.now();
        const newSession: AgentSession = {
          id: newId,
          title: 'New Connection',
          messages: [],
          updatedAt: Date.now(),
        };
        
        set((state) => ({
          sessions: [newSession, ...state.sessions],
          activeSessionId: newId,
        }));
        
        return newId;
      },

      switchSession: (id) => {
        set({ activeSessionId: id });
      },

      deleteSession: (id) => {
        set((state) => {
          const newSessions = state.sessions.filter(s => s.id !== id);
          return {
            sessions: newSessions,
            activeSessionId: state.activeSessionId === id 
              ? (newSessions[0]?.id || null) 
              : state.activeSessionId
          };
        });
      },

      updateSessionTitle: (id, title) => {
        set((state) => ({
          sessions: state.sessions.map(s => 
            s.id === id ? { ...s, title, updatedAt: Date.now() } : s
          )
        }));
      },

      addMessage: (message) => {
        set((state) => {
          const { activeSessionId, sessions } = state;
          
          if (!activeSessionId) {
            // Auto create session if none exists
            const newId = 'session_' + Date.now();
            let autoTitle = 'New Connection';
            
            // Auto generate title from first user message
            if (message.role === 'user' && message.content) {
              autoTitle = message.content.substring(0, 15) + (message.content.length > 15 ? '...' : '');
            }
            
            const newSession: AgentSession = {
              id: newId,
              title: autoTitle,
              messages: [message],
              updatedAt: Date.now(),
            };
            
            return {
              sessions: [newSession, ...sessions],
              activeSessionId: newId,
            };
          }
          
          // Add to existing active session
          return {
            sessions: sessions.map(s => {
              if (s.id === activeSessionId) {
                let title = s.title;
                const msgs = s.messages || [];
                // Update title if it's the first user message and title is default
                if (msgs.length === 0 && message.role === 'user' && title === 'New Connection' && message.content) {
                  title = message.content.substring(0, 15) + (message.content.length > 15 ? '...' : '');
                }
                
                return {
                  ...s,
                  title,
                  messages: [...msgs, message],
                  updatedAt: Date.now()
                };
              }
              return s;
            })
          };
        });
      },

      setMessages: (messages) => {
        set((state) => {
          if (!state.activeSessionId) return state;
          return {
            sessions: state.sessions.map(s => 
              s.id === state.activeSessionId ? { ...s, messages, updatedAt: Date.now() } : s
            )
          };
        });
      },

      clearMessages: () => {
        set((state) => {
          if (!state.activeSessionId) return state;
          return {
            sessions: state.sessions.map(s => 
              s.id === state.activeSessionId ? { ...s, messages: [], updatedAt: Date.now() } : s
            )
          };
        });
      },

      updateSettings: (newSettings) => {
        set((state) => ({
          settings: { ...state.settings, ...newSettings }
        }));
      }
    }),
    {
      name: 'prompt-muse-agent',
      version: 3,
      migrate: (persistedState: any, version: number) => {
        if (version === 0 || version === 1 || version === 2) {
          // Reset systemPrompt to apply the new character trait rules
          if (persistedState.settings) {
            persistedState.settings.systemPrompt = defaultSystemPrompt;
          }
        }
        return persistedState;
      }
    }
  )
);
