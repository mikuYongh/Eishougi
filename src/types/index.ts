export interface Prompt {
  id: string;
  title: string;
  description: string;
  positive_prompt: string;
  negative_prompt: string;
  artist_prompt: string;
  seed: string;
  width: number;
  height: number;
  steps: number;
  cfg_scale: number;
  sampler_name: string;
  scheduler: string;
  base_model: string | null;
  lora_configs: string | null;
  vae_model: string | null;
  is_favorite: boolean;
  is_pinned: boolean;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
  tags: Tag[];
  images: PromptImage[];
}

export interface Tag {
  id: string;
  name: string;
  color: string;
  created_at: number;
}

export interface PromptImage {
  id: string;
  prompt_id: string;
  file_path: string;
  file_name: string;
  created_at: number;
}

export interface Workflow {
  id: string;
  name: string;
  description: string;
  json_content: string;
  parameter_mapping: string;
  type: WorkflowType;
  is_default: boolean;
  is_builtin: boolean;
  created_at: number;
  updated_at: number;
}

export type WorkflowType = "text2img" | "img2video" | "text2video" | "img2img";

export interface GeneratedImage {
  id: string;
  prompt_id: string | null;
  workflow_id: string | null;
  seed: string | null;
  output_path: string;
  output_type: "image" | "video";
  status: "completed" | "failed";
  error_msg: string | null;
  isSaved: boolean;
  created_at: number;
}

export interface PromptFilter {
  search?: string;
  tags?: string[];
  prompt_type?: "positive" | "negative" | "artist" | "all";
  favorite?: boolean;
  pinned?: boolean;
  limit?: number;
  offset?: number;
}

export type TabId = "all" | "positive" | "negative" | "artist" | "favorite";

export type NavId =
  | "dashboard"
  | "prompts"
  | "workflows"
  | "generate"
  | "video"
  | "tagger"
  | "characters"
  | "artists"
  | "history"
  | "vault"
  | "settings";

export type ThemeId = "sakura" | "classic" | "green" | "night" | "cyber";
