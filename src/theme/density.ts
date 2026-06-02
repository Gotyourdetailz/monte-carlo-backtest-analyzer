/**
 * Density persistence + application.
 *
 * Density scales the root font-size (rem base), which in turn scales all
 * rem-based Tailwind spacing. 'spacious' is the default. SSR/test-safe.
 */

export type Density = 'spacious' | 'compact';

const STORAGE_KEY = 'mc-density';

const VALID_DENSITIES: ReadonlySet<string> = new Set<Density>([
  'spacious',
  'compact',
]);

/** Read + validate the stored density; fall back to 'spacious'. */
export function loadDensity(): Density {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return 'spacious';
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw !== null && VALID_DENSITIES.has(raw)) {
      return raw as Density;
    }
  } catch {
    // localStorage access can throw (privacy mode / disabled storage).
  }
  return 'spacious';
}

/** Persist the density. No-ops when storage is unavailable. */
export function saveDensity(density: Density): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return;
  }
  try {
    localStorage.setItem(STORAGE_KEY, density);
  } catch {
    // Ignore write failures (quota / disabled storage).
  }
}

/** Apply density to the document root via `data-density`. */
export function applyDensity(density: Density): void {
  if (typeof document === 'undefined' || document.documentElement == null) {
    return;
  }
  document.documentElement.dataset.density = density;
}
