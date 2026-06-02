/**
 * runDispatch.ts
 *
 * Pure builder layer that converts typed engine configs into the discriminated
 * `WorkerRequest` payloads exchanged across the main-thread ↔ Web Worker
 * boundary. Extracted from the inline `worker.postMessage({ ... })` call sites
 * in `App.tsx` so payload construction is a unit-testable function with no
 * React imports and no side effects.
 *
 * Validates: Requirements 10.2, 13.1.
 *
 * ---------------------------------------------------------------------------
 * Returned shape: `{ request, transfer }`
 * ---------------------------------------------------------------------------
 *
 * Each builder returns both the typed `WorkerRequest` (which the caller posts
 * as the message payload) and a `Transferable[]` list (which the caller hands
 * to `worker.postMessage(payload, transfer)`). Splitting the two means
 * `useSimulationRunner` can wire transferables in without re-deriving them
 * from the payload, and the same builder is reusable from a future Node-side
 * test harness that doesn't have `Transferable`s at all (it can simply ignore
 * the second field).
 *
 *   const { request, transfer } = buildSingleRunRequest(...);
 *   worker.postMessage(request, transfer);   // caller, in the hook
 *
 * ---------------------------------------------------------------------------
 * Float64Array packing — byte layout (task 5.7 / forward-compat for 5.17)
 * ---------------------------------------------------------------------------
 *
 * The numeric series carried on a single-run payload (PnL, optional benchmark,
 * optional multi-factor matrix) are packed into transferable `Float64Array`
 * buffers. Layout, with `N = parsed.length` and `K = factorNames.length`:
 *
 *   pnlBuf       : Float64Array(N)
 *                  pnlBuf[i] === parsed[i].pnl
 *
 *   benchmarkBuf : Float64Array(N)         (omitted when no row has benchmarkReturn)
 *                  benchmarkBuf[i] === parsed[i].benchmarkReturn ?? NaN
 *
 *   factorBuf    : Float64Array(N * K)     (omitted when K === 0 or no row has factorRow)
 *                  Row-major: factorBuf[i*K + j] === parsed[i].factorRow?.[j] ?? NaN
 *
 * Endianness is host-native; the buffers are exchanged via structured clone /
 * transfer within the same browser process, so endianness is irrelevant on
 * the wire (this is NOT the audit-log digest, which IS endianness-sensitive
 * — see `runHistory.ts`).
 *
 * For the portfolio dispatch, every sleeve gets its own pnlBuf packed the
 * same way; sleeves do not currently carry benchmark or factor rows in the
 * portfolio payload shape, so only PnL buffers are produced.
 *
 * NOTE (task 5.17): The transfer list returned here is forwarded by
 * `useSimulationRunner.run` into `worker.postMessage(payload, transfer)`,
 * so the buffers are detached from the main thread without a structured-
 * clone copy (Requirement 13.1). `simulationWorker.ts` still consumes the
 * inline `payload.data: DailyData[]` for now — Requirement 13.2's
 * "reconstruct per-row metadata without copying numeric series back" half
 * is a forward-compatible scaffold that lands once `runSimulation` /
 * `runPortfolioSimulation` grow a `Float64Array`-shaped input path. See
 * the docblock at the top of `simulationWorker.ts` for the full
 * transferable-buffer contract.
 */

import type {
  CommonRunConfig,
  DailyData,
  PortfolioConfig,
  SingleStrategyConfig,
  StrategyAllocation,
} from './types';
import {
  type PortfolioRunPayload,
  type PortfolioRunRequest,
  type SingleRunPayload,
  type SingleRunRequest,
} from './workerProtocol';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * The result of a builder: a typed `WorkerRequest` (single-run or portfolio)
 * plus the transfer list the caller hands to `worker.postMessage`.
 *
 * `transfer` is a (possibly empty) array of distinct `Transferable`s; it
 * never contains duplicates and never contains `undefined`. Callers can
 * forward it as-is.
 */
export interface BuiltRunRequest<TRequest> {
  request: TRequest;
  transfer: Transferable[];
}

export interface BuildSingleRunRequestOptions {
  /** When true, the engine skips post-sim analytics (see Requirement 14). */
  skipPostSimAnalytics?: boolean;
  /** When true, the worker also computes the position-sizing recommendation. */
  computePositionSizing?: boolean;
}

