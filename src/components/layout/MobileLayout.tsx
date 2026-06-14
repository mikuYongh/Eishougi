import React from "react";
import { MobileTopBar } from "./MobileTopBar";
import { MobileBottomNav } from "./MobileBottomNav";
import { CompletionToast } from "../ui/CompletionToast";
import { MobileAgentModal } from "../agent/MobileAgentModal";

interface MobileLayoutProps {
  children: React.ReactNode;
}

export function MobileLayout({ children }: MobileLayoutProps) {
  return (
    <div className="flex-1 flex flex-col overflow-hidden relative">
      <MobileTopBar />
      <CompletionToast />
      
      {/* Main Scrollable Content Area */}
      {/* We add pb-24 to ensure the content is not hidden behind the bottom nav */}
      <div className="flex-1 overflow-y-auto px-4 py-4 pb-28 scroll-smooth">
        {children}
      </div>

      <MobileBottomNav />
      <MobileAgentModal />
    </div>
  );
}
