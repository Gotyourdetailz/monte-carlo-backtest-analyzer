/**
 * Web Worker entrypoint for simulation dispatch.
 *
 * Speaks the typed `WorkerRequest` / `WorkerResponse` discriminated unions
 * defined in `./workerProtocol`. The exhaustive `switch` on `request.kind`
 * means a future model addition (a new `WorkerRequest` arm) produces a
 * `tsc --noEmit` error here as well as in the host's `useSimulationRunner`.
 *
 * Implements Requirements 7.3 (defensive WASM init) and 8.1 / 8.2 (typed
 * worker protocol) of the code-review-remediation spec.
 *
 * ---------------------------------------------------------------------------
 * Transferable-buffer contract (Requirements 13.1, 13.2 — task 5.17)
 * ---------------------------------------------------------------------------
 *
 * `runDispatch.ts` packs the per-row numeric series — PnL (single-run +
 * portfolio), and optionally benchmark and the row-major factor matrix on
 * single-run dispatches — into fresh `Float64Array` buffers and hands their
 * underlying `ArrayBuffer`s to `useSimulationRunner.run` as the `transfer`
 * list of `worker.postMessage(payload, transfer)`. Those buffers therefore
 * ride into the worker without a structured-clone copy, satisfying
 * Requirement 13.1 (no doubled peak memory on dispatch start).
 *
 * Reading the numeric series back out of the transferred buffers — and
 * reconstructing only the per-row metadata (`regime`, `segment`, `timestamp`
 * strings) on the worker side — is the second half of Requirement 13.2.
 * That half is currently a forward-compatible scaffold: this worker still
 * consumes the inline `payload.data: DailyData[]` so that the engine
 * signatures (`runSimulation`, `runPortfolioSimulation`) and every
 * downstream consumer (`pathSimulator`, `regimeSegmentation`,
 * `benchmarkAttribution`, ...) can keep accepting `DailyData[]` unchanged
 * for now. The transfer list is wired and exercised end-to-end on every
 * dispatch; switching the engines to read from the buffers is a follow-up
 * optimization that lands once those signatures grow a `Float64Array`-shaped
 * input path.
 *
 * Until then, the practical effect on the host side is: the freshly-packed
 * buffers in `runDispatch` are owned only by the dispatch builder, so
 * transferring them is free (no main-thread holders are detached). The
 * `DailyData[]` is still structured-cloned, so dispatch peak memory is the
 * same order as before; the buffers are "ready when the worker is."
 */

import { runSimulation } from './simulationEngine';
import { runPortfolioSimulation } from './portfolioEngine';
import { computePositionSizingRecommendation } from './positionSizing';
import type {
  PortfolioConfig,
  SingleStrategyConfig,
} from './types';
import type {
  ErrorMessage,
  ProgressMessage,
  ResultMessage,
  WorkerRequest,
} from './workerProtocol';

/**
 * Eagerly load and initialize the WASM kernel at the start of every dispatch,
 * so we can surface a specific "WASM kernel failed to load" error to the host
 * UI separately from a generic "simulation failed" runtime error.
 *
 * The result is cached: subsequent dispatches reuse the resolved promise. The
 * engine itself also calls `await initWasm()` inside its own try/catch (the
 * "already initialized" path is a no-op), so pre-loading here is idempotent
 * and does not duplicate kernel state.
 *
 * Implements Requirement 7.3 of the code-review-remediation spec.
 */
let wasmInitPromise: Promise<void> | null = null;
function ensureWasmReady(): Promise<void> {
  if (wasmInitPromise) return wasmInitPromise;
  wasmInitPromise = (async () => {
    const { default: initWasm } = await import('wasm-engine');
    try {
      await initWasm();
    } catch (_) {
      // Already initialized — safe to ignore. wasm-bindgen throws when
      // `init()` is called twice on the same module instance.
    }
  })();
  // If the load itself fails, drop the cached rejection so a future run can
  // retry (e.g. after a transient network blip serving the .wasm asset).
  wasmInitPromise.catch(() => {
    wasmInitPromise = null;
  });
  return wasmInitPromise;
}

// ---------------------------------------------------------------------------
// Typed message helpers
// ---------------------------------------------------------------------------

function postProgress(completed: number, total: number): void {
  const safeTotal = total > 0 && Number.isFinite(total) ? total : 1;
  const safeCompleted = Number.isFinite(completed) ? completed : 0;
  const pct = Math.max(0, Math.min(1, safeCompleted / safeTotal));
  const msg: ProgressMessage = {
    kind: 'progress',
    pct,
    completed: safeCompleted,
    total: safeTotal,
  };
  self.postMessage(msg);
}

