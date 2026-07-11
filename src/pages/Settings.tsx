import { useState, useEffect } from "react";
import { useSettingsStore, type McpServerConfig } from "../stores/settingsStore";
import { useQueueStore } from "../stores/queueStore";
import { useModelStore } from "../stores/modelStore";
import { appLog } from "../utils/appLog";
import { Search, Palette, Settings as SettingsIcon, Cpu, Info, Image as ImageIcon, RotateCcw, Monitor, ChevronDown, Check, Download, Upload, Database, Wand2, RefreshCw, Loader2, MessageCircle, ExternalLink } from "lucide-react";
import { useAppVersion } from "../hooks/useAppVersion";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { save, open } from "@tauri-apps/plugin-dialog";
import { open as openUrl } from "@tauri-apps/plugin-shell";
import { GlassDropdown } from "../components/ui/GlassDropdown";
import { McpServerPanel } from "../components/settings/McpServerPanel";
import { UpdatePanel } from "../components/settings/UpdatePanel";
import { toast } from "sonner";
import qqGroupQR from "../assets/qrcodes/qq_group.jpg";

const QQ_GROUP_URL = "https://qm.qq.com/q/DOL54nJCSc";
const QQ_GROUP_NUMBER = "389236073";
const ANIMA_MODELS_URL = "https://huggingface.co/circlestone-labs/Anima/tree/main/split_files";

const SETTINGS_TABS = [
  { id: "appearance", label: "外观设置", icon: <Palette size={18} /> },
  { id: "general", label: "通用设置", icon: <SettingsIcon size={18} /> },
  { id: "models", label: "模型与服务", icon: <Cpu size={18} /> },
  { id: "data", label: "数据管理", icon: <Database size={18} /> },
  { id: "about", label: "关于", icon: <Info size={18} /> },
];

