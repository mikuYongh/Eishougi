import { create } from "zustand";
import type { NavId } from "../types";

interface NavState {
  activeNav: NavId;
  setActiveNav: (nav: NavId) => void;
  isSidebarCollapsed: boolean;
  toggleSidebar: () => void;
}

export const useNavStore = create<NavState>((set) => ({
  activeNav: "dashboard",
  setActiveNav: (activeNav) => set({ activeNav }),
  isSidebarCollapsed: false,
  toggleSidebar: () => set((state) => ({ isSidebarCollapsed: !state.isSidebarCollapsed })),
}));
