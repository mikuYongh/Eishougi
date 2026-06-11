import { useEffect } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { convertFileSrc } from "@tauri-apps/api/core";
import { useSettingsStore } from "./stores/settingsStore";
import { TitleBar } from "./components/layout/TitleBar";
import { Sidebar } from "./components/layout/Sidebar";
import { TopBar } from "./components/layout/TopBar";
import { StatusBar } from "./components/layout/StatusBar";
import { AgentPanel } from "./components/agent/AgentPanel";

import { Dashboard } from "./pages/Dashboard";
import {
  PromptList, PromptEdit, PromptDetail,
  WorkflowList, WorkflowEdit,
  Generate, VideoGenerate,
  Tagger, Gallery, History, Settings,
} from "./pages";
import { usePromptStore } from "./stores/promptStore";
import { useWorkflowStore } from "./stores/workflowStore";

export default function App() {
  const { wallpaperPath, appTheme, colorTheme, blurLevel } = useSettingsStore();
  const fetchPrompts = usePromptStore((state) => state.fetchPrompts);
  const fetchWorkflows = useWorkflowStore((state) => state.fetchWorkflows);

  useEffect(() => {
    fetchPrompts();
    fetchWorkflows();
  }, [fetchPrompts, fetchWorkflows]);

  // Determine effective theme (handling 'system' if needed, but for now fallback to dark)
  const isLight = appTheme === 'light';

  return (
    <BrowserRouter>
      {/* Background */}
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
        {/* Main Background Image */}
        <div
          className="absolute inset-[-20px] bg-cover bg-center scale-105 transition-all duration-700"
          style={{ 
            backgroundImage: `url("${(wallpaperPath.startsWith('http') || wallpaperPath.startsWith('data:') || wallpaperPath.startsWith('blob:')) ? wallpaperPath : convertFileSrc(wallpaperPath)}")`,
            filter: `blur(${blurLevel}px)`
          }}
        />
        {/* Theme Overlays */}
        {isLight ? (
          <>
            <div className="absolute inset-0 bg-white/40 mix-blend-overlay transition-colors duration-700" />
            <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-white/60 transition-colors duration-700" />
          </>
        ) : (
          <>
            <div className="absolute inset-0 bg-[var(--glass-bg)] mix-blend-multiply transition-colors duration-700" />
            <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/80 transition-colors duration-700" />
          </>
        )}
        {/* Noise overlay for texture */}
        <div className="absolute inset-0 opacity-[0.03] bg-repeat bg-[length:256px_256px]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          }}
        />
      </div>

      {/* App Window */}
      <div className={`relative z-10 w-screen h-screen flex flex-col bg-transparent transition-colors duration-700 ${isLight ? "light-mode" : ""} theme-${colorTheme}`}>
        <TitleBar />

        <div className="flex-1 flex overflow-hidden">
          <Sidebar />

          {/* Main Area */}
          <div className="flex-1 flex flex-col overflow-hidden bg-transparent">
            <TopBar />
            <div className="flex-1 overflow-y-auto px-5 py-5">
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/prompts" element={<PromptList />} />
                <Route path="/prompts/new" element={<PromptEdit />} />
                <Route path="/prompts/:id" element={<PromptDetail />} />
                <Route path="/prompts/:id/edit" element={<PromptEdit />} />
                <Route path="/workflows" element={<WorkflowList />} />
                <Route path="/workflows/new" element={<WorkflowEdit />} />
                <Route path="/workflows/:id" element={<WorkflowEdit />} />
                <Route path="/workflows/:id/edit" element={<WorkflowEdit />} />
                <Route path="/generate/:promptId?" element={<Generate />} />
                <Route path="/video/:imagePath?" element={<VideoGenerate />} />
                <Route path="/tagger" element={<Tagger />} />
                <Route path="/gallery" element={<Gallery />} />
                <Route path="/history" element={<History />} />
                <Route path="/settings" element={<Settings />} />
              </Routes>
            </div>
            <StatusBar />
          </div>

          <AgentPanel />
        </div>
      </div>
    </BrowserRouter>
  );
}
