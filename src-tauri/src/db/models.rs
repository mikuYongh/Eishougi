use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Prompt {
    pub id: String,
    pub title: String,
    pub description: String,
    pub positive_prompt: String,
    pub negative_prompt: String,
    pub artist_prompt: String,
    pub seed: String,
    pub width: i32,
    pub height: i32,
    pub steps: i32,
    pub cfg_scale: f64,
    pub sampler_name: String,
    pub scheduler: String,
    pub base_model: Option<String>,
    pub lora_configs: Option<String>,  // JSON string
    pub vae_model: Option<String>,
    pub is_favorite: bool,
    pub is_pinned: bool,
    pub created_at: i64,
    pub updated_at: i64,
    pub deleted_at: Option<i64>,
    // 非数据库字段（JOIN 查询填充）
    pub tags: Option<Vec<Tag>>,
    pub images: Option<Vec<PromptImage>>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Tag {
    pub id: String,
    pub name: String,
    pub color: String,
    pub created_at: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PromptImage {
    pub id: String,
    pub prompt_id: String,
    pub file_path: String,
    pub file_name: String,
    pub created_at: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Workflow {
    pub id: String,
    pub name: String,
    pub description: String,
    pub json_content: String,
    #[serde(rename = "type")]
    pub workflow_type: String,  // text2img | img2video | text2video | img2img
    pub is_default: bool,
    pub is_builtin: bool,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GeneratedImage {
    pub id: String,
    pub prompt_id: Option<String>,
    pub workflow_id: Option<String>,
    pub seed: Option<String>,
    pub output_path: String,
    pub output_type: String,
    pub status: String,
    pub error_msg: Option<String>,
    pub created_at: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessage {
    pub id: String,
    pub session_id: String,
    pub role: String,
    pub content: Option<String>,
    pub tool_calls: Option<String>,
    pub tool_result: Option<String>,
    pub created_at: i64,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PromptFilter {
    pub search: Option<String>,
    pub tags: Option<Vec<String>>,
    pub prompt_type: Option<String>,
    pub favorite: Option<bool>,
    pub pinned: Option<bool>,
    pub limit: Option<i32>,
    pub offset: Option<i32>,
}
