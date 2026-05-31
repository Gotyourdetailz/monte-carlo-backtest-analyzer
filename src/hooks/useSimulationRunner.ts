/**
 * `useSimulationRunner` — owns the Web Worker lifecycle for one simulation
 * dispatch path.
 *
 * Encapsulates the `workerRef` / `isLoading` / `progress` / `error` /
 * `results` state that previously lived inline in `App.tsx`, and exposes a
 * stable `{ run, cancel }` API. The hook is the single place that talks to
 * `simulationWorker.ts` — payload construction stays in `runDispatch.ts`.
 *
 * Lifecycle contract (per design.md, Requirement 7 / 10.3):
 *
 *  1. `run(req, transfer)` first terminates any in-flight worker and zeroes
 *     `workerRef.current` before constructing a fresh `SimWorker`. There is
 *     never more than one live worker per hook instance.
 *  2. All four failure surfaces are wired: `onmessage` (terminal `'result'` /
 *     `'error'` arms), `onmessageerror`, and `onerror`. Both error handlers
 *     set `isLoading=false`, surface a user-visible error message (including
 *     the underlying reason when available), terminate the worker, and zero
 *     the ref — there is no path to a stuck spinner.
 *  3. On terminal `'result'` or `'error'` messages, the worker is terminated
 *     and the ref is zeroed before state updates settle.
 *  4. `cancel()` is idempotent and safe to call when nothing is running.
 *  5. Stale messages from a previously-terminated worker (e.g. a queued
 *     `progress` event delivered after a new `run()`) are ignored via a
 *     `workerRef.current === worker` identity check.
 *
 * The hook intentionally does NOT persist runs to IndexedDB; the caller wires
 * `runHistory.recordRun` against the returned `results` so the persistence
 * policy (full-input digest, retention cap, …) stays in `runHistory.ts` per
 * Requirement 9 / 15.
 *
 * Both ends of the boundary now speak the typed `WorkerRequest` /
 * `WorkerResponse` discriminated unions defined in `src/workerProtocol.ts`
 * (task 9.2 migrated `simulationWorker.ts` onto the typed protocol). The
 * incoming-message normalizer below still tolerates the legacy
 * `{ type: 'progress' | 'result' | 'error', ... }` envelope so a stale build
 * of the worker cannot strand the host on a spinner; the legacy arms are
 * dead code on the current `simulationWorker.ts` and can be removed in a
 * follow-up sweep once we are confident no cached builds remain.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import SimWorker from '../simulationWorker?worker';
import type { SimulationResults } from '../types';
import type {
  WorkerRequest,
  WorkerResponse,
} from '../workerProtocol';

export interface SimulationProgress {
  /** Fractional progress in [0, 1]. Multiply by 100 for percent display. */
  pct: number;
  message?: string;
}

export interface UseSimulationRunnerResult {
  isLoading: boolean;
  progress: SimulationProgress | null;
  error: string | null;
  results: SimulationResults | null;
  /**
   * Dispatch a typed `WorkerRequest` to a fresh Web Worker. Any in-flight
   * worker is terminated first. `transfer` is forwarded as the
   * `postMessage` transfer list so callers can hand off `Float64Array`
   * buffers without copying (see Requirement 13).
   */
  run: (req: WorkerRequest, transfer: Transferable[]) => void;
  /**
   * Terminate the in-flight worker (if any) and exit the loading state.
   * Idempotent.
   */
  cancel: () => void;
}

/**
 * Normalize the worker's incoming message into a `WorkerResponse`. Returning
 * `null` means the message could not be recognized and should surface as a
 * deserialization error.
 *
 * The current `simulationWorker.ts` posts the typed `{ kind, ... }` shape
 * directly (task 9.2). The legacy `{ type, ... }` arms are retained as a
 * defensive bridge against a stale cached worker bundle and can be removed
 * once we are confident no cached builds remain.
 */
