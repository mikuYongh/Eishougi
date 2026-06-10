import { useState } from "react";
import { Sparkles } from "lucide-react";

function getTauriWindow() {
  try {
    // Dynamic import — only works in Tauri runtime
    return (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__
      ? true
      : false;
  } catch {
    return false;
  }
}

export function TitleBar() {
  const [isTauri] = useState(() => getTauriWindow());

  const handleMinimize = () => {
    if (isTauri) {
      import("@tauri-apps/api/window").then(({ getCurrentWindow }) => {
        getCurrentWindow().minimize();
      });
    }
  };

  const handleMaximize = () => {
    if (isTauri) {
      import("@tauri-apps/api/window").then(({ getCurrentWindow }) => {
        getCurrentWindow().toggleMaximize();
      });
    }
  };

  const handleClose = () => {
    if (isTauri) {
      import("@tauri-apps/api/window").then(({ getCurrentWindow }) => {
        getCurrentWindow().close();
      });
    }
  };

  return (
    <div
      className="titlebar-drag flex items-center h-[var(--spacing-titlebar-h)] flex-shrink-0 px-4 relative z-20"
      style={{ 
        background: "rgba(10, 8, 15, 0.6)", 
        backdropFilter: "blur(16px)", 
        borderBottom: "1px solid rgba(255,255,255,0.08)" 
      }}
    >
      <div className="flex items-center gap-2.5 flex-1">
        <Sparkles size={14} className="text-pink-400" />
        <span className="text-[11px] font-bold tracking-[0.2em] uppercase text-white/80">
          Prompt Muse
        </span>
        {!isTauri && (
          <span className="text-[9px] font-bold ml-2 px-1.5 py-[1px] rounded bg-pink-500/20 text-pink-300 border border-pink-500/30">
            DEV
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 titlebar-no-drag">
        <button
          className="w-3 h-3 rounded-full cursor-pointer border-none hover:opacity-80 hover:scale-110 transition-all shadow-[0_0_8px_rgba(254,188,46,0.4)]"
          style={{ background: "#FEBC2E" }}
          onClick={handleMinimize}
        />
        <button
          className="w-3 h-3 rounded-full cursor-pointer border-none hover:opacity-80 hover:scale-110 transition-all shadow-[0_0_8px_rgba(40,200,64,0.4)]"
          style={{ background: "#28C840" }}
          onClick={handleMaximize}
        />
        <button
          className="w-3 h-3 rounded-full cursor-pointer border-none hover:opacity-80 hover:scale-110 transition-all shadow-[0_0_8px_rgba(255,95,87,0.4)]"
          style={{ background: "#FF5F57" }}
          onClick={handleClose}
        />
      </div>
    </div>
  );
}
