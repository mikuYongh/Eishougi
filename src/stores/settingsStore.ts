import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface AppSettings {
  comfyUrl: string;
  llm: {
    provider: 'openai' | 'anthropic' | 'ollama' | 'agnes';
    apiKey: string;
    apiUrl: string;
    model: string;
  };
  slimToolsMode: boolean;
  wallpaperPath: string;
  appTheme: 'dark' | 'light' | 'system';
  blurLevel: number;
}

interface SettingsState {
  settings: AppSettings;
  wallpaperPath: string;
  blurLevel: number;
  appTheme: 'dark' | 'light' | 'system';
  updateSettings: (newSettings: Partial<AppSettings>) => void;
  setWallpaperPath: (path: string) => void;
  setBlurLevel: (level: number) => void;
  setAppTheme: (theme: 'dark' | 'light' | 'system') => void;
  resetWallpaper: () => void;
}

const defaultSettings: AppSettings = {
  comfyUrl: import.meta.env.VITE_COMFY_URL || 'http://127.0.0.1:8188',
  llm: {
    provider: 'agnes',
    apiKey: import.meta.env.VITE_LLM_API_KEY || '',
    apiUrl: import.meta.env.VITE_LLM_API_URL || 'https://apihub.agnes-ai.com/v1',
    model: import.meta.env.VITE_LLM_MODEL || 'agnes-2.0-flash'
  },
  slimToolsMode: false,
  wallpaperPath: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=2560&auto=format&fit=crop',
  appTheme: 'dark',
  blurLevel: 20,
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      settings: defaultSettings,
      wallpaperPath: defaultSettings.wallpaperPath,
      blurLevel: defaultSettings.blurLevel,
      appTheme: defaultSettings.appTheme,
      updateSettings: (newSettings) => set((state) => ({
        settings: { ...state.settings, ...newSettings }
      })),
      setWallpaperPath: (path) => set({ wallpaperPath: path }),
      setBlurLevel: (level) => set({ blurLevel: level }),
      setAppTheme: (theme) => set({ appTheme: theme }),
      resetWallpaper: () => set({ wallpaperPath: defaultSettings.wallpaperPath }),
    }),
    {
      name: 'eishougi-settings',
    }
  )
);
