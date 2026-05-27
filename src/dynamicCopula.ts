import { DynamicCopulaModel } from './types';
import { buildCorrelationMatrix } from './correlation';
import { 
  choleskyLower, 
  ensurePsdCorrelation, 
  drawCorrelatedNormals, 
  studentTCdf, 
  drawCorrelatedStudentT,
  normalCdf 
} from './correlatedResampling';

/**
 * Builds a dynamic copula model by grouping aligned PnLs by their regime label,
 * calculating empirical transition probabilities between regimes, and building
 * a Cholesky-decomposed correlation matrix for each regime.
 */
export function buildDynamicCopulaModel(
  alignedPnls: number[][], // [numLegs][numHistoricalRows]
  regimeLabels: string[]   // [numHistoricalRows]
): DynamicCopulaModel {
  const numRows = regimeLabels.length;
  if (numRows === 0) throw new Error('No regime labels provided.');
  if (alignedPnls.length === 0) throw new Error('No aligned PnLs provided.');
  if (alignedPnls[0].length !== numRows) {
    throw new Error('Mismatched lengths between alignedPnls and regimeLabels.');
  }

  // Find unique regimes
  const regimes = [...new Set(regimeLabels)];
  
  // Calculate empirical initial probabilities
  const initialProbabilities: Record<string, number> = {};
  regimes.forEach(r => initialProbabilities[r] = 0);
  regimeLabels.forEach(r => initialProbabilities[r]++);
  regimes.forEach(r => initialProbabilities[r] /= numRows);

  // Calculate empirical transition matrix
  const transitionMatrix: Record<string, Record<string, number>> = {};
  const transitionsCount: Record<string, number> = {};
  
  regimes.forEach(r => {
    transitionMatrix[r] = {};
    transitionsCount[r] = 0;
    regimes.forEach(r2 => transitionMatrix[r][r2] = 0);
  });

  for (let i = 0; i < numRows - 1; i++) {
    const from = regimeLabels[i];
    const to = regimeLabels[i + 1];
    transitionMatrix[from][to]++;
    transitionsCount[from]++;
  }

  // Normalize transition probabilities
  regimes.forEach(from => {
    const count = transitionsCount[from];
    if (count > 0) {
      regimes.forEach(to => {
        transitionMatrix[from][to] /= count;
      });
    } else {
      // If a regime only appears at the very end, give it a uniform transition probability
      regimes.forEach(to => {
        transitionMatrix[from][to] = 1 / regimes.length;
      });
    }
  });

  // Calculate regime-specific correlation matrices
  const choleskyLByRegime: Record<string, number[][]> = {};
  
  regimes.forEach(regime => {
    // Extract rows for this regime
    const indices = [];
    for (let i = 0; i < numRows; i++) {
      if (regimeLabels[i] === regime) indices.push(i);
    }
    
    // If a regime has fewer than 2 rows, we can't build a correlation matrix.
    // Fall back to identity matrix
    if (indices.length < 2) {
      const k = alignedPnls.length;
      const identity = Array.from({ length: k }, (_, i) =>
        Array.from({ length: k }, (_, j) => (i === j ? 1 : 0))
      );
      choleskyLByRegime[regime] = choleskyLower(identity)!;
      return;
    }
    
    // Build PnL subsets for the regime
    const regimePnls = alignedPnls.map(series => indices.map(idx => series[idx]));
    const corr = buildCorrelationMatrix(regimePnls);
    const psdCorr = ensurePsdCorrelation(corr);
    const L = choleskyLower(psdCorr);
    if (!L) {
      // Fallback if numerical issues persist
      const k = alignedPnls.length;
      const identity = Array.from({ length: k }, (_, i) =>
        Array.from({ length: k }, (_, j) => (i === j ? 1 : 0))
      );
      choleskyLByRegime[regime] = choleskyLower(identity)!;
    } else {
      choleskyLByRegime[regime] = L;
    }
  });

  return {
    regimes,
    choleskyLByRegime,
    transitionMatrix,
    initialProbabilities
  };
}

export function sampleNextRegime(
  currentRegime: string,
  model: DynamicCopulaModel,
  rng: () => number
): string {
  const probs = model.transitionMatrix[currentRegime];
  if (!probs) return model.regimes[Math.floor(rng() * model.regimes.length)]; // Fallback
  
  const r = rng();
  let cumulative = 0;
  for (const next of model.regimes) {
    cumulative += probs[next];
    if (r <= cumulative) return next;
  }
  return model.regimes[model.regimes.length - 1]; // Floating point fallback
}

export function sampleInitialRegime(model: DynamicCopulaModel, rng: () => number): string {
  const r = rng();
  let cumulative = 0;
  for (const regime of model.regimes) {
    cumulative += model.initialProbabilities[regime];
    if (r <= cumulative) return regime;
  }
  return model.regimes[model.regimes.length - 1];
}

/**
 * Correlated bootstrap step using a dynamic copula model.
 */
export function drawDynamicCorrelatedReturnStep(
  returnPools: number[][],
  model: DynamicCopulaModel,
  currentRegime: string,
  rng: () => number,
  copulaType: 'gaussian' | 'student_t' = 'gaussian',
  copulaDf: number = 5
): number[] {
  const L = model.choleskyLByRegime[currentRegime];
  if (!L) throw new Error(`Missing Cholesky matrix for regime ${currentRegime}`);

  const z = copulaType === 'student_t'
    ? drawCorrelatedStudentT(L, copulaDf, rng)
    : drawCorrelatedNormals(L, rng);

  const cdfFn = copulaType === 'student_t'
    ? (x: number) => studentTCdf(x, copulaDf)
    : normalCdf;

  return z.map((zi, j) => {
    const u = cdfFn(zi);
    const n = returnPools[j].length;
    const idx = Math.min(n - 1, Math.max(0, Math.floor(u * n)));
    return returnPools[j][idx];
  });
}
