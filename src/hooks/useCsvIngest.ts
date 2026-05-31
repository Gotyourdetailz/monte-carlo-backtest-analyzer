/**
 * `useCsvIngest` — owns CSV parse state for the App component.
 *
 * Exposes `{ rows, fields, parseProgress, ingest, reset }`. The hook delegates
 * the actual parse to `parseCsvFile` (which runs Papaparse with `worker: true`
 * — see `src/csvIngest.ts`), so the main thread is not blocked on large
 * NinjaTrader exports. The `parseProgress` state machine drives the
 * user-visible spinner / progress text in the upload UI: while the parse is
 * in flight the UI can show a "Parsing CSV..." indicator instead of a frozen
 * page (Requirement 12.2). On parse failure the underlying error message is
 * surfaced via `parseProgress.message` so the App's error banner can render
 * it directly rather than relying on console-only logging (Requirement 12.3).
 *
 * Validates: Requirements 12.1, 12.2, 12.3.
 */

import { useCallback, useRef, useState } from 'react';
import { parseCsvFile } from '../csvIngest';

export type ParseProgressState = 'idle' | 'parsing' | 'done' | 'error';

export interface ParseProgress {
  state: ParseProgressState;
  /** Optional progress fraction in `[0, 1]` when the parser surfaces it. */
  pct?: number;
  /** Human-readable status / error message. Populated on `error` and `done`. */
  message?: string;
}

export interface UseCsvIngestResult {
  /** Parsed row objects with forbidden own-keys stripped, or `null` before
   *  any successful parse / after `reset`. */
  rows: Record<string, unknown>[] | null;
  /** Header field names with FORBIDDEN_HEADER_SET removed, or `null` before
   *  any successful parse / after `reset`. */
  fields: string[] | null;
  /** Coarse parse-state machine for the UI spinner. */
  parseProgress: ParseProgress;
  /** Begin parsing the supplied file. Resolves once the parse completes
   *  (successfully or otherwise); the resolved promise never rejects so
   *  callers can `await` it without wrapping in try/catch. */
  ingest: (file: File | Blob) => Promise<void>;
  /** Clear parsed rows and reset the progress state to `idle`. */
  reset: () => void;
}

/**
 * React hook owning the CSV parse lifecycle. Stateful counterpart to the
 * pure `parseCsvFile` function in `src/csvIngest.ts`.
 *
 * Concurrency: if `ingest` is invoked while a previous parse is still in
 * flight, only the most-recent invocation's result is committed to state.
 * Older invocations resolve quietly (their results are discarded) so a
 * fast double-click on the file picker cannot leave stale rows in state.
 */
export function useCsvIngest(): UseCsvIngestResult {
  const [rows, setRows] = useState<Record<string, unknown>[] | null>(null);
  const [fields, setFields] = useState<string[] | null>(null);
  const [parseProgress, setParseProgress] = useState<ParseProgress>({
    state: 'idle',
  });

  // Monotonically-increasing token used to ignore late-completing parses
  // when the user kicks off a newer one.
  const ingestTokenRef = useRef(0);

  const ingest = useCallback(async (file: File | Blob): Promise<void> => {
    const token = ++ingestTokenRef.current;
    setParseProgress({ state: 'parsing', message: 'Parsing CSV...' });

    try {
      const result = await parseCsvFile(file, {
        onProgress: (pct) => {
          if (ingestTokenRef.current !== token) return;
          setParseProgress({ state: 'parsing', pct, message: 'Parsing CSV...' });
        },
      });
      if (ingestTokenRef.current !== token) return; // superseded by a newer parse
      setRows(result.rows);
      setFields(result.fields);
      const warningSummary =
        result.warnings.length > 0
          ? `Parsed ${result.rows.length} rows (${result.warnings.length} warning${
              result.warnings.length === 1 ? '' : 's'
            }).`
          : `Parsed ${result.rows.length} rows.`;
      setParseProgress({ state: 'done', pct: 1, message: warningSummary });
    } catch (err) {
      if (ingestTokenRef.current !== token) return; // superseded
      const message =
        err instanceof Error ? err.message : String(err ?? 'CSV parse failed');
      setParseProgress({ state: 'error', message });
    }
  }, []);

  const reset = useCallback(() => {
    // Bump the token so any in-flight parse cannot commit results after reset.
    ingestTokenRef.current++;
    setRows(null);
    setFields(null);
    setParseProgress({ state: 'idle' });
  }, []);

  return { rows, fields, parseProgress, ingest, reset };
}
