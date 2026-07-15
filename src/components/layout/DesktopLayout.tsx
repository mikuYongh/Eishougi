import React from "react";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { StatusBar } from "./StatusBar";
import { BottomNav } from "./BottomNav";
import { AgentPanel } from "../../agent/AgentPanel";
import { CompletionToast } from "../ui/CompletionToast";
import { useSettingsStore } from "../../stores/settingsStore";

interface DesktopLayoutProps {
  children: React.ReactNode;
}

export function DesktopLayout({ children }: DesktopLayoutProps) {
  const { uiScale } = useSettingsStore();

  return (
    <div className="flex-1 flex overflow-hidden relative">
      <Sidebar />

      {/* Main Area — padding-right 给 agent overlay 窄栏让出空间 */}
      <div id="main-content-area" className="flex-1 flex flex-col overflow-hidden bg-transparent relative" style={{ paddingRight: "60px" }}>
        <TopBar />
        <CompletionToast />
        <div 
          className="flex-1 overflow-y-auto px-5 py-5 scroll-smooth custom-scrollbar origin-top" 
          style={{ zoom: uiScale || 1 }}
        >
          {children}
        </div>
        <BottomNav />
        <StatusBar />
      </div>

      <AgentPanel />
    </div>
  );
}
