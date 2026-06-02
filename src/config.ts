/**
 * src/config.ts — build-time configuration & lightweight analytics.
 *
 * Phase A (wedge ship): reads the Stripe Payment Link and the optional
 * privacy-light analytics domain from Vite env vars. No backend, no secrets —
 * the Payment Link is a public URL and the analytics domain is public.
 *
 * All values resolve at build time from `import.meta.env`. Missing/blank env
 * vars degrade gracefully: the "Reserve early access" CTAs disable themselves
 * (`isEarlyAccessEnabled === false`) and analytics becomes a silent no-op.
 */

/** Raw Stripe Payment Link for the "Reserve early access" pre-order. */
const rawEarlyAccessUrl = (import.meta.env.VITE_STRIPE_EARLY_ACCESS_URL ?? '').trim();

/**
 * The early-access pre-order URL, or `''` when unconfigured. Consumers should
 * gate their CTA on {@link isEarlyAccessEnabled} rather than truthiness so a
 * malformed non-URL value is also rejected.
 */
export const EARLY_ACCESS_URL: string = rawEarlyAccessUrl;

/** True only when a syntactically valid https URL is configured. */
export const isEarlyAccessEnabled: boolean = /^https:\/\/\S+$/.test(rawEarlyAccessUrl);

/** Public analytics domain (Plausible). Blank → analytics disabled. */
const analyticsDomain = (import.meta.env.VITE_ANALYTICS_DOMAIN ?? '').trim();

declare global {
  interface Window {
    plausible?: (
      event: string,
      options?: { props?: Record<string, string | number | boolean> },
    ) => void;
  }
}

/**
 * Inject the Plausible analytics script exactly once, only when a domain is
 * configured. Cookie-less / privacy-light. Safe to call on every boot — it
 * dedupes on a data attribute. Never throws.
 */
export function initAnalytics(): void {
  if (!analyticsDomain) return;
  if (typeof document === 'undefined') return;
  if (document.querySelector('script[data-mc-analytics]')) return;
  try {
    const s = document.createElement('script');
    s.defer = true;
    s.dataset.domain = analyticsDomain;
    s.dataset.mcAnalytics = 'true';
    s.src = 'https://plausible.io/js/script.js';
    document.head.appendChild(s);
  } catch {
    // Analytics must never break the app — swallow injection failures.
  }
}

/**
 * Fire a custom analytics event (e.g. a Reserve-early-access click). No-op
 * when analytics is disabled or the script has not yet loaded. Never throws.
 */
export function trackEvent(
  event: string,
  props?: Record<string, string | number | boolean>,
): void {
  try {
    window.plausible?.(event, props ? { props } : undefined);
  } catch {
    // ignore — telemetry is best-effort
  }
}
