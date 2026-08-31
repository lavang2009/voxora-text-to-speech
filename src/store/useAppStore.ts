import { create } from "zustand";

import type {
  AppUser,
  HistoryItem,
  Preferences,
  Voice,
} from "../types";

const defaultPreferences: Preferences = {
  defaultLanguage: "vi-VN",
  defaultVoice: "",
  defaultSpeed: 1,
  defaultPitch: 0,
  defaultVolume: 1,
  defaultFormat: "mp3",
  theme: "system",
};

type AppState = {
  user: AppUser | null;

  voices: Voice[];

  favorites: Record<string, Voice>;

  history: HistoryItem[];

  preferences: Preferences;

  setUser: (
    user: AppUser | null
  ) => void;

  setVoices: (
    voices: Voice[]
  ) => void;

  setFavorites: (
    voices: Voice[]
  ) => void;

  setHistory: (
    history: HistoryItem[]
  ) => void;

  toggleFavorite: (
    voice: Voice
  ) => void;

  setPreferences: (
    preferences: Partial<Preferences>
  ) => void;

  resetStore: () => void;
};

const initialState = {
  user: null,

  voices: [] as Voice[],

  favorites: {} as Record<
    string,
    Voice
  >,

  history: [] as HistoryItem[],

  preferences:
    defaultPreferences,
};

export const useAppStore =
  create<AppState>((set) => ({
    ...initialState,

    setUser: (user) => {
      set({
        user: user ?? null,
      });
    },

    setVoices: (voices) => {
      set({
        voices: Array.isArray(voices)
          ? voices
          : [],
      });
    },

    setFavorites: (voices) => {
      const safeVoices =
        Array.isArray(voices)
          ? voices.filter(
              (
                voice
              ): voice is Voice =>
                Boolean(
                  voice &&
                  voice.id
                )
            )
          : [];

      set({
        favorites:
          Object.fromEntries(
            safeVoices.map(
              (voice) => [
                voice.id,
                voice,
              ]
            )
          ),
      });
    },

    setHistory: (history) => {
      set({
        history:
          Array.isArray(history)
            ? history
            : [],
      });
    },

    toggleFavorite: (voice) => {
      if (
        !voice ||
        !voice.id
      ) {
        return;
      }

      set((state) => {
        const current =
          state.favorites &&
          typeof state.favorites ===
            "object"
            ? state.favorites
            : {};

        const next = {
          ...current,
        };

        if (next[voice.id]) {
          delete next[voice.id];
        } else {
          next[voice.id] = voice;
        }

        return {
          favorites: next,
        };
      });
    },

    setPreferences: (
      preferences
    ) => {
      set((state) => ({
        preferences: {
          ...defaultPreferences,
          ...(state.preferences ||
            {}),
          ...(preferences ||
            {}),
        },
      }));
    },

    resetStore: () => {
      set({
        user: null,
        voices: [],
        favorites: {},
        history: [],
        preferences: {
          ...defaultPreferences,
        },
      });
    },
  }));
