/**
 * Typed contract for the main thread ↔ Web Worker boundary, and (via the
 * `wasm_protocol_version` constant on outgoing payloads) the TS ↔ Rust/WASM
 * boundary.
 *
 * This module is intentionally pure: no React, no DOM, no side effects. It is
 * imported by both `App.tsx`-side dispatchers (via `runDispatch.ts`) and by
 * `simulationWorker.ts`, so that `tsc --noEmit` (the `npm run lint` command)
 * exhaustively type-checks every branch of the worker switch.
 *
 * Discriminated unions are keyed on `kind`. Adding a new model means adding a
 * new arm here first; the compiler will then surface every site that needs to
 * grow a handler.
 *
 * Implements Requirement 8 (typed worker protocol + cross-language versioning)
 * of the code-review-remediation spec.
 */

import type {
  DailyData,
  DataFormat,
  PortfolioResampling,
  SamplingMode,
  SimulationResults,
  SlippageModel,
  StrategyAllocation,
  RowFrequency,
} from './types';

// ---------------------------------------------------------------------------
// Cross-language version tag
// ---------------------------------------------------------------------------

/**
 * Schema version stamped onto the JSON payload exchanged between TypeScript
 * and the Rust/WASM kernel. Bump whenever the on-the-wire shape changes.
 *
 * The TS engine stamps this value onto every kernel-bound `WasmSimulationParams`
 * payload (see `simulationEngine.ts`, where `wasm_protocol_version: WASM_PROTOCOL_VERSION`
 * is set on the JSON handed to `run_mc_simulation`). Once Requirement 8.3
 * lands on the Rust side, the kernel will refuse mismatched versions with a
 * structured `{ "error": "wasm_protocol_version_mismatch: ..." }` response
 * (surfaced on the TS side as `WasmKernelError`); the current pre-versioned
 * kernel ignores the field, so the scaffold is forward-compatible.
 */
export const WASM_PROTOCOL_VERSION = 1 as const;

// ---------------------------------------------------------------------------
// Payload shapes (split from the legacy monolithic BaseModelConfig)
// ---------------------------------------------------------------------------

/**
 * Fields that apply to every run dispatched across the worker boundary,
 * regardless of single-strategy vs portfolio vs position-sizing search.
 *
 * Note: the on-the-wire payload deliberately omits the `onProgress` callback
 * present on the in-process engine signatures — callbacks are not
 * structured-cloneable. The worker installs its own progress emitter and
 * publishes `ProgressMessage` values back to the host.
 */
export interface CommonRunPayload {
  nSimulations: number;
  nTrades: number;
  startingCapital: number;
  ruinThreshold: number;
  commissionPerTrade: number;
  randomSeed: number | null;
  samplingMode: SamplingMode;
  rowFrequency: RowFrequency;
  periodsPerYear: number;
  positionSizeMultiplier: number;
  slippageModel: SlippageModel;
  impactCoefficient: number;
}

/**
 * Single-strategy run payload (basic / regime / parametric / GARCH).
 *
 * Holds the prop-firm and regime fields that are meaningless on a portfolio
 * dispatch; keeping them off `PortfolioRunPayload` is what eliminates the
 * "dummy zero fill" anti-pattern in the current `App.tsx` dispatch site
 * (Requirement 8.5).
 */
export interface SingleRunPayload extends CommonRunPayload {
  modelType: 'basic' | 'regime' | 'parametric' | 'garch';
  data: DailyData[];
  dataFormat: DataFormat;
  /** Ordered factor labels matching `DailyData.factorRow` entries. */
  factorNames?: string[];

  // Regime tagging
  regimeSource: string;
  autoRegimeWindow: number;
  autoRegimeThreshold: number;

  // Prop-firm evaluation
  propFirmRulesEnabled: boolean;
  propTarget: number;
  propMaxDrawdown: number;
  propConsistencyPercent: number;
  dailyLossLimitEnabled: boolean;
  dailyMaxLosses: number;
  dailyMaxLossDollars: number;
  tradesPerSession: number;

