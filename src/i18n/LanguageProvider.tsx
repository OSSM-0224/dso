"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { messages } from "./messages/index.ts";
import {
  DEFAULT_LOCALE,
  locales,
  type Locale,
  type TranslationVars,
} from "./types.ts";

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (phrase: string, vars?: TranslationVars) => string;
}

const I18nContext = createContext<I18nContextValue | undefined>(undefined);

const STORAGE_KEY = "dso-locale";

function isLocale(value: string | null): value is Locale {
  return locales.some((option) => option.code === value);
}

function interpolate(text: string, vars?: TranslationVars): string {
  if (!vars) return text;
  let result = text;
  for (const [key, value] of Object.entries(vars)) {
    result = result.split(`{${key}}`).join(String(value));
  }
  return result;
}

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (isLocale(stored)) setLocaleState(stored);
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    try {
      window.localStorage.setItem(STORAGE_KEY, locale);
    } catch {
      // Storage can be unavailable (private mode); language still applies.
    }
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
  }, []);

  const t = useCallback(
    (phrase: string, vars?: TranslationVars) => {
      const translated =
        locale === "en" ? phrase : messages[locale][phrase] ?? phrase;
      return interpolate(translated, vars);
    },
    [locale]
  );

  const value = useMemo<I18nContextValue>(
    () => ({ locale, setLocale, t }),
    [locale, setLocale, t]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used within a LanguageProvider");
  }
  return context;
}
