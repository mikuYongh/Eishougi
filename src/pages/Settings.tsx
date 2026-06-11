import { useState, useEffect } from "react";
import { useSettingsStore } from "../stores/settingsStore";
import { Search, Palette, Settings as SettingsIcon, Cpu, Info, Image as ImageIcon, RotateCcw, Monitor } from "lucide-react";

const SETTINGS_TABS = [
  { id: "appearance", label: "外观设置", icon: <Palette size={18} /> },
  { id: "general", label: "通用设置", icon: <SettingsIcon size={18} /> },
  { id: "models", label: "模型与服务", icon: <Cpu size={18} /> },
  { id: "about", label: "关于", icon: <Info size={18} /> },
];

export function Settings() {
  const [activeTab, setActiveTab] = useState("appearance");
  const [searchQuery, setSearchQuery] = useState("");
  
  const { 
    wallpaperPath, setWallpaperPath, resetWallpaper, 
    blurLevel, setBlurLevel,
    appTheme, setAppTheme,
    colorTheme, setColorTheme,
    settings, setPrivacyMode
  } = useSettingsStore();
  const [localWallpaper, setLocalWallpaper] = useState(wallpaperPath);

  useEffect(() => {
    setLocalWallpaper(wallpaperPath);
  }, [wallpaperPath]);

  const handleApplyWallpaper = () => setWallpaperPath(localWallpaper);
  const handleResetWallpaper = () => resetWallpaper();
  
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const objectUrl = URL.createObjectURL(file);
      setLocalWallpaper(objectUrl);
      setWallpaperPath(objectUrl);
    }
  };

  return (
    <div className="relative z-10 h-full flex flex-col">
      {/* Header matching Dashboard style */}
      <div className="flex items-center justify-between mb-6 px-1 flex-shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <SettingsIcon size={20} className="text-[var(--accent-1)]" />
            <h2 className="text-2xl font-bold text-[var(--text-primary)] drop-shadow-md">应用配置</h2>
          </div>
          <p className="text-sm mt-1 text-[var(--text-muted)] font-medium">调整界面、模型与通用行为</p>
        </div>
        
        <div
          className="group flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all duration-300 shadow-[0_4px_12px_rgba(0,0,0,0.1)] w-64 focus-within:w-80"
          style={{
            background: "rgba(255, 255, 255, 0.05)",
            borderColor: "rgba(255, 255, 255, 0.1)",
            borderWidth: 1,
          }}
        >
          <Search size={16} className="text-[var(--text-muted)] group-focus-within:text-[var(--accent-1)] transition-colors" />
          <input
            type="text"
            placeholder="搜索设置项..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="border-none bg-transparent outline-none text-[13px] text-[var(--text-primary)] w-full font-sans placeholder:text-[var(--text-muted)]"
          />
        </div>
      </div>

      <div className="flex flex-1 gap-6 min-h-0">
        {/* Left Sidebar Menu */}
        <div className="w-56 flex flex-col gap-2 flex-shrink-0">
          {SETTINGS_TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-bold transition-all duration-300 cursor-pointer ${
                  isActive 
                    ? "glass-panel bg-white/10 text-[var(--text-primary)] shadow-[0_4px_20px_rgba(179,136,255,0.15)] border-[var(--accent-1)]/30 translate-x-2" 
                    : "text-[var(--text-muted)] hover:bg-white/5 hover:text-[var(--text-primary)] border border-transparent"
                }`}
              >
                <span className={isActive ? "text-[var(--accent-1)] drop-shadow-[0_0_8px_rgba(var(--accent-1-rgb), 0.5)]" : ""}>
                  {tab.icon}
                </span>
                {tab.label}
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
                    <p className="text-xs text-[var(--text-muted)] mt-0.5">支持在线链接、相对路径，或直接从本地上传图片。</p>
                  </div>
                </div>
                
                <div className="flex gap-8">
                  {/* Preview Monitor */}
                  <div className="w-64 h-40 rounded-xl overflow-hidden relative border border-[var(--glass-border)] shadow-[0_10px_30px_rgba(0,0,0,0.5)] flex-shrink-0 bg-[var(--glass-bg)]">
                    <div 
                      className="absolute inset-0 bg-cover bg-center transition-all duration-700 hover:scale-110"
                      style={{ backgroundImage: `url("${localWallpaper}")` }}
                    />
                    <div className="absolute top-2 left-2 px-2 py-1 rounded bg-[var(--glass-bg)] backdrop-blur-md border border-[var(--glass-border)]">
                      <span className="text-[var(--text-muted)] text-[9px] font-bold tracking-widest uppercase">Preview</span>
                    </div>
                    {/* Native Upload Button Overlay */}
                    <div className="absolute inset-0 bg-[var(--bg-layer-1)] opacity-0 hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                      <label className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/20 hover:bg-white/30 backdrop-blur-md text-[var(--text-primary)] text-xs font-bold cursor-pointer transition-colors shadow-lg border border-[var(--glass-border-active)]">
                        <ImageIcon size={14} /> 选本地图
                        <input type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
                      </label>
                    </div>
                  </div>

                  {/* Input Controls */}
                  <div className="flex-1 flex flex-col justify-center space-y-4">
                    <div>
                      <label className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest mb-2 block">图片地址</label>
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
                        className="px-4 py-2.5 rounded-xl bg-white/5 border border-[var(--glass-border)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-white/10 transition-all cursor-pointer flex items-center gap-2 text-[13px] font-bold"
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
                    <p className="text-xs text-[var(--text-muted)] mt-0.5">实时控制全局磨砂玻璃强度的滑块，打造专属质感。</p>
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
                              : 'bg-white/5 text-[var(--text-muted)] border-[var(--glass-border)] hover:bg-white/10'
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
                              ? 'bg-white/10 text-[var(--text-primary)] border-[var(--glass-border-active)] shadow-[0_4px_15px_rgba(0,0,0,0.2)]'
                              : 'bg-transparent text-[var(--text-muted)] border-[var(--glass-border)] hover:bg-white/5'
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
                    <div className="flex justify-between text-[10px] text-[var(--text-muted)] uppercase tracking-widest font-bold mt-2">
                      <span>清晰 (0px)</span>
                      <span>极度朦胧 (60px)</span>
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
                    <p className="text-xs text-[var(--text-muted)] mt-0.5">控制程序的隐私、快捷键和其他基本行为。</p>
                  </div>
                </div>
                
                <div className="flex flex-col gap-6 max-w-2xl">
                  {/* Privacy Mode */}
                  <div>
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-sm font-bold text-[var(--text-primary)]">防偷窥模式 (Privacy Mode)</h4>
                        <p className="text-xs text-[var(--text-muted)] mt-1">开启后全局图片默认高斯模糊，鼠标悬浮才清晰可见</p>
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

          {activeTab !== "appearance" && activeTab !== "general" && (
            <div className="glass-panel w-full h-64 flex flex-col items-center justify-center text-center opacity-60">
               <SettingsIcon size={48} className="text-[var(--text-muted)] mb-4 animate-[spin_10s_linear_infinite]" />
               <h3 className="text-xl font-bold text-[var(--text-primary)]">开发中</h3>
               <p className="text-xs text-[var(--text-muted)] mt-1 uppercase tracking-widest">Module under construction</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
