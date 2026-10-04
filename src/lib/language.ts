import { create } from 'zustand';

/** Explanation language. Only the wording changes; every amount is still the engine's and checked. */
export type Language = 'en' | 'es';

export const useLanguage = create<{ language: Language; setLanguage: (l: Language) => void }>()((set) => ({
  language: 'en',
  setLanguage: (language) => set({ language }),
}));
