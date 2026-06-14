import { useEffect } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { convertFileSrc } from "@tauri-apps/api/core";
import { useSettingsStore } from "./stores/settingsStore";
import { TitleBar } from "./components/layout/TitleBar";
import { Sidebar } from "./components/layout/Sidebar";
import { BottomNav } from "./components/layout/BottomNav";
import { TopBar } from "./components/layout/TopBar";
import { StatusBar } from "./components/layout/StatusBar";
import { AgentPanel } from "./components/agent/AgentPanel";
import { CompletionToast } from "./components/ui/CompletionToast";

import { Dashboard } from "./pages/Dashboard";
import {
  PromptList, PromptEdit, PromptDetail,
  WorkflowList, WorkflowEdit,
  Generate, VideoGenerate,
  Tagger, History, Settings,
} from "./pages";
import { CharacterLibrary } from "./pages/library/CharacterLibrary";
import { ArtistLibrary } from "./pages/library/ArtistLibrary";
import { Vault } from "./pages/vault/Vault";
import { usePromptStore } from "./stores/promptStore";
import { useWorkflowStore } from "./stores/workflowStore";
import { useDevice } from "./hooks/useDevice";
import { DesktopLayout } from "./components/layout/DesktopLayout";
import { MobileLayout } from "./components/layout/MobileLayout";

export default function App() {
  const { isMobile } = useDevice();
  const { wallpaperPath, appTheme, colorTheme, blurLevel, uiScale } = useSettingsStore();
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
        {/* TitleBar for desktop window dragging (hidden on mobile naturally if not Tauri window, but we keep it) */}
        {!isMobile && <TitleBar />}

        {isMobile ? (
          <MobileLayout>
            <AppRoutes />
          </MobileLayout>
        ) : (
          <DesktopLayout>
            <AppRoutes />
          </DesktopLayout>
        )}
      </div>
    </BrowserRouter>
  );
}

// Extract routes to avoid duplication
function AppRoutes() {
  return (
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
      <Route path="/characters" element={<CharacterLibrary />} />
      <Route path="/artists" element={<ArtistLibrary />} />
      <Route path="/history" element={<History />} />
      <Route path="/vault" element={<Vault />} />
      <Route path="/settings" element={<Settings />} />
    </Routes>
  );
}
