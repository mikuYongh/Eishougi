import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Server, Copy, RefreshCw, Eye, EyeOff, Power, Shield, Link2, Check,
} from "lucide-react";
import { useSettingsStore } from "../../stores/settingsStore";
import { toast } from "sonner";

interface McpStatus {
  running: boolean;
  port: number;
  url: string;
  token: string | null;
  core: boolean;
  query: boolean;
  write: boolean;
}

/**
 * Settings panel for the MCP HTTP server (the "expose this app to external AI tools" side).
 * Reads the real running state from the backend via `mcp_server_status` and drives it via the
 * mcp_server_* commands. The local settings store only mirrors port + tool-group toggles so
 * the UI stays responsive; the backend is the source of truth for the running state + token.
 */
export function McpServerPanel() {
  const { settings, updateSettings } = useSettingsStore();
  const [status, setStatus] = useState<McpStatus | null>(null);
  const [showToken, setShowToken] = useState(false);
  const [toggling, setToggling] = useState(false);

  const refresh = async () => {
    try {
      const s = await invoke<McpStatus>("mcp_server_status");
      setStatus(s);
      // Keep local mirror in sync with backend state so toggles reflect reality.
      updateSettings({
        mcpServer: {
          port: s.port,
          core: s.core,
          query: s.query,
          write: s.write,
        },
      });
    } catch (e) {
      console.warn("[MCP] status query failed:", e);
    }
  };

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 4000);
    return () => clearInterval(t);
  }, []);

  const toggleServer = async () => {
    if (!status || toggling) return;
    setToggling(true);
    try {
      const next = !status.running;
      await invoke("mcp_server_set_enabled", { enabled: next });
      await refresh();
      toast.success(next ? "MCP 服务已启动" : "MCP 服务已停止");
    } catch (e: any) {
      toast.error(`操作失败：${e?.message || e}`);
      await refresh();
    } finally {
      setToggling(false);
    }
  };

  const regenerateToken = async () => {
    try {
      const token = await invoke<string>("mcp_server_regenerate_token");
      await refresh();
      setShowToken(true);
      toast.success("已生成新 Token");
      void token;
    } catch (e: any) {
      toast.error(`生成失败：${e?.message || e}`);
    }
  };

  const updateGroup = async (group: "core" | "query" | "write", value: boolean) => {
    // Optimistically update local store, then push to backend.
    updateSettings({
      mcpServer: { ...settings.mcpServer, [group]: value },
    });
    try {
      await invoke("mcp_server_set_tool_groups", {
        core: group === "core" ? value : undefined,
        query: group === "query" ? value : undefined,
        write: group === "write" ? value : undefined,
      });
      await refresh();
    } catch (e: any) {
      toast.error(`更新失败：${e?.message || e}`);
      await refresh();
    }
  };

  const changePort = async (port: number) => {
    updateSettings({ mcpServer: { ...settings.mcpServer, port } });
    try {
      await invoke("mcp_server_set_port", { port });
      await refresh();
    } catch (e: any) {
      toast.error(`端口修改失败：${e?.message || e}`);
      await refresh();
    }
  };

  const copyConnectString = () => {
    if (!status || !status.token) {
      toast.error("请先生成 Token");
      return;
    }
    // Claude Desktop / Cursor mcpServers config snippet.
    const config = {
      mcpServers: {
        "prompt-muse": {
          url: status.url,
          token: status.token,
        },
      },
    };
    navigator.clipboard.writeText(JSON.stringify(config, null, 2));
    toast.success("已复制 MCP 连接配置到剪贴板");
  };

  const token = status?.token;
  const maskedToken = token ? `••••${token.slice(-6)}` : "未设置";

  return (
    <div className="glass-panel p-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-6 border-b border-[var(--glass-border)] pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-[var(--accent-2)]/20 text-[var(--accent-2)] border border-[var(--accent-2)]/20">
            <Server size={20} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-[var(--text-primary)] flex items-center gap-2">
              MCP 对外服务
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${status?.running ? "bg-green-500/20 text-green-400 border border-green-500/30" : "bg-white/5 text-[var(--text-secondary)] border border-[var(--glass-border)]"}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${status?.running ? "bg-green-400 animate-pulse" : "bg-gray-500"}`} />
                {status?.running ? "运行中" : "已停止"}
              </span>
            </h3>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              让外部 AI 工具（Claude Desktop / Cursor 等）通过 MCP 协议调用本应用的能力。
            </p>
          </div>
        </div>
        <button
          onClick={toggleServer}
          disabled={toggling}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-bold transition-all cursor-pointer ${status?.running ? "bg-red-500/10 text-red-400 border border-red-500/30 hover:bg-red-500/20" : "bg-green-500/15 text-green-400 border border-green-500/30 hover:bg-green-500/25"}`}
        >
          <Power size={15} className={toggling ? "animate-spin" : ""} />
          {status?.running ? "停止服务" : "启动服务"}
        </button>
      </div>

      <div className="space-y-5">
        {/* Connection URL + copy */}
        <div>
          <label className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-2 flex items-center gap-1.5">
            <Link2 size={12} /> 服务地址
          </label>
          <div className="flex items-center gap-2">
            <code className="flex-1 px-3 py-2 rounded-lg bg-[var(--bg-layer-1)] border border-[var(--glass-border)] text-[12px] font-mono text-[var(--accent-1)] truncate">
              {status?.url || `http://127.0.0.1:${settings.mcpServer.port}/mcp`}
            </code>
            <button
              onClick={copyConnectString}
              disabled={!status?.running}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[var(--glass-bg)] hover:bg-[var(--glass-bg-hover)] border border-[var(--glass-border)] text-[12px] font-bold text-[var(--text-primary)] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              title="复制 Claude Desktop / Cursor 用的连接配置 JSON"
            >
              <Copy size={13} /> 复制配置
            </button>
          </div>
        </div>

        {/* Port */}
        <div>
          <label className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-2 block">端口</label>
          <input
            type="number"
            min={1024}
            max={65535}
            value={settings.mcpServer.port}
            onChange={(e) => changePort(parseInt(e.target.value) || 21434)}
            className="w-32 px-3 py-2 rounded-lg bg-[var(--bg-layer-1)] border border-[var(--glass-border)] text-[12px] text-[var(--text-primary)] outline-none focus:border-[var(--accent-1)]/50"
          />
          <p className="text-[10px] text-[var(--text-secondary)] mt-1">修改端口会自动重启服务（若正在运行）。</p>
        </div>

        {/* Token */}
        <div>
          <label className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-2 flex items-center gap-1.5">
            <Shield size={12} /> 访问令牌 (Token)
          </label>
          <div className="flex items-center gap-2">
            <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--bg-layer-1)] border border-[var(--glass-border)]">
              <code className="flex-1 text-[12px] font-mono text-[var(--text-primary)] truncate">
                {showToken ? token || "未设置" : maskedToken}
              </code>
              <button
                onClick={() => setShowToken((v) => !v)}
                className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                title={showToken ? "隐藏" : "显示"}
              >
                {showToken ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <button
              onClick={regenerateToken}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[var(--glass-bg)] hover:bg-[var(--glass-bg-hover)] border border-[var(--glass-border)] text-[12px] font-bold text-[var(--text-primary)] transition-colors cursor-pointer"
            >
              <RefreshCw size={13} /> 生成 / 重置
            </button>
          </div>
          <p className="text-[10px] text-[var(--text-secondary)] mt-1">
            外部客户端必须携带此 Token 才能调用。建议保持开启以防止局域网内未授权访问。
          </p>
        </div>

        {/* Tool groups */}
        <div>
          <label className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-2 block">开放的工具范围</label>
          <div className="space-y-2">
            <ToolToggle
              label="核心工具"
              desc="搜索 / 创建项目、生成图片、查历史（默认开）"
              checked={settings.mcpServer.core}
              onChange={(v) => updateGroup("core", v)}
            />
            <ToolToggle
              label="查询工具"
              desc="角色 / 画师 / 工作流 / 模型库查询（只读，默认开）"
              checked={settings.mcpServer.query}
              onChange={(v) => updateGroup("query", v)}
            />
            <ToolToggle
              label="写入工具"
              desc="修改项目、添加收藏、创建工作流（默认关）"
              checked={settings.mcpServer.write}
              onChange={(v) => updateGroup("write", v)}
            />
          </div>
        </div>

        {/* Quick how-to */}
        <div className="rounded-lg bg-[var(--accent-2)]/5 border border-[var(--accent-2)]/20 p-3">
          <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
            <Check size={11} className="inline text-[var(--accent-2)] mr-1" />
            <strong className="text-[var(--text-primary)]">使用方式：</strong>
            启动服务后，点击「复制配置」把 JSON 粘贴到 Claude Desktop 的 <code className="text-[var(--accent-1)]">claude_desktop_config.json</code> 即可。AI 助手就能帮你管理提示词项目并触发生图。
          </p>
        </div>
      </div>
    </div>
  );
}

function ToolToggle({
  label, desc, checked, onChange,
}: {
  label: string; desc: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-[var(--bg-layer-1)] border border-[var(--glass-border)]">
      <div className="min-w-0">
        <p className="text-[13px] font-bold text-[var(--text-primary)]">{label}</p>
        <p className="text-[10px] text-[var(--text-secondary)] mt-0.5">{desc}</p>
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 cursor-pointer ${checked ? "bg-[var(--accent-1)]" : "bg-[var(--glass-bg-hover)]"}`}
      >
        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${checked ? "translate-x-5" : "translate-x-0.5"}`} />
      </button>
    </div>
  );
}
