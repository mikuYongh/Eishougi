import { memo, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { PhotoView } from "react-photo-view";
import { getImgSrc } from "../../utils/imageUtils";

/**
 * 共享的 memo 化 Markdown 渲染器。桌面端 AgentPanel 和移动端 MobileAgentModal
 * 都用同一个组件，避免双端逻辑漂移 + 让移动端也享受 memo 带来的流式性能收益。
 *
 * Why memo: streaming 时 messages 每秒更新 ~60 次，每个历史 assistant 消息都会
 * 重 render。ReactMarkdown 解析 + AST walk 开销大，memo 让未变的消息跳过解析。
 */

// 图片/视频后缀，用于识别 markdown 链接里指向媒体文件的本地路径
const MEDIA_VIDEO = new Set(['mp4', 'webm', 'avi', 'mov', 'mkv', 'm4v']);
const MEDIA_IMAGE = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp']);

/**
 * Normalize local Windows file paths that the LLM embeds inside markdown image/link
 * syntax. remark treats `\` as an escape character, so `C:\Users\...\file.png` gets
 * mangled (`\U`/`\y` lose their backslash, `\t`/`\f` become tab/form-feed) and the
 * whole `![](...)` collapses into plain text. We rewrite backslashes → forward slashes
 * in URL positions BEFORE parsing so the image survives remark.
 *
 * Only touches `](` … `)` URL spans; leaves code blocks / inline text alone.
 */
function normalizeMarkdownPaths(content: string): string {
  // Match `]( <url> )` — the URL portion of a markdown link/image — and replace
  // backslashes with forward slashes only inside that URL span.
  return content.replace(/\]\(([^)]*)\)/g, (_m, url: string) => `](${url.replace(/\\/g, '/')})`);
}

export const MarkdownContent = memo(function MarkdownContent({ content }: { content: string }) {
  const processed = useMemo(() => normalizeMarkdownPaths(content), [content]);

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      urlTransform={(url) => url}
      components={{
        p: ({node, ...props}) => <div className="mb-2 last:mb-0 leading-relaxed break-words" {...props} />,
        strong: ({node, ...props}) => <strong className="text-[var(--accent-1)] font-bold" {...props} />,
        a: ({node, href, children, ...props}) => {
          // LLM 回复中的 [视频预览](path.mp4) 是 markdown 链接语法，
          // 对媒体文件直接渲染为 video/img 播放器，不显示为可点击超链接。
          if (typeof href === 'string') {
            const ext = href.split('?')[0].split('.').pop()?.toLowerCase() || '';
            if (MEDIA_VIDEO.has(ext)) {
              return <video src={getImgSrc(href)} controls className="max-w-full max-h-64 rounded-lg border border-[var(--glass-border)] my-2" />;
            }
            if (MEDIA_IMAGE.has(ext)) {
              return <PhotoView src={getImgSrc(href)}><img src={getImgSrc(href)} className="max-w-full rounded-lg border border-[var(--glass-border)] my-2 cursor-zoom-in" /></PhotoView>;
            }
          }
          return <a className="text-[var(--accent-2)] underline hover:text-[var(--accent-1)] transition-colors break-all" target="_blank" href={href} {...props}>{children}</a>;
        },
        code: ({node, inline, className, children, ...props}: any) =>
          inline
            ? <code className="px-1.5 py-0.5 mx-0.5 rounded-md bg-[var(--accent-1)]/20 text-[var(--accent-1)] font-mono text-[12px] break-all" {...props}>{children}</code>
            : <pre className="p-3 rounded-xl bg-[var(--bg-layer-1)] border border-[var(--glass-border)] overflow-x-auto text-[12px] font-mono text-[var(--text-secondary)] mt-2 mb-2 custom-scrollbar"><code {...props}>{children}</code></pre>,
        table: ({node, ...props}) => <div className="overflow-x-auto my-2 custom-scrollbar"><table className="text-[12px] border-collapse" {...props} /></div>,
        ul: ({node, ...props}) => <ul className="list-disc pl-4 mb-2 space-y-1" {...props} />,
        ol: ({node, ...props}) => <ol className="list-decimal pl-4 mb-2 space-y-1" {...props} />,
        h1: ({node, ...props}) => <h1 className="text-lg font-bold text-[var(--text-primary)] mt-4 mb-2" {...props} />,
        h2: ({node, ...props}) => <h2 className="text-md font-bold text-[var(--text-primary)] mt-3 mb-2" {...props} />,
        h3: ({node, ...props}) => <h3 className="text-sm font-bold text-[var(--text-primary)] mt-2 mb-1" {...props} />,
        blockquote: ({node, ...props}) => <blockquote className="border-l-2 border-[var(--accent-1)]/30 pl-3 py-1 text-[var(--text-secondary)] italic my-2" {...props} />,
        img: ({node, ...props}) => (
          <PhotoView src={getImgSrc(props.src)}>
            <img {...props} src={getImgSrc(props.src)} className="max-w-full rounded-lg border border-[var(--glass-border)] my-2 cursor-zoom-in" />
          </PhotoView>
        )
      }}
    >
      {processed}
    </ReactMarkdown>
  );
});
