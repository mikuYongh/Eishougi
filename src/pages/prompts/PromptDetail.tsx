import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft, Star, Pin, Tag, Copy, Trash2, Play, Paintbrush,
  FileText, Cpu, Settings, Hash, Image as ImageIcon, Download
} from "lucide-react";

export function PromptDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const prompt = {
    id: id ?? "1",
    title: "赛博朋克城市夜景",
    description: "霓虹灯下的未来都市，适合作为背景或氛围图",
    positive_prompt: "masterpiece, best quality, cyberpunk city, neon lights, rain, wet streets, reflections, night, high resolution, 8k, cinematic lighting",
    negative_prompt: "lowres, bad anatomy, bad hands, text, error, missing fingers, extra digit, fewer digits, cropped, worst quality, low quality, normal quality, jpeg artifacts, signature, watermark, username, blurry",
    artist_prompt: "by wlop, by greg rutkowski, trending on artstation",
    tags: ["场景", "科幻", "夜景", "雨景"],
    is_favorite: true,
    is_pinned: true,
    base_model: "animagine-xl-4.0",
    seed: "-1",
    width: 1216,
    height: 832,
    steps: 20,
    cfg_scale: 5.5,
    sampler_name: "euler",
    scheduler: "normal",
    lora_configs: [
      { name: "detail_enhancer", strength: 0.8, enabled: true },
      { name: "add_detail", strength: 0.6, enabled: true },
    ],
    vae_model: "sdxl-vae-fp16-fix",
    created_at: Date.now() - 86400000,
    updated_at: Date.now(),
  };

  return (
    <div className="relative z-10 h-full flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate("/prompts")}
            className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-colors cursor-pointer border border-white/5"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-bold text-white drop-shadow-md">{prompt.title}</h2>
              <button className="cursor-pointer">
                <Star size={20} className={prompt.is_favorite ? "text-yellow-400 fill-yellow-400 drop-shadow-[0_0_8px_rgba(250,204,21,0.5)]" : "text-white/30 hover:text-white/60"} />
              </button>
              <button className={`cursor-pointer ${prompt.is_pinned ? "text-purple-400" : "text-white/30 hover:text-white/60"}`}>
                <Pin size={18} />
              </button>
            </div>
            <p className="text-sm mt-1 text-white/50">{prompt.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(`/generate/${prompt.id}`)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white shadow-[0_4px_15px_rgba(255,107,157,0.4)] hover:scale-105 transition-all cursor-pointer"
            style={{ background: "linear-gradient(135deg, #FF6B9D, #B388FF)" }}
          >
            <Play size={16} /> 生成图片
          </button>
          <button
            onClick={() => navigate(`/prompts/${prompt.id}/edit`)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 hover:text-white text-sm font-bold border border-white/10 transition-all cursor-pointer"
          >
            <Settings size={16} /> 编辑
          </button>
          <button className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/50 hover:text-white transition-colors cursor-pointer border border-white/5" title="复制">
            <Copy size={16} />
          </button>
          <button className="p-2.5 rounded-xl bg-white/5 hover:bg-red-500/20 text-white/50 hover:text-red-400 transition-colors cursor-pointer border border-white/5" title="删除">
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {/* Content Grid */}
      <div className="flex-1 overflow-y-auto pr-2 grid grid-cols-3 gap-6 min-h-0">
        {/* Left: Prompts & Params */}
        <div className="col-span-2 space-y-6">
          {/* Positive Prompt */}
          <div className="glass-panel p-5">
            <div className="flex items-center gap-2 mb-3 border-b border-white/5 pb-3">
              <div className="p-1.5 rounded bg-green-500/10 text-green-400">
                <FileText size={14} />
              </div>
              <h3 className="text-sm font-bold text-white/90">正向提示词</h3>
            </div>
            <p className="text-sm text-white/80 leading-relaxed font-mono whitespace-pre-wrap select-all">
              {prompt.positive_prompt}
            </p>
          </div>

          {/* Negative Prompt */}
          <div className="glass-panel p-5">
            <div className="flex items-center gap-2 mb-3 border-b border-white/5 pb-3">
              <div className="p-1.5 rounded bg-red-500/10 text-red-400">
                <FileText size={14} />
              </div>
              <h3 className="text-sm font-bold text-white/90">负向提示词</h3>
            </div>
            <p className="text-sm text-white/70 leading-relaxed font-mono whitespace-pre-wrap select-all">
              {prompt.negative_prompt}
            </p>
          </div>

          {/* Artist Prompt - only if exists */}
          {prompt.artist_prompt && (
            <div className="glass-panel p-5">
              <div className="flex items-center gap-2 mb-3 border-b border-white/5 pb-3">
                <div className="p-1.5 rounded bg-purple-500/10 text-purple-400">
                  <Paintbrush size={14} />
                </div>
                <h3 className="text-sm font-bold text-white/90">画师风格</h3>
              </div>
              <p className="text-sm text-white/70 leading-relaxed font-mono">
                {prompt.artist_prompt}
              </p>
            </div>
          )}

          {/* Generation Params */}
          <div className="glass-panel p-5">
            <div className="flex items-center gap-2 mb-4 border-b border-white/5 pb-3">
              <div className="p-1.5 rounded bg-blue-500/10 text-blue-400">
                <Hash size={14} />
              </div>
              <h3 className="text-sm font-bold text-white/90">生成参数</h3>
            </div>
            <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
              {[
                { label: "Seed", value: prompt.seed },
                { label: "尺寸", value: `${prompt.width} × ${prompt.height}` },
                { label: "采样步数", value: String(prompt.steps) },
                { label: "CFG Scale", value: String(prompt.cfg_scale) },
                { label: "采样器", value: prompt.sampler_name },
                { label: "调度器", value: prompt.scheduler },
              ].map(p => (
                <div key={p.label} className="flex items-center justify-between py-1.5 border-b border-white/[0.03]">
                  <span className="text-white/50">{p.label}</span>
                  <span className="text-white/90 font-mono font-bold">{p.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Meta, Tags, Models */}
        <div className="space-y-6">
          {/* Reference Images */}
          <div className="glass-panel p-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="p-1.5 rounded bg-cyan-500/10 text-cyan-400">
                <ImageIcon size={14} />
              </div>
              <h3 className="text-sm font-bold text-white/90">参考图片</h3>
            </div>
            <div className="flex items-center justify-center h-32 rounded-lg border border-dashed border-white/10 bg-black/20 text-white/30 text-xs">
              暂无参考图片
            </div>
          </div>

          {/* Tags */}
          <div className="glass-panel p-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="p-1.5 rounded bg-pink-500/10 text-pink-400">
                <Tag size={14} />
              </div>
              <h3 className="text-sm font-bold text-white/90">标签</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {prompt.tags.map(tag => (
                <span key={tag} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 text-white/70 text-xs font-medium border border-white/10 hover:bg-white/10 transition-colors cursor-pointer">
                  <Tag size={10} /> {tag}
                </span>
              ))}
            </div>
          </div>

          {/* Model Config */}
          <div className="glass-panel p-5">
            <div className="flex items-center gap-2 mb-4 border-b border-white/5 pb-3">
              <div className="p-1.5 rounded bg-purple-500/10 text-purple-400">
                <Cpu size={14} />
              </div>
              <h3 className="text-sm font-bold text-white/90">模型配置</h3>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-white/50">基础模型</span>
                <span className="text-white/90 font-mono text-xs">{prompt.base_model}</span>
              </div>
              {prompt.vae_model && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-white/50">VAE</span>
                  <span className="text-white/90 font-mono text-xs">{prompt.vae_model}</span>
                </div>
              )}
            </div>

            {prompt.lora_configs && prompt.lora_configs.length > 0 && (
              <div className="mt-4 pt-4 border-t border-white/5">
                <div className="text-[11px] font-bold text-white/40 uppercase tracking-widest mb-3">LoRA 配置</div>
                <div className="space-y-2">
                  {prompt.lora_configs.filter(l => l.enabled).map((lora, i) => (
                    <div key={i} className="flex items-center justify-between px-3 py-2 rounded-lg bg-black/20 border border-white/5">
                      <div className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                        <span className="text-xs text-white/80 font-mono">{lora.name}</span>
                      </div>
                      <span className="text-xs font-mono font-bold text-purple-400">{lora.strength.toFixed(1)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Meta */}
          <div className="glass-panel p-5">
            <div className="text-[11px] font-bold text-white/40 uppercase tracking-widest mb-2">元信息</div>
            <div className="space-y-2 text-xs text-white/50">
              <div className="flex justify-between"><span>创建时间</span><span>{new Date(prompt.created_at).toLocaleDateString()}</span></div>
              <div className="flex justify-between"><span>更新时间</span><span>{new Date(prompt.updated_at).toLocaleDateString()}</span></div>
              <div className="flex justify-between"><span>ID</span><span className="font-mono text-[10px] text-white/30">{prompt.id}</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
