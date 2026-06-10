import { create } from "zustand";
import type { ThemeId } from "../types";

interface ThemeState {
  theme: ThemeId;
  setTheme: (theme: ThemeId) => void;
}

export const useThemeStore = create<ThemeState>((set) => ({
  theme: (localStorage.getItem("prompt-muse-theme") as ThemeId) || "sakura",
  setTheme: (theme) => {
    localStorage.setItem("prompt-muse-theme", theme);
    set({ theme });
  },
}));