function normalizeResponse(raw: unknown): WorkerResponse | null {
  if (raw == null || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;

  // New typed shape — pass through after a minimal kind check.
  if (typeof data.kind === 'string') {
    if (data.kind === 'progress' || data.kind === 'result' || data.kind === 'error') {
      return raw as WorkerResponse;
    }
    return null;
  }

  // Legacy shape (current `simulationWorker.ts`).
  if (typeof data.type !== 'string') return null;
  switch (data.type) {
    case 'progress': {
      const completed =
        typeof data.completed === 'number' && Number.isFinite(data.completed)
          ? data.completed
          : 0;
      const total =
        typeof data.total === 'number' && Number.isFinite(data.total) && data.total > 0
          ? data.total
          : 1;
      const pct = Math.max(0, Math.min(1, completed / total));
      return { kind: 'progress', pct, completed, total };
    }
    case 'result': {
      // The legacy worker wraps the SimulationResults in `data`.
      const inner = data.data;
      if (inner == null || typeof inner !== 'object') return null;
      return { kind: 'result', results: inner as SimulationResults };
    }
    case 'error': {
      const err = typeof data.error === 'string' && data.error.length > 0
        ? data.error
        : 'Simulation failed.';
      const cause = typeof data.cause === 'string' ? data.cause : undefined;
      return { kind: 'error', error: err, cause };
    }
    default:
      return null;
  }
}

export function useSimulationRunner(): UseSimulationRunnerResult {
  const workerRef = useRef<Worker | null>(null);

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [progress, setProgress] = useState<SimulationProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<SimulationResults | null>(null);

  /** Terminate the current worker (if any) and zero the ref. */
  const teardownWorker = useCallback(() => {
    const w = workerRef.current;
    if (w) {
      try {
        w.terminate();
      } catch {
        // terminate() is documented to never throw, but guard anyway so a
        // pathological host does not strand us mid-cleanup.
      }
      workerRef.current = null;
    }
  }, []);

  const cancel = useCallback(() => {
    teardownWorker();
    setIsLoading(false);
    setProgress(null);
  }, [teardownWorker]);

  const run = useCallback(
    (req: WorkerRequest, transfer: Transferable[]) => {
      // Always cancel the previous worker before starting a new run, per the
      // structure.md "Always cancel the previous worker" rule.
      teardownWorker();

      // Reset run-scoped state. We deliberately keep the previous `results`
      // visible in the UI until a fresh result lands; only `error` and
      // `progress` are cleared at dispatch.
      setError(null);
      setProgress({ pct: 0 });
      setIsLoading(true);

      let worker: Worker;
      try {
        worker = new SimWorker();
      } catch (constructErr: unknown) {
        const reason =
          constructErr instanceof Error
            ? constructErr.message
            : 'unknown error';
        setIsLoading(false);
        setProgress(null);
        setError(`Failed to start simulation worker: ${reason}`);
        return;
      }
      workerRef.current = worker;

      // Tear down `worker` specifically (not whatever the ref currently
      // points at) and update state only when this worker is still the
      // active one. Keeps stale-message handling correct when run() is
      // called again before a previous run completes.
      const finalize = (next: {
        error?: string | null;
        results?: SimulationResults | null;
      }) => {
        const isActive = workerRef.current === worker;
        try {
          worker.terminate();
        } catch {
          // ignore
        }
        if (isActive) {
          workerRef.current = null;
          setIsLoading(false);
          if (Object.prototype.hasOwnProperty.call(next, 'error')) {
            setError(next.error ?? null);
          }
          if (Object.prototype.hasOwnProperty.call(next, 'results')) {
            setResults(next.results ?? null);
          }
        }
      };

      worker.onmessage = (ev: MessageEvent<unknown>) => {
        // Drop messages from a worker that has already been replaced or
        // cancelled.
        if (workerRef.current !== worker) return;

        const msg = normalizeResponse(ev.data);
        if (msg == null) {
          finalize({
            error: 'Simulation worker sent an unrecognized message.',
          });
          return;
        }

        switch (msg.kind) {
          case 'progress': {
            setProgress({ pct: msg.pct, message: msg.message });
            return;
          }
          case 'result': {
            finalize({ results: msg.results, error: null });
            return;
          }
          case 'error': {
            const detail = msg.cause
              ? `${msg.error}: ${msg.cause}`
              : msg.error;
            finalize({ error: detail });
            return;
          }
          default: {
            // Exhaustiveness check — adding a new WorkerResponse arm without
            // updating this switch will fail `tsc --noEmit`.
            const _never: never = msg;
            void _never;
            finalize({ error: 'Unknown simulation worker response.' });
            return;
          }
        }
      };

      worker.onmessageerror = (ev: MessageEvent) => {
        if (workerRef.current !== worker) return;
        // `MessageEvent.data` on a deserialization failure is implementation-
        // defined and frequently undefined; surface whatever scrap we can.
        const rawData = (ev as unknown as { data?: unknown }).data;
        const detail =
          typeof rawData === 'string' && rawData.length > 0
            ? `Simulation worker message could not be deserialized: ${rawData}`
            : 'Simulation worker message could not be deserialized.';
        finalize({ error: detail });
      };

      worker.onerror = (ev: ErrorEvent | Event) => {
        if (workerRef.current !== worker) return;
        const underlying =
          (ev as ErrorEvent).message != null
            ? String((ev as ErrorEvent).message).trim()
            : '';
        const detail = underlying
          ? `Simulation worker crashed: ${underlying}`
          : 'Simulation worker crashed unexpectedly.';
        finalize({ error: detail });
      };

      try {
        worker.postMessage(req, transfer);
      } catch (postErr: unknown) {
        const reason =
          postErr instanceof Error ? postErr.message : 'unknown error';
        finalize({
          error: `Failed to dispatch simulation request: ${reason}`,
        });
      }
    },
    [teardownWorker]
  );

  // Tear down on unmount so an orphaned worker cannot outlive its owner.
  useEffect(() => {
    return () => {
      const w = workerRef.current;
      if (w) {
        try {
          w.terminate();
        } catch {
          // ignore
        }
        workerRef.current = null;
      }
    };
  }, []);

  return { isLoading, progress, error, results, run, cancel };
}
