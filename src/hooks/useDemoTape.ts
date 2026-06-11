/**
 * `useDemoTape` — one-click sample-tape demo.
 *
 * Fetches the bundled synthetic NinjaTrader-format tape from
 * `/sample-tape.csv` (same-origin, CSP `connect-src 'self'`), feeds it
 * through the normal `useCsvIngest` pipeline, and then auto-runs the
 * simulation once the parsed data lands — so a first-time visitor gets the
 * full ChallengeVerdict / walk-forward / tail-risk experience without
 * needing a CSV of their own.
 *
 * The tape is synthetic (generated, seeded — see public/sample-tape.csv);
 * no real trader's data ships with the app.
 *
 * Also honours a `?demo=1` query param on mount so the marketing page can
 * deep-link straight into a live run (`/app?demo=1`).
 */
import { useCallback, useEffect, useRef } from 'react';

export const SAMPLE_TAPE_URL = '/sample-tape.csv';

interface DemoTapeArgs {
  /** `useCsvIngest().ingest` — parses a File/Blob through the worker. */
  ingest: (file: File | Blob) => Promise<void>;
  /** `useCsvIngest().reset` — clears any previously ingested rows. */
  reset: () => void;
  /** True once the canonical `parsedData` memo holds rows for this tape. */
  ready: boolean;
  /** `handleRun` — dispatches the simulation with current settings. */
  run: () => void;
  /** Error sink for fetch/parse failures (surfaces in the app banner). */
  onError: (message: string) => void;
}

export function useDemoTape({ ingest, reset, ready, run, onError }: DemoTapeArgs): {
  loadDemo: () => void;
} {
  // Armed after a successful demo ingest; the next time parsed data is
  // ready we fire exactly one auto-run, then disarm.
  const armed = useRef(false);

  useEffect(() => {
    if (!armed.current || !ready) return;
    armed.current = false;
    run();
  }, [ready, run]);

  const loadDemo = useCallback((): void => {
    void (async () => {
      try {
        reset();
        const res = await fetch(SAMPLE_TAPE_URL);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        armed.current = true;
        await ingest(blob);
      } catch {
        armed.current = false;
        onError('Could not load the sample tape — please upload your own CSV instead.');
      }
    })();
  }, [ingest, reset, onError]);

  // Deep link: /app?demo=1 starts the demo on first mount.
  const autoStarted = useRef(false);
  useEffect(() => {
    if (autoStarted.current) return;
    autoStarted.current = true;
    if (new URLSearchParams(window.location.search).get('demo') === '1') {
      loadDemo();
    }
  }, [loadDemo]);

  return { loadDemo };
}
