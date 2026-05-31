/**
 * Theme tokens — single source of truth for the color system.
 *
 * `darkTokens` and `lightTokens` MUST share identical keys (enforced by
 * `src/__tests__/property_theme_parity.test.ts`). The codegen script
 * `src/theme/generateThemeCss.ts` consumes these registries (plus the semantic
 * alias map) to emit `src/theme.css`.
 *
 * Accent hues are intentionally identical across modes; only background, border
 * and text tokens diverge between dark and light.
 */

/** Core color tokens for the default (dark) theme. */
export const darkTokens: Readonly<Record<string, string>> = {
  '--bg-primary': '#0a0e17',
  '--bg-secondary': '#0d1117',
  '--bg-card': '#161b22',
  '--bg-elevated': '#1c2333',
  '--border': '#30363d',
  '--border-bright': '#58a6ff',
  '--text-primary': '#e6edf3',
  '--text-secondary': '#8b949e',
  '--accent-blue': '#58a6ff',
  '--accent-green': '#3fb950',
  '--accent-red': '#f85149',
  '--accent-amber': '#d29922',
  '--accent-purple': '#d2a8ff',
  '--accent-magenta': '#e879f9',
};

/** Core color tokens for the light theme. Accent hues match `darkTokens`. */
export const lightTokens: Readonly<Record<string, string>> = {
  '--bg-primary': '#ffffff',
  '--bg-secondary': '#f6f8fa',
  '--bg-card': '#ffffff',
  '--bg-elevated': '#eff2f5',
  '--border': '#d0d7de',
  '--border-bright': '#0969da',
  '--text-primary': '#1f2328',
  '--text-secondary': '#5a6470',
  '--accent-blue': '#58a6ff',
  '--accent-green': '#3fb950',
  '--accent-red': '#f85149',
  '--accent-amber': '#d29922',
  '--accent-purple': '#d2a8ff',
  '--accent-magenta': '#e879f9',
};

/**
 * Convert a single 8-bit sRGB channel (0–255) to its linearized value per the
 * WCAG 2.x relative-luminance definition.
 */
function linearizeChannel(channel8bit: number): number {
  const c = channel8bit / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** Parse a `#rrggbb` (or `#rgb`) hex string into an `[r, g, b]` 0–255 tuple. */
function parseHex(hex: string): readonly [number, number, number] {
  const normalized = hex.trim().replace(/^#/, '');
  const full =
    normalized.length === 3
      ? normalized
          .split('')
          .map((ch) => ch + ch)
          .join('')
      : normalized;
  if (full.length !== 6 || /[^0-9a-fA-F]/.test(full)) {
    throw new Error(`Invalid hex color: "${hex}"`);
  }
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return [r, g, b];
}

/** WCAG relative luminance for a hex color in [0, 1]. */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHex(hex);
  return (
    0.2126 * linearizeChannel(r) +
    0.7152 * linearizeChannel(g) +
    0.0722 * linearizeChannel(b)
  );
}

/**
 * WCAG contrast ratio between two hex colors: `(L1 + 0.05) / (L2 + 0.05)`
 * where `L1 >= L2`. Result is in the range [1, 21].
 */
export function contrastRatio(hexA: string, hexB: string): number {
  const lumA = relativeLuminance(hexA);
  const lumB = relativeLuminance(hexB);
  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Supported UI densities. */
export const densities = ['spacious', 'compact'] as const;

/** Root font-size (px) driving rem-based spacing for each density. */
export const densityRootFontPx: Record<(typeof densities)[number], number> = {
  spacious: 16,
  compact: 14.5,
};

/**
 * shadcn/ui semantic aliases mapped onto the core tokens. These are emitted
 * once in `:root`; because every value is `var(--core-token)`, switching the
 * core tokens for `[data-theme="light"]` updates the aliases automatically.
 */
export const semanticAliases: Readonly<Record<string, string>> = {
  '--background': 'var(--bg-primary)',
  '--foreground': 'var(--text-primary)',
  '--card': 'var(--bg-card)',
  '--card-foreground': 'var(--text-primary)',
  '--popover': 'var(--bg-elevated)',
  '--popover-foreground': 'var(--text-primary)',
  '--primary': 'var(--accent-blue)',
  '--primary-foreground': 'var(--bg-primary)',
  '--secondary': 'var(--bg-elevated)',
  '--secondary-foreground': 'var(--text-primary)',
  '--muted': 'var(--bg-secondary)',
  '--muted-foreground': 'var(--text-secondary)',
  '--accent': 'var(--accent-magenta)',
  '--accent-foreground': 'var(--bg-primary)',
  '--destructive': 'var(--accent-red)',
  '--destructive-foreground': '#ffffff',
  '--input': 'var(--border)',
  '--ring': 'var(--accent-blue)',
  '--radius': '0.5rem',
};

/** Brand gradient referencing accent tokens (mode-agnostic). */
export const gradientBrand =
  'linear-gradient(135deg, var(--accent-blue), var(--accent-magenta))';
