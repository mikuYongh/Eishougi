import { useState, useRef } from "react";
import { UploadCloud, Image as ImageIcon, Sparkles, Copy, FileText, CheckCircle2, RefreshCw } from "lucide-react";
import { useSettingsStore } from "../../stores/settingsStore";
import { GlassDropdown } from "../../components/ui/GlassDropdown";
import { llmService } from "../../services/llmService";

export function Tagger() {
  const privacyMode = useSettingsStore(state => state.settings.privacyMode);
  const [image, setImage] = useState<string | null>(null);
  const [format, setFormat] = useState("danbooru");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [results, setResults] = useState<{ tag: string, confidence: number }[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImage(URL.createObjectURL(file));
      setResults([]);
    }
  };

  const handleAnalyze = async () => {
    if (!image) return;
    setIsAnalyzing(true);
    
    try {
      // In a real app we'd need to convert the selected file to a base64 string
      // Let's get the file from the input ref
      const file = fileInputRef.current?.files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64data = reader.result as string;
          try {
            const tags = await llmService.tagImage(base64data);
            setResults(tags);
          } catch (e: any) {
            alert(e.message);
          } finally {
            setIsAnalyzing(false);
          }
        };
        reader.readAsDataURL(file);
      } else {
        setIsAnalyzing(false);
      }
    } catch (e) {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="flex flex-col h-full relative z-10 gap-6 max-w-5xl mx-auto w-full">
      
      {/* PageHeader */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <h2 className="text-2xl font-bold text-[var(--text-primary)] drop-shadow-md flex items-center gap-2">
            <span className="text-orange-400">🔍</span> 图片反推 (Tagger)
          </h2>
          <p className="text-sm mt-1 text-[var(--text-muted)] font-medium">上传图片，使用 WD14 模型提取特征标签，一键转化为提示词</p>
        </div>
      </div>

      <div className="flex gap-6 flex-1 min-h-0">
        
        {/* Left Column - Uploader */}
        <div className="w-1/2 flex flex-col gap-4">
          <div className="glass-panel p-1 flex-1 rounded-2xl flex flex-col relative overflow-hidden group">
            <div className="absolute inset-0 bg-[var(--bg-layer-1)] z-0"></div>
            
            {image ? (
              <div className="relative w-full h-full z-10 flex flex-col items-center justify-center p-2 group/img">
                <img src={image} alt="Upload" className={`max-w-full max-h-full object-contain rounded-lg shadow-2xl transition-all duration-300 ${privacyMode ? 'blur-2xl hover:blur-none' : ''}`} />
                <button 
                  onClick={() => setImage(null)}
                  className="absolute top-4 right-4 w-10 h-10 rounded-full bg-[var(--glass-bg)] backdrop-blur-md text-[var(--text-primary)] flex items-center justify-center hover:bg-red-500/80 transition-colors opacity-0 group-hover:opacity-100"
                >
                  <RefreshCw size={18} />
                </button>
              </div>
            ) : (
              <div 
                className="relative w-full h-full z-10 flex flex-col items-center justify-center border-2 border-dashed border-[var(--glass-border)] hover:border-orange-500/50 m-2 rounded-xl bg-[var(--glass-bg-hover)] cursor-pointer transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <div className="w-16 h-16 rounded-full bg-orange-500/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <UploadCloud size={32} className="text-orange-400/80" />
                </div>
                <h3 className="text-lg font-bold text-[var(--text-primary)] mb-1">拖拽或点击上传图片</h3>
                <p className="text-xs text-[var(--text-muted)] mb-3">支持 JPG, PNG, WEBP (最大 10MB)</p>
                <div className="text-[10px] text-[var(--text-muted)] px-4 text-center">
                  * 反推模型将调用本地或云端的 agnes-2.0-flash 多模态视觉模型进行高精度特征提取。
                </div>
              </div>
            )}
            <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleImageUpload} />
          </div>

          <div className="glass-panel p-5 rounded-2xl flex items-center gap-4">
            <div className="flex-1 relative z-20">
              <label className="text-[10px] text-[var(--text-muted)] mb-1.5 block uppercase tracking-wider font-bold">输出格式 (Format)</label>
              <GlassDropdown 
                value={format}
                onChange={setFormat}
                options={[
                  { label: "Danbooru (动漫标签)", value: "danbooru" },
                  { label: "DeepDanbooru", value: "deepdanbooru" },
                  { label: "自然语言描述 (BLIP)", value: "blip" }
                ]}
                accentColor="orange"
              />
            </div>
            <button 
              onClick={handleAnalyze}
              disabled={!image || isAnalyzing}
              className={`mt-5 flex items-center gap-2 px-6 py-2.5 rounded-xl text-[14px] font-bold shadow-[0_4px_15px_rgba(255,152,0,0.3)] transition-all ${!image ? 'opacity-50 cursor-not-allowed' : 'hover:scale-[1.02] cursor-pointer text-[var(--text-primary)]'}`}
              style={{ background: image ? "linear-gradient(135deg, #FF9800, #F44336)" : "rgba(255,255,255,0.1)", border: image ? "1px solid rgba(255,255,255,0.2)" : "none" }}
            >
              {isAnalyzing ? <RefreshCw size={18} className="animate-spin" /> : <Sparkles size={18} />}
              {isAnalyzing ? '正在反推...' : '开始反推'}
            </button>
          </div>
        </div>

        {/* Right Column - Results */}
        <div className="w-1/2 flex flex-col">
          <div className="glass-panel rounded-2xl flex flex-col flex-1 overflow-hidden relative">
            <div className="p-4 border-b border-[var(--glass-border)] flex items-center justify-between bg-[var(--bg-layer-1)]">
              <h3 className="text-[14px] font-bold text-[var(--text-primary)] flex items-center gap-2">
                <FileText size={16} className="text-orange-400" /> 反推结果
              </h3>
              <div className="flex gap-2">
                <button 
                  disabled={results.length === 0}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-[var(--text-primary)] text-[11px] font-bold transition-colors disabled:opacity-50"
                >
                  <Copy size={12} /> 复制文本
                </button>
                <button 
                  disabled={results.length === 0}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-500/20 hover:bg-orange-500/30 text-orange-400 text-[11px] font-bold border border-orange-500/20 transition-colors disabled:opacity-50"
                >
                  <CheckCircle2 size={12} /> 创建为提示词项目
                </button>
              </div>
            </div>

            <div className="flex-1 p-5 overflow-y-auto">
              {results.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {results.map((r, i) => (
                    <div key={i} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-[var(--glass-bg)] border border-[var(--glass-border)] hover:border-orange-500/30 transition-colors cursor-pointer group">
                      <span className="text-[13px] font-mono text-[var(--text-primary)]">{r.tag}</span>
                      <span className="text-[10px] text-orange-400/60 group-hover:text-orange-400">{(r.confidence * 100).toFixed(0)}%</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-[var(--text-muted)]">
                  <ImageIcon size={48} className="mb-4 opacity-20" />
                  <p className="text-[13px] font-bold uppercase tracking-widest">等待上传与反推</p>
                </div>
              )}
            </div>
            
            {results.length > 0 && (
              <div className="p-4 bg-[var(--glass-bg)] border-t border-[var(--glass-border)]">
                <textarea 
                  readOnly 
                  value={results.map(r => r.tag).join(", ")}
                  className="w-full h-24 bg-transparent border-none outline-none text-[var(--text-muted)] text-[12px] font-mono resize-none leading-relaxed"
                />
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
