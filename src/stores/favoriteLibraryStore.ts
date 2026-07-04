import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';

export interface FavoriteCharacterTagCount {
  tag: string;
  count: number;
}

export interface FavoriteCharacter {
  id: string;
  characterTag: string;
  displayName: string | null;
  source: 'gallery' | 'lora' | 'custom' | 'unknown';
  galleryCharacterId: string | null;
  trigger: string | null;
  exampleImage: string | null;
  notes: string | null;
  createdAt: number;
  updatedAt: number;
  resolvedImage: string | null;
  tags: string[] | null;
}

export interface FavoriteArtist {
  id: string;
  artistTag: string;
  displayName: string | null;
  source: 'gallery' | 'lora' | 'custom' | 'unknown';
  galleryArtistId: string | null;
  trigger: string | null;
  exampleImage: string | null;
  notes: string | null;
  createdAt: number;
  updatedAt: number;
  resolvedImage: string | null;
}

interface FavoriteState {
  characters: FavoriteCharacter[];
  artists: FavoriteArtist[];
  tags: FavoriteCharacterTagCount[];
  
  isCharactersLoading: boolean;
  isArtistsLoading: boolean;
  
  // Character Filters
  selectedTags: string[];
  tagMatchMode: 'all' | 'any';
  characterPage: number;
  characterHasMore: boolean;

  // Artist Filters
  artistSearch: string;
  artistPage: number;
  artistHasMore: boolean;

  // Actions
  fetchCharacters: (reset?: boolean) => Promise<void>;
  fetchArtists: (reset?: boolean) => Promise<void>;
  fetchTags: () => Promise<void>;
  
  setTagMatchMode: (mode: 'all' | 'any') => void;
  toggleTagFilter: (tag: string) => void;
  setArtistSearch: (search: string) => void;

  refreshFavorites: () => Promise<void>;

  // Character mutations
  addCharacter: (tag: string, source?: string, tags?: string[]) => Promise<void>;
  updateCharacter: (id: string, updates: Partial<FavoriteCharacter>) => Promise<void>;
  removeCharacter: (id: string) => Promise<void>;
  setCharacterTags: (id: string, tags: string[]) => Promise<void>;

  // Artist mutations
  addArtist: (tag: string, source?: string, notes?: string) => Promise<void>;
  updateArtist: (id: string, updates: Partial<FavoriteArtist>) => Promise<void>;
  removeArtist: (id: string) => Promise<void>;
}

