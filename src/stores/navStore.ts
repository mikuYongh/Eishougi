import { create } from "zustand";
import type { NavId } from "../types";

interface NavState {
  activeNav: NavId;
  setActiveNav: (nav: NavId) => void;
}

export const useNavStore = create<NavState>((set) => ({
  activeNav: "dashboard",
  setActiveNav: (activeNav) => set({ activeNav }),
}));