  /** Whether the worker should also compute the position-sizing recommendation. */
  computePositionSizing?: boolean;
  /**
   * When true, the engine skips validation, EVT, attribution, timestamp,
   * walk-forward, and multi-factor blocks. Used by the position-sizing
   * bisection's intermediate runs (Requirement 14).
   */
  skipPostSimAnalytics?: boolean;
}

/**
 * Multi-strategy portfolio run payload. Single-strategy fields
 * (`propTarget`, `propMaxDrawdown`, `dailyMaxLosses`, …) are intentionally
 * absent here.
 */
export interface PortfolioRunPayload extends CommonRunPayload {
  modelType: 'portfolio';
  strategies: StrategyAllocation[];
  resampling: PortfolioResampling;
  copulaDf: number;
  dataFormat: DataFormat;
  /** Ordered factor labels for portfolio-level multi-factor attribution. */
  factorNames?: string[];
  skipPostSimAnalytics?: boolean;
}

/**
 * Standalone position-sizing search payload, used when the host wants to run
 * the bisection without a prior single-run result already cached.
 */
export interface PositionSizingSearchPayload extends CommonRunPayload {
  data: DailyData[];
  dataFormat: DataFormat;
  /** Baseline metrics produced at scale = 1.0; used as the search anchor. */
  baselineRuin: number;
  baselineCvar95: number;
  baselineStdPnL: number;
  baselineMeanPnL: number;
}

// ---------------------------------------------------------------------------
// WorkerRequest: discriminated union over `kind`
// ---------------------------------------------------------------------------

export type SingleRunRequest = {
  kind: 'single-run';
  modelType: 'basic' | 'regime' | 'parametric' | 'garch';
  payload: SingleRunPayload;
};

export type PortfolioRunRequest = {
  kind: 'portfolio-run';
  payload: PortfolioRunPayload;
};

export type PositionSizingRequest = {
  kind: 'position-sizing-search';
  payload: PositionSizingSearchPayload;
};

export type WorkerRequest =
  | SingleRunRequest
  | PortfolioRunRequest
  | PositionSizingRequest;

// ---------------------------------------------------------------------------
// WorkerResponse: discriminated union over `kind`
// ---------------------------------------------------------------------------

export type ProgressMessage = {
  kind: 'progress';
  /** Fractional progress in [0, 1]; multiply by 100 for percent display. */
  pct: number;
  message?: string;
  /** Raw progress numerators kept for back-compat with existing UI hooks. */
  completed?: number;
  total?: number;
};

export type ResultMessage = {
  kind: 'result';
  results: SimulationResults;
};

export type ErrorMessage = {
  kind: 'error';
  /** Short, user-displayable summary. */
  error: string;
  /** Original underlying cause (e.g. WASM kernel reason) when known. */
  cause?: string;
};

export type WorkerResponse = ProgressMessage | ResultMessage | ErrorMessage;

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/**
 * Thrown by the engine when the deserialized WASM kernel result contains a
 * structured `error` field. Carries the kernel-reported reason and the kernel
 * version (when surfaced) so callers can render a precise error to the user
 * and audit log.
 */
export class WasmKernelError extends Error {
  /** Kernel version reported by the WASM module, or undefined for pre-versioned builds. */
  readonly kernelVersion: string | undefined;
  /** Verbatim reason string from the kernel. */
  readonly kernelReason: string;

  constructor(reason: string, kernelVersion?: string) {
    const versionTag = kernelVersion ? ` (kernel ${kernelVersion})` : '';
    super(`WASM kernel error${versionTag}: ${reason}`);
    this.name = 'WasmKernelError';
    this.kernelReason = reason;
    this.kernelVersion = kernelVersion;
    // Restore prototype chain so `instanceof WasmKernelError` works after
    // transpilation under older targets / minifiers.
    Object.setPrototypeOf(this, WasmKernelError.prototype);
  }
}
