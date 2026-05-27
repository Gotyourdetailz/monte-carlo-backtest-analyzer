/**
 * slippageModel.ts
 *
 * Dynamic market-impact / slippage model for Monte Carlo simulation paths.
 *
 * Three modes:
 *   - 'none'        — zero transaction cost (useful for raw-edge analysis)
 *   - 'fixed'       — flat $ per trade (backward-compatible with commissionPerTrade)
 *   - 'sqrt_impact' — institutional square-root law of market impact:
 *                      slippage = k · σ · √(sizeMultiplier) · |tradePnL| / (|tradePnL| + σ)
 *
 * The sqrt_impact formula is bounded:
 *   - As |tradePnL| → 0, slippage → 0  (no trade, no impact)
 *   - As |tradePnL| → ∞, slippage → k · σ · √(sizeMultiplier)  (saturates)
 *   - √(sizeMultiplier) captures the well-documented concavity of market impact
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Configuration for the slippage / market-impact model.
 *
 * @property model               - Which model to apply.
 * @property fixedSlippagePerTrade - Flat $ amount deducted per trade (used by 'fixed' mode).
 * @property impactCoefficient   - `k` in the square-root model (typical institutional range 0.05–0.20).
 * @property baseVolatility      - σ_base estimated from historical PnL data; acts as a normalisation anchor.
 */
export type SlippageConfig = {
  model: 'none' | 'fixed' | 'sqrt_impact';
  fixedSlippagePerTrade: number;
  impactCoefficient: number;
  baseVolatility: number;
};

// ---------------------------------------------------------------------------
// Default configuration
// ---------------------------------------------------------------------------

/**
 * Default slippage configuration — flat mode with zero cost.
 *
 * Drop-in replacement for the legacy `commissionPerTrade = 0` behaviour so
 * existing simulations are unaffected until the user opts in.
 */
export const DEFAULT_SLIPPAGE_CONFIG: SlippageConfig = {
  model: 'fixed',
  fixedSlippagePerTrade: 0,
  impactCoefficient: 0.1,
  baseVolatility: 0,
};

// ---------------------------------------------------------------------------
// Core computation
// ---------------------------------------------------------------------------

/**
 * Compute the slippage cost for a single trade.
 *
 * @param config              - Active slippage configuration.
 * @param tradePnL            - Raw PnL of the trade (positive or negative, in $).
 * @param positionSizeMultiplier - Multiplier on base position size (≥ 0; 1 = base).
 * @param currentVolatility   - Current volatility estimate (σ) for the asset / strategy.
 * @returns The slippage cost to *subtract* from the trade PnL (always ≥ 0).
 *
 * ### Square-root impact model
 * ```
 *   slippage = k · σ · √(sizeMultiplier) · |tradePnL| / (|tradePnL| + σ)
 * ```
 * This formulation:
 *   - Scales sub-linearly with position size (√ concavity).
 *   - Increases with volatility (wider spreads in volatile markets).
 *   - Is bounded above by `k · σ · √(sizeMultiplier)`, preventing blow-up on outlier trades.
 */
export function computeSlippage(
  config: SlippageConfig,
  tradePnL: number,
  positionSizeMultiplier: number,
  currentVolatility: number,
): number {
  switch (config.model) {
    case 'none':
      return 0;

    case 'fixed':
      return config.fixedSlippagePerTrade;

    case 'sqrt_impact': {
      const absPnL = Math.abs(tradePnL);
      const sigma = Math.max(currentVolatility, 1e-12); // guard against division by zero
      const k = config.impactCoefficient;
      const sqrtSize = Math.sqrt(Math.max(positionSizeMultiplier, 0));

      // Square-root law with saturation term
      const slippage = k * sigma * sqrtSize * (absPnL / (absPnL + sigma));
      return Math.max(slippage, 0);
    }

    default: {
      // Exhaustiveness check — TypeScript will flag if a case is missed
      const _exhaustive: never = config.model;
      return _exhaustive;
    }
  }
}

// ---------------------------------------------------------------------------
// Volatility estimation helper
// ---------------------------------------------------------------------------

/**
 * Estimate base volatility (standard deviation) from a PnL series.
 *
 * Uses Bessel-corrected sample standard deviation (N − 1 denominator),
 * consistent with `meanAndStdDev` in mathUtils.ts.
 *
 * @param pnlData - Array of per-trade or per-period PnL values.
 * @returns The sample standard deviation; 0 when the array has fewer than 2 elements.
 */
export function estimateBaseVolatility(pnlData: number[]): number {
  const n = pnlData.length;
  if (n < 2) return 0;

  const mean = pnlData.reduce((sum, val) => sum + val, 0) / n;
  const variance = pnlData.reduce((sum, val) => sum + (val - mean) ** 2, 0) / (n - 1);
  return Math.sqrt(variance);
}
