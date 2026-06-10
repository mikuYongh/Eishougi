import { UploadCloud, Search, Tag, Copy, Plus, Image as ImageIcon } from "lucide-react";
import { useState } from "react";
import { GlassDropdown } from "../../components/ui/GlassDropdown";

export function Tagger() {
  const [modelFormat, setModelFormat] = useState("wd14-vit-v2");

  const mockTags = [
    { text: "1girl", weight: 0.98 },
    { text: "solo", weight: 0.95 },
    { text: "long_hair", weight: 0.88 },
    { text: "looking_at_viewer", weight: 0.85 },
    { text: "smile", weight: 0.82 },
    { text: "school_uniform", weight: 0.70 },
  ];

  return (
    <div className="flex flex-col h-full relative z-10 gap-6 max-w-4xl mx-auto w-full">
      
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-white drop-shadow-md flex items-center gap-2">
          <span className="text-blue-400">🔍</span> 图片反推
        </h2>
        <p className="text-sm mt-1 text-white/60 font-medium">上传图片获取 WD14 标签</p>
      </div>

      <div className="flex gap-6">
        {/* Left Col - Config & Upload */}
        <div className="w-[300px] flex flex-col gap-4 flex-shrink-0">
          {/* ImageUploader */}
          <div className="glass-panel h-64 rounded-xl border-2 border-dashed border-white/10 hover:border-blue-400/50 bg-black/10 hover:bg-white/5 transition-all flex flex-col items-center justify-center gap-4 cursor-pointer">
            <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center">
              <UploadCloud size={24} className="text-white/40" />
            </div>
            <div className="text-center">
              <p className="text-[13px] font-bold text-white/80">拖拽上传图片</p>
            </div>
          </div>

          {/* Format Select */}
          <div className="glass-panel p-4 space-y-2 relative z-50">
            <label className="text-[11px] font-bold text-white/50 uppercase tracking-widest block">模型格式选择</label>
            <GlassDropdown 
              value={modelFormat}
              onChange={setModelFormat}
              options={[
                { label: "wd14-vit-v2 (推荐)", value: "wd14-vit-v2" },
                { label: "wd14-convnext-v2", value: "wd14-convnext-v2" }
              ]}
              accentColor="blue"
            />
          </div>

          {/* AnalyzeButton */}
          <button 
            className="w-full py-3.5 rounded-xl font-bold text-white text-[14px] flex items-center justify-center gap-2 shadow-[0_4px_15px_rgba(100,181,246,0.3)] hover:scale-[1.02] transition-all cursor-pointer"
            style={{ background: "linear-gradient(135deg, #42A5F5, #7E57C2)" }}
          >
            <Search size={16} /> 开始分析标签
          </button>
        </div>

        {/* Right Col - Results */}
        <div className="flex-1 glass-panel flex flex-col min-w-0">
          <div className="px-5 py-3 border-b border-white/5 bg-black/10 flex items-center justify-between">
            <h3 className="text-[13px] font-bold text-white/80 flex items-center gap-2">
              <Tag size={14} className="text-blue-400" /> 分析结果
            </h3>
            {/* Actions (创建提示词/复制) */}
            <div className="flex gap-2">
              <button className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-white/5 hover:bg-white/10 text-white/70 hover:text-white text-[11px] font-bold border border-white/10 transition-colors cursor-pointer">
                <Copy size={12} /> 复制标签
              </button>
              <button className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 text-[11px] font-bold border border-blue-500/20 transition-colors cursor-pointer">
                <Plus size={12} /> 创建为提示词
              </button>
            </div>
          </div>

          {/* TagResult (TagChip 网格) */}
          <div className="p-5 flex-1 overflow-y-auto">
            <div className="flex flex-wrap gap-2">
              {mockTags.map((tag, i) => (
                <div 
                  key={i} 
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition-colors cursor-pointer"
                >
                  <span className="text-[13px] font-medium text-white/90">{tag.text}</span>
                  <span className="text-[10px] text-white/40 font-mono">{tag.weight.toFixed(2)}</span>
                </div>
              ))}
              
              {/* Empty state placeholder when no tags */}
              {mockTags.length === 0 && (
                <div className="w-full h-full flex flex-col items-center justify-center text-white/30 gap-2 mt-10">
                  <ImageIcon size={32} />
                  <p className="text-xs font-bold uppercase tracking-widest">请先上传图片进行反推</p>
                </div>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
