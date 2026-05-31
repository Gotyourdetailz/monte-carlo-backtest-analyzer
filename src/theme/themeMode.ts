/**
 * Theme mode persistence + resolution.
 *
 * `ThemeMode` is the user's stored preference (may be 'system'); `ResolvedTheme`
 * is the concrete theme actually applied. All functions are SSR/test-safe:
 * absent `window`, `document`, `localStorage` or `matchMedia` degrade to sane
 * defaults rather than throwing.
 */

export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'mc-theme-mode';

const VALID_MODES: ReadonlySet<string> = new Set<ThemeMode>([
  'light',
  'dark',
  'system',
]);

/** Read + validate the stored theme mode; fall back to 'system'. */
export function loadThemeMode(): ThemeMode {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return 'system';
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw !== null && VALID_MODES.has(raw)) {
      return raw as ThemeMode;
    }
  } catch {
    // localStorage access can throw (privacy mode / disabled storage).
  }
  return 'system';
}

/** Persist the theme mode. No-ops when storage is unavailable. */
export function saveThemeMode(mode: ThemeMode): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return;
  }
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // Ignore write failures (quota / disabled storage).
  }
}

/**
 * Resolve a stored mode to a concrete theme. 'system' consults
 * `prefers-color-scheme`. Anything malformed (or unavailable matchMedia)
 * resolves to 'dark', the application default.
 */
export function resolveTheme(mode: ThemeMode): ResolvedTheme {
  if (mode === 'light') return 'light';
  if (mode === 'dark') return 'dark';
  // mode === 'system' (or unexpected): consult the OS preference.
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    try {
      return window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
    } catch {
      // matchMedia can throw in constrained environments.
    }
  }
  return 'dark';
}

/**
 * Apply the resolved theme to the document root. Light mode sets
 * `data-theme="light"` (matching the `[data-theme="light"]` selector in
 * theme.css); dark mode clears the attribute so the default `:root` applies.
 */
export function applyResolvedTheme(resolved: ResolvedTheme): void {
  if (typeof document === 'undefined' || document.documentElement == null) {
    return;
  }
  if (resolved === 'light') {
    document.documentElement.dataset.theme = 'light';
  } else {
    delete document.documentElement.dataset.theme;
  }
}