export interface BuildPortfolioRunRequestOptions {
  /** When true, the engine skips post-sim analytics (see Requirement 14). */
  skipPostSimAnalytics?: boolean;
}

/**
 * Build a typed `single-run` `WorkerRequest` from the parsed CSV row series
 * and the user-configured single-strategy settings.
 *
 * `settings.data` and `settings.onProgress` are deliberately ignored:
 *   - `data` is supplied via the explicit `parsed` argument so the caller can
 *     reuse the canonical `parsedData: DailyData[]` memo from `App.tsx`
 *     (Requirement 10.9) without rebuilding it.
 *   - `onProgress` is a closure and is not structured-cloneable; the worker
 *     installs its own emitter and posts `progress` messages back.
 *
 * Returns `{ request, transfer }`. `transfer` always contains the PnL buffer
 * and optionally the benchmark and factor buffers (see byte-layout docblock
 * at the top of this file).
 */
export function buildSingleRunRequest(
  settings: SingleStrategyConfig,
  parsed: DailyData[],
  options: BuildSingleRunRequestOptions = {},
): BuiltRunRequest<SingleRunRequest> {
  const factorNames = (settings.factorNames ?? []).filter((s) => s.length > 0);

  const pnlBuf = packPnls(parsed);
  const benchmarkBuf = packBenchmark(parsed);
  const factorBuf = packFactors(parsed, factorNames.length);

  const payload: SingleRunPayload = {
    ...commonPayloadFromConfig(settings),
    modelType: settings.modelType,
    data: parsed,
    dataFormat: settings.dataFormat,
    factorNames: factorNames.length > 0 ? factorNames : undefined,

    regimeSource: settings.regimeSource,
    autoRegimeWindow: settings.autoRegimeWindow,
    autoRegimeThreshold: settings.autoRegimeThreshold,

    propFirmRulesEnabled: settings.propFirmRulesEnabled,
    propTarget: settings.propTarget,
    propMaxDrawdown: settings.propMaxDrawdown,
    propConsistencyPercent: settings.propConsistencyPercent,
    dailyLossLimitEnabled: settings.dailyLossLimitEnabled,
    dailyMaxLosses: settings.dailyMaxLosses,
    dailyMaxLossDollars: settings.dailyMaxLossDollars,
    tradesPerSession: settings.tradesPerSession,
  };
  if (options.computePositionSizing) {
    payload.computePositionSizing = true;
  }
  if (options.skipPostSimAnalytics) {
    payload.skipPostSimAnalytics = true;
  }

  const request: SingleRunRequest = {
    kind: 'single-run',
    modelType: settings.modelType,
    payload,
  };

  return {
    request,
    transfer: collectTransferables(pnlBuf, benchmarkBuf, factorBuf),
  };
}

/**
 * Build a typed `portfolio-run` `WorkerRequest` from the user-configured
 * portfolio settings and the per-sleeve `StrategyAllocation` list.
 *
 * `settings.strategies` and `settings.onProgress` are deliberately ignored;
 * sleeves come from the explicit `strategies` argument (which the caller has
 * already filtered to enabled sleeves and validated), and `onProgress` is not
 * structured-cloneable.
 *
 * Each sleeve's per-row PnL series is packed into its own `Float64Array`
 * buffer; all sleeve buffers are returned in the `transfer` list. Benchmark
 * and factor buffers are not emitted at the portfolio level (the
 * `PortfolioRunPayload` shape carries `factorNames` only — see
 * `workerProtocol.ts`).
 */
