//! MCP HTTP Server entry point.
//!
//! Runs an axum HTTP server inside Tauri's tokio runtime that speaks the Model Context Protocol
//! (Streamable HTTP transport). External AI tools connect to `http://127.0.0.1:<port>/mcp` and
//! call the app's capabilities as MCP tools.
//!
//! Lifecycle:
//!   - `init(app)` is called once from `lib.rs::setup()`. It loads the persisted config (token)
//!     from disk and, if enabled, spawns the server.
//!   - `set_enabled(app, enabled)` starts/stops the server and flips the persisted `enabled` flag.
//!   - The server task holds a `JoinHandle` behind a mutex; stopping cancels it.

pub mod handler;
pub mod state;
pub mod tools;

use crate::AppState;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{AppHandle, Manager};
use tokio::sync::{Mutex, RwLock};
use tokio::task::JoinHandle;

use state::{McpConfig, McpServerState};

const DEFAULT_PORT: u16 = 21434;

/// Persisted (in `app_data_dir/mcp_server.json`) server preferences.
#[derive(Debug, Clone, Serialize, Deserialize)]
struct PersistedConfig {
    #[serde(default)]
    enabled: bool,
    #[serde(default = "default_port")]
    port: u16,
    #[serde(default)]
    token: Option<String>,
    #[serde(default = "default_true")]
    core: bool,
    #[serde(default = "default_true")]
    query: bool,
    #[serde(default)]
    write: bool,
}
fn default_port() -> u16 {
    DEFAULT_PORT
}
fn default_true() -> bool {
    true
}
impl Default for PersistedConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            port: DEFAULT_PORT,
            token: None,
            core: true,
            query: true,
            write: false,
        }
    }
}

/// The global server controller. Stored once via `init` and accessed through `controller()`.
struct Controller {
    config: Arc<RwLock<McpConfig>>,
    /// The running server task, if any. None = stopped.
    task: Mutex<Option<JoinHandle<()>>>,
    port: RwLock<u16>,
    /// Where the persisted config file lives.
    config_path: PathBuf,
}

static CONTROLLER: tokio::sync::OnceCell<Arc<Controller>> = tokio::sync::OnceCell::const_new();

/// Initialise the MCP server subsystem. Call exactly once from `setup()`.
pub async fn init(app: &AppHandle) {
    let config_path = config_file_path(app);

    // Make sure AppState dir exists (it normally does, but be defensive on first run).
    if let Some(dir) = config_path.parent() {
        let _ = std::fs::create_dir_all(dir);
    }

    let persisted: PersistedConfig = std::fs::read_to_string(&config_path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default();

    let config = McpConfig {
        token: persisted.token.clone(),
        core: persisted.core,
        query: persisted.query,
        write: persisted.write,
    };
    let port = persisted.port;

    let controller = Arc::new(Controller {
        config: Arc::new(RwLock::new(config)),
        task: Mutex::new(None),
        port: RwLock::new(port),
        config_path: config_path.clone(),
    });
    CONTROLLER.set(controller).ok();

    if persisted.enabled {
        let _ = start_server(app.clone()).await;
    }
}

/// Status reported to the frontend.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpStatus {
    pub running: bool,
    pub port: u16,
    pub url: String,
    pub token: Option<String>,
    pub core: bool,
    pub query: bool,
    pub write: bool,
}

// ============================ Tauri commands ============================

#[tauri::command]
pub async fn mcp_server_status() -> Result<McpStatus, String> {
    let controller = controller().ok_or("MCP server not initialised")?;
    let config = controller.config.read().await;
    let port = *controller.port.read().await;
    let running = controller.task.lock().await.is_some();
    Ok(McpStatus {
        running,
        port,
        url: format!("http://127.0.0.1:{}/mcp", port),
        token: config.token.clone(),
        core: config.core,
        query: config.query,
        write: config.write,
    })
}

#[tauri::command]
pub async fn mcp_server_set_enabled(
    app: AppHandle,
    enabled: bool,
) -> Result<bool, String> {
    let controller = controller().ok_or("MCP server not initialised")?;
    if enabled {
        start_server(app).await?;
    } else {
        stop_server().await;
    }
    persist_enabled(controller, enabled).await;
    Ok(enabled)
}

#[tauri::command]
pub async fn mcp_server_regenerate_token() -> Result<String, String> {
    let controller = controller().ok_or("MCP server not initialised")?;
    // 32 bytes → ~43 base64url chars. Plenty of entropy for a local secret.
    let token = uuid::Uuid::new_v4().simple().to_string()
        + &uuid::Uuid::new_v4().simple().to_string();
    {
        let mut config = controller.config.write().await;
        config.token = Some(token.clone());
    }
    persist(controller).await;
    Ok(token)
}

