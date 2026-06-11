/**
 * Distribution and tail-risk metrics used in institutional risk reporting.
 */

export function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  const idx = Math.min(
    sortedAsc.length - 1,
    Math.max(0, Math.floor(sortedAsc.length * p))
  );
  return sortedAsc[idx];
}

export function valueAtRisk(sortedAsc: number[], confidence = 0.95): number {
  // Loss at tail: 5th percentile of PnL distribution for 95% VaR
  return percentile(sortedAsc, 1 - confidence);
}

export function expectedShortfall(sortedAsc: number[], confidence = 0.95): number {
  if (sortedAsc.length === 0) return 0;
  const cutoff = Math.max(1, Math.floor(sortedAsc.length * (1 - confidence)));
  const tail = sortedAsc.slice(0, cutoff);
  return tail.reduce((s, v) => s + v, 0) / tail.length;
}

/*
 * Moment calculations below use only IEEE-754 correctly-rounded operations
 * (+, *, /, Math.sqrt) — never `**` / `Math.pow`, whose results for
 * non-trivial exponents are implementation-defined and differ by ±1 ULP
 * across platforms and V8 versions. This preserves the engine's
 * reproducibility contract: same seed → byte-identical result JSON on
 * every machine (see property_regime_preservation.test.ts, Req 3.1/3.6).
 */
export function skewness(data: number[]): number {
  const n = data.length;
  if (n < 3) return 0;
  const mean = data.reduce((s, v) => s + v, 0) / n;
  const m2 = data.reduce((s, v) => s + (v - mean) * (v - mean), 0) / n;
  const m3 = data.reduce((s, v) => s + (v - mean) * (v - mean) * (v - mean), 0) / n;
  if (m2 === 0) return 0;
  return m3 / (m2 * Math.sqrt(m2));
}

export function excessKurtosis(data: number[]): number {
  const n = data.length;
  if (n < 4) return 0;
  const mean = data.reduce((s, v) => s + v, 0) / n;
  const m2 = data.reduce((s, v) => s + (v - mean) * (v - mean), 0) / n;
  const m4 = data.reduce((s, v) => {
    const d2 = (v - mean) * (v - mean);
    return s + d2 * d2;
  }, 0) / n;
  if (m2 === 0) return 0;
  return m4 / (m2 * m2) - 3;
}

export type InstitutionalRiskMetrics = {
  var95: number;
  var99: number;
  cvar95: number;
  cvar99: number;
  medianFinalBalance: number;
  medianMaxDrawdown: number;
  skewness: number;
  excessKurtosis: number;
  probabilityOfLoss: number;
  calmarRatio: number;
};

export function computeInstitutionalMetrics(
  finalBalances: number[],
  maxDrawdowns: number[],
  startingCapital: number,
  nTrades: number,
  periodsPerYear: number
): InstitutionalRiskMetrics {
  const sortedBalances = [...finalBalances].sort((a, b) => a - b);
  const sortedDd = [...maxDrawdowns].sort((a, b) => a - b);
  const pnl = finalBalances.map((b) => b - startingCapital);
  const sortedPnl = [...pnl].sort((a, b) => a - b);

  const medianFinalBalance = percentile(sortedBalances, 0.5);
  const medianMaxDrawdown = percentile(sortedDd, 0.5);
  const probabilityOfLoss =
    (pnl.filter((p) => p < 0).length / Math.max(1, pnl.length)) * 100;

  const years = Math.max(nTrades / periodsPerYear, 1 / periodsPerYear);
  const medianReturn = (medianFinalBalance - startingCapital) / startingCapital;
  const annualizedReturn = Math.pow(1 + medianReturn, 1 / years) - 1;
  const calmarRatio =
    medianMaxDrawdown > 0 ? annualizedReturn / medianMaxDrawdown : 0;

  return {
    var95: valueAtRisk(sortedPnl, 0.95),
    var99: valueAtRisk(sortedPnl, 0.99),
    cvar95: expectedShortfall(sortedPnl, 0.95),
    cvar99: expectedShortfall(sortedPnl, 0.99),
    medianFinalBalance,
    medianMaxDrawdown,
    skewness: skewness(pnl),
    excessKurtosis: excessKurtosis(pnl),
    probabilityOfLoss,
    calmarRatio,
  };
}