export const useFavoriteLibraryStore = create<FavoriteState>((set, get) => ({
  characters: [],
  artists: [],
  tags: [],
  
  isCharactersLoading: false,
  isArtistsLoading: false,

  selectedTags: [],
  tagMatchMode: 'all',
  characterPage: 0,
  characterHasMore: true,

  artistSearch: '',
  artistPage: 0,
  artistHasMore: true,

  setTagMatchMode: (mode) => {
    set({ tagMatchMode: mode });
    get().fetchCharacters(true);
  },

  toggleTagFilter: (tag) => {
    const { selectedTags } = get();
    const newTags = selectedTags.includes(tag) 
      ? selectedTags.filter(t => t !== tag)
      : [...selectedTags, tag];
    set({ selectedTags: newTags });
    get().fetchCharacters(true);
  },

  setArtistSearch: (search) => {
    set({ artistSearch: search });
    get().fetchArtists(true);
  },

  fetchTags: async () => {
    try {
      const tags = await invoke<FavoriteCharacterTagCount[]>('list_favorite_character_tags');
      set({ tags });
    } catch (e) {
      console.error("Failed to fetch favorite tags:", e);
    }
  },

  fetchCharacters: async (reset = false) => {
    const { selectedTags, tagMatchMode, characterPage, characters } = get();
    set({ isCharactersLoading: true });
    try {
      const page = reset ? 0 : characterPage;
      // Map the UI mode to the value the Rust backend understands.
      // Rust's list_favorite_characters only treats the literal "and" (case-insensitive) as
      // AND semantics; every other value (including the UI default "all") falls back to OR.
      // Since the UI exposes multi-select tags expecting "match ALL", default "all" must map
      // to "and" so multi-tag filtering actually intersects instead of unions.
      const rustMode = tagMatchMode === 'all' ? 'and' : tagMatchMode === 'any' ? 'or' : tagMatchMode;
      const res = await invoke<FavoriteCharacter[]>('list_favorite_characters', {
        tags: selectedTags.length > 0 ? selectedTags : null,
        tagMatch: rustMode,
        limit: 50,
        offset: page * 50
      });
      set({
        characters: reset ? res : [...characters, ...res],
        characterPage: page + 1,
        characterHasMore: res.length === 50,
        isCharactersLoading: false
      });
    } catch (e) {
      console.error("Failed to fetch favorite characters:", e);
      set({ isCharactersLoading: false });
    }
  },

  fetchArtists: async (reset = false) => {
    const { artistSearch, artistPage, artists } = get();
    set({ isArtistsLoading: true });
    try {
      const page = reset ? 0 : artistPage;
      const res = await invoke<FavoriteArtist[]>('list_favorite_artists', {
        search: artistSearch || null,
        limit: 50,
        offset: page * 50
      });
      set({
        artists: reset ? res : [...artists, ...res],
        artistPage: page + 1,
        artistHasMore: res.length === 50,
        isArtistsLoading: false
      });
    } catch (e) {
      console.error("Failed to fetch favorite artists:", e);
      set({ isArtistsLoading: false });
    }
  },

  refreshFavorites: async () => {
    await Promise.all([
      get().fetchTags(),
      get().fetchCharacters(true),
      get().fetchArtists(true)
    ]);
  },

  addCharacter: async (tag, source, tags) => {
    try {
      await invoke('add_favorite_character', { characterTag: tag, source, tags });
      get().refreshFavorites();
    } catch (e) {
      console.error("Failed to add favorite character:", e);
      throw e;
    }
  },

  updateCharacter: async (id, updates) => {
    try {
      await invoke('update_favorite_character', {
        id,
        displayName: updates.displayName ?? null,
        trigger: updates.trigger ?? null,
        exampleImage: updates.exampleImage ?? null,
        notes: updates.notes ?? null,
      });
      if (updates.tags !== undefined) {
        await invoke('set_favorite_character_tags', { characterId: id, tags: updates.tags || [] });
      }
      get().refreshFavorites();
    } catch (e) {
      console.error("Failed to update favorite character:", e);
      throw e;
    }
  },

  removeCharacter: async (id) => {
    try {
      await invoke('remove_favorite_character', { id });
      get().refreshFavorites();
    } catch (e) {
      console.error("Failed to remove favorite character:", e);
      throw e;
    }
  },

  setCharacterTags: async (id, tags) => {
    try {
      await invoke('set_favorite_character_tags', { characterId: id, tags });
      get().refreshFavorites();
    } catch (e) {
      console.error("Failed to set favorite character tags:", e);
      throw e;
    }
  },

  addArtist: async (tag, source, notes) => {
    try {
      await invoke('add_favorite_artist', { artistTag: tag, source, notes });
      get().refreshFavorites();
    } catch (e) {
      console.error("Failed to add favorite artist:", e);
      throw e;
    }
  },

  updateArtist: async (id, updates) => {
    try {
      await invoke('update_favorite_artist', {
        id,
        displayName: updates.displayName ?? null,
        trigger: updates.trigger ?? null,
        exampleImage: updates.exampleImage ?? null,
        notes: updates.notes ?? null,
      });
      get().refreshFavorites();
    } catch (e) {
      console.error("Failed to update favorite artist:", e);
      throw e;
    }
  },

  removeArtist: async (id) => {
    try {
      await invoke('remove_favorite_artist', { id });
      get().refreshFavorites();
    } catch (e) {
      console.error("Failed to remove favorite artist:", e);
      throw e;
    }
  }
}));
