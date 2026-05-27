import { meanAndStdDev } from './mathUtils';

/** Pearson correlation; returns 0 if either series has zero variance */
export function pearsonCorrelation(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;
  const { mean: meanA, std: stdA } = meanAndStdDev(a.slice(0, n));
  const { mean: meanB, std: stdB } = meanAndStdDev(b.slice(0, n));
  if (stdA === 0 || stdB === 0) return 0;
  let cov = 0;
  for (let i = 0; i < n; i++) {
    cov += (a[i] - meanA) * (b[i] - meanB);
  }
  return cov / ((n - 1) * stdA * stdB);
}

export function buildCorrelationMatrix(series: number[][]): number[][] {
  const k = series.length;
  const matrix: number[][] = Array.from({ length: k }, () => Array(k).fill(0));
  for (let i = 0; i < k; i++) {
    matrix[i][i] = 1;
    for (let j = i + 1; j < k; j++) {
      const r = pearsonCorrelation(series[i], series[j]);
      matrix[i][j] = r;
      matrix[j][i] = r;
    }
  }
  return matrix;
}
