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
}

interface AgentStore {
  sessions: AgentSession[];
  activeSessionId: string | null;
  settings: AgentSettings;
  
  // Actions
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
CRITICAL: When using the create_prompt or update_prompt tool:
1. You MUST translate the positive_prompt and negative_prompt into high-quality English keywords.
2. You MUST auto-generate suitable negative_prompt keywords tailored to the specific scene to avoid bad generations (e.g. lowres, bad anatomy, bad hands, missing fingers, extra digit, worst quality, etc).
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
      },

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
    }
  )
);
