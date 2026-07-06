//! Shared, mutable MCP server configuration + runtime handle.
//!
//! `McpServerState` is wrapped in axum's `State` extractor so every request handler can read the
//! current config (token, tool-group toggles) without owning a separate copy. The actual server
//! task (the axum listener) lives in `mod.rs` and is started/stopped from there.

use std::sync::Arc;
use tauri::AppHandle;
use tokio::sync::RwLock;

/// Runtime-toggleable config. Mutated by the Tauri commands (`mcp_server_set_enabled`,
/// `mcp_server_regenerate_token`, and the settings sync) and read on every request.
#[derive(Debug, Clone)]
pub struct McpConfig {
    /// Bearer token. None = no auth (only safe on loopback). When a token file exists it is
    /// loaded at startup; the user can also regenerate it from settings.
    pub token: Option<String>,
    pub core: bool,
    pub query: bool,
    pub write: bool,
}

impl Default for McpConfig {
    fn default() -> Self {
        // Core + Query default ON; Write default OFF (user opts in to mutating tools).
        Self {
            token: None,
            core: true,
            query: true,
            write: false,
        }
    }
}

/// The state shared with all axum handlers.
#[derive(Clone)]
pub struct McpServerState {
    pub app: AppHandle,
    pub config: Arc<RwLock<McpConfig>>,
}
