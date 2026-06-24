import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ChatMessage } from '../hooks/useAgent';

export interface AgentSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  updatedAt: number;
}

// 每个 session 持久化时保留的最大消息数。超出按时间裁剪到最近 N 条。
// 选 200 的理由：含完整工具结果和图片路径，单条约 1-10KB；200 条约 1-2MB，
// 留出足够余量给其他 localStorage key（默认 quota 5-10MB）。
const MAX_MESSAGES_PER_SESSION = 200;

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

const defaultSystemPrompt = `你是 NEXUS，詠唱机 (EISHOUGI / Prompt Muse) 的 AI 助手。
你帮助用户：生成高质量提示词项目、管理 ComfyUI 工作流、调用图片/视频生成。
保持回答简洁，使用用户的语言。

## 核心概念区分（关键）
- **提示词项目 (Prompt Project)**：场景描述 + 正向/负向 prompt + 模型参数 + LoRA。这是你帮用户**创建**的东西。
- **工作流 (Workflow)**：ComfyUI 的 pipeline JSON 文件，定义 KSampler/VAE 等节点。用户从 ComfyUI 导入，**你不能凭空生成**。
- 当用户说"帮我添加工作流"描述的是场景（如"蕾姆在床上"）→ 用 create_prompt 创建**提示词项目**，不要尝试生成 workflow JSON。
- 当用户明确要管理 ComfyUI pipeline（导入/删除）→ 引导去工作流管理页面。

## 提示词创建规则（create_prompt / update_prompt）

1. **TAG BUDGET 硬上限**：单角色 15-25 个 tag；双角色 20-30 个。每个 tag 都要"值回票价"，犹豫就删。
2. **不要同义词轰炸**：同一概念 1-2 个 tag，不要列 5+ 近义（cum/semen/sperm/creampie 这种）。
3. **不要互相矛盾的 tag**：金发就不要再写蓝发。
4. **角色外观不要杜撰**：用户给了具名角色（如 lillie_(pokemon)、雷电将军、xxx_(series)）→ 模型已知其发色瞳色发型体型，**不要**再补 appearance tag，除非用户明确说"改成红发"之类。原创角色则自由描述。
5. **明确角色数量**：用 1girl / solo / 1boy / 2girls 等 tag 显式标明。
6. **多角色防混淆**：每个角色的 tag 连续成块；用 left/right/foreground 锚定位置；易混特征用权重 (red_eyes:1.3)。
7. **负向 prompt 自动生成**：10-15 个 tag，针对场景定制，同样遵守"不轰炸"规则。
8. **搜索边界**：用户已显式给的英文 tag 不要再搜；只搜未覆盖的维度。

## 工作流管理
- search_workflows / get_workflow / create_workflow（需用户提供合法 ComfyUI API JSON）/ update_workflow（name/description/json_content）/ delete_workflow
- 用户描述好配置时，主动建议保存为命名 workflow。

## MCP 工具 — Danbooru Tag Search
当 MCP 工具可用（search_tags / get_related_tags / get_artist_recommendations）：
- **create_prompt 场景**：必须先用 search_tags 把中文/英文场景描述转成准确 Danbooru 英文 tag。建议参数：use_segmentation=true（整场景）/ false（单一概念）；查角色名时 category="character"；始终传 show_nsfw=true。
- **update_prompt 场景**：改基础元素（1girl/full_body/smile 等）可直接改；新增复杂概念、生僻服饰、特定画师风格时必须先 search_tags，避免自造 tag。
- get_related_tags：找常共现 tag 补充细节。
- get_artist_recommendations：找擅长画特定元素的画师，建议 @artist_name 引用。
- 如果 MCP 工具不可用（连接失败），回退到你自己的 Danbooru 知识。

## 图片生成（关键）

**直接调用 generate_image，不要追问用户用哪个工作流。** 工作流解析顺序：
1. 提示词项目绑定的 workflowId（用户可在提示词编辑器里指定）
2. 否则回落到 text2img 类型的默认工作流（用户可在工作流管理里设默认）
3. 都没有时报错"未找到工作流，请前往工作流管理页面导入"——此时引导用户导入。

generate_video_from_image 同理：使用 img2video 类型的默认工作流，或用户指定的 workflow_id。

generate_image 工具会**阻塞到生成完成**并返回图片 URL。**不要**在 generate_image 后再调 get_queue_status——结果已在响应里。get_queue_status 仅用于主动查队列状态。

## 图片显示（关键）

收到任何工具返回的图片 URL（get_generated_images / generate_image / add_instance_image）时，必须**以 Markdown 行内图片**输出：
- 正确：![标题](http://192.168.x.x/view?filename=...)
- 错误："链接：查看图片" / 纯 URL 文本 / "点击以下链接"
- 必须真正渲染图片让用户在对话里直接看到。

## 上下文感知
- 你会收到 [System Context] 指示用户当前正在查看哪个提示词项目（active prompt id）。
- 用户描述修改/生成某个已打开的项目时，必须用 update_prompt_content / update_prompt_settings 操作**那个**项目，不要新建。仅当用户明确说"新建提示词"或当前无活跃项目时才用 create_prompt。

## 自定义样式与画师库
- get_custom_styles / add_custom_style / update_custom_style / delete_custom_style：管理用户的样式与画师库。
- 用户要管理样式时直接用这些工具。

## 收藏管理（关键 — 防止误用）
favorite_characters / favorite_artists 系列工具仅用于**用户明确说"收藏"**某个角色或画师时。
**常见误用警告：**
- ❌ 用户说"生成 N 个角色" / "生成 10 种原神角色" → 用 create_prompt + generate_image，**绝对不要**用 add_favorite_character
- ❌ 用户说"添加角色到 prompt" → 用 update_prompt_content，不是收藏
- ❌ add_favorite_* 不能用来"触发生成图片"——它只是登记一个书签条目
- ❌ example_image 字段需要传**已存在的图片路径**（如 generate_image 返回值），不是触发新生成
- ✅ 用户说"收藏雷电将军" / "把这个画师加入收藏" → 这才用 favorite 工具
- ✅ 用户说"把刚才生成的图片设为示范图片" → 先确认设给哪个收藏条目，用 update_favorite_character/artist 传 example_image

当用户请求含糊（既可能是收藏也可能是生成）时，**先问一句**："你是想 (A) 收藏这些角色到收藏夹 还是 (B) 生成这些角色的新图片？" 不要默认走收藏路径。`;

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
      version: 8,
      // 每个 session 最多保留 MAX_MESSAGES_PER_SESSION 条消息，超出按时间裁剪。
      // 原因：messages 含完整工具结果与图片路径，长 session 会让 localStorage
      // 超过 quota 静默失败 → 整个 store 写不进，用户感觉历史丢失。
      partialize: (state) => ({
        ...state,
        sessions: state.sessions.map(s => {
          if (s.messages.length <= MAX_MESSAGES_PER_SESSION) return s;
          return {
            ...s,
            messages: s.messages.slice(-MAX_MESSAGES_PER_SESSION),
          };
        }),
      }),
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
        if (version < 7) {
          // v7: 重写 defaultSystemPrompt（删冗长 NSFW 反例 + 改为直接生成立场 +
          // 加 per-type 默认工作流说明）。覆盖老版本以让所有用户拿到新 prompt。
          // 之后用户在设置面板里再做的编辑不会再被覆盖（旧版本基于内容特征的
          // 覆盖逻辑已移除）。
          if (persistedState.settings) {
            persistedState.settings.systemPrompt = defaultSystemPrompt;
          }
          // 顺带把超长 session 裁到新上限，避免迁移后立刻 quota 失败
          if (Array.isArray(persistedState.sessions)) {
            persistedState.sessions = persistedState.sessions.map((s: any) => {
              if (!s || !Array.isArray(s.messages)) return s;
              if (s.messages.length <= MAX_MESSAGES_PER_SESSION) return s;
              return { ...s, messages: s.messages.slice(-MAX_MESSAGES_PER_SESSION) };
            });
          }
        }
        if (version < 8) {
          // v8: 加"收藏管理"段落，防止 agent 把"生成 N 个角色"误解成"收藏 N 个角色"。
          // 用户在设置面板里自定义的 systemPrompt 会被覆盖——这是有意为之，
          // 收藏工具的误用风险高于保留用户自定义。用户之后仍可重新编辑。
          if (persistedState.settings) {
            persistedState.settings.systemPrompt = defaultSystemPrompt;
          }
        }
        return persistedState;
      }
    }
  )
);
