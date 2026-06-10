import { create } from "zustand";
import type { Prompt, PromptFilter, Tag } from "../types";

interface PromptState {
  prompts: Prompt[];
  tags: Tag[];
  filter: PromptFilter;
  loading: boolean;
  setPrompts: (prompts: Prompt[]) => void;
  setTags: (tags: Tag[]) => void;
  setFilter: (filter: Partial<PromptFilter>) => void;
  setLoading: (loading: boolean) => void;
}

export const usePromptStore = create<PromptState>((set) => ({
  prompts: [],
  tags: [],
  filter: {},
  loading: false,
  setPrompts: (prompts) => set({ prompts }),
  setTags: (tags) => set({ tags }),
  setFilter: (filter) => set((s) => ({ filter: { ...s.filter, ...filter } })),
  setLoading: (loading) => set({ loading }),
}));
