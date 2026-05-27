import { pearsonCorrelation } from './correlation';

export type RegimeSegmentId = 'in_regime' | 'out_regime' | 'clustered' | 'dispersed';

const WINDOW = 20;
const AUTOCORR_THRESHOLD = 0.35;

export function findInRegimeColumn(fields: string[]): string | null {
  const lower = fields.map((f) => f.trim().toLowerCase());
  const idx = lower.findIndex((f) => f === 'in_regime' || f === 'in regime');
  if (idx >= 0) return fields[idx];
  return null;
}

function parseBooleanish(val: unknown): boolean | null {
  if (val === true || val === 1) return true;
  if (val === false || val === 0) return false;
  if (typeof val === 'string') {
    const s = val.trim().toLowerCase();
    if (['1', 'true', 'yes', 'y'].includes(s)) return true;
    if (['0', 'false', 'no', 'n'].includes(s)) return false;
  }
  return null;
}

/** Labels each CSV row for portfolio regime breakdown */
export function assignPortfolioRegimeSegments(
  rows: Record<string, unknown>[],
  profitCol: string,
  parseProfit: (v: unknown) => number,
  inRegimeCol: string | null
): RegimeSegmentId[] {
  if (inRegimeCol) {
    return rows.map((row) => {
      const b = parseBooleanish(row[inRegimeCol]);
      return b ? 'in_regime' : 'out_regime';
    });
  }

  const pnls = rows.map((r) => parseProfit(r[profitCol]));
  return pnls.map((_, i) => {
    if (i < WINDOW - 1) return 'dispersed';
    const w = pnls.slice(i - WINDOW + 1, i + 1);
    const lagA = w.slice(0, -1);
    const lagB = w.slice(1);
    const ac = Math.abs(pearsonCorrelation(lagA, lagB));
    return ac >= AUTOCORR_THRESHOLD ? 'clustered' : 'dispersed';
  });
}

export function regimeSegmentLabel(id: RegimeSegmentId | string): string {
  switch (id) {
    case 'in_regime':
      return 'In regime (column)';
    case 'out_regime':
      return 'Out of regime (column)';
    case 'clustered':
      return 'Clustered (high rolling autocorrelation)';
    case 'dispersed':
      return 'Dispersed (low rolling autocorrelation)';
    default:
      return String(id);
  }
}
