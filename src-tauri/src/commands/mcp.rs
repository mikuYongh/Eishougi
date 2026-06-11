use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct McpToolDef {
    pub name: String,
    pub description: String,
    #[serde(rename = "inputSchema", default)]
    pub input_schema: serde_json::Value,
}

#[derive(Debug, Serialize, Deserialize)]
struct JsonRpcRequest {
    jsonrpc: String,
    method: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    params: Option<serde_json::Value>,
    id: u64,
}

#[derive(Debug, Deserialize)]
struct JsonRpcResponse {
    #[serde(default)]
    result: serde_json::Value,
    #[serde(default)]
    error: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
struct InitializeResult {
    #[serde(default)]
    #[allow(dead_code)]
    protocolVersion: String,
    #[allow(dead_code)]
    serverInfo: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
struct ToolsListResult {
    #[serde(default)]
    tools: Vec<McpToolDef>,
}

#[derive(Debug, Deserialize)]
struct ToolsCallResult {
    #[serde(default)]
    content: Vec<serde_json::Value>,
}

async fn mcp_notify(
    url: &str,
    session_id: &str,
    method: &str,
    params: Option<serde_json::Value>,
) -> Result<(), String> {
    let client = reqwest::Client::new();
    let body = serde_json::json!({
        "jsonrpc": "2.0",
        "method": method,
        "params": params,
    });

    let resp = client
        .post(url)
        .header("Content-Type", "application/json")
        .header("Accept", "application/json, text/event-stream")
        .header("Mcp-Session-Id", session_id)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("MCP notify failed: {}", e))?;

    let status = resp.status();
    if !status.is_success() {
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("MCP notify HTTP {}: {}", status.as_u16(), text));
    }
    Ok(())
}

async fn mcp_request(
    url: &str,
    session_id: Option<&str>,
    method: &str,
    params: Option<serde_json::Value>,
) -> Result<(Option<String>, serde_json::Value), String> {
    let client = reqwest::Client::new();
    let body = serde_json::json!({
        "jsonrpc": "2.0",
        "method": method,
        "params": params,
        "id": 1
    });

    let mut req = client
        .post(url)
        .header("Content-Type", "application/json")
        .header("Accept", "application/json, text/event-stream")
        .json(&body);

    if let Some(sid) = session_id {
        req = req.header("Mcp-Session-Id", sid);
    }

    let resp = req.send().await.map_err(|e| format!("MCP request failed: {}", e))?;
    let status = resp.status();
    let new_session_id = resp
        .headers()
        .get("Mcp-Session-Id")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());
    let content_type = resp
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();

    let text = resp.text().await.map_err(|e| format!("Failed to read MCP response: {}", e))?;

    if !status.is_success() {
        return Err(format!("MCP HTTP {}: {}", status.as_u16(), text));
    }

    let json_text = if content_type.contains("text/event-stream") || text.starts_with("event:") {
        text.lines()
            .filter(|l| l.starts_with("data: "))
            .map(|l| l.trim_start_matches("data: ").trim())
            .collect::<Vec<_>>()
            .join("")
    } else {
        text.clone()
    };

    if json_text.is_empty() {
        return Err(format!("MCP empty response body — {}", text));
    }

    let parsed: JsonRpcResponse =
        serde_json::from_str(&json_text).map_err(|e| format!("MCP parse error: {} — body: {}", e, text))?;

    if let Some(err) = parsed.error {
        return Err(format!("MCP RPC error: {}", err));
    }

    let sid = new_session_id.or(session_id.map(|s| s.to_string()));
    Ok((sid, parsed.result))
}

pub struct McpSession {
    pub url: String,
    pub session_id: Option<String>,
    pub tools: Vec<McpToolDef>,
}

impl McpSession {
    pub fn new(url: String) -> Self {
        Self { url, session_id: None, tools: Vec::new() }
    }

    pub async fn connect(&mut self) -> Result<(), String> {
        let params = serde_json::json!({
            "protocolVersion": "2024-11-05",
            "capabilities": {},
            "clientInfo": {
                "name": "prompt-muse",
                "version": "0.1.0"
            }
        });

        println!("[MCP] connecting to {} ...", self.url);
        let (sid, result) = mcp_request(&self.url, None, "initialize", Some(params)).await?;
        self.session_id = sid;
        serde_json::from_value::<InitializeResult>(result)
            .map_err(|e| format!("Failed to parse initialize result: {}", e))?;
        println!("[MCP] initialized, session: {:?}", self.session_id);
        Ok(())
    }

    pub async fn send_initialized(&self) -> Result<(), String> {
        if let Some(ref sid) = self.session_id {
            println!("[MCP] sending notifications/initialized");
            mcp_notify(&self.url, sid, "notifications/initialized", None).await?;
            println!("[MCP] notifications/initialized OK");
        }
        Ok(())
    }

    pub async fn list_tools(&mut self) -> Result<Vec<McpToolDef>, String> {
        let sid = self.session_id.as_deref().ok_or("MCP not initialized")?;
        println!("[MCP] listing tools...");
        let (_sid, result) = mcp_request(&self.url, Some(sid), "tools/list", None).await?;
        let list: ToolsListResult = serde_json::from_value(result)
            .map_err(|e| format!("Failed to parse tools/list: {}", e))?;
        self.tools = list.tools.clone();
        println!("[MCP] got {} tools", self.tools.len());
        Ok(list.tools)
    }

    pub async fn call_tool(
        &self,
        name: &str,
        arguments: HashMap<String, serde_json::Value>,
    ) -> Result<String, String> {
        let sid = self.session_id.as_deref().ok_or("MCP not initialized")?;
        let params = serde_json::json!({
            "name": name,
            "arguments": arguments
        });
        let (_sid, result) = mcp_request(&self.url, Some(sid), "tools/call", Some(params)).await?;
        let call_result: ToolsCallResult = serde_json::from_value(result)
            .map_err(|e| format!("Failed to parse tools/call: {}", e))?;

        let texts: Vec<String> = call_result
            .content
            .iter()
            .filter_map(|c| c.get("text").and_then(|t| t.as_str()).map(|s| s.to_string()))
            .collect();

        Ok(texts.join("\n"))
    }
}

#[tauri::command]
pub async fn list_mcp_tools(url: String) -> Result<Vec<McpToolDef>, String> {
    let mut session = McpSession::new(url);
    session.connect().await?;
    session.send_initialized().await?;
    session.list_tools().await
}

#[tauri::command]
pub async fn call_mcp_tool(
    url: String,
    name: String,
    arguments: HashMap<String, serde_json::Value>,
) -> Result<String, String> {
    let mut session = McpSession::new(url);
    session.connect().await?;
    session.send_initialized().await?;
    session.call_tool(&name, arguments).await
}
