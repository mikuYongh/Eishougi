/**
 * ResultActions — 生成图片结果操作栏
 * 在生成的图片下方显示快捷操作按钮
 */
import { RefreshCw, Film, Star, Download, Lock, Copy } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";

interface ResultActionsProps {
  images: string[];
  promptId?: string;
  onAction: (message: string) => void;
}

export function ResultActions({ images, promptId, onAction }: ResultActionsProps) {
  if (!images || images.length === 0) return null;

  const handleSave = async () => {
    try {
      const { downloadImage } = await import("../../utils/download");
      for (const img of images) {
        await downloadImage(img, `eishougi_${Date.now()}.png`);
      }
    } catch (e) {
      toast.error("保存失败: " + String(e));
    }
  };

  const handleSetExample = async () => {
    if (!promptId) {
      toast.warning("未关联提示词项目");
      return;
    }
    try {
      await invoke("update_prompt", { prompt: { id: promptId, coverImage: images[0] } });
      toast.success("已设为示范图");
    } catch (e) {
      toast.error("设置失败: " + String(e));
    }
  };

  const handleEncrypt = async () => {
    // 触发加密消息
    onAction(`请加密这张图片后发送: ${images[0]}`);
  };

  const actions = [
    { icon: RefreshCw, label: "再来一张", onClick: () => onAction("用同样的参数再生成一张") },
    { icon: Film, label: "生成视频", onClick: () => onAction(`将这张图片生成视频 ${images[0]}`) },
    { icon: Star, label: "设为示范", onClick: handleSetExample },
    { icon: Download, label: "保存", onClick: handleSave },
    { icon: Lock, label: "加密发送", onClick: handleEncrypt },
  ];

  return (
    <div className="flex items-center gap-1 mt-1.5 flex-wrap">
      {actions.map((action) => (
        <button
          key={action.label}
          onClick={action.onClick}
          className="flex items-center gap-1 px-2 py-1 rounded-lg bg-[var(--glass-bg)] border border-[var(--glass-border)] hover:border-[var(--accent-1)]/30 hover:bg-[var(--accent-1)]/10 text-[10px] text-[var(--text-secondary)] hover:text-[var(--accent-1)] transition-all cursor-pointer"
        >
          <action.icon size={11} />
          {action.label}
        </button>
      ))}
    </div>
  );
}
