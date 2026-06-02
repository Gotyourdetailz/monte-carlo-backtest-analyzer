/**
 * benchmarkAttribution.ts
 *
 * Buy-side benchmark / factor attribution against an optional benchmark
 * return series. Produces alpha (Jensen's α), beta, R², tracking error,
 * information ratio, up-capture, down-capture, and HC0 (White) standard
 * errors with t-statistics — the language an allocator's IC actually uses.
 *
 * Inputs are aligned per-period returns (NOT $ PnL). If the user uploads
 * absolute dollar PnL, it must be converted to per-period returns relative
 * to deployed capital before calling these functions.
 */

// ─── Linear regression with HC0 (White) robust standard errors ───────────────

export type RegressionResult = {
  alpha: number;
  beta: number;
  alphaStdErr: number;
  betaStdErr: number;
  /** t-statistic for α = 0. */
  alphaT: number;
  /** t-statistic for β = 0. */
  betaT: number;
  /** Two-sided p-values via normal approximation (large-sample). */
  alphaPValue: number;
  betaPValue: number;
  rSquared: number;
  residuals: number[];
  n: number;
};

/**
 * OLS regression of y on (1, x) with HC0 (White) heteroskedasticity-robust
 * standard errors.  HC0 is the canonical Eicker-White sandwich:
 *   V = (X'X)^-1 (Σ ê_i² x_i x_i') (X'X)^-1
 *
 * For the bivariate intercept-slope case we expand the sandwich in closed
 * form so we avoid dragging in a matrix library.
 */
export function regressWithRobustSE(y: number[], x: number[]): RegressionResult {
  const n = y.length;
  if (n !== x.length || n < 3) {
    throw new Error('regressWithRobustSE: x and y must align and have at least 3 obs');
  }

  let sx = 0, sy = 0;
  for (let i = 0; i < n; i++) { sx += x[i]; sy += y[i]; }
  const xbar = sx / n;
  const ybar = sy / n;

  let sxx = 0, sxy = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - xbar;
    sxx += dx * dx;
    sxy += dx * (y[i] - ybar);
  }
  const beta = sxx > 0 ? sxy / sxx : 0;
  const alpha = ybar - beta * xbar;

  // Residuals
  const e: number[] = new Array(n);
  let rss = 0, tss = 0;
  for (let i = 0; i < n; i++) {
    const yhat = alpha + beta * x[i];
    e[i] = y[i] - yhat;
    rss += e[i] * e[i];
    tss += (y[i] - ybar) * (y[i] - ybar);
  }
  const r2 = tss > 0 ? 1 - rss / tss : 0;

  // (X'X)^-1 in closed form for [1, x]
  // X'X = [[n, Σx], [Σx, Σx²]]; det = n·Σx² - (Σx)²  =  n · sxx
  let sxxRaw = 0;
  for (let i = 0; i < n; i++) sxxRaw += x[i] * x[i];
  const det = n * sxxRaw - sx * sx;
  if (det <= 0) {
    return {
      alpha, beta,
      alphaStdErr: NaN, betaStdErr: NaN,
      alphaT: NaN, betaT: NaN,
      alphaPValue: NaN, betaPValue: NaN,
      rSquared: r2, residuals: e, n,
    };
  }
  const invDet = 1 / det;
  // (X'X)^-1 = (1/det) · [[Σx², -Σx], [-Σx, n]]
  const a11 = sxxRaw * invDet;
  const a12 = -sx * invDet;
  const a22 = n * invDet;

  // Meat S = Σ ê_i² x_i x_i'
  let s11 = 0, s12 = 0, s22 = 0;
  for (let i = 0; i < n; i++) {
    const u = e[i] * e[i];
    s11 += u;
    s12 += u * x[i];
    s22 += u * x[i] * x[i];
  }

  // Sandwich V = A · S · A
  // We need V[0,0] (alpha variance) and V[1,1] (beta variance).
  // A · S:
  const m11 = a11 * s11 + a12 * s12;
  const m12 = a11 * s12 + a12 * s22;
  const m21 = a12 * s11 + a22 * s12;
  const m22 = a12 * s12 + a22 * s22;
  // V = (A · S) · A
  const v11 = m11 * a11 + m12 * a12;
  const v22 = m21 * a12 + m22 * a22;

  const seAlpha = v11 > 0 ? Math.sqrt(v11) : NaN;
  const seBeta = v22 > 0 ? Math.sqrt(v22) : NaN;
  const tAlpha = seAlpha ? alpha / seAlpha : NaN;
  const tBeta = seBeta ? beta / seBeta : NaN;

  return {
    alpha,
    beta,
    alphaStdErr: seAlpha,
    betaStdErr: seBeta,
    alphaT: tAlpha,
    betaT: tBeta,
    alphaPValue: twoSidedNormalPValue(tAlpha),
    betaPValue: twoSidedNormalPValue(tBeta),
    rSquared: r2,
    residuals: e,
    n,
  };
}

