import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

export type Lang = 'en' | 'tr';
export type Mode = 'system' | 'light' | 'dark';
type Prefs = { lang: Lang; mode: Mode; ready: boolean };

const KEY = 'doneva-prefs';

function deviceLang(): Lang {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale.toLowerCase().startsWith('tr') ? 'tr' : 'en';
  } catch {
    return 'en';
  }
}

// Kept outside React so that plain helpers (dates, translations) can read the language too.
let prefs: Prefs = { lang: deviceLang(), mode: 'system', ready: false };
const listeners = new Set<() => void>();

function set(next: Partial<Prefs>, save = true) {
  prefs = { ...prefs, ...next };
  listeners.forEach((listener) => listener());
  if (save) AsyncStorage.setItem(KEY, JSON.stringify({ lang: prefs.lang, mode: prefs.mode })).catch(() => {});
}

AsyncStorage.getItem(KEY)
  .then((saved) => {
    const value = saved ? (JSON.parse(saved) as Partial<Prefs>) : {};
    set(
      {
        lang: value.lang === 'tr' || value.lang === 'en' ? value.lang : prefs.lang,
        mode: value.mode === 'light' || value.mode === 'dark' ? value.mode : 'system',
        ready: true,
      },
      false,
    );
  })
  .catch(() => set({ ready: true }, false));

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** The person's language and day or night choice on this device. */
export function usePrefs() {
  return useSyncExternalStore(subscribe, () => prefs, () => prefs);
}

export const currentLang = () => prefs.lang;
export const setLang = (lang: Lang) => set({ lang });
export const setMode = (mode: Mode) => set({ mode });
