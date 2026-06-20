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
  /**
   * Agent 执行模式分档，借鉴 LPF 的 Effort 级别。
   * - low:    流水线模式。不让弱模型做多轮 tool calling 决策——
   *           重写 → 批量 search_tags → 一次性组装。
   * - medium: 当前默认行为，单轮 Agent。
   * - high:   多轮 Agent + 关联标签深挖，适合强模型。
   */
  effort: 'low' | 'medium' | 'high';
  /**
   * Agent 工具调用最大轮次预算。超过后强制收尾输出。
   * 0 表示不限制。仅对 medium/high 生效。
   */
  maxRounds: number;
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

1. TAG BUDGET — HARD LIMIT:
   - Single character: 15-25 tags MAX (including quality/count tags).
   - Two characters: 20-30 tags MAX.
   - Every tag must earn its place. When in doubt, CUT it.
   - Counting includes: quality tags (masterpiece...), count tags (1girl...), character name, appearance, clothing, action, background.
   - BAD EXAMPLE (FORBIDDEN — 80+ tags): "masterpiece, 1girl, lillie_(pokemon), blonde_hair, blue_hair, twintails, very_long_hair, long_hair, bare_shoulders, cleavage, white_skin, looking_at_viewer, blush, open_mouth, saliva, drooling, heavy_breathing, moaning, sexual_expression, aroused, flushed_face, wet_clothes, translucent_clothes, clothes_lift, skirt_lift, underwear, panties, panty_pull, partial_disrobing, exposed_ass, ass, large_breasts, nipples, navel, pubic_hair, pussy, genitals, vaginal, penetration, deep_penetration, penis, erect_penis, sexual_activity, sex, cum, cum_on_belly, cum_on_clothes, creampie, sperm, semen, pre_cum, precum_string, pussy_juice_drip_through_clothes, cum_bath, sex_toy, vibrator, masturbation, self_pleasure, handjob, fingering, pussy_peek, showing_pussy, presenting_pussy, fetish, sex_clothes, fuck_me_clothes, bitemarks, hickeys, sweat, glistening_skin, shiny_skin, wet_skin, drool, lewd_pose, arching_back, spread_legs, legs_apart, spread_anus, anus, ahegao, messy_hair, disheveled_hair, torn_clothes, ripped_clothes, torn_panties, bed, bedroom, messy_room, indoor, soft_lighting, sensual, erotic, pornographic, hentai_style, anime_style"
   - That example violates: tag budget, character protection, AND has 10+ overlapping synonyms (cum/semen/sperm/creampie/pre_cum, pussy_peek/showing_pussy/presenting_pussy, etc). NEVER do this.
   - GOOD EXAMPLE (21 tags): "masterpiece, best quality, 1girl, lillie_(pokemon), solo, looking_at_viewer, blush, open_mouth, bed, bedroom, soft_lighting, parted_lips, heavy_breathing, aroused, messy_hair, translucent_clothes, panties, thighhighs, spread_legs, lewd_pose, sweat"

2. NO SYNONYM FLOOD: Never list 5+ near-identical tags for the same concept.
   - BAD: cum, creampie, sperm, semen, pre_cum, precum_string, cum_bath, cum_on_belly, cum_on_clothes (9 tags for semen)
   - GOOD: pick 1-2 (e.g., creampie OR cum_on_body — NOT both)
   - BAD: pussy_peek, showing_pussy, presenting_pussy, pussy_juice_drip, partially_visible_vulva, spread_pussy (6 tags for vulva exposure)
   - GOOD: spread_legs OR presenting (1 tag)

3. NO CONTRADICTORY TRAITS: Do not output mutually exclusive tags. If the character is blonde, do NOT also write blue_hair.