/** Two-sided p-value from a t-statistic, using the normal approximation. */
function twoSidedNormalPValue(t: number): number {
  if (!isFinite(t)) return NaN;
  return 2 * (1 - standardNormalCDF(Math.abs(t)));
}

/** Abramowitz–Stegun 7.1.26 approximation to Φ(x). */
function standardNormalCDF(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const phi = Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
  const poly = t * (0.319381530 +
    t * (-0.356563782 +
    t * (1.781477937 +
    t * (-1.821255978 +
    t * 1.330274429))));
  const cdf = 1 - phi * poly;
  return x >= 0 ? cdf : 1 - cdf;
}

// ─── Capture ratios ──────────────────────────────────────────────────────────

export type AttributionReport = {
  alpha: number;
  alphaAnnualized: number;
  beta: number;
  rSquared: number;
  alphaT: number;
  betaT: number;
  alphaPValue: number;
  /** Annualised tracking error (std dev of strategy - benchmark). */
  trackingError: number;
  /** Information ratio: mean active return / tracking error, annualised. */
  informationRatio: number;
  upCapture: number;
  downCapture: number;
  /** Annualised correlation. */
  correlation: number;
  observations: number;
  periodsPerYear: number;
};

/**
 * Build a buy-side attribution report given aligned per-period returns.
 * Returns may be percent or decimal — the report is unit-consistent with input.
 */
export function buildAttributionReport(
  strategyReturns: number[],
  benchmarkReturns: number[],
  periodsPerYear: number
): AttributionReport {
  if (strategyReturns.length !== benchmarkReturns.length) {
    throw new Error('buildAttributionReport: strategy and benchmark must have equal length');
  }
  const reg = regressWithRobustSE(strategyReturns, benchmarkReturns);

  // Tracking error and information ratio
  const active: number[] = strategyReturns.map((r, i) => r - benchmarkReturns[i]);
  const meanActive = active.reduce((s, v) => s + v, 0) / active.length;
  const varActive =
    active.reduce((s, v) => s + (v - meanActive) ** 2, 0) /
    Math.max(1, active.length - 1);
  const teAnn = Math.sqrt(varActive) * Math.sqrt(periodsPerYear);
  const ir = teAnn > 0 ? (meanActive * periodsPerYear) / teAnn : 0;

  // Up/down capture
  let upS = 0, upB = 0, upCount = 0;
  let dnS = 0, dnB = 0, dnCount = 0;
  for (let i = 0; i < benchmarkReturns.length; i++) {
    if (benchmarkReturns[i] > 0) {
      upS += strategyReturns[i];
      upB += benchmarkReturns[i];
      upCount++;
    } else if (benchmarkReturns[i] < 0) {
      dnS += strategyReturns[i];
      dnB += benchmarkReturns[i];
      dnCount++;
    }
  }
  const upCapture = upCount > 0 && upB !== 0 ? (upS / upCount) / (upB / upCount) : 0;
  const downCapture = dnCount > 0 && dnB !== 0 ? (dnS / dnCount) / (dnB / dnCount) : 0;

  // Correlation
  const correlation = pearson(strategyReturns, benchmarkReturns);

  return {
    alpha: reg.alpha,
    alphaAnnualized: reg.alpha * periodsPerYear,
    beta: reg.beta,
    rSquared: reg.rSquared,
    alphaT: reg.alphaT,
    betaT: reg.betaT,
    alphaPValue: reg.alphaPValue,
    trackingError: teAnn,
    informationRatio: ir,
    upCapture,
    downCapture,
    correlation,
    observations: reg.n,
    periodsPerYear,
  };
}