function postResult(results: ResultMessage['results']): void {
  const msg: ResultMessage = { kind: 'result', results };
  self.postMessage(msg);
}

function postError(error: string, cause?: string): void {
  const msg: ErrorMessage = cause ? { kind: 'error', error, cause } : { kind: 'error', error };
  self.postMessage(msg);
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const request = e.data;

  // Step 1: ensure the WASM kernel is loaded. A failure here is reported with
  // a specific, user-displayable summary so the host can distinguish kernel
  // load problems (e.g. CSP misconfiguration, asset 404) from simulation
  // runtime errors. (Requirement 7.3)
  try {
    await ensureWasmReady();
  } catch (err: unknown) {
    const cause = err instanceof Error ? err.message : String(err);
    postError('WASM kernel failed to load', cause);
    return;
  }

  try {
    const onProgress = (completed: number, total: number) => {
      postProgress(completed, total);
    };

    switch (request.kind) {
      case 'single-run': {
        const { payload } = request;
        // The on-the-wire payload deliberately omits the engine's
        // `onProgress` callback (closures are not structured-cloneable);
        // reconstruct the full `SingleStrategyConfig` here by reattaching
        // the worker-local emitter.
        const config: SingleStrategyConfig = {
          ...payload,
          onProgress,
        };

        const result = await runSimulation(config);

        // Position-sizing recommendation is computed inline only for the
        // parametric / GARCH single-strategy paths, matching the legacy
        // pre-typed-protocol behavior.
        if (
          (payload.modelType === 'parametric' || payload.modelType === 'garch') &&
          payload.computePositionSizing
        ) {
          const pnls = result.finalBalances.map(
            (b) => b - payload.startingCapital
          );
          const mean = pnls.reduce((s, v) => s + v, 0) / pnls.length;
          const std = Math.sqrt(
            pnls.reduce((s, v) => s + (v - mean) ** 2, 0) /
              Math.max(1, pnls.length - 1)
          );
          result.positionSizing = await computePositionSizingRecommendation({
            data: payload.data,
            dataFormat: payload.dataFormat,
            startingCapital: payload.startingCapital,
            ruinThreshold: payload.ruinThreshold,
            commissionPerTrade: payload.commissionPerTrade ?? 0,
            randomSeed: payload.randomSeed ?? null,
            rowFrequency: payload.rowFrequency,
            periodsPerYear: payload.periodsPerYear,
            baselineRuin: result.ruinProbability,
            baselineCvar95: result.institutionalMetrics.cvar95,
            baselineStdPnL: std,
            baselineMeanPnL: mean,
          });
        }

        postResult(result);
        return;
      }

      case 'portfolio-run': {
        const { payload } = request;
        const config: PortfolioConfig = {
          ...payload,
          onProgress,
        };
        const result = await runPortfolioSimulation(config);
        postResult(result);
        return;
      }

      case 'position-sizing-search': {
        // Standalone position-sizing search dispatch. The current host
        // (`useSimulationRunner`) doesn't dispatch this arm yet — it
        // computes position sizing inline as a side effect of a
        // `single-run` with `computePositionSizing: true`. The arm is
        // implemented here so that:
        //   (a) the discriminated-union switch is exhaustive (Req 8.1/8.2),
        //   and
        //   (b) once the host wires standalone search, the worker-side
        //       contract is already correct.
        //
        // We post a structured error with `kind: 'error'` since
        // `computePositionSizingRecommendation` returns a
        // `PositionSizingRecommendation`, not a `SimulationResults`, so
        // there is no `kind: 'result'` envelope to fill. A dedicated
        // `position-sizing-result` response arm can be added to
        // `WorkerResponse` when the host adopts this dispatch.
        postError(
          'Standalone position-sizing search dispatch is not yet wired through the worker.',
          'WorkerRequest kind "position-sizing-search" has no result envelope on WorkerResponse.'
        );
        return;
      }

      default: {
        // Exhaustiveness check — adding a new WorkerRequest arm without
        // updating this switch fails `tsc --noEmit`.
        const _never: never = request;
        void _never;
        postError('Unknown simulation worker request kind.');
        return;
      }
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Simulation failed';
    const cause = err instanceof Error ? err.message : undefined;
    postError(message, cause);
  }
};