#[tauri::command]
pub async fn mcp_server_clear_token() -> Result<(), String> {
    let controller = controller().ok_or("MCP server not initialised")?;
    {
        let mut config = controller.config.write().await;
        config.token = None;
    }
    persist(controller).await;
    Ok(())
}

/// Update tool-group toggles from the frontend settings.
#[tauri::command]
#[allow(non_snake_case)]
pub async fn mcp_server_set_tool_groups(
    core: Option<bool>,
    query: Option<bool>,
    write: Option<bool>,
) -> Result<(), String> {
    let controller = controller().ok_or("MCP server not initialised")?;
    {
        let mut config = controller.config.write().await;
        if let Some(v) = core {
            config.core = v;
        }
        if let Some(v) = query {
            config.query = v;
        }
        if let Some(v) = write {
            config.write = v;
        }
    }
    persist(controller).await;
    Ok(())
}

#[tauri::command]
pub async fn mcp_server_set_port(app: AppHandle, port: u16) -> Result<(), String> {
    let controller = controller().ok_or("MCP server not initialised")?;
    let was_running = controller.task.lock().await.is_some();
    if was_running {
        stop_server().await;
    }
    {
        *controller.port.write().await = port;
    }
    persist(controller).await;
    if was_running {
        start_server(app).await?;
    }
    Ok(())
}

// ============================ internals ============================

fn controller() -> Option<&'static Arc<Controller>> {
    CONTROLLER.get()
}

async fn start_server(app: AppHandle) -> Result<(), String> {
    let controller = controller().ok_or("MCP server not initialised")?;
    let mut task_guard = controller.task.lock().await;
    if task_guard.is_some() {
        return Ok(()); // already running
    }

    let port = *controller.port.read().await;
    let bind = format!("127.0.0.1:{}", port);

    let state = McpServerState {
        app: app.clone(),
        config: controller.config.clone(),
    };

    // CORS: allow any origin (localhost dev tools, etc.). Token auth still gates access.
    let cors = tower_http::cors::CorsLayer::very_permissive();
    let app_router = axum::Router::new()
        .route("/mcp", axum::routing::post(handler::handle))
        .layer(cors)
        .with_state(state);

    let listener = tokio::net::TcpListener::bind(&bind)
        .await
        .map_err(|e| format!("Failed to bind {}: {}", bind, e))?;
    log::info!("[MCP] server listening on {}", bind);

    let handle = tokio::spawn(async move {
        if let Err(e) = axum::serve(listener, app_router).await {
            log::error!("[MCP] server error: {}", e);
        }
    });
    *task_guard = Some(handle);
    Ok(())
}

async fn stop_server() {
    let Some(controller) = controller() else {
        return;
    };
    let mut task_guard = controller.task.lock().await;
    if let Some(handle) = task_guard.take() {
        handle.abort();
        log::info!("[MCP] server stopped");
    }
}

async fn persist_enabled(controller: &Controller, enabled: bool) {
    let on_disk: PersistedConfig = std::fs::read_to_string(&controller.config_path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default();
    let mut on_disk = on_disk;
    on_disk.enabled = enabled;
    {
        let config = controller.config.read().await;
        let port = *controller.port.read().await;
        on_disk.token = config.token.clone();
        on_disk.core = config.core;
        on_disk.query = config.query;
        on_disk.write = config.write;
        on_disk.port = port;
    }
    write_config(controller, &on_disk);
}

async fn persist(controller: &Controller) {
    let on_disk: PersistedConfig = std::fs::read_to_string(&controller.config_path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default();
    let mut on_disk = on_disk;
    {
        let config = controller.config.read().await;
        let port = *controller.port.read().await;
        on_disk.token = config.token.clone();
        on_disk.core = config.core;
        on_disk.query = config.query;
        on_disk.write = config.write;
        on_disk.port = port;
    }
    write_config(controller, &on_disk);
}

fn write_config(controller: &Controller, cfg: &PersistedConfig) {
    if let Ok(s) = serde_json::to_string_pretty(cfg) {
        if let Err(e) = std::fs::write(&controller.config_path, s) {
            log::warn!("[MCP] failed to persist config: {}", e);
        }
    }
}

fn config_file_path(app: &AppHandle) -> PathBuf {
    // Prefer the canonical AppState dir (hardcoded on Android, set at startup elsewhere).
    if let Some(state) = app.try_state::<AppState>() {
        return state.app_data_dir.join("mcp_server.json");
    }
    PathBuf::from("mcp_server.json")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_config() {
        let cfg = PersistedConfig::default();
        assert!(!cfg.enabled);
        assert_eq!(cfg.port, DEFAULT_PORT);
        assert!(cfg.core);
        assert!(cfg.query);
        assert!(!cfg.write);
        assert!(cfg.token.is_none());
    }

    #[test]
    fn test_persisted_config_default_true_fn() {
        assert!(default_true());
    }

    #[test]
    fn test_default_port_fn() {
        assert_eq!(default_port(), DEFAULT_PORT);
    }
}