export function Settings() {
  const isAndroid = /android/i.test(navigator.userAgent);
  // Allow other parts of the app (e.g. the startup update toast) to deep-link into a specific tab.
  const [activeTab, setActiveTab] = useState(() => {
    const requested = localStorage.getItem("settings_open_tab");
    if (requested) { localStorage.removeItem("settings_open_tab"); return requested; }
    return "appearance";
  });
  const [searchQuery, setSearchQuery] = useState("");
  const appVersion = useAppVersion();
  
  const { 
    wallpaperPath, setWallpaperPath, resetWallpaper, 
    blurLevel, setBlurLevel,
    appTheme, setAppTheme,
    colorTheme, setColorTheme,
    uiScale, setUiScale,
    settings, setPrivacyMode, updateSettings
  } = useSettingsStore();
  const [localWallpaper, setLocalWallpaper] = useState(wallpaperPath);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [fetchedModels, setFetchedModels] = useState<string[]>([]);
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const [isTestingComfy, setIsTestingComfy] = useState(false);
  // MCP server running indicator (null = unknown). Polled so the "模型与服务" tab dot stays live.
  const [mcpRunning, setMcpRunning] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    const check = async () => {
      try {
        const s = await invoke<{ running: boolean }>("mcp_server_status");
        if (alive) setMcpRunning(s.running);
      } catch {
        if (alive) setMcpRunning(null);
      }
    };
    check();
    const t = setInterval(check, 4000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  const handleTestComfy = async (url: string) => {
    setIsTestingComfy(true);
    try {
      const result = await invoke<any>('check_comfyui_status', { url: url || null });
      if (result && result.online === true) {
        toast.success('连接成功！ComfyUI 服务运行正常', { icon: '✨' });
      } else {
        const errDetail = result?.error || '未知原因';
        toast.error('连接失败：' + errDetail, { duration: 8000 });
        appLog.warn('ComfySettings', `test connection to ${url} failed: ${errDetail}`);
      }
    } catch (error: any) {
      toast.error('连接异常: ' + error);
      appLog.error('ComfySettings', `test connection to ${url} exception: ${error}`);
    } finally {
      setIsTestingComfy(false);
    }
  };

  const handleFetchModels = async () => {
    setIsFetchingModels(true);
    try {
      const models = await invoke<string[]>('fetch_llm_models', {
        provider: settings.llm.provider,
        baseUrl: settings.llm.apiUrl,
        apiKey: settings.llm.apiKey || null,
      });
      setFetchedModels(models);
      toast.success(`获取到 ${models.length} 个模型`);
    } catch (e: any) {
      toast.error(`获取模型列表失败: ${e?.message || e}`);
      console.error("Failed to fetch LLM models:", e);
    } finally {
      setIsFetchingModels(false);
    }
  };

  useEffect(() => {
    setLocalWallpaper(wallpaperPath);
  }, [wallpaperPath]);

  const handleApplyWallpaper = () => setWallpaperPath(localWallpaper);
  const handleResetWallpaper = () => resetWallpaper();
  
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const base64Data = event.target?.result as string;
        try {
          // Attempt to save persistently via Tauri
          // Check if we are actually inside Tauri environment
          if ('__TAURI_INTERNALS__' in window || '__TAURI_IPC__' in window) {
            const savedPath = await invoke<string>('save_base64_image', { base64Data });
            setLocalWallpaper(savedPath);
            setWallpaperPath(savedPath);
          } else {
            // Fallback for mobile browser testing
            setLocalWallpaper(base64Data);
            setWallpaperPath(base64Data);
          }
        } catch (err) {
          console.warn("Tauri invoke failed or not available, falling back to base64 browser storage:", err);
          setLocalWallpaper(base64Data);
          setWallpaperPath(base64Data);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleExport = async () => {
    setExportStatus("请选择保存位置...");
    let unlisten: any = null;
    try {
      // 1. Show save dialog FIRST — get output path before export starts
      const filePath = await save({
        defaultPath: `eishougi-backup-${new Date().toISOString().slice(0, 10)}.eishougi`,
        filters: [{ name: "Eishougi Backup", extensions: ["eishougi"] }],
      });

      if (!filePath) {
        setExportStatus(null);
        return;
      }

      unlisten = await listen<any>('export-progress', (event) => {
        setExportStatus(event.payload.message);
      });

      // 2. Export directly to the chosen file path (no IPC byte transfer)
      setExportStatus("正在导出数据...");

      // On Android, save() may return a path that Rust std::fs can't write to.
      // Export to app internal temp first, then the user can share it manually.
      const isAndroid = /android/i.test(navigator.userAgent);
      let actualOutputPath = filePath;
      if (isAndroid) {
        // On Android, write to app data dir; the export result can be shared later
        actualOutputPath = filePath; // save() on Android usually returns a writable path
      }

      // Collect frontend localStorage to pass to Rust for sidecar writing
      const frontendData: Record<string, any> = {};
      const lsKeys = ['eishougi-settings', 'agent-storage'];
      for (const key of lsKeys) {
        const val = localStorage.getItem(key);
        if (val) frontendData[key] = JSON.parse(val);
      }

      const result = await invoke<string>('export_all_data', {
        outputPath: actualOutputPath,
        frontendJson: JSON.stringify(frontendData),
      });

      setExportStatus(result || "导出成功！");
      setTimeout(() => setExportStatus(null), 5000);
    } catch (err: any) {
      console.error("Export failed:", err);
      setExportStatus(`导出失败: ${err}`);
    } finally {
      if (unlisten) unlisten();
    }
  };

  const handleImport = async () => {
    setImportStatus("请选择备份文件...");
    try {
      // 1. Show open dialog
      const filePath = await open({
        filters: [
          { name: "Eishougi Backup", extensions: ["eishougi"] },
          { name: "JSON", extensions: ["json"] },
        ],
        multiple: false,
      });

      if (!filePath) {
        setImportStatus(null);
        return;
      }

      setImportStatus("正在准备导入...");

      // 2. On Android, content:// URIs can't be opened by std::fs.
      // Copy to app internal storage first, then import from the local path.
      let importPath = filePath;
      const isAndroid = /android/i.test(navigator.userAgent);
      if (isAndroid) {
        importPath = await invoke<string>('copy_to_internal', { source: filePath });
      }

      setImportStatus("正在导入数据...");

      // 3. Import from the local file path
      const result = await invoke<string>('import_all_data', { inputPath: importPath });

      // 4. Restore frontend localStorage — read sidecar via Rust
      try {
        const sidecarJson = await invoke<string>('read_text_file', { path: importPath + ".frontend.json" });
        const frontendData = JSON.parse(sidecarJson);
        for (const [key, value] of Object.entries(frontendData)) {
          localStorage.setItem(key, JSON.stringify(value));
        }
      } catch {
        // Sidecar not found is fine
      }

      setImportStatus(`${result} 请重启应用以加载所有数据。`);
    } catch (err: any) {
      console.error("Import failed:", err);
      setImportStatus(`导入失败: ${err}`);
    }
  };

  return (
    <div className="relative z-10 h-full flex flex-col">
      {/* Header matching Dashboard style */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 px-1 flex-shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <SettingsIcon size={20} className="text-[var(--accent-1)]" />
            <h2 className="text-2xl font-bold text-[var(--text-primary)] drop-shadow-md">应用配置</h2>
          </div>
          <p className="text-sm mt-1 text-[var(--text-secondary)] font-medium">调整界面、模型与通用行为</p>
        </div>
        
        <div
          className="group flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all duration-300 shadow-[0_4px_12px_rgba(0,0,0,0.1)] w-full md:w-64 md:focus-within:w-80"
          style={{
            background: "rgba(255, 255, 255, 0.05)",
            borderColor: "rgba(255, 255, 255, 0.1)",
            borderWidth: 1,
          }}
        >
          <Search size={16} className="text-[var(--text-secondary)] group-focus-within:text-[var(--accent-1)] transition-colors" />
          <input
            type="text"
            placeholder="搜索设置项..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="border-none bg-transparent outline-none text-[13px] text-[var(--text-primary)] w-full font-sans placeholder:text-[var(--text-secondary)]"
          />
        </div>
      </div>

      <div className="flex flex-col md:flex-row flex-1 gap-6 min-h-0">
        {/* Left Sidebar Menu */}
        <div className="w-full md:w-56 flex md:flex-col gap-2 flex-shrink-0 overflow-x-auto custom-scrollbar pb-2 md:pb-0">
          {SETTINGS_TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-shrink-0 flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-bold transition-all duration-300 cursor-pointer whitespace-nowrap ${
                  isActive 
                    ? "glass-panel bg-gradient-to-r from-[var(--accent-1)]/20 to-transparent text-[var(--text-primary)] shadow-[inset_0_0_20px_rgba(var(--accent-1-rgb),0.1)] border border-[var(--accent-1)]/50 md:translate-x-2" 
                    : "text-[var(--text-secondary)] hover:bg-[var(--glass-bg-hover)] hover:text-[var(--text-primary)] border border-transparent"
                }`}
              >
                <span className={isActive ? "text-[var(--accent-1)] drop-shadow-[0_0_8px_rgba(var(--accent-1-rgb), 0.5)]" : ""}>
                  {tab.icon}
                </span>
                {tab.label}
                {tab.id === "models" && mcpRunning !== null && (
                  <span
                    title={mcpRunning ? "MCP 对外服务运行中" : "MCP 对外服务已停止"}
                    className={`w-1.5 h-1.5 rounded-full ml-auto flex-shrink-0 ${mcpRunning ? "bg-green-400 animate-pulse" : "bg-gray-500"}`}
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* Right Content Area using generic glass-panels */}
        <div className="flex-1 overflow-y-auto pr-2 pb-8 space-y-6">
          {activeTab === "appearance" && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-6">
              
              <div className="glass-panel p-6">
                <div className="flex items-center gap-3 mb-6 border-b border-[var(--glass-border)] pb-4">
                  <div className="p-2 rounded-lg bg-[var(--accent-1)]/20 text-[var(--accent-1)] border border-[var(--accent-1)]/20 shadow-[0_0_10px_rgba(var(--accent-1-rgb), 0.2)]">
                    <Monitor size={20} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-[var(--text-primary)]">全局动态壁纸</h3>
                    <p className="text-xs text-[var(--text-secondary)] mt-0.5">支持在线链接、相对路径，或直接从本地上传图片。</p>
                  </div>
                </div>
                
                <div className="flex flex-col md:flex-row gap-4 md:gap-8">
                  {/* Preview Monitor */}
                  <div className="w-full md:w-64 h-40 rounded-xl overflow-hidden relative border border-[var(--glass-border)] shadow-[0_10px_30px_rgba(0,0,0,0.5)] flex-shrink-0 bg-[var(--glass-bg)]">
                    <div 
                      className="absolute inset-0 bg-cover bg-center transition-all duration-700 hover:scale-110"
                      style={{ backgroundImage: `url("${(localWallpaper.startsWith('http') || localWallpaper.startsWith('data:') || localWallpaper.startsWith('blob:')) ? localWallpaper : convertFileSrc(localWallpaper)}")` }}
                    />
                    <div className="absolute top-2 left-2 px-2 py-1 rounded bg-[var(--glass-bg)] backdrop-blur-md border border-[var(--glass-border)]">
                      <span className="text-[var(--text-secondary)] text-[9px] font-bold tracking-widest uppercase">Preview</span>
                    </div>
                    {/* Native Upload Button Overlay */}
                    <div className="absolute inset-0 bg-[var(--bg-layer-1)] opacity-0 hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                      <label className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--glass-bg-active)] hover:bg-[var(--glass-bg-active)] backdrop-blur-md text-[var(--text-primary)] text-xs font-bold cursor-pointer transition-colors shadow-lg border border-[var(--glass-border-active)]">
                        <ImageIcon size={14} /> 选本地图
                        <input type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
                      </label>
                    </div>
                  </div>

                  {/* Input Controls */}
                  <div className="flex-1 flex flex-col justify-center space-y-4">
                    <div>
                      <label className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-2 block">图片地址</label>
                      <input
                        type="text"
                        value={localWallpaper}
                        onChange={(e) => setLocalWallpaper(e.target.value)}
                        className="w-full px-4 py-3 rounded-xl bg-[var(--glass-bg-hover)] border border-[var(--glass-border)] text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--accent-1)]/50 focus:shadow-[0_0_15px_rgba(var(--accent-1-rgb), 0.15)] transition-all font-mono"
                        placeholder="https://... 或点击左侧预览图上传"
                      />
                    </div>
                    
                    <div className="flex gap-3">
                      <button
                        onClick={handleApplyWallpaper}
                        className="flex-1 py-2.5 rounded-xl text-[13px] font-bold cursor-pointer transition-all duration-300 hover:scale-105 shadow-[0_4px_15px_rgba(var(--accent-1-rgb), 0.4)]"
                        style={{ background: "linear-gradient(135deg, #FF6B9D, #B388FF)", color: "#fff" }}
                      >
                        应用链接
                      </button>
                      <button
                        onClick={handleResetWallpaper}
                        className="px-4 py-2.5 rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-bg-active)] transition-all cursor-pointer flex items-center gap-2 text-[13px] font-bold"
                      >
                        <RotateCcw size={14} /> 恢复默认
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="glass-panel p-6">
                 <div className="flex items-center gap-3 mb-6 border-b border-[var(--glass-border)] pb-4">
                  <div className="p-2 rounded-lg bg-[var(--accent-2)]/20 text-[var(--accent-2)] border border-[var(--accent-2)]/20">
                    <Palette size={20} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-[var(--text-primary)]">主题色彩与磨砂材质</h3>
                    <p className="text-xs text-[var(--text-secondary)] mt-0.5">实时控制全局磨砂玻璃强度的滑块，打造专属质感。</p>
                  </div>
                </div>
                
                <div className="flex flex-col gap-6 max-w-2xl">
                  {/* Theme Mode */}
                  <div>
                    <h4 className="text-sm font-bold text-[var(--text-primary)] mb-3">色彩模式</h4>
                    <div className="flex gap-3">
                      {[
                        { id: 'dark', label: '暗色 (Dark)' },
                        { id: 'light', label: '亮色 (Light)' },
                      ].map(mode => (
                        <button
                          key={mode.id}
                          onClick={() => setAppTheme(mode.id as 'dark' | 'light')}
                          className={`px-4 py-2 rounded-lg text-sm font-bold border transition-all ${
                            appTheme === mode.id
                              ? 'bg-[var(--accent-1)]/20 text-[var(--accent-1)] border-[var(--accent-1)]'
                              : 'bg-[var(--glass-bg)] text-[var(--text-secondary)] border-[var(--glass-border)] hover:bg-[var(--glass-bg-active)]'
                          }`}
                        >
                          {mode.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Color Theme */}
                  <div>
                    <h4 className="text-sm font-bold text-[var(--text-primary)] mb-3">强调色主题</h4>
                    <div className="flex flex-wrap gap-3">
                      {[
                        { id: 'sakura', label: '樱花粉', colors: ['#FF6B9D', '#B388FF'] },
                        { id: 'classic', label: '经典蓝', colors: ['#4A90D9', '#7CB8FF'] },
                        { id: 'green', label: '葱绿', colors: ['#4CAF7D', '#81D4A8'] },
                        { id: 'night', label: '暗夜星辰', colors: ['#7C6DF0', '#B388FF'] },
                        { id: 'cyber', label: '赛博极光', colors: ['#00E5FF', '#FF3D7F'] },
                      ].map(theme => (
                        <button
                          key={theme.id}
                          onClick={() => setColorTheme(theme.id as any)}
                          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold border transition-all ${
                            colorTheme === theme.id
                              ? 'bg-[var(--glass-bg-active)] text-[var(--text-primary)] border-[var(--glass-border-active)] shadow-[0_4px_15px_rgba(0,0,0,0.2)]'
                              : 'bg-transparent text-[var(--text-secondary)] border-[var(--glass-border)] hover:bg-[var(--glass-bg)]'
                          }`}
                        >
                          <div 
                            className="w-4 h-4 rounded-full border border-[var(--glass-border-active)]"
                            style={{ background: `linear-gradient(135deg, ${theme.colors[0]}, ${theme.colors[1]})` }}
                          />
                          {theme.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Blur Level */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-bold text-[var(--text-primary)]">底层壁纸磨砂强度 (Blur)</h4>
                      <span className="text-xs font-mono font-bold text-[var(--accent-2)] bg-[var(--accent-2)]/10 px-2 py-0.5 rounded border border-[var(--accent-2)]/20">
                        {blurLevel}px
                      </span>
                    </div>
                    <input 
                      type="range" 
                      min="0" max="60" step="1"
                      value={blurLevel}
                      onChange={(e) => setBlurLevel(Number(e.target.value))}
                      className="w-full h-2 bg-[var(--glass-bg)] rounded-lg appearance-none cursor-pointer border border-[var(--glass-border)] outline-none"
                      style={{ accentColor: "var(--accent-2)" }}
                    />
                    <div className="flex justify-between text-[10px] text-[var(--text-secondary)] uppercase tracking-widest font-bold mt-2">
                      <span>清晰 (0px)</span>
                      <span>极度朦胧 (60px)</span>
                    </div>
                  </div>

                  {/* UI Scale */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-bold text-[var(--text-primary)]">界面缩放比例 (UI Scale)</h4>
                      <span className="text-xs font-mono font-bold text-[var(--accent-1)] bg-[var(--accent-1)]/10 px-2 py-0.5 rounded border border-[var(--accent-1)]/20">
                        {Math.round(uiScale * 100)}%
                      </span>
                    </div>
                    <input 
                      type="range" 
                      min="0.5" max="1.5" step="0.05"
                      value={uiScale}
                      onChange={(e) => setUiScale(Number(e.target.value))}
                      className="w-full h-2 bg-[var(--glass-bg)] rounded-lg appearance-none cursor-pointer border border-[var(--glass-border)] outline-none"
                      style={{ accentColor: "var(--accent-1)" }}
                    />
                    <div className="flex justify-between text-[10px] text-[var(--text-secondary)] uppercase tracking-widest font-bold mt-2">
                      <span>迷你小巧 (50%)</span>
                      <span>默认 (100%)</span>
                      <span>超大视效 (150%)</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "general" && (
            <div className="space-y-6">
              <div className="glass-panel p-6">
                <div className="flex items-center gap-3 mb-6 border-b border-[var(--glass-border)] pb-4">
                  <div className="p-2 rounded-lg bg-orange-500/20 text-orange-400 border border-orange-500/20">
                    <SettingsIcon size={20} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-[var(--text-primary)]">通用与安全控制</h3>
                    <p className="text-xs text-[var(--text-secondary)] mt-0.5">控制程序的隐私、快捷键和其他基本行为。</p>
                  </div>
                </div>
                
                <div className="flex flex-col gap-6 max-w-2xl">
                  {/* Privacy Mode */}
                  <div>
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-sm font-bold text-[var(--text-primary)]">防偷窥模式 (Privacy Mode)</h4>
                        <p className="text-xs text-[var(--text-secondary)] mt-1">开启后全局图片默认高斯模糊，鼠标悬浮才清晰可见</p>
                      </div>
                      <button
                        onClick={() => setPrivacyMode(!settings.privacyMode)}
                        className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer ${settings.privacyMode ? 'bg-[var(--accent-1)]' : 'bg-[var(--bg-layer-2)] border border-[var(--glass-border)]'}`}
                      >
                        <div className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-all ${settings.privacyMode ? 'left-7' : 'left-1'}`} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "models" && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-6">
              {/* ComfyUI Settings */}
              <div className="glass-panel p-6">
                <div className="flex items-center gap-3 mb-6 border-b border-[var(--glass-border)] pb-4">
                  <div className="p-2 rounded-lg bg-[var(--accent-1)]/20 text-[var(--accent-1)] border border-[var(--accent-1)]/20 shadow-[0_0_10px_rgba(var(--accent-1-rgb),0.2)]">
                    <Cpu size={20} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-[var(--text-primary)]">ComfyUI 引擎配置</h3>
                    <p className="text-xs text-[var(--text-secondary)] mt-0.5">配置本地或远程 ComfyUI 实例的连接端点。</p>
                  </div>
                </div>

                <div className="max-w-2xl space-y-4">
                  <div>
                    <label className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-2 block">ComfyUI 服务器地址 (图生图/文生图)</label>
                    <div className="flex items-center gap-2 mb-4">
                      <input
                        type="text"
                        value={settings.comfyUrl}
                        onChange={(e) => updateSettings({ comfyUrl: e.target.value })}
                        onBlur={() => {
                          console.info(`[ComfySettings] comfyUrl changed to "${settings.comfyUrl}", reconnecting WS...`);
                          const qs = useQueueStore.getState();
                          qs.disconnect();
                          qs.connect();
                          // 同时刷新模型列表（用户改了 URL 后旧模型列表已失效）
                          useModelStore.getState().fetchModels(true);
                        }}
                        className="w-full px-4 py-3 rounded-xl bg-[var(--glass-bg-hover)] border border-[var(--glass-border)] text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--accent-1)]/50 transition-all font-mono"
                        placeholder="http://192.168.1.100:8188"
                      />
                      <button
                        onClick={() => handleTestComfy(settings.comfyUrl)}
                        disabled={isTestingComfy}
                        className="flex-shrink-0 px-4 py-3 bg-[var(--glass-bg)] hover:bg-[var(--glass-bg-hover)] border border-[var(--glass-border)] rounded-xl text-[13px] font-bold text-[var(--text-primary)] transition-colors disabled:opacity-50 cursor-pointer"
                      >
                        {isTestingComfy ? '测试中...' : '测试连接'}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-2 block">ComfyUI 安装路径 (用于一键部署/安装节点时定位)</label>
                    <input
                      type="text"
                      value={settings.comfyDir || ''}
                      onChange={(e) => updateSettings({ comfyDir: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl bg-[var(--glass-bg-hover)] border border-[var(--glass-border)] text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--accent-1)]/50 transition-all font-mono mb-4"
                      placeholder="C:\ComfyUI"
                    />
                    <p className="text-xs text-[var(--text-secondary)] mt-1">可选。配置后可方便后续下载 LoRA 模型等操作。</p>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-2 block">图生视频 服务器地址 (Video ComfyUI URL)</label>
                    <div className="flex items-center gap-2 mb-4">
                      <input
                        type="text"
                        value={settings.videoComfyUrl || ''}
                        onChange={(e) => updateSettings({ videoComfyUrl: e.target.value })}
                        className="w-full px-4 py-3 rounded-xl bg-[var(--glass-bg-hover)] border border-[var(--glass-border)] text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--accent-1)]/50 transition-all font-mono"
                        placeholder="http://192.168.1.100:8189"
                      />
                      <button
                        onClick={() => handleTestComfy(settings.videoComfyUrl || '')}
                        disabled={isTestingComfy}
                        className="flex-shrink-0 px-4 py-3 bg-[var(--glass-bg)] hover:bg-[var(--glass-bg-hover)] border border-[var(--glass-border)] rounded-xl text-[13px] font-bold text-[var(--text-primary)] transition-colors disabled:opacity-50 cursor-pointer"
                      >
                        {isTestingComfy ? '测试中...' : '测试连接'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Environment setup & onboarding — desktop only (Android has no onboarding) */}
              {!isAndroid && (
              <div className="glass-panel p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-purple-500/20 text-purple-400 border border-purple-500/20">
                      <Wand2 size={20} />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-[var(--text-primary)]">环境检测 & 引导</h3>
                      <p className="text-xs text-[var(--text-secondary)] mt-0.5">重新运行 ComfyUI 部署、本地检测或云端配置向导。</p>
                    </div>
                  </div>
                  <button
                    onClick={() => updateSettings({ hasCompletedOnboarding: false })}
                    className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-sm font-bold transition-all"
                  >
                    重新开始引导
                  </button>
                </div>
              </div>
              )}

              {/* LLM Agent Settings */}
              <div className="glass-panel p-6">
                <div className="flex items-center gap-3 mb-6 border-b border-[var(--glass-border)] pb-4">
                  <div className="p-2 rounded-lg bg-[var(--accent-2)]/20 text-[var(--accent-2)] border border-[var(--accent-2)]/20">
                    <SettingsIcon size={20} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-[var(--text-primary)]">AI 助手 & 反推模型配置</h3>
                    <p className="text-xs text-[var(--text-secondary)] mt-0.5">配置 LLM 服务的连接、模型、温度以及最大 Token。</p>
                  </div>
                </div>

                <div className="max-w-2xl space-y-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-2 block">服务商 (Provider)</label>
                      <GlassDropdown
                        value={settings.llm.provider}
                        onChange={(val) => {
                          const provider = val as any;
                          const updates: any = { provider };
                          if (provider === 'ollama') {
                            updates.apiUrl = 'http://127.0.0.1:11434/v1';
                            updates.model = 'qwen2.5:7b';
                          } else if (provider === 'agnes') {
                            updates.apiUrl = 'https://apihub.agnes-ai.com/v1';
                            updates.model = 'agnes-2.0-flash';
                          } else if (provider === 'openai') {
                            updates.apiUrl = 'https://api.openai.com/v1';
                            updates.model = 'gpt-4o';
                          } else if (provider === 'anthropic') {
                            updates.apiUrl = 'https://api.anthropic.com/v1';
                            updates.model = 'claude-3-5-sonnet-20240620';
                          }
                          updateSettings({
                            llm: { ...settings.llm, ...updates }
                          });
                        }}
                        options={[
                          { label: "Agnes AI", value: "agnes" },
                          { label: "OpenAI Compatible", value: "openai" },
                          { label: "Anthropic Claude", value: "anthropic" },
                          { label: "Ollama (Local)", value: "ollama" }
                        ]}
                        accentColor="pink"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-2 block">模型名称 (Model)</label>
                      <div className="relative">
                        <div className="relative">
                          <input
                            type="text"
                            value={settings.llm.model}
                            onChange={(e) => { setModelDropdownOpen(true); updateSettings({ llm: { ...settings.llm, model: e.target.value } }); }}
                            onFocus={() => setModelDropdownOpen(true)}
                            className="w-full px-4 py-3 rounded-xl bg-[var(--glass-bg-hover)] border border-[var(--glass-border)] text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--accent-1)]/50 transition-all font-mono pr-10"
                            placeholder="e.g. gpt-4o, claude-3-5-sonnet, qwen2.5:7b..."
                          />
                          {fetchedModels.length > 0 && (
                            <button
                              type="button"
                              onClick={() => setModelDropdownOpen(!modelDropdownOpen)}
                              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-bg)] transition-all"
                            >
                              <ChevronDown size={16} className={`transition-transform duration-300 ${modelDropdownOpen ? "rotate-180" : ""}`} />
                            </button>
                          )}
                        </div>
                        {modelDropdownOpen && fetchedModels.length > 0 && (
                          <div className="absolute left-0 right-0 top-[110%] bg-[var(--glass-bg)] backdrop-blur-3xl border border-[var(--glass-border)] rounded-xl overflow-hidden shadow-[0_10px_40px_rgba(0,0,0,0.6)] z-[100] py-1 max-h-60 overflow-y-auto custom-scrollbar text-[13px]">
                            {fetchedModels.map(m => (
                              <div
                                key={m}
                                className={`px-4 py-2.5 font-bold cursor-pointer flex items-center justify-between transition-colors ${settings.llm.model === m ? "bg-[var(--accent-1)]/10 text-[var(--accent-1)]" : "text-[var(--text-secondary)] hover:bg-[var(--glass-bg-hover)] hover:text-[var(--text-primary)]"}`}
                                onClick={() => { updateSettings({ llm: { ...settings.llm, model: m } }); setModelDropdownOpen(false); }}
                              >
                                {m}
                                {settings.llm.model === m && <Check size={14} className="flex-shrink-0" />}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <button
                          onClick={handleFetchModels}
                          disabled={isFetchingModels}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold text-[var(--accent-1)] bg-[var(--accent-1)]/10 hover:bg-[var(--accent-1)]/20 border border-[var(--accent-1)]/20 transition-all cursor-pointer disabled:opacity-50"
                        >
                          {isFetchingModels ? <Loader2 size={10} className="animate-spin" /> : <RefreshCw size={10} />}
                          {isFetchingModels ? '获取中...' : '获取模型列表'}
                        </button>
                        {fetchedModels.length > 0 && (
                          <span className="text-[10px] text-[var(--text-muted)]">{fetchedModels.length} 个模型可用，点击下拉选择</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-2 block">API 接口地址 (API Base URL)</label>
                    <input
                      type="text"
                      value={settings.llm.apiUrl}
                      onChange={(e) => updateSettings({
                        llm: { ...settings.llm, apiUrl: e.target.value }
                      })}
                      className="w-full px-4 py-3 rounded-xl bg-[var(--glass-bg-hover)] border border-[var(--glass-border)] text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--accent-1)]/50 transition-all font-mono"
                      placeholder="https://api.openai.com/v1"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-2 block">API 密钥 (API Key)</label>
                    <input
                      type="password"
                      value={settings.llm.apiKey}
                      onChange={(e) => updateSettings({
                        llm: { ...settings.llm, apiKey: e.target.value }
                      })}
                      className="w-full px-4 py-3 rounded-xl bg-[var(--glass-bg-hover)] border border-[var(--glass-border)] text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--accent-1)]/50 transition-all font-mono"
                      placeholder="sk-..."
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Temperature Slider */}
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <label className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-widest block">温度 (Temperature)</label>
                        <span className="text-xs font-mono font-bold text-[var(--accent-1)] bg-[var(--accent-1)]/10 px-2 py-0.5 rounded border border-[var(--accent-1)]/20">
                          {settings.llm.temperature ?? 0.7}
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0.0"
                        max="2.0"
                        step="0.1"
                        value={settings.llm.temperature ?? 0.7}
                        onChange={(e) => updateSettings({
                          llm: { ...settings.llm, temperature: Number(e.target.value) }
                        })}
                        className="w-full h-2 bg-[var(--glass-bg)] rounded-lg appearance-none cursor-pointer border border-[var(--glass-border)] outline-none"
                        style={{ accentColor: "var(--accent-1)" }}
                      />
                      <div className="flex justify-between text-[9px] text-[var(--text-secondary)] uppercase tracking-widest font-bold mt-2">
                        <span>精准 (0.0)</span>
                        <span>创造力 (2.0)</span>
                      </div>
                    </div>

                    {/* Max Tokens */}
                    <div>
                      <label className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-2 block">最大生成 Token (Max Tokens)</label>
                      <input
                        type="number"
                        min="1"
                        max="32768"
                        value={settings.llm.maxTokens ?? 4096}
                        onChange={(e) => updateSettings({
                          llm: { ...settings.llm, maxTokens: Number(e.target.value) }
                        })}
                        className="w-full px-4 py-3 rounded-xl bg-[var(--glass-bg-hover)] border border-[var(--glass-border)] text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--accent-1)]/50 transition-all font-mono"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* MCP Server — expose the app's tools to external AI clients */}
              <McpServerPanel />
            </div>
          )}

          {activeTab === "data" && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-6">
              <div className="glass-panel p-6">
                <div className="flex items-center gap-3 mb-6 border-b border-[var(--glass-border)] pb-4">
                  <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/20">
                    <Database size={20} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-[var(--text-primary)]">数据导出与导入</h3>
                    <p className="text-xs text-[var(--text-secondary)] mt-0.5">导出全部数据（提示词、工作流、生成记录、设置等）为 JSON 文件，方便设备间迁移。</p>
                  </div>
                </div>

                <div className="flex flex-col gap-6 max-w-2xl">
                  <div className="flex gap-4">
                    <button
                      onClick={handleExport}
                      disabled={exportStatus !== null && !exportStatus.includes("失败")}
                      className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-[13px] font-bold cursor-pointer transition-all duration-300 hover:scale-105 shadow-[0_4px_15px_rgba(16,185,129,0.3)]"
                      style={{ background: "linear-gradient(135deg, #10B981, #059669)", color: "#fff" }}
                    >
                      <Download size={16} /> 导出全部数据
                    </button>
                    <button
                      onClick={handleImport}
                      disabled={importStatus !== null && !importStatus.includes("失败") && !importStatus.includes("请选择")}
                      className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)] text-[var(--text-primary)] hover:bg-[var(--glass-bg-active)] transition-all cursor-pointer text-[13px] font-bold"
                    >
                      <Upload size={16} /> 导入备份数据
                    </button>
                  </div>

                  {exportStatus && (
                    <div className={`px-4 py-3 rounded-xl text-sm font-medium ${
                      exportStatus.includes("失败") 
                        ? "bg-red-500/10 text-red-400 border border-red-500/20" 
                        : exportStatus.includes("成功")
                        ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                        : "bg-[var(--glass-bg)] text-[var(--text-secondary)] border border-[var(--glass-border)]"
                    }`}>
                      {exportStatus}
                    </div>
                  )}
                  {importStatus && (
                    <div className={`px-4 py-3 rounded-xl text-sm font-medium ${
                      importStatus.includes("失败") || importStatus.includes("无效")
                        ? "bg-red-500/10 text-red-400 border border-red-500/20"
                        : importStatus.includes("成功")
                        ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                        : "bg-[var(--glass-bg)] text-[var(--text-secondary)] border border-[var(--glass-border)]"
                    }`}>
                      {importStatus}
                    </div>
                  )}

                  <div className="text-xs text-[var(--text-secondary)] space-y-1 border-t border-[var(--glass-border)] pt-4">
                    <p className="font-bold text-[var(--text-primary)]">备份内容包括：</p>
                    <ul className="list-disc list-inside space-y-0.5 ml-2">
                      <li>提示词项目（正面/负面提示词、模型配置、LoRA等）</li>
                      <li>工作流定义（ComfyUI JSON）</li>
                      <li>生成历史记录与示范图片（本地图片打包进备份）</li>
                      <li>收藏提示词 / 自定义风格</li>
                      <li>Agent 会话记录</li>
                      <li>应用设置（主题、LLM配置、壁纸等）</li>
                    </ul>
                    <p className="mt-2 text-[var(--text-secondary)]">备份格式为 .eishougi 压缩包，包含所有数据和本地图片文件。</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "about" && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-6">
              <div className="glass-panel p-6 text-center max-w-2xl mx-auto py-12 border border-[var(--glass-border)] shadow-[0_0_30px_rgba(var(--accent-1-rgb),0.1)] relative overflow-hidden">
                <div className="absolute -top-32 -left-32 w-64 h-64 bg-[var(--accent-1)] opacity-10 rounded-full blur-3xl pointer-events-none" />
                <div className="absolute -bottom-32 -right-32 w-64 h-64 bg-blue-500 opacity-10 rounded-full blur-3xl pointer-events-none" />

                <img src="/logo.png" alt="EISHOUGI Logo" className="w-64 h-auto mx-auto mb-6 drop-shadow-[0_0_20px_rgba(var(--accent-1-rgb),0.5)] hover:scale-105 transition-all duration-500 object-contain" />
                <h3 className="text-2xl font-bold text-[var(--text-primary)] mb-2 drop-shadow-md tracking-wider">詠唱机 <span className="text-[var(--accent-1)] font-black">EISHOUGI</span></h3>
                <p className="text-sm font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-6">v{appVersion} • Stable</p>

                <div className="bg-black/30 p-6 rounded-xl border border-[var(--glass-border)] mx-auto max-w-lg relative shadow-inner">
                  <p className="text-sm text-[var(--text-primary)] leading-relaxed tracking-wide text-left indent-8 mb-3">
                    <span className="text-[var(--accent-1)] font-bold text-lg">在</span>这里，想象力是您唯一的边界。
                    <strong>詠唱机 (EISHOUGI)</strong> 是一款为您量身打造的灵感具现化工坊。
                  </p>
                  <p className="text-sm text-[var(--text-secondary)] leading-relaxed tracking-wide text-left indent-8">
                    我们将繁杂冰冷的技术参数温柔剥离，赋予纯粹的文字以魔法般的重构力量。您只需尽情倾诉您的创意，它便会静候在侧，将您的思绪编织为最精准的视觉咒语，并于指尖召唤出突破现实的绚丽画卷。让每一次微小的灵感闪烁，都能毫无阻碍地结晶为永恒的杰作。
                  </p>
                </div>
              </div>

              {/* Update check + install panel */}
              <div className="max-w-2xl mx-auto">
                <UpdatePanel />
              </div>

              {/* Re-run onboarding — desktop only (Android has no onboarding) */}
              {!isAndroid && (
              <div className="max-w-2xl mx-auto">
                <button
                  onClick={() => { updateSettings({ hasCompletedOnboarding: false } as any); setTimeout(() => window.location.reload(), 100); }}
                  className="w-full p-4 rounded-2xl bg-[var(--glass-bg)] border border-[var(--glass-border)] hover:bg-[var(--glass-bg-hover)] hover:border-[var(--accent-1)]/30 transition-all text-left cursor-pointer group"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-[var(--accent-1)]/10 text-[var(--accent-1)] group-hover:scale-110 transition-transform">
                      <RefreshCw size={18} />
                    </div>
                    <div>
                      <h4 className="text-[14px] font-bold text-[var(--text-primary)]">重新运行配置引导</h4>
                      <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">重新检测 ComfyUI 环境、补全组件、测试生图</p>
                    </div>
                  </div>
                </button>
              </div>
              )}

              {/* QQ群 + 模型下载 */}
              <div className="max-w-2xl mx-auto">
                <div className="p-5 rounded-2xl bg-[var(--glass-bg)] border border-[var(--glass-border)]">
                  <div className="flex items-center gap-2 mb-4">
                    <MessageCircle size={18} className="text-[var(--accent-1)]" />
                    <h4 className="text-[14px] font-bold text-[var(--text-primary)]">帮助与支持</h4>
                  </div>
                  <div className="flex items-start gap-4 mb-4">
                    <img src={qqGroupQR} alt="QQ群二维码" className="w-24 h-24 rounded-xl object-cover border border-[var(--glass-border)] flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-bold text-[var(--text-primary)]">詠唱机 ComfyUI 交流群</p>
                      <p className="text-[12px] text-[var(--text-secondary)] mt-1">群号：<span className="font-mono font-bold text-[var(--text-primary)]">{QQ_GROUP_NUMBER}</span></p>
                      <p className="text-[11px] text-[var(--text-secondary)] mt-1.5">遇到安装/模型/节点问题，群里有人帮你。群内有完整模型包和图文教程。</p>
                      <button
                        onClick={() => openUrl(QQ_GROUP_URL)}
                        className="mt-2.5 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--accent-1)]/15 border border-[var(--accent-1)]/40 text-[12px] font-bold text-[var(--accent-1)] hover:bg-[var(--accent-1)]/25 transition-colors cursor-pointer"
                      >
                        <ExternalLink size={13} /> 点此加群
                      </button>
                    </div>
                  </div>
                  <div className="pt-4 border-t border-[var(--glass-border)]">
                    <button
                      onClick={() => openUrl(ANIMA_MODELS_URL)}
                      className="flex items-center gap-2 text-[12px] text-[var(--text-secondary)] hover:text-[var(--accent-2)] transition-colors cursor-pointer"
                    >
                      <Download size={14} />
                      自行下载 Anima 模型（HuggingFace）
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
