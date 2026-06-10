import { Play, UploadCloud, Film, Activity, RefreshCw } from "lucide-react";
import { useState } from "react";
import { GlassDropdown } from "../../components/ui/GlassDropdown";

export function VideoGenerate() {
  const [duration, setDuration] = useState("25");
  const [fps, setFps] = useState("12");

  return (
    <div className="flex flex-col h-full relative z-10 gap-6">
      
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <h2 className="text-2xl font-bold text-white drop-shadow-md flex items-center gap-2">
            <span className="text-orange-400">🎬</span> 图生视频
          </h2>
          <p className="text-sm mt-1 text-white/60 font-medium">使用 SVD 将静态图片转化为动态视频</p>
        </div>
      </div>

      <div className="flex flex-1 min-h-0 gap-6">
        
        {/* Left Area - Settings */}
        <div className="w-[400px] flex flex-col gap-5 flex-shrink-0 overflow-y-auto pr-2 pb-10">
          
          {/* ImageUploader */}
          <div className="glass-panel rounded-2xl border-2 border-dashed border-white/10 hover:border-orange-400/50 bg-black/10 hover:bg-white/5 transition-all flex flex-col items-center justify-center gap-4 cursor-pointer relative overflow-hidden group aspect-video">
            <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center group-hover:scale-110 transition-transform">
              <UploadCloud size={24} className="text-white/40 group-hover:text-orange-400 transition-colors" />
            </div>
            <div className="text-center">
              <p className="text-[13px] font-bold text-white/80 group-hover:text-white transition-colors">拖拽初始帧图片到此处</p>
            </div>
          </div>

          {/* Prompt Select */}
          <div className="glass-panel p-4 space-y-3">
            <h3 className="text-[13px] font-bold text-white/80 border-b border-white/10 pb-2">运动提示词 (Prompt Select)</h3>
            <textarea 
              className="w-full h-20 rounded-lg bg-black/20 border border-white/5 resize-none outline-none text-xs text-white p-3 placeholder:text-white/20 focus:border-orange-400/50 transition-colors"
              placeholder="描述画面运动的提示词 (如：camera pan right, wind blowing)..."
            />
          </div>

          {/* VideoParams */}
          <div className="glass-panel p-4 space-y-4">
            <h3 className="text-[13px] font-bold text-white/80 border-b border-white/10 pb-2">视频参数 (Video Params)</h3>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-bold text-white/70">运动幅度 (Motion Bucket)</label>
                <span className="text-[11px] font-mono text-orange-400 bg-orange-500/10 px-1.5 py-0.5 rounded border border-orange-500/20">127</span>
              </div>
              <input type="range" min="1" max="255" defaultValue="127" className="w-full h-1.5 bg-black/40 rounded-lg appearance-none cursor-pointer border border-white/5 outline-none accent-orange-400" />
            </div>
            
            <div className="flex gap-4">
              <div className="flex-1 relative z-30">
                <label className="text-[10px] text-white/40 mb-1 block">生成帧数 (Duration)</label>
                <GlassDropdown 
                  value={duration}
                  onChange={setDuration}
                  options={[
                    { label: "14 帧 (极速)", value: "14" },
                    { label: "25 帧 (标准)", value: "25" }
                  ]}
                  accentColor="orange"
                  small
                />
              </div>

              <div className="flex-1 relative z-20">
                <label className="text-[10px] text-white/40 mb-1 block">视频帧率 (FPS)</label>
                <GlassDropdown 
                  value={fps}
                  onChange={setFps}
                  options={[
                    { label: "8 fps", value: "8" },
                    { label: "12 fps", value: "12" }
                  ]}
                  accentColor="orange"
                  small
                />
              </div>
            </div>
          </div>

          {/* SubmitButton */}
          <button 
            className="w-full h-14 rounded-xl font-bold text-white text-[15px] flex items-center justify-center gap-2 shadow-[0_4px_20px_rgba(255,171,64,0.3)] hover:scale-[1.02] transition-all cursor-pointer relative overflow-hidden group flex-shrink-0"
            style={{ background: "linear-gradient(135deg, #FFAB40, #FF6B9D)" }}
          >
            <div className="absolute top-0 -left-[100%] w-1/2 h-full bg-gradient-to-r from-transparent via-white/30 to-transparent skew-x-[-20deg] group-hover:left-[200%] transition-all duration-700 ease-in-out" />
            <Play size={18} fill="currentColor" /> 开始渲染视频
          </button>
        </div>

        {/* Right Area - ProgressArea + ResultPreview */}
        <div className="flex-1 flex flex-col gap-6 min-w-0">
          
          <div className="glass-panel p-4 flex-shrink-0 flex items-center gap-4 border-orange-500/20 bg-orange-500/5">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-orange-500/20 text-orange-400">
              <Activity size={20} className="animate-pulse" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[13px] font-bold text-white/90">渲染进度 (Progress)</span>
                <span className="text-[11px] font-mono text-orange-400">等待中</span>
              </div>
              <div className="w-full h-1.5 bg-black/40 rounded-full overflow-hidden">
                <div className="h-full bg-orange-400/20 relative" />
              </div>
            </div>
          </div>

          <div className="glass-panel flex-1 rounded-2xl flex flex-col items-center justify-center relative overflow-hidden border border-white/10 bg-black/40">
            <div className="absolute inset-0 opacity-10 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCI+CjxyZWN0IHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjZmZmIiBzdHJva2Utd2lkdGg9IjEiIHN0cm9rZS1vcGFjaXR5PSIwLjEiIC8+Cjwvc3ZnPg==')] bg-repeat pointer-events-none" />
            
            <div className="relative z-10 flex flex-col items-center gap-4 text-white/30">
              <Film size={48} strokeWidth={1} />
              <p className="text-sm font-bold tracking-widest uppercase">渲染结果预览</p>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
