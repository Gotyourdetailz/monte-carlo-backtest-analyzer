import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, XCircle, AlertTriangle, Trash2, Download, X, Database } from 'lucide-react';
import {
  RunHistoryEntry,
  compareReproducibility,
  deleteRun,
  exportRunsAsJson,
  listRuns,
} from '../runHistory';

type Props = {
  open: boolean;
  onClose: () => void;
};

function fmtUSD(v: number): string {
  if (!isFinite(v)) return '—';
  return `${v < 0 ? '-' : ''}$${Math.round(Math.abs(v)).toLocaleString()}`;
}

function fmtPct(v: number): string {
  if (!isFinite(v)) return '—';
  return `${v.toFixed(2)}%`;
}

function shortId(runId: string): string {
  // run_<timestamp> → take last 6 digits
  const m = runId.match(/(\d{6})$/);
  return m ? m[1] : runId.slice(-6);
}

function relTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (!isFinite(t)) return iso;
  const dt = Date.now() - t;
  const s = Math.floor(dt / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

const VERDICT_BADGE: Record<string, string> = {
  pass: 'badge badge-green',
  warn: 'badge badge-amber',
  fail: 'badge badge-red',
};

export function RunHistoryPanel({ open, onClose }: Props) {
  const [runs, setRuns] = useState<RunHistoryEntry[]>([]);
  const [filter, setFilter] = useState<'all' | 'basic' | 'regime' | 'parametric' | 'portfolio' | 'garch'>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    listRuns(200).then((r) => {
      if (!cancelled) {
        setRuns(r);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const filtered = useMemo(
    () => (filter === 'all' ? runs : runs.filter((r) => r.modelType === filter)),
    [runs, filter]
  );

  const reproCompare = useMemo(() => {
    if (selected.size !== 2) return null;
    const [a, b] = [...selected].map((id) => runs.find((r) => r.runId === id)).filter(Boolean) as RunHistoryEntry[];
    if (!a || !b) return null;
    return compareReproducibility(a, b);
  }, [selected, runs]);

  if (!open) return null;

  const toggleSelect = (runId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(runId)) next.delete(runId);
      else if (next.size < 2) next.add(runId);
      else {
        // replace the older selection with the new one
        const first = [...next][0];
        next.delete(first);
        next.add(runId);
      }
      return next;
    });
  };

  const handleDelete = async (runId: string) => {
    await deleteRun(runId);
    setRuns((prev) => prev.filter((r) => r.runId !== runId));
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(runId);
      return next;
    });
  };

  const handleExport = () => {
    const blob = new Blob([exportRunsAsJson(filtered)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mc_risk_run_history_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-12 px-4 backdrop-enter"
      style={{ background: 'rgba(0,0,0,0.55)' }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="run-history-title"
    >
      <div
        className="glass-card sheet-enter w-full max-w-5xl max-h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-6 py-4 border-b border-[#30363d]/60 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Database className="w-4 h-4 text-[var(--accent-blue)]" />
            <h2 id="run-history-title" className="text-sm font-semibold text-[var(--text-primary)] tracking-wide">
              Run History
            </h2>
            <span className="badge badge-blue">{runs.length} runs</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExport}
              disabled={filtered.length === 0}
              className="btn-press text-xs px-3 py-1.5 rounded-md border border-[#30363d] hover:border-[var(--accent-blue)] hover:bg-[var(--accent-blue)]/10 inline-flex items-center gap-1.5 text-[var(--text-secondary)]"
            >
              <Download className="w-3.5 h-3.5" /> Export JSON
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close run history"
              className="btn-press p-1.5 rounded-md hover:bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </header>

        <div className="px-6 py-3 border-b border-[#30363d]/40 flex items-center gap-2 flex-wrap text-[10px]">
          <span className="text-[var(--text-secondary)] uppercase tracking-wider font-bold">Model</span>
          {(['all', 'basic', 'regime', 'parametric', 'portfolio', 'garch'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setFilter(m)}
              className={`btn-press px-2.5 py-1 rounded-full uppercase tracking-wider font-bold ${
                filter === m
                  ? 'bg-[var(--accent-blue)]/20 text-[var(--accent-blue)] ring-1 ring-[var(--accent-blue)]/40'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]'
              }`}
            >
              {m}
            </button>
          ))}
          <span className="ml-auto text-[10px] text-[var(--text-secondary)] opacity-70">
            Select two runs to check reproducibility
          </span>
        </div>

        <div className="flex-1 overflow-auto custom-scrollbar">
          {loading ? (
            <div className="p-6 space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="skeleton h-12 w-full" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-sm text-[var(--text-secondary)]">
              No runs yet. Run a simulation and it will be persisted here.
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-[var(--bg-secondary)] border-b border-[#30363d]/60 z-10">
                <tr className="text-left text-[10px] uppercase tracking-wider text-[var(--text-secondary)]">
                  <th className="px-3 py-2 w-8"></th>
                  <th className="px-3 py-2">Run</th>
                  <th className="px-3 py-2">Model</th>
                  <th className="px-3 py-2">Sampling</th>
                  <th className="px-3 py-2">Seed</th>
                  <th className="px-3 py-2">N</th>
                  <th className="px-3 py-2 text-right">Median Term.</th>
                  <th className="px-3 py-2 text-right">CVaR 95%</th>
                  <th className="px-3 py-2 text-right">Ruin %</th>
                  <th className="px-3 py-2">Validation</th>
                  <th className="px-3 py-2 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const isSelected = selected.has(r.runId);
                  return (
                    <tr
                      key={r.runId}
                      className={`border-b border-[#30363d]/30 hover:bg-[var(--bg-elevated)]/40 transition-colors ${
                        isSelected ? 'bg-[var(--accent-blue)]/10' : ''
                      }`}
                    >
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(r.runId)}
                          className="accent-[var(--accent-blue)]"
                          aria-label={`Select run ${shortId(r.runId)}`}
                        />
                      </td>
                      <td className="px-3 py-2 metric-value text-[var(--text-primary)]">
                        <div>{shortId(r.runId)}</div>
                        <div className="text-[10px] text-[var(--text-secondary)] opacity-70">
                          {relTime(r.timestamp)}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-[var(--text-primary)]">{r.modelType}</td>
                      <td className="px-3 py-2 text-[var(--text-secondary)]">{r.samplingMode}</td>
                      <td className="px-3 py-2 metric-value text-[var(--text-secondary)]">
                        {r.randomSeed ?? '—'}
                      </td>
                      <td className="px-3 py-2 metric-value text-[var(--text-secondary)]">
                        {r.nSimulations.toLocaleString()}
                      </td>
                      <td className="px-3 py-2 text-right metric-value text-[var(--accent-green)]">
                        {fmtUSD(r.summary.medianFinalBalance)}
                      </td>
                      <td className="px-3 py-2 text-right metric-value text-[var(--accent-red)]">
                        {r.summary.terminalPnLValid ? fmtUSD(r.summary.cvar95) : 'N/A'}
                      </td>
                      <td
                        className={`px-3 py-2 text-right metric-value ${
                          r.summary.ruinProbability > 5
                            ? 'text-[var(--accent-red)]'
                            : r.summary.ruinProbability > 1
                            ? 'text-[var(--accent-amber)]'
                            : 'text-[var(--accent-green)]'
                        }`}
                      >
                        {fmtPct(r.summary.ruinProbability)}
                      </td>
                      <td className="px-3 py-2">
                        {r.validationVerdict ? (
                          <span className={VERDICT_BADGE[r.validationVerdict] ?? 'badge'}>
                            {r.validationVerdict === 'pass' ? (
                              <CheckCircle2 className="w-3 h-3" />
                            ) : r.validationVerdict === 'warn' ? (
                              <AlertTriangle className="w-3 h-3" />
                            ) : (
                              <XCircle className="w-3 h-3" />
                            )}
                            {r.validationVerdict.toUpperCase()}
                          </span>
                        ) : (
                          <span className="text-[10px] text-[var(--text-secondary)] opacity-60">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => handleDelete(r.runId)}
                          aria-label={`Delete run ${shortId(r.runId)}`}
                          className="btn-press p-1 rounded text-[var(--text-secondary)] hover:text-[var(--accent-red)] hover:bg-[var(--accent-red)]/10"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {reproCompare && (
          <div className="px-6 py-3 border-t border-[#30363d]/60 bg-[var(--bg-secondary)]/60">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] uppercase tracking-wider font-bold text-[var(--text-secondary)]">
                Reproducibility Check
              </span>
              <span
                className={`badge ${
                  reproCompare.reproducible ? 'badge-green' : 'badge-red'
                }`}
              >
                {reproCompare.reproducible ? 'Reproducible' : 'Drift detected'}
              </span>
            </div>
            {reproCompare.deltas.length === 0 ? (
              <p className="text-[10px] text-[var(--text-secondary)] opacity-80">
                Inputs differ between selected runs (seed, sampling, data, or sim count). Reproducibility check
                requires identical inputs.
              </p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-[10px]">
                {reproCompare.deltas.map((d) => (
                  <div key={d.field} className="border border-[#30363d]/60 rounded p-2">
                    <div className="text-[var(--text-secondary)] uppercase tracking-wider">{d.field}</div>
                    <div className="metric-value text-[var(--text-primary)]">
                      Δ {d.absDelta.toExponential(2)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
