export type AppLanguage = "ar" | "en";
export type AppTheme = "light" | "dark";

export function readLanguage(value: string | null | undefined): AppLanguage {
  return value === "en" ? "en" : "ar";
}

export function readTheme(value: string | null | undefined, fallback: AppTheme = "dark"): AppTheme {
  return value === "light" || value === "dark" ? value : fallback;
}

export function nextTheme(theme: AppTheme): AppTheme {
  return theme === "dark" ? "light" : "dark";
}

export type PreferenceStorage = Pick<Storage, "getItem" | "setItem">;

export function saveLanguage(storage: PreferenceStorage, language: AppLanguage): void {
  storage.setItem("cyberjocx-language", language);
}

export function saveTheme(storage: PreferenceStorage, theme: AppTheme): void {
  storage.setItem("theme", theme);
}
