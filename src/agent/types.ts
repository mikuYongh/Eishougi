/**
 * Agent 类型定义 — AG-UI 协议 + 生图/生视频专属交互扩展
 */

// ── 基础消息类型（兼容旧 useAgent.ts 的 ChatMessage）──

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  images?: string[];
  files?: ChatAttachment[];
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
  reasoning_content?: string;
  /** AG-UI CUSTOM 事件附带的富 UI 数据（建议、生成预览、角色卡片等） */
  attachments?: MessageAttachment[];
}

export interface ChatAttachment {
  path: string;
  name: string;
  mime: string;
  isImage: boolean;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

// ── 富 UI 消息附件（通过 AG-UI CUSTOM 事件传递）──

export type MessageAttachment =
  | SuggestionAttachment
  | GenerationPreviewAttachment
  | CharacterPickerAttachment
  | ResultActionsAttachment
  | ToolProgressAttachment;

export interface SuggestionAttachment {
  type: 'suggestions';
  suggestions: Suggestion[];
}

export interface Suggestion {
  title: string;
  message: string;
  icon?: string;
}

export interface GenerationPreviewAttachment {
  type: 'generation_preview';
  previewId: string;
  prompt: string;
  negativePrompt?: string;
  artistPrompt?: string;
  model?: string;
  width?: number;
  height?: number;
  steps?: number;
  cfgScale?: number;
  sampler?: string;
  scheduler?: string;
  loras?: { name: string; strength: number; enabled: boolean }[];
  promptId?: string;
  status: 'pending' | 'approved' | 'rejected' | 'modified';
}

export interface CharacterPickerAttachment {
  type: 'character_picker';
  pickerId: string;
  kind: 'character' | 'artist';
  results: CharacterCard[];
}

export interface CharacterCard {
  id: string;
  name: string;
  nameEn?: string;
  trigger?: string;
  imageUrl?: string;
  source?: string;
  tags?: string[];
}

export interface ResultActionsAttachment {
  type: 'result_actions';
  images: string[];
  promptId?: string;
  actions: ResultAction[];
}

export interface ResultAction {
  id: string;
  label: string;
  icon: string;
  message: string;
}

export interface ToolProgressAttachment {
  type: 'tool_progress';
  toolName: string;
  status: 'running' | 'completed' | 'error';
  label?: string;
  result?: string;
  images?: string[];
}

// ── Token 统计 ──

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

// ── 快速预设 ──

export interface QuickPreset {
  category: 'size' | 'quality' | 'style';
  label: string;
  value: string;
  icon?: string;
  apply: Record<string, any>;
}

export const QUICK_PRESETS: QuickPreset[] = [
  // 尺寸
  { category: 'size', label: '竖版', value: '832×1216', icon: '📱', apply: { width: 832, height: 1216 } },
  { category: 'size', label: '横版', value: '1216×832', icon: '🖥️', apply: { width: 1216, height: 832 } },
  { category: 'size', label: '方图', value: '1024×1024', icon: '⬜', apply: { width: 1024, height: 1024 } },
  // 质量
  { category: 'quality', label: '高清', value: '30步', icon: '✨', apply: { steps: 30, cfgScale: 5.5 } },
  { category: 'quality', label: '快速', value: '20步', icon: '⚡', apply: { steps: 20, cfgScale: 5.0 } },
  // 风格
  { category: 'style', label: '动漫', value: 'anime', icon: '🌸', apply: {} },
  { category: 'style', label: '写实', value: 'realistic', icon: '📷', apply: {} },
  { category: 'style', label: '水彩', value: 'watercolor', icon: '🎨', apply: {} },
];
