import { create } from "zustand";

type AppTheme = "dark" | "light";

interface SettingsState {
  wallpaperPath: string;
  setWallpaperPath: (path: string) => void;
  resetWallpaper: () => void;
  
  appTheme: AppTheme;
  setAppTheme: (theme: AppTheme) => void;
  toggleTheme: () => void;
  
  blurLevel: number;
  setBlurLevel: (level: number) => void;
}

const DEFAULT_WALLPAPER = "/anime_bg.png";
const DEFAULT_BLUR = 20;

// Migration: If user had the old default cached, force upgrade it
let initialWallpaper = localStorage.getItem("prompt-muse-wallpaper");
if (!initialWallpaper || initialWallpaper === "/bg.png") {
  initialWallpaper = DEFAULT_WALLPAPER;
  localStorage.setItem("prompt-muse-wallpaper", DEFAULT_WALLPAPER);
}

export const useSettingsStore = create<SettingsState>((set) => ({
  wallpaperPath: initialWallpaper,
  setWallpaperPath: (path) => {
    localStorage.setItem("prompt-muse-wallpaper", path);
    set({ wallpaperPath: path });
  },
  resetWallpaper: () => {
    localStorage.setItem("prompt-muse-wallpaper", DEFAULT_WALLPAPER);
    set({ wallpaperPath: DEFAULT_WALLPAPER });
  },
  
  appTheme: (localStorage.getItem("prompt-muse-theme-mode") as AppTheme) || "dark",
  setAppTheme: (theme) => {
    localStorage.setItem("prompt-muse-theme-mode", theme);
    set({ appTheme: theme });
  },
  toggleTheme: () => set((state) => {
    const newTheme = state.appTheme === "dark" ? "light" : "dark";
    localStorage.setItem("prompt-muse-theme-mode", newTheme);
    return { appTheme: newTheme };
  }),
  
  blurLevel: parseInt(localStorage.getItem("prompt-muse-blur") || String(DEFAULT_BLUR)),
  setBlurLevel: (level) => {
    localStorage.setItem("prompt-muse-blur", String(level));
    set({ blurLevel: level });
  },
}));
