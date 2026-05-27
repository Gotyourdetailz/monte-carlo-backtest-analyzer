/** Detect NinjaTrader Grid export (Trades tab → Export) */
export function isNinjaTraderGrid(fields: string[]): boolean {
  const lower = fields.map((f) => f.trim().toLowerCase());
  return (
    lower.includes('profit') &&
    lower.includes('instrument') &&
    (lower.includes('trade number') || lower.includes('entry time'))
  );
}

export function findColumn(fields: string[], ...candidates: string[]): string | null {
  const lower = fields.map((f) => f.trim().toLowerCase());
  for (const c of candidates) {
    const idx = lower.indexOf(c.toLowerCase());
    if (idx >= 0) return fields[idx];
  }
  return null;
}

/** Columns that are not strategy PnL sleeves in a NinjaTrader export */
export const NINJATRADER_NON_SLEEVE_COLUMNS = new Set(
  [
    'trade number',
    'instrument',
    'account',
    'strategy',
    'market pos.',
    'qty',
    'entry price',
    'exit price',
    'entry time',
    'exit time',
    'entry name',
    'exit name',
    'cum. net profit',
    'commission',
    'clearing fee',
    'exchange fee',
    'ip fee',
    'nfa fee',
    'mae',
    'mfe',
    'etd',
    'bars',
    '',
  ].map((s) => s.toLowerCase())
);

export type InstrumentSleeve = {
  id: string;
  name: string;
  weight: number;
  tradeCount: number;
};

export function listInstrumentSleeves(
  data: Record<string, unknown>[],
  instrumentCol: string,
  profitCol: string,
  parseProfit: (val: unknown) => number
): InstrumentSleeve[] {
  const counts = new Map<string, number>();
  for (const row of data) {
    const inst = String(row[instrumentCol] ?? '').trim();
    if (!inst) continue;
    const pnl = parseProfit(row[profitCol]);
    if (isNaN(pnl)) continue;
    counts.set(inst, (counts.get(inst) ?? 0) + 1);
  }
  const instruments = [...counts.keys()].sort();
  const w = instruments.length > 0 ? 1 / instruments.length : 0;
  return instruments.map((name) => ({
    id: name,
    name,
    weight: w,
    tradeCount: counts.get(name) ?? 0,
  }));
}
