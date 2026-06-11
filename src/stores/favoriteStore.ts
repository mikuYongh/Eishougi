import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';

export interface FavoritePrompt {
  id: string;
  content: string; // single tag or full text
  type: 'positive' | 'negative';
  label?: string;
  createdAt: number;
}

interface FavoriteStore {
  positiveFavorites: FavoritePrompt[];
  negativeFavorites: FavoritePrompt[];
  fetchFavorites: () => Promise<void>;
  addFavorite: (content: string, type: 'positive' | 'negative', label?: string) => Promise<void>;
  deleteFavorite: (id: string) => Promise<void>;
}

export const useFavoriteStore = create<FavoriteStore>((set) => ({
  positiveFavorites: [],
  negativeFavorites: [],

  fetchFavorites: async () => {
    try {
      const pos = await invoke<FavoritePrompt[]>('get_favorite_prompts', { promptType: 'positive' });
      const neg = await invoke<FavoritePrompt[]>('get_favorite_prompts', { promptType: 'negative' });
      set({ positiveFavorites: pos, negativeFavorites: neg });
    } catch (e) {
      console.error("Failed to fetch favorite prompts:", e);
    }
  },

  addFavorite: async (content, type, label) => {
    try {
      const fav = await invoke<FavoritePrompt>('add_favorite_prompt', {
        content,
        promptType: type,
        label: label || null,
      });
      set((state) => {
        if (type === 'positive') {
          return { positiveFavorites: [fav, ...state.positiveFavorites] };
        } else {
          return { negativeFavorites: [fav, ...state.negativeFavorites] };
        }
      });
    } catch (e) {
      console.error("Failed to add favorite prompt:", e);
    }
  },

  deleteFavorite: async (id) => {
    try {
      await invoke('delete_favorite_prompt', { id });
      set((state) => ({
        positiveFavorites: state.positiveFavorites.filter(f => f.id !== id),
        negativeFavorites: state.negativeFavorites.filter(f => f.id !== id),
      }));
    } catch (e) {
      console.error("Failed to delete favorite prompt:", e);
    }
  },
}));
