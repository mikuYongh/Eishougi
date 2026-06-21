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