export function buildPortfolioRunRequest(
  settings: PortfolioConfig,
  strategies: StrategyAllocation[],
  options: BuildPortfolioRunRequestOptions = {},
): BuiltRunRequest<PortfolioRunRequest> {
  const factorNames = (settings.factorNames ?? []).filter((s) => s.length > 0);

  const sleevePnlBufs: Float64Array[] = strategies.map((s) =>
    packPnls(s.data),
  );

  const payload: PortfolioRunPayload = {
    ...commonPayloadFromConfig(settings),
    modelType: 'portfolio',
    strategies,
    resampling: settings.portfolioResampling ?? 'independent',
    copulaDf: settings.copulaDf,
    dataFormat: settings.dataFormat,
    factorNames: factorNames.length > 0 ? factorNames : undefined,
  };
  if (options.skipPostSimAnalytics) {
    payload.skipPostSimAnalytics = true;
  }

  const request: PortfolioRunRequest = {
    kind: 'portfolio-run',
    payload,
  };

  return {
    request,
    transfer: collectTransferables(...sleevePnlBufs),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Project the on-the-wire `CommonRunPayload` slice from a typed engine config.
 *
 * NOTE: The `wasm_protocol_version` schema tag (Requirement 8.3 / task 9.4)
 * is stamped on the TS ↔ Rust/WASM payload (`WasmSimulationParams`), not on
 * the TS ↔ Worker payload built here. The engine adds it when it constructs
 * the JSON it hands to `run_mc_simulation` (see `simulationEngine.ts`). The
 * worker `CommonRunPayload` deliberately omits it.
 */
function commonPayloadFromConfig(config: CommonRunConfig): {
  nSimulations: number;
  nTrades: number;
  startingCapital: number;
  ruinThreshold: number;
  commissionPerTrade: number;
  randomSeed: number | null;
  samplingMode: CommonRunConfig['samplingMode'];
  rowFrequency: CommonRunConfig['rowFrequency'];
  periodsPerYear: number;
  positionSizeMultiplier: number;
  slippageModel: CommonRunConfig['slippageModel'];
  impactCoefficient: number;
} {
  return {
    nSimulations: config.nSimulations,
    nTrades: config.nTrades,
    startingCapital: config.startingCapital,
    ruinThreshold: config.ruinThreshold,
    commissionPerTrade: config.commissionPerTrade,
    randomSeed: config.randomSeed,
    samplingMode: config.samplingMode,
    rowFrequency: config.rowFrequency,
    periodsPerYear: config.periodsPerYear,
    positionSizeMultiplier: config.positionSizeMultiplier,
    slippageModel: config.slippageModel,
    impactCoefficient: config.impactCoefficient,
  };
}

/** Pack `data[i].pnl` into a fresh `Float64Array` of length `data.length`. */
function packPnls(data: DailyData[]): Float64Array {
  const out = new Float64Array(data.length);
  for (let i = 0; i < data.length; i++) {
    out[i] = data[i].pnl;
  }
  return out;
}

/**
 * Pack `data[i].benchmarkReturn ?? NaN` into a fresh `Float64Array`. Returns
 * `undefined` when no row carries a defined benchmark — there's no point
 * shipping an all-NaN buffer to the worker.
 */
function packBenchmark(data: DailyData[]): Float64Array | undefined {
  let any = false;
  for (let i = 0; i < data.length; i++) {
    if (data[i].benchmarkReturn != null) {
      any = true;
      break;
    }
  }
  if (!any) return undefined;
  const out = new Float64Array(data.length);
  for (let i = 0; i < data.length; i++) {
    const v = data[i].benchmarkReturn;
    out[i] = v == null ? NaN : v;
  }
  return out;
}

/**
 * Pack `data[i].factorRow` into a row-major `Float64Array` of length
 * `data.length * factorCount`. Missing rows / missing entries are written as
 * `NaN`. Returns `undefined` when `factorCount === 0` or no row carries a
 * factor row.
 */
function packFactors(
  data: DailyData[],
  factorCount: number,
): Float64Array | undefined {
  if (factorCount <= 0) return undefined;
  let any = false;
  for (let i = 0; i < data.length; i++) {
    if (data[i].factorRow && data[i].factorRow!.length > 0) {
      any = true;
      break;
    }
  }
  if (!any) return undefined;
  const out = new Float64Array(data.length * factorCount);
  for (let i = 0; i < data.length; i++) {
    const row = data[i].factorRow;
    const base = i * factorCount;
    for (let j = 0; j < factorCount; j++) {
      const v = row && j < row.length ? row[j] : undefined;
      out[base + j] = v == null || !isFinite(v) ? NaN : v;
    }
  }
  return out;
}

/** Filter out undefined buffers and return their underlying ArrayBuffers. */
function collectTransferables(
  ...bufs: (Float64Array | undefined)[]
): Transferable[] {
  const out: Transferable[] = [];
  for (const b of bufs) {
    if (b) out.push(b.buffer);
  }
  return out;
}
