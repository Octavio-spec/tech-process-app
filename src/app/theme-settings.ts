export const THEME_STORAGE_KEY = "tech-process-theme";

export type AppTheme = "light" | "dark";

export const defaultTheme: AppTheme = "light";

export function parseTheme(value: string | null): AppTheme {
  return value === "dark" ? "dark" : "light";
}

export function applyTheme(theme: AppTheme) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}
