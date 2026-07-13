import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface McpServerConfig {
  name: string;
  enabled: boolean;
  url: string;
}

export interface AppSettings {
  comfyUrl: string;
  videoComfyUrl: string;
  comfyDir: string;
  autoSave: boolean;
  llm: {
    provider: 'openai' | 'anthropic' | 'ollama' | 'agnes';
    apiKey: string;
    apiUrl: string;
    model: string;
    temperature: number;
    maxTokens: number;
  };
  mcpServers: McpServerConfig[];
  // MCP server (exposing this app's tools to external AI clients like Claude Desktop / Cursor).
  // The actual running state + token live in the Rust backend (persisted in mcp_server.json);
  // these are just the UI-side toggles that mirror what the backend was last told.
  mcpServer: {
    port: number;
    core: boolean;
    query: boolean;
    write: boolean;
  };
  slimToolsMode: boolean;
  /// Subfolder name (relative to OS Pictures/Downloads) where saved images go.
  /// Empty = use default ("Eishougi"). On Android: Pictures/<folder>/, on desktop: Downloads/<folder>/photo/.
  saveFolder: string;
  /// Desktop-only absolute save directory. When set, generated images go directly
  /// into this folder (e.g. D:\Pictures\AI). Empty = fall back to Downloads/<saveFolder>/photo/.
  /// Mobile ignores this field entirely (uses saveFolder via the gallery API).
  saveDir: string;
  wallpaperPath: string;
  appTheme: 'dark' | 'light' | 'system';
  colorTheme: 'sakura' | 'classic' | 'green' | 'night' | 'cyber';
  blurLevel: number;
  privacyMode: boolean;
  uiScale: number;
  hasCompletedOnboarding: boolean;
}

interface SettingsState {
  settings: AppSettings;
  wallpaperPath: string;
  blurLevel: number;
  appTheme: 'dark' | 'light' | 'system';
  colorTheme: 'sakura' | 'classic' | 'green' | 'night' | 'cyber';
  uiScale: number;
  updateSettings: (newSettings: Partial<AppSettings>) => void;
  setWallpaperPath: (path: string) => void;
  setBlurLevel: (level: number) => void;
  setAppTheme: (theme: 'dark' | 'light' | 'system') => void;
  setColorTheme: (theme: 'sakura' | 'classic' | 'green' | 'night' | 'cyber') => void;
  setUiScale: (scale: number) => void;
  toggleTheme: () => void;
  resetWallpaper: () => void;
  setPrivacyMode: (enabled: boolean) => void;
}

const defaultSettings: AppSettings = {
  comfyUrl: import.meta.env.VITE_COMFY_URL || 'http://127.0.0.1:8188',
  videoComfyUrl: 'http://127.0.0.1:8188',
  comfyDir: import.meta.env.VITE_COMFY_DIR || 'C:\\ComfyUI',
  autoSave: true,
  llm: {
    provider: 'agnes',
    // SECURITY: apiKey MUST stay empty here. Never read it from import.meta.env at build time —
    // Vite inlines VITE_* vars into the JS bundle, which gets shipped inside the APK. Anyone who
    // unpacks the APK (jadx / unzip) could then read the key. Keys belong only in the user's own
    // device storage (localStorage via zustand persist), entered through Settings.
    apiKey: '',
    apiUrl: import.meta.env.VITE_LLM_API_URL || 'https://apihub.agnes-ai.com/v1',
    model: import.meta.env.VITE_LLM_MODEL || 'agnes-2.0-flash',
    temperature: 0.7,
    maxTokens: 8192
  },
  slimToolsMode: false,
  saveFolder: 'Eishougi',
  saveDir: '',
  mcpServers: [
    {
      name: "Danbooru 标签搜索",
      enabled: true,
      url: "https://sakizuki-danboorusearchonline.ms.show/mcp/mcp"
    }
  ],
  mcpServer: {
    port: 21434,
    core: true,
    query: true,
    write: false,
  },
  wallpaperPath: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=2560&auto=format&fit=crop',
  appTheme: 'dark',
  colorTheme: 'sakura',
  blurLevel: 20,
  privacyMode: false,
  uiScale: 1,
  hasCompletedOnboarding: false,
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      settings: defaultSettings,
      wallpaperPath: defaultSettings.wallpaperPath,
      blurLevel: defaultSettings.blurLevel,
      appTheme: defaultSettings.appTheme,
      colorTheme: defaultSettings.colorTheme,
      uiScale: defaultSettings.uiScale,
      updateSettings: (newSettings) => set((state) => ({
        settings: { ...state.settings, ...newSettings }
      })),
      setWallpaperPath: (path) => set({ wallpaperPath: path }),
      setBlurLevel: (level) => set({ blurLevel: level }),
      setAppTheme: (theme) => set({ appTheme: theme }),
      setColorTheme: (theme) => set({ colorTheme: theme }),
      setUiScale: (scale) => set({ uiScale: scale }),
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