function pearson(a: number[], b: number[]): number {
  const n = a.length;
  if (n < 2) return 0;
  let sa = 0, sb = 0;
  for (let i = 0; i < n; i++) { sa += a[i]; sb += b[i]; }
  const ma = sa / n, mb = sb / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) {
    const xa = a[i] - ma;
    const xb = b[i] - mb;
    num += xa * xb;
    da += xa * xa;
    db += xb * xb;
  }
  return da > 0 && db > 0 ? num / Math.sqrt(da * db) : 0;
}

// ─── Multi-factor regression (HC0) ──────────────────────────────────────────

export type FactorEstimate = {
  name: string;
  coefficient: number;
  stdErr: number;
  tStat: number;
  pValue: number;
};

export type MultiFactorReport = {
  alpha: number;
  alphaStdErr: number;
  alphaT: number;
  alphaPValue: number;
  /** Annualised intercept. */
  alphaAnnualized: number;
  factors: FactorEstimate[];
  rSquared: number;
  adjRSquared: number;
  /** Annualised tracking error vs the residual (factor-neutral risk). */
  residualVolAnnualized: number;
  observations: number;
  periodsPerYear: number;
};

/**
 * OLS regression of y on (1, x_1, ..., x_k) with HC0 robust SEs.
 *
 * Solves (X' X) b = X' y via Gauss-Jordan elimination on the augmented
 * matrix.  For our intended use (k <= 8 factors, n in the hundreds to
 * low thousands), the cost is negligible and we avoid pulling in a
 * matrix library.
 */
function solveLinearSystem(A: number[][], b: number[]): number[] | null {
  const n = A.length;
  // augment
  const M: number[][] = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    // pivot: largest absolute value in this column at or below diagonal
    let pivotRow = col;
    let pivotVal = Math.abs(M[col][col]);
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > pivotVal) {
        pivotVal = Math.abs(M[r][col]);
        pivotRow = r;
      }
    }
    if (pivotVal < 1e-12) return null; // singular
    if (pivotRow !== col) {
      const tmp = M[col]; M[col] = M[pivotRow]; M[pivotRow] = tmp;
    }
    // eliminate
    const piv = M[col][col];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = M[r][col] / piv;
      if (factor === 0) continue;
      for (let c = col; c <= n; c++) M[r][c] -= factor * M[col][c];
    }
  }
  // normalise
  const x = new Array(n);
  for (let i = 0; i < n; i++) x[i] = M[i][n] / M[i][i];
  return x;
}

function invert(A: number[][]): number[][] | null {
  const n = A.length;
  const M: number[][] = A.map((row) => [...row, ...new Array(n).fill(0)]);
  for (let i = 0; i < n; i++) M[i][n + i] = 1;
  for (let col = 0; col < n; col++) {
    let pivotRow = col;
    let pivotVal = Math.abs(M[col][col]);
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > pivotVal) { pivotVal = Math.abs(M[r][col]); pivotRow = r; }
    }
    if (pivotVal < 1e-12) return null;
    if (pivotRow !== col) { const tmp = M[col]; M[col] = M[pivotRow]; M[pivotRow] = tmp; }
    const piv = M[col][col];
    for (let c = 0; c < 2 * n; c++) M[col][c] /= piv;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = M[r][col];
      if (factor === 0) continue;
      for (let c = 0; c < 2 * n; c++) M[r][c] -= factor * M[col][c];
    }
  }
  return M.map((row) => row.slice(n));
}

/**
 * Multi-factor regression. `factorMatrix[i]` is the i-th observation's
 * factor row (length k). `factorNames[j]` labels the j-th coefficient.
 */
