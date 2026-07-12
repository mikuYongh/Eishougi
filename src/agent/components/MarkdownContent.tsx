/**
 * 复用旧 MarkdownContent — 移到 agent/components/ 下
 */
import { memo, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { PhotoView } from "react-photo-view";
import { useSettingsStore } from "../../stores/settingsStore";

const VIDEO_EXTS = new Set(["mp4", "webm", "avi", "mov", "mkv", "m4v"]);
const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"]);

function normalizeMarkdownPaths(content: string): string {
  return content.replace(/\]\(([^)]+)\)/g, (match, url) => {
    const normalized = url.replace(/\\/g, "/");
    return `](${normalized})`;
  });
}

export const MarkdownContent = memo(function MarkdownContent({ content }: { content: string }) {
  const privacyMode = useSettingsStore((s) => s.settings.privacyMode);
  const normalized = useMemo(() => normalizeMarkdownPaths(content), [content]);

  return (
    <div className="prose prose-invert prose-sm max-w-none break-words [&_*]:my-0">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        urlTransform={(url) => url}
        components={{
          p: ({ node, ...props }) => <div {...props} />,
          strong: ({ node, ...props }) => <strong className="text-[var(--accent-1)] font-bold" {...props} />,
          a: ({ href = "", children }) => {
            const ext = href.split("?")[0].split(".").pop()?.toLowerCase() || "";
            if (VIDEO_EXTS.has(ext)) {
              return <video src={href} controls className="max-w-full rounded-xl border border-[var(--glass-border)]" />;
            }
            if (IMAGE_EXTS.has(ext)) {
              return (
                <PhotoView src={href}>
                  <img src={href} alt={String(children)} className={`max-w-full rounded-xl border border-[var(--glass-border)] cursor-zoom-in ${privacyMode ? "blur-md hover:blur-none transition-all" : ""}`} />
                </PhotoView>
              );
            }
            return <a href={href} target="_blank" rel="noopener noreferrer" className="text-[var(--accent-2)] underline" {...{ children }} />;
          },
          code: ({ inline, children }: any) =>
            inline ? (
              <code className="bg-[var(--accent-1)]/20 text-[var(--accent-1)] px-1.5 py-0.5 rounded text-[11px] font-mono">{children}</code>
            ) : (
              <pre className="bg-[var(--bg-layer-1)] p-3 rounded-xl overflow-x-auto custom-scrollbar text-[11px] font-mono">{children}</pre>
            ),
          ul: ({ children }) => <ul className="list-disc pl-4 space-y-0.5">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-4 space-y-0.5">{children}</ol>,
          h1: ({ children }) => <h1 className="text-base font-bold text-[var(--text-primary)] mb-1">{children}</h1>,
          h2: ({ children }) => <h2 className="text-sm font-bold text-[var(--text-primary)] mb-1">{children}</h2>,
          h3: ({ children }) => <h3 className="text-xs font-bold text-[var(--text-primary)] mb-1">{children}</h3>,
          blockquote: ({ children }) => <blockquote className="border-l-2 border-[var(--accent-1)]/50 pl-3 text-[var(--text-secondary)] italic">{children}</blockquote>,
          img: ({ src }) => (
            <PhotoView src={src as string}>
              <img src={src as string} alt="" className={`max-w-full rounded-xl border border-[var(--glass-border)] cursor-zoom-in ${privacyMode ? "blur-md hover:blur-none transition-all" : ""}`} />
            </PhotoView>
          ),
        }}
      >
        {normalized}
      </ReactMarkdown>
    </div>
  );
});
