import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface McpServerConfig {
  name: string;
  enabled: boolean;
  url: string;
}

export interface AppSettings {
  comfyUrl: string;
  llm: {
    provider: 'openai' | 'anthropic' | 'ollama' | 'agnes';
    apiKey: string;
    apiUrl: string;
    model: string;
    temperature: number;
    maxTokens: number;
  };
  mcpServers: McpServerConfig[];
  slimToolsMode: boolean;
  wallpaperPath: string;
  appTheme: 'dark' | 'light' | 'system';
  colorTheme: 'sakura' | 'classic' | 'green' | 'night' | 'cyber';
  blurLevel: number;
  privacyMode: boolean;
}

interface SettingsState {
  settings: AppSettings;
  wallpaperPath: string;
  blurLevel: number;
  appTheme: 'dark' | 'light' | 'system';
  colorTheme: 'sakura' | 'classic' | 'green' | 'night' | 'cyber';
  updateSettings: (newSettings: Partial<AppSettings>) => void;
  setWallpaperPath: (path: string) => void;
  setBlurLevel: (level: number) => void;
  setAppTheme: (theme: 'dark' | 'light' | 'system') => void;
  setColorTheme: (theme: 'sakura' | 'classic' | 'green' | 'night' | 'cyber') => void;
  toggleTheme: () => void;
  resetWallpaper: () => void;
  setPrivacyMode: (enabled: boolean) => void;
}

const defaultSettings: AppSettings = {
  comfyUrl: import.meta.env.VITE_COMFY_URL || 'http://127.0.0.1:8188',
  llm: {
    provider: 'agnes',
    apiKey: import.meta.env.VITE_LLM_API_KEY || '',
    apiUrl: import.meta.env.VITE_LLM_API_URL || 'https://apihub.agnes-ai.com/v1',
    model: import.meta.env.VITE_LLM_MODEL || 'agnes-2.0-flash',
    temperature: 0.7,
    maxTokens: 2048
  },
  slimToolsMode: false,
  mcpServers: [
    {
      name: "Danbooru 标签搜索",
      enabled: true,
      url: "https://sakizuki-danboorusearchonline.ms.show/mcp/mcp"
    }
  ],
  wallpaperPath: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=2560&auto=format&fit=crop',
  appTheme: 'dark',
  colorTheme: 'sakura',
  blurLevel: 20,
  privacyMode: false,
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      settings: defaultSettings,
      wallpaperPath: defaultSettings.wallpaperPath,
      blurLevel: defaultSettings.blurLevel,
      appTheme: defaultSettings.appTheme,
      colorTheme: defaultSettings.colorTheme,
      updateSettings: (newSettings) => set((state) => ({
        settings: { ...state.settings, ...newSettings }
      })),
      setWallpaperPath: (path) => set({ wallpaperPath: path }),
      setBlurLevel: (level) => set({ blurLevel: level }),
      setAppTheme: (theme) => set({ appTheme: theme }),
      setColorTheme: (theme) => set({ colorTheme: theme }),
      toggleTheme: () => set((state) => ({ appTheme: state.appTheme === 'dark' ? 'light' : 'dark' })),
      resetWallpaper: () => set({ wallpaperPath: defaultSettings.wallpaperPath }),
      setPrivacyMode: (enabled) => set((state) => ({ settings: { ...state.settings, privacyMode: enabled } })),
    }),
    {
      name: 'eishougi-settings',
      merge(persisted: unknown, current: SettingsState) {
        const p = persisted as Partial<SettingsState> | null;
        return {
          ...current,
          ...(p || {}),
          settings: {
            ...current.settings,
            ...(p?.settings || {}),
          },
        };
      },
    }
  )
);
