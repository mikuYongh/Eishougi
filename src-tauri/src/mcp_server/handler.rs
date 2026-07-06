//! JSON-RPC 2.0 request handling for the MCP protocol.
//!
//! Implements the four MCP methods a tool-only server must speak:
//!   - initialize                      (handshake)
//!   - notifications/initialized       (client ack, no reply)
//!   - tools/list                      (advertise enabled tools)
//!   - tools/call                      (run a tool)
//!
//! The wire shapes mirror what our own MCP client (`commands/mcp.rs`) sends/expects, so any
//! compliant client (Claude Desktop, Cursor) can talk to this server.

use crate::mcp_server::state::McpServerState;
use crate::mcp_server::tools;
use axum::{
    extract::State,
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Json, Response},
};
use serde_json::{json, Value};

/// Version of the MCP protocol we advertise. Matches what our client sends.
const PROTOCOL_VERSION: &str = "2024-11-05";

/// The single MCP endpoint. Every JSON-RPC message (initialize, tools/list, tools/call, ...)
/// arrives as a POST here.
pub async fn handle(
    State(srv): State<McpServerState>,
    headers: HeaderMap,
    Json(req): Json<Value>,
) -> Response {
    // --- Auth: require Bearer token when one is configured. ---
    if let Some(expected) = srv.config.read().await.token.as_deref() {
        if !check_bearer(&headers, expected) {
            return (StatusCode::UNAUTHORIZED, "invalid or missing token").into_response();
        }
    }

    let method = req.get("method").and_then(|v| v.as_str()).unwrap_or("");
    let id = req.get("id").cloned();
    let is_notification = id.is_none();

    // --- initialize ---
    if method == "initialize" {
        // Create + return a session id. We don't strictly enforce sessions for tool-only use,
        // but compliant clients expect the header / field.
        let session_id = format!("pm-mcp-{}", uuid::Uuid::new_v4());
        let result = json!({
            "protocolVersion": PROTOCOL_VERSION,
            "capabilities": { "tools": {} },
            "serverInfo": { "name": "prompt-muse", "version": env!("CARGO_PKG_VERSION") },
            "sessionId": session_id,
        });
            let mut resp = json_rpc_response(id, result);
            if let (Ok(name), Ok(val)) = (
                "Mcp-Session-Id".parse::<axum::http::HeaderName>(),
                session_id.parse::<axum::http::HeaderValue>(),
            ) {
                resp.headers_mut().insert(name, val);
            }
            return resp;
    }

    // --- notifications/initialized (and any other notification): 202, no body ---
    if is_notification {
        return StatusCode::ACCEPTED.into_response();
    }

    // All remaining methods are requests and need a result keyed by id.
    let result = match method {
        "tools/list" => {
            let (core, query, write) = {
                let cfg = srv.config.read().await;
                (cfg.core, cfg.query, cfg.write)
            };
            let tools_list = tools::tools_list_payload(core, query, write);
            json!({ "tools": tools_list })
        }
        "tools/call" => {
            let params = req.get("params").cloned().unwrap_or(Value::Null);
            let name = params.get("name").and_then(|v| v.as_str()).unwrap_or("");
            let arguments = params.get("arguments").cloned().unwrap_or(json!({}));
            let (core, query, write) = {
                let cfg = srv.config.read().await;
                (cfg.core, cfg.query, cfg.write)
            };
            let (content, is_error) = tools::execute_tool(&srv.app, name, &arguments, core, query, write).await;
            json!({ "content": content, "isError": is_error })
        }
        _ => {
            // Unknown method → JSON-RPC error.
            let err = json!({
                "code": -32601,
                "message": format!("Method not found: {}", method),
            });
            return Json(json!({ "jsonrpc": "2.0", "id": id, "error": err }))
                .into_response();
        }
    };

    json_rpc_response(id, result)
}

fn json_rpc_response(id: Option<Value>, result: Value) -> Response {
    Json(json!({ "jsonrpc": "2.0", "id": id, "result": result })).into_response()
}

fn check_bearer(headers: &HeaderMap, expected: &str) -> bool {
    let auth = headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    let token = auth.strip_prefix("Bearer ").unwrap_or("").trim();
    // Constant-time-ish comparison to avoid timing leaks of the token.
    token.len() == expected.len() && token == expected
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::HeaderMap;

    fn make_header(token: &str) -> HeaderMap {
        let mut h = HeaderMap::new();
        h.insert("authorization", format!("Bearer {}", token).parse().unwrap());
        h
    }

    #[test]
    fn test_check_bearer_valid() {
        let headers = make_header("mytoken123");
        assert!(check_bearer(&headers, "mytoken123"));
    }

    #[test]
    fn test_check_bearer_invalid() {
        let headers = make_header("wrongtoken");
        assert!(!check_bearer(&headers, "mytoken123"));
    }

    #[test]
    fn test_check_bearer_missing() {
        let headers = HeaderMap::new();
        assert!(!check_bearer(&headers, "mytoken123"));
    }

    #[test]
    fn test_check_bearer_empty_token() {
        let headers = make_header("");
        assert!(!check_bearer(&headers, "mytoken123"));

        // When expected is empty (no auth configured) and no header
        let headers2 = HeaderMap::new();
        assert!(check_bearer(&headers2, ""));
    }

    #[test]
    fn test_check_bearer_malformed_header() {
        let mut headers = HeaderMap::new();
        headers.insert("authorization", "NotBearer token".parse().unwrap());
        assert!(!check_bearer(&headers, "token"));
    }
}