4. CHARACTER APPEARANCE — DO NOT INVENT (CRITICAL):
   - When the user specifies a NAMED CHARACTER (e.g. "lillie_(pokemon)", "hatsune_miku", "雷电将军", any xxx_(series) tag):
     → The model ALREADY KNOWS their hair color, eye color, hairstyle, body type.
     → DO NOT add ANY of these tags unless the user EXPLICITLY asked for a change:
         blonde_hair, blue_hair, pink_hair, black_hair, white_hair, brown_hair, purple_hair, red_hair, silver_hair, green_hair, multicolored_hair
         blue_eyes, red_eyes, green_eyes, purple_eyes, golden_eyes, brown_eyes, heterochromia
         twintails, ponytail, long_hair, short_hair, very_long_hair, bob_cut, side_ponytail, drill_hair, messy_hair, straight_hair
         large_breasts, flat_chest, medium_breasts, huge_breasts, small_breasts, petite, tall, short
     → WRONG: "lillie_(pokemon), blonde_hair, blue_hair, twintails, very_long_hair" ← you invented 4 appearance tags and even contradicted yourself (blonde vs blue)
     → RIGHT: "lillie_(pokemon)" alone — the model fills in the rest
   - EXCEPTION: If the user EXPLICITLY says "change her hair to X" / "give her red eyes" / "make her busty" — then add THAT ONE specific tag.
   - ORIGINAL CHARACTERS (no series name): freely describe appearance.
5. EXPLICIT CHARACTER COUNT: ALWAYS explicitly state the number of characters using tags like 1girl, solo, 1boy, 2girls, 3boys, etc. If the user doesn't specify, default to 1girl or solo for a single female character.
6. MULTI-CHARACTER ANTI-CONFUSION (CRITICAL for 2+ characters):
   - GROUP TAGS: List each character's tags as a contiguous block. NEVER interleave tags of different characters.
   - SPATIAL ANCHORING: Use position words (left/right/foreground/background) to separate characters.
   - KEY FEATURE EMPHASIS: For easily-confused features between characters, use weight syntax like (red_eyes:1.3).
7. SEARCH BOUNDARY RULES:
   - If the user provided explicit English tags (e.g., "1girl, white_hair, serafuku"), DO NOT search for those concepts again. Only search dimensions NOT already covered.
   - Focus search queries ONLY on uncovered dimensions. Do not include already-provided concepts in search queries.
8. NEGATIVE PROMPT: Auto-generate a SHORT negative_prompt (10-15 tags) tailored to the scene. Do NOT flood it either — same synonym rule applies.

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
        effort: 'medium',
        maxRounds: 8,
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
      version: 6,
      migrate: (persistedState: any, version: number) => {
        if (version < 4) {
          // v4: Added character protection, multi-character anti-confusion,
          // mandatory search, and search boundary rules to systemPrompt
          if (persistedState.settings) {
            persistedState.settings.systemPrompt = defaultSystemPrompt;
          }
        }
        if (version < 5) {
          // v5: Added effort (Low/Medium/High) and maxRounds budget
          if (persistedState.settings) {
            persistedState.settings.effort = 'medium';
            persistedState.settings.maxRounds = 8;
          }
        }
        if (version < 6) {
          // v6: Strengthened anti-spam (TAG BUDGET hard limit + NO SYNONYM FLOOD)
          // and CHARACTER APPEARANCE rules with explicit blacklist + examples.
          // Force-overwrite all sessions' systemPrompt to the new stricter version.
          if (persistedState.settings) {
            persistedState.settings.systemPrompt = defaultSystemPrompt;
          }
        }
        // Content-based fallback: if systemPrompt doesn't contain the v6 marker
        // (e.g. HMR saved version=6 with stale prompt), force-overwrite.
        if (persistedState.settings &&
            typeof persistedState.settings.systemPrompt === 'string' &&
            !persistedState.settings.systemPrompt.includes('TAG BUDGET — HARD LIMIT')) {
          persistedState.settings.systemPrompt = defaultSystemPrompt;
        }
        return persistedState;
      }
    }
  )
);
