/**
 * Theme context provider + pre-render initializer.
 *
 * `initThemeBeforeRender()` is called synchronously by main.tsx BEFORE React
 * mounts, so the correct theme/density attributes are on <html> on first paint
 * (no flash of the wrong theme). The provider then owns runtime state and keeps
 * the document in sync, including live OS preference changes while in 'system'.
 */

import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { ReactElement, ReactNode } from 'react';
import {
  loadThemeMode,
  saveThemeMode,
  resolveTheme,
  applyResolvedTheme,
  type ThemeMode,
  type ResolvedTheme,
} from './themeMode';
import {
  loadDensity,
  saveDensity,
  applyDensity,
  type Density,
} from './density';

interface ThemeContextValue {
  mode: ThemeMode;
  resolved: ResolvedTheme;
  density: Density;
  setMode: (mode: ThemeMode) => void;
  setDensity: (density: Density) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * Synchronously load persisted preferences and apply them to <html>. Safe to
 * call before React renders. Returns nothing; reads storage, writes the DOM.
 */
export function initThemeBeforeRender(): void {
  const mode = loadThemeMode();
  applyResolvedTheme(resolveTheme(mode));
  applyDensity(loadDensity());
}

export function ThemeProvider({
  children,
}: {
  children: ReactNode;
}): ReactElement {
  const [mode, setModeState] = useState<ThemeMode>(() => loadThemeMode());
  const [density, setDensityState] = useState<Density>(() => loadDensity());
  const [resolved, setResolved] = useState<ResolvedTheme>(() =>
    resolveTheme(mode),
  );

  // Keep the document in sync whenever the resolved theme changes.
  useEffect(() => {
    applyResolvedTheme(resolved);
  }, [resolved]);

  // Keep the document in sync whenever density changes.
  useEffect(() => {
    applyDensity(density);
  }, [density]);

  // Recompute the resolved theme when the stored mode changes, and — while in
  // 'system' — subscribe to OS preference changes so the UI tracks live.
  useEffect(() => {
    setResolved(resolveTheme(mode));

    if (mode !== 'system') return;
    if (
      typeof window === 'undefined' ||
      typeof window.matchMedia !== 'function'
    ) {
      return;
    }

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (): void => {
      setResolved(media.matches ? 'dark' : 'light');
    };
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [mode]);

  const setMode = useCallback((next: ThemeMode): void => {
    setModeState(next);
    saveThemeMode(next);
  }, []);

  const setDensity = useCallback((next: Density): void => {
    setDensityState(next);
    saveDensity(next);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ mode, resolved, density, setMode, setDensity }),
    [mode, resolved, density, setMode, setDensity],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

/** Access theme context. Throws if used outside a `ThemeProvider`. */
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (ctx === null) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return ctx;
}
