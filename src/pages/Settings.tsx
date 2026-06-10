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
  
  const { wallpaperPath, setWallpaperPath, resetWallpaper, blurLevel, setBlurLevel } = useSettingsStore();
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
            <SettingsIcon size={20} className="text-pink-400" />
            <h2 className="text-2xl font-bold text-white drop-shadow-md">应用配置</h2>
          </div>
          <p className="text-sm mt-1 text-white/60 font-medium">调整界面、模型与通用行为</p>
        </div>
        
        <div
          className="group flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all duration-300 shadow-[0_4px_12px_rgba(0,0,0,0.1)] w-64 focus-within:w-80"
          style={{
            background: "rgba(255, 255, 255, 0.05)",
            borderColor: "rgba(255, 255, 255, 0.1)",
            borderWidth: 1,
          }}
        >
          <Search size={16} className="text-white/40 group-focus-within:text-pink-400 transition-colors" />
          <input
            type="text"
            placeholder="搜索设置项..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="border-none bg-transparent outline-none text-[13px] text-white w-full font-sans placeholder:text-white/30"
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
                    ? "glass-panel bg-white/10 text-white shadow-[0_4px_20px_rgba(179,136,255,0.15)] border-pink-500/30 translate-x-2" 
                    : "text-white/50 hover:bg-white/5 hover:text-white/80 border border-transparent"
                }`}
              >
                <span className={isActive ? "text-pink-400 drop-shadow-[0_0_8px_rgba(255,107,157,0.5)]" : ""}>
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
                <div className="flex items-center gap-3 mb-6 border-b border-white/5 pb-4">
                  <div className="p-2 rounded-lg bg-pink-500/20 text-pink-400 border border-pink-500/20 shadow-[0_0_10px_rgba(255,107,157,0.2)]">
                    <Monitor size={20} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white/90">全局动态壁纸</h3>
                    <p className="text-xs text-white/40 mt-0.5">支持在线链接、相对路径，或直接从本地上传图片。</p>
                  </div>
                </div>
                
                <div className="flex gap-8">
                  {/* Preview Monitor */}
                  <div className="w-64 h-40 rounded-xl overflow-hidden relative border border-white/10 shadow-[0_10px_30px_rgba(0,0,0,0.5)] flex-shrink-0 bg-black/40">
                    <div 
                      className="absolute inset-0 bg-cover bg-center transition-all duration-700 hover:scale-110"
                      style={{ backgroundImage: `url("${localWallpaper}")` }}
                    />
                    <div className="absolute top-2 left-2 px-2 py-1 rounded bg-black/60 backdrop-blur-md border border-white/10">
                      <span className="text-white/60 text-[9px] font-bold tracking-widest uppercase">Preview</span>
                    </div>
                    {/* Native Upload Button Overlay */}
                    <div className="absolute inset-0 bg-black/50 opacity-0 hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                      <label className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/20 hover:bg-white/30 backdrop-blur-md text-white text-xs font-bold cursor-pointer transition-colors shadow-lg border border-white/20">
                        <ImageIcon size={14} /> 选本地图
                        <input type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
                      </label>
                    </div>
                  </div>

                  {/* Input Controls */}
                  <div className="flex-1 flex flex-col justify-center space-y-4">
                    <div>
                      <label className="text-xs font-bold text-white/50 uppercase tracking-widest mb-2 block">图片地址</label>
                      <input
                        type="text"
                        value={localWallpaper}
                        onChange={(e) => setLocalWallpaper(e.target.value)}
                        className="w-full px-4 py-3 rounded-xl bg-black/30 border border-white/10 text-[13px] text-white outline-none focus:border-pink-400/50 focus:shadow-[0_0_15px_rgba(255,107,157,0.15)] transition-all font-mono"
                        placeholder="https://... 或点击左侧预览图上传"
                      />
                    </div>
                    
                    <div className="flex gap-3">
                      <button
                        onClick={handleApplyWallpaper}
                        className="flex-1 py-2.5 rounded-xl text-[13px] font-bold cursor-pointer transition-all duration-300 hover:scale-105 shadow-[0_4px_15px_rgba(255,107,157,0.4)]"
                        style={{ background: "linear-gradient(135deg, #FF6B9D, #B388FF)", color: "#fff" }}
                      >
                        应用链接
                      </button>
                      <button
                        onClick={handleResetWallpaper}
                        className="px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white/60 hover:text-white hover:bg-white/10 transition-all cursor-pointer flex items-center gap-2 text-[13px] font-bold"
                      >
                        <RotateCcw size={14} /> 恢复默认
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="glass-panel p-6">
                 <div className="flex items-center gap-3 mb-6 border-b border-white/5 pb-4">
                  <div className="p-2 rounded-lg bg-purple-500/20 text-purple-400 border border-purple-500/20">
                    <Palette size={20} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white/90">主题色彩与磨砂材质</h3>
                    <p className="text-xs text-white/40 mt-0.5">实时控制全局磨砂玻璃强度的滑块，打造专属质感。</p>
                  </div>
                </div>
                
                <div className="flex flex-col gap-4 max-w-md">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-white/80">底层壁纸磨砂强度 (Blur)</span>
                    <span className="text-xs font-mono font-bold text-purple-400 bg-purple-500/20 px-2 py-0.5 rounded border border-purple-500/20">
                      {blurLevel}px
                    </span>
                  </div>
                  <input 
                    type="range" 
                    min="0" max="60" step="1"
                    value={blurLevel}
                    onChange={(e) => setBlurLevel(Number(e.target.value))}
                    className="w-full h-2 bg-black/40 rounded-lg appearance-none cursor-pointer border border-white/10 outline-none"
                    style={{
                      accentColor: "#B388FF"
                    }}
                  />
                  <div className="flex justify-between text-[10px] text-white/30 uppercase tracking-widest font-bold">
                    <span>清晰 (0px)</span>
                    <span>极度朦胧 (60px)</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab !== "appearance" && (
            <div className="glass-panel w-full h-64 flex flex-col items-center justify-center text-center opacity-60">
               <SettingsIcon size={48} className="text-white/20 mb-4 animate-[spin_10s_linear_infinite]" />
               <h3 className="text-xl font-bold text-white/80">开发中</h3>
               <p className="text-xs text-white/40 mt-1 uppercase tracking-widest">Module under construction</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
