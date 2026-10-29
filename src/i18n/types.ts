export type Locale = "en" | "mr" | "hi";

export interface LocaleOption {
  code: Locale;
  label: string;
  nativeLabel: string;
}

export const locales: readonly LocaleOption[] = [
  { code: "en", label: "English", nativeLabel: "English" },
  { code: "mr", label: "Marathi", nativeLabel: "मराठी" },
  { code: "hi", label: "Hindi", nativeLabel: "हिंदी" },
];

export const DEFAULT_LOCALE: Locale = "en";

export type PhraseMap = Record<string, string>;

export type AreaMessages = {
  mr: PhraseMap;
  hi: PhraseMap;
};

export type TranslationVars = Record<string, string | number>;
