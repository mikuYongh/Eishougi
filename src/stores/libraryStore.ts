import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';

export interface Character {
  id: string;
  characterTag: string;
  nameEn: string;
  nameZh: string | null;
  copyright: string | null;
  trigger: string;
  coreTags: string | null;
  count: number;
  imgUrl: string | null;
  isFavorite: boolean;
}

export interface Artist {
  id: string;
  artistTag: string;
  nameEn: string;
  nameZh: string | null;
  trigger: string;
  count: number;
  imgUrl: string | null;
  isFavorite: boolean;
}

interface LibraryState {
  characters: Character[];
  artists: Artist[];
  isCharactersLoading: boolean;
  isArtistsLoading: boolean;
  
  // Characters filters
  characterSearch: string;
  characterPage: number;
  characterShowFavorites: boolean;
  characterHasMore: boolean;

  // Artists filters
  artistSearch: string;
  artistPage: number;
  artistShowFavorites: boolean;
  artistHasMore: boolean;

  // Actions
  setCharacterSearch: (query: string) => void;
  setArtistSearch: (query: string) => void;
  toggleCharacterFavoriteFilter: () => void;
  toggleArtistFavoriteFilter: () => void;
  
  loadMoreCharacters: () => Promise<void>;
  loadMoreArtists: () => Promise<void>;
  
  toggleCharacterFavorite: (id: string) => Promise<void>;
  toggleArtistFavorite: (id: string) => Promise<void>;
}

const PAGE_SIZE = 50;

export const useLibraryStore = create<LibraryState>((set, get) => ({
  characters: [],
  artists: [],
  isCharactersLoading: false,
  isArtistsLoading: false,
  
  characterSearch: '',
  characterPage: 0,
  characterShowFavorites: false,
  characterHasMore: true,

  artistSearch: '',
  artistPage: 0,
  artistShowFavorites: false,
  artistHasMore: true,

  setCharacterSearch: (query: string) => {
    set({ characterSearch: query, characterPage: 0, characters: [], characterHasMore: true });
    get().loadMoreCharacters();
  },

  setArtistSearch: (query: string) => {
    set({ artistSearch: query, artistPage: 0, artists: [], artistHasMore: true });
    get().loadMoreArtists();
  },

  toggleCharacterFavoriteFilter: () => {
    const next = !get().characterShowFavorites;
    set({ characterShowFavorites: next, characterPage: 0, characters: [], characterHasMore: true });
    get().loadMoreCharacters();
  },

  toggleArtistFavoriteFilter: () => {
    const next = !get().artistShowFavorites;
    set({ artistShowFavorites: next, artistPage: 0, artists: [], artistHasMore: true });
    get().loadMoreArtists();
  },

  loadMoreCharacters: async () => {
    const state = get();
    if (state.isCharactersLoading || !state.characterHasMore) return;

    set({ isCharactersLoading: true });
    try {
      const results: Character[] = await invoke('search_characters', {
        search: state.characterSearch || null,
        limit: PAGE_SIZE,
        offset: state.characterPage * PAGE_SIZE,
        favorite: state.characterShowFavorites ? true : null
      });

      set({
        characters: state.characterPage === 0 ? results : [...state.characters, ...results],
        characterPage: state.characterPage + 1,
        characterHasMore: results.length === PAGE_SIZE,
      });
    } catch (e) {
      console.error("Failed to load characters", e);
    } finally {
      set({ isCharactersLoading: false });
    }
  },

  loadMoreArtists: async () => {
    const state = get();
    if (state.isArtistsLoading || !state.artistHasMore) return;

    set({ isArtistsLoading: true });
    try {
      const results: Artist[] = await invoke('search_artists', {
        search: state.artistSearch || null,
        limit: PAGE_SIZE,
        offset: state.artistPage * PAGE_SIZE,
        favorite: state.artistShowFavorites ? true : null
      });

      set({
        artists: state.artistPage === 0 ? results : [...state.artists, ...results],
        artistPage: state.artistPage + 1,
        artistHasMore: results.length === PAGE_SIZE,
      });
    } catch (e) {
      console.error("Failed to load artists", e);
    } finally {
      set({ isArtistsLoading: false });
    }
  },

  toggleCharacterFavorite: async (id: string) => {
    try {
      const isFav: boolean = await invoke('toggle_favorite_character', { id });
      set(state => ({
        characters: state.characters.map(c => 
          c.id === id ? { ...c, isFavorite: isFav } : c
        )
      }));
    } catch (e) {
      console.error("Failed to toggle character favorite", e);
    }
  },

  toggleArtistFavorite: async (id: string) => {
    try {
      const isFav: boolean = await invoke('toggle_favorite_artist', { id });
      set(state => ({
        artists: state.artists.map(a => 
          a.id === id ? { ...a, isFavorite: isFav } : a
        )
      }));
    } catch (e) {
      console.error("Failed to toggle artist favorite", e);
    }
  }
}));
