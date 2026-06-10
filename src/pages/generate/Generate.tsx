import { Play, ChevronDown, Image as ImageIcon, Download, Copy, Zap, Maximize2, Settings2 } from "lucide-react";
import { useState } from "react";
import { GlassDropdown } from "../../components/ui/GlassDropdown";

export function Generate() {
  const [isModelConfigOpen, setIsModelConfigOpen] = useState(false);
  const [selectedWorkflow, setSelectedWorkflow] = useState("sdxl_base");
  const [selectedCkpt, setSelectedCkpt] = useState("sd_xl_base_1.0.safetensors");
  const [selectedVae, setSelectedVae] = useState("auto");

  return (
    <div className="flex h-full relative z-10 gap-6">
      
      {/* Configuration Column */}
      <div className="w-[480px] flex-shrink-0 flex flex-col gap-6 overflow-y-auto pr-2 pb-10">
        
        <div>
          <h2 className="text-2xl font-bold text-white drop-shadow-md flex items-center gap-2">
            <span className="text-pink-400">🎨</span> 图像生成
          </h2>
          <p className="text-sm mt-1 text-white/60 font-medium">配置文生图参数并提交至渲染列队</p>
        </div>

        <div className="flex flex-col gap-5">
          {/* Workflow Select */}
          <div className="glass-panel p-4 relative z-50">
            <label className="text-[11px] font-bold text-white/50 uppercase tracking-widest mb-2 block">工作流 (Workflow Select)</label>
            <GlassDropdown 
              value={selectedWorkflow}
              onChange={setSelectedWorkflow}
              options={[
                { label: "基础文生图 (SDXL)", value: "sdxl_base" },
                { label: "Latent 高清放大", value: "latent_upscale" },
                { label: "ControlNet 辅助生成", value: "controlnet" }
              ]}
              accentColor="pink"
            />
          </div>

          {/* Prompt Select & Preview */}
          <div className="glass-panel p-4 border border-pink-500/20 shadow-[0_4px_20px_rgba(255,107,157,0.05)] focus-within:border-pink-500/50 transition-all">
            <div className="flex items-center justify-between mb-3">
              <label className="text-[11px] font-bold text-pink-400 uppercase tracking-widest">提示词组合 (Prompt Select)</label>
              <button className="text-[11px] bg-white/5 hover:bg-white/10 text-white/70 px-2 py-1 rounded border border-white/10 transition-colors cursor-pointer">
                从提示词库选择
              </button>
            </div>
            
            <div className="space-y-3">
              <div>
                <span className="text-[10px] text-white/40 font-bold uppercase mb-1 block">Positive</span>
                <div className="px-3 py-2 rounded bg-black/30 border border-white/5 text-xs text-white/80 font-mono min-h-[60px]">
                  masterpiece, best quality, 1girl, cyberpunk city, neon lights, highly detailed, 8k
                </div>
              </div>
              <div>
                <span className="text-[10px] text-white/40 font-bold uppercase mb-1 block">Negative</span>
                <div className="px-3 py-2 rounded bg-black/30 border border-white/5 text-xs text-white/50 font-mono min-h-[40px]">
                  lowres, bad anatomy, bad hands, text, error, missing fingers
                </div>
              </div>
            </div>
          </div>

          {/* GenerationConfig */}
          <div className="glass-panel p-4 space-y-5">
            <h3 className="text-[13px] font-bold text-white/80 border-b border-white/10 pb-2">生成参数 (Generation Config)</h3>
            
            {/* ResolutionPicker */}
            <div>
              <label className="text-[11px] font-bold text-white/50 uppercase tracking-widest mb-2 block">分辨率 (Resolution Picker)</label>
              <div className="grid grid-cols-3 gap-2">
                {["1:1 (1024x1024)", "16:9 (1024x576)", "9:16 (576x1024)"].map((res, i) => (
                  <button key={i} className={`py-2 rounded-lg text-[10px] font-bold border transition-colors cursor-pointer ${i===0 ? "bg-pink-500/20 text-pink-400 border-pink-500/30" : "bg-black/20 text-white/60 border-white/10 hover:bg-white/10"}`}>
                    {res}
                  </button>
                ))}
              </div>
            </div>

            {/* BatchCount Input */}
            <div>
              <label className="text-[11px] font-bold text-white/50 uppercase tracking-widest mb-2 block">生成批次 (Batch Count)</label>
              <div className="flex items-center gap-3">
                <input type="range" min="1" max="8" defaultValue="1" className="flex-1 h-1.5 bg-black/40 rounded-lg appearance-none cursor-pointer border border-white/5 outline-none accent-pink-400" />
                <span className="text-[13px] font-mono text-white/80 font-bold bg-white/5 px-3 py-1 rounded border border-white/10">1</span>
              </div>
            </div>
            
            {/* ModelConfigSection (Collapsible) */}
            <div className="border border-white/10 rounded-xl bg-black/20 relative z-40">
              <button 
                onClick={() => setIsModelConfigOpen(!isModelConfigOpen)}
                className="w-full px-4 py-3 flex items-center justify-between text-[11px] font-bold text-white/70 hover:text-white hover:bg-white/5 transition-colors cursor-pointer uppercase tracking-widest rounded-xl"
              >
                模型与进阶配置 (Model Config)
                <ChevronDown size={14} className={`transition-transform duration-300 ${isModelConfigOpen ? "rotate-180" : ""}`} />
              </button>
              
              {isModelConfigOpen && (
                <div className="px-4 pb-4 pt-1 space-y-4 border-t border-white/5">
                  <div className="relative z-30">
                    <label className="text-[10px] text-white/40 mb-1 block">Checkpoint 模型</label>
                    <GlassDropdown 
                      value={selectedCkpt}
                      onChange={setSelectedCkpt}
                      options={[
                        { label: "sd_xl_base_1.0.safetensors", value: "sd_xl_base_1.0.safetensors" },
                        { label: "animagine-xl-3.1.safetensors", value: "animagine" }
                      ]}
                      accentColor="pink"
                      small
                    />
                  </div>
                  <div className="relative z-20">
                    <label className="text-[10px] text-white/40 mb-1 block">VAE</label>
                    <GlassDropdown 
                      value={selectedVae}
                      onChange={setSelectedVae}
                      options={[
                        { label: "Automatic (自动)", value: "auto" },
                        { label: "sdxl_vae.safetensors", value: "sdxl_vae" }
                      ]}
                      accentColor="pink"
                      small
                    />
                  </div>
                  <div className="flex gap-4">
                    <div className="flex-1">
                      <label className="text-[10px] text-white/40 mb-1 block">Steps</label>
                      <input type="number" defaultValue="20" className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-xs text-white/80 outline-none font-mono focus:border-pink-500/50 transition-colors" />
                    </div>
                    <div className="flex-1">
                      <label className="text-[10px] text-white/40 mb-1 block">CFG</label>
                      <input type="number" defaultValue="7.0" className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-xs text-white/80 outline-none font-mono focus:border-pink-500/50 transition-colors" />
                    </div>
                  </div>
                </div>
              )}
            </div>

          </div>

          {/* SubmitButton */}
          <button 
            className="w-full py-4 rounded-xl font-bold text-white text-[15px] flex items-center justify-center gap-2 shadow-[0_4px_20px_rgba(255,107,157,0.4)] hover:scale-[1.02] hover:shadow-[0_4px_25px_rgba(255,107,157,0.6)] transition-all cursor-pointer relative overflow-hidden group"
            style={{ background: "linear-gradient(135deg, #FF6B9D, #B388FF)" }}
          >
            <div className="absolute top-0 -left-[100%] w-1/2 h-full bg-gradient-to-r from-transparent via-white/30 to-transparent skew-x-[-20deg] group-hover:left-[200%] transition-all duration-700 ease-in-out" />
            <Play size={18} fill="currentColor" /> 提交生成任务
          </button>
        </div>

      </div>

      {/* Results Column */}
      <div className="flex-1 flex flex-col gap-6 min-w-0">
        
        {/* ProgressArea */}
        <div className="glass-panel p-4 flex-shrink-0 flex items-center gap-4">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-pink-500/20 text-pink-400">
            <Zap size={20} />
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[13px] font-bold text-white/90">正在渲染 (Progress)</span>
              <span className="text-[11px] font-mono text-pink-400">45%</span>
            </div>
            <div className="w-full h-1.5 bg-black/40 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-pink-400 to-purple-500 relative">
                <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4IiBoZWlnaHQ9IjgiPgo8cGF0aCBkPSJNMCAwTDggOFYwSDBaIiBmaWxsPSJyZ2JhKDI1NSwyNTUsMjU1LDAuMykiLz4KPC9zdmc+')] bg-repeat opacity-50 animate-[slide_1s_linear_infinite]" />
              </div>
            </div>
          </div>
        </div>

        {/* ResultGallery */}
        <div className="flex-1 glass-panel p-6 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between mb-4 border-b border-white/5 pb-2">
            <h3 className="text-[13px] font-bold text-white/80">本次生成结果 (Result Gallery)</h3>
          </div>
          
          <div className="flex-1 overflow-y-auto pr-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* ResultCard Placeholder */}
              {[1, 2].map((id) => (
                <div key={id} className="relative rounded-2xl overflow-hidden group border border-white/10 bg-black/40 aspect-square">
                  <div className="absolute inset-0 flex items-center justify-center opacity-10">
                    <ImageIcon size={48} />
                  </div>
                  
                  <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex justify-between items-end backdrop-blur-[2px]">
                    <div className="flex gap-1">
                      <button className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white/90 transition-colors cursor-pointer" title="全屏预览">
                        <Maximize2 size={14} />
                      </button>
                      <button className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white/90 transition-colors cursor-pointer" title="保存本地">
                        <Download size={14} />
                      </button>
                    </div>
                    <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/60 border border-white/10 text-[10px] text-white/70 hover:text-white transition-colors cursor-pointer">
                      <Copy size={12} /> Seed: 84920112
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>

    </div>
  );
}
