/** Permutation + absolute PnL fixes terminal wealth; only drawdown paths differ. */
export function isTerminalPnLDegenerate(finalBalances: number[]): boolean {
  if (finalBalances.length < 2) return false;
  const first = finalBalances[0];
  return finalBalances.every((b) => Math.abs(b - first) < 1e-4);
}

export function terminalPnLValidForRun(
  modelType: string,
  samplingMode: string,
  dataFormat: string,
  finalBalances: number[]
): boolean {
  if (modelType === 'basic' && samplingMode === 'permutation' && dataFormat === 'absolute') {
    return false;
  }
  return !isTerminalPnLDegenerate(finalBalances);
}

export const PERMUTATION_TERMINAL_WARNING =
  'Permutation sampling preserves total PnL under absolute dollars — terminal balance, VaR, and CVaR are identical across paths. Use drawdown distributions for sequence risk, or switch to Bootstrap for terminal tail metrics.';