export function regressMultiFactorWithRobustSE(
  y: number[],
  factorMatrix: number[][],
  factorNames: string[]
): MultiFactorReport | null {
  const n = y.length;
  const k = factorNames.length;
  if (n < k + 5 || factorMatrix.length !== n) return null;
  for (const row of factorMatrix) if (row.length !== k) return null;

  // Build X with intercept
  const X: number[][] = factorMatrix.map((row) => [1, ...row]);
  const p = k + 1;

  // X'X
  const XtX: number[][] = Array.from({ length: p }, () => new Array(p).fill(0));
  const Xty: number[] = new Array(p).fill(0);
  for (let i = 0; i < n; i++) {
    const xi = X[i];
    for (let a = 0; a < p; a++) {
      Xty[a] += xi[a] * y[i];
      for (let b = a; b < p; b++) {
        XtX[a][b] += xi[a] * xi[b];
      }
    }
  }
  // mirror
  for (let a = 0; a < p; a++) for (let b = 0; b < a; b++) XtX[a][b] = XtX[b][a];

  const beta = solveLinearSystem(
    XtX.map((r) => [...r]),
    [...Xty]
  );
  if (!beta) return null;

  // Residuals
  const e: number[] = new Array(n);
  let rss = 0;
  let mean = 0;
  for (let i = 0; i < n; i++) mean += y[i];
  mean /= n;
  let tss = 0;
  for (let i = 0; i < n; i++) {
    let yhat = 0;
    for (let a = 0; a < p; a++) yhat += X[i][a] * beta[a];
    e[i] = y[i] - yhat;
    rss += e[i] * e[i];
    tss += (y[i] - mean) ** 2;
  }
  const r2 = tss > 0 ? 1 - rss / tss : 0;
  const adjR2 = n - p > 0 ? 1 - (1 - r2) * (n - 1) / (n - p) : r2;

  // HC0 sandwich: V = (X'X)^-1 (sum e^2 x x') (X'X)^-1
  const XtXInv = invert(XtX);
  if (!XtXInv) return null;

  const meat: number[][] = Array.from({ length: p }, () => new Array(p).fill(0));
  for (let i = 0; i < n; i++) {
    const u = e[i] * e[i];
    const xi = X[i];
    for (let a = 0; a < p; a++) {
      for (let b = 0; b < p; b++) {
        meat[a][b] += u * xi[a] * xi[b];
      }
    }
  }

  // V = XtXInv * meat * XtXInv
  const tmp: number[][] = Array.from({ length: p }, () => new Array(p).fill(0));
  for (let a = 0; a < p; a++) for (let b = 0; b < p; b++) {
    let s = 0;
    for (let c = 0; c < p; c++) s += XtXInv[a][c] * meat[c][b];
    tmp[a][b] = s;
  }
  const V: number[][] = Array.from({ length: p }, () => new Array(p).fill(0));
  for (let a = 0; a < p; a++) for (let b = 0; b < p; b++) {
    let s = 0;
    for (let c = 0; c < p; c++) s += tmp[a][c] * XtXInv[c][b];
    V[a][b] = s;
  }

  const seCoeff = new Array(p).fill(0).map((_, i) => (V[i][i] > 0 ? Math.sqrt(V[i][i]) : NaN));

  // Build factor estimates
  const factors: FactorEstimate[] = factorNames.map((name, j) => {
    const coef = beta[j + 1];
    const se = seCoeff[j + 1];
    const t = se ? coef / se : NaN;
    return {
      name,
      coefficient: coef,
      stdErr: se,
      tStat: t,
      pValue: twoSidedNormalPValue(t),
    };
  });

  // Periods/year is up to caller — let them pass it in via wrapper.
  // Residual vol from RSS / (n - p)
  const sigma2 = (n - p) > 0 ? rss / (n - p) : 0;
  const sigmaRes = Math.sqrt(Math.max(0, sigma2));

  const alphaT = seCoeff[0] ? beta[0] / seCoeff[0] : NaN;
  return {
    alpha: beta[0],
    alphaStdErr: seCoeff[0],
    alphaT,
    alphaPValue: twoSidedNormalPValue(alphaT),
    alphaAnnualized: 0, // wrapper fills in
    factors,
    rSquared: r2,
    adjRSquared: adjR2,
    residualVolAnnualized: sigmaRes, // wrapper fills annualisation
    observations: n,
    periodsPerYear: 0, // wrapper fills
  };
}

/** User-facing wrapper that handles annualisation. */
export function buildMultiFactorReport(
  strategyReturns: number[],
  factorMatrix: number[][],
  factorNames: string[],
  periodsPerYear: number
): MultiFactorReport | null {
  const r = regressMultiFactorWithRobustSE(strategyReturns, factorMatrix, factorNames);
  if (!r) return null;
  return {
    ...r,
    alphaAnnualized: r.alpha * periodsPerYear,
    residualVolAnnualized: r.residualVolAnnualized * Math.sqrt(periodsPerYear),
    periodsPerYear,
  };
}
