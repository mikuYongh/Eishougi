// NOTE: Rust models use `#[serde(rename_all = "camelCase")]`, so the JSON the
// frontend receives is camelCase. Keep this interface aligned with that.
export interface GeneratedImage {
  id: string;
  promptId: string | null;
  workflowId: string | null;
  seed: string | null;
  outputPath: string;
  outputType: "image" | "video";
  status: "completed" | "failed";
  errorMsg: string | null;
  isSaved: boolean;
  createdAt: number;
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
