import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, XCircle, AlertTriangle, Trash2, Download, X, Database, ShieldAlert } from 'lucide-react';
import {
  RunHistoryEntry,
  REPRO_TOLERANCE,
  compareReproducibility,
  deleteRun,
  exportRunsAsJson,
  listRuns,
} from '../runHistory';
import { cn } from '../lib/utils';

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

/**
 * Compute the approximate aggregate JSON-serialized size of `entries` and
 * format as a human-readable string (KB / MB). Returns `'unknown'` if any
 * entry fails to serialize (cycles, throws, etc.) so the UI degrades
 * gracefully rather than breaking the panel.
 */
function formatAuditLogSize(entries: RunHistoryEntry[]): string {
  if (entries.length === 0) return '0 KB';
  try {
    let bytes = 0;
    for (const entry of entries) {
      bytes += JSON.stringify(entry).length;
    }
    if (bytes >= 1024 * 1024) {
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }
    return `${(bytes / 1024).toFixed(1)} KB`;
  } catch {
    return 'unknown';
  }
}

const VERDICT_BADGE: Record<string, string> = {
  pass: 'badge badge-green',
  warn: 'badge badge-amber',
  fail: 'badge badge-red',
};

/**
 * Two-slot selection used by the reproducibility comparison feature
 * (Requirement 25.5). A `Set<string>` was previously used here, but its
 * iteration order made the "replace older selection" semantics implicit;
 * a tuple captures the order explicitly: index 0 is the older selection,
 * index 1 the newer.
 */
type SelectionTuple = [string?, string?];

function isSelected(sel: SelectionTuple, runId: string): boolean {
  return sel[0] === runId || sel[1] === runId;
}

function toggleSelectTuple(sel: SelectionTuple, runId: string): SelectionTuple {
  // Already selected → deselect, leaving the other (if any) in slot 0.
  if (sel[0] === runId) return [sel[1], undefined];
  if (sel[1] === runId) return [sel[0], undefined];
  // Empty slots → fill in order.
  if (sel[0] === undefined) return [runId, sel[1]];
  if (sel[1] === undefined) return [sel[0], runId];
  // Both slots full → evict the older (slot 0), shift slot 1 down, append new.
  return [sel[1], runId];
}

export function RunHistoryPanel({ open, onClose }: Props) {
  const [runs, setRuns] = useState<RunHistoryEntry[]>([]);
  const [filter, setFilter] = useState<'all' | 'basic' | 'regime' | 'parametric' | 'portfolio' | 'garch'>('all');
  const [selected, setSelected] = useState<SelectionTuple>([undefined, undefined]);
  const [loading, setLoading] = useState(false);
  const [showExportConfirm, setShowExportConfirm] = useState(false);
  const [exportPayload, setExportPayload] = useState<{ json: string; size: string; count: number } | null>(null);

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

  const auditLogSize = useMemo(() => formatAuditLogSize(runs), [runs]);

  const reproCompare = useMemo(() => {
    const [aId, bId] = selected;
    if (!aId || !bId) return null;
    const a = runs.find((r) => r.runId === aId);
    const b = runs.find((r) => r.runId === bId);
    if (!a || !b) return null;
    return compareReproducibility(a, b);
  }, [selected, runs]);

  if (!open) return null;

  const toggleSelect = (runId: string) => {
    setSelected((prev) => toggleSelectTuple(prev, runId));
  };

  const handleDelete = async (runId: string) => {
    await deleteRun(runId);
    setRuns((prev) => prev.filter((r) => r.runId !== runId));
    setSelected((prev) => [
      prev[0] === runId ? undefined : prev[0],
      prev[1] === runId ? undefined : prev[1],
    ]);
  };

  const handleExport = () => {
    if (filtered.length === 0) return;
    const json = exportRunsAsJson(filtered);
    // Approximate byte size in UTF-8. JSON output is ASCII-heavy, so length is a
    // reasonable proxy; non-ASCII characters would inflate slightly but are rare
    // in run-history entries (numeric metrics, run ids, ISO timestamps).
    const bytes = new Blob([json]).size;
    let size: string;
    if (bytes >= 1024 * 1024) {
      size = `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    } else {
      size = `${(bytes / 1024).toFixed(1)} KB`;
    }
    setExportPayload({ json, size, count: filtered.length });
    setShowExportConfirm(true);
  };

  const handleCancelExport = () => {
    setShowExportConfirm(false);
    setExportPayload(null);
  };

  const handleConfirmExport = () => {
    if (!exportPayload) return;
    const blob = new Blob([exportPayload.json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mc_risk_run_history_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setShowExportConfirm(false);
    setExportPayload(null);
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
        <header className="px-6 py-4 border-b border-[var(--border)]/60 flex items-center justify-between">
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
              className="btn-press text-xs px-3 py-1.5 rounded-md border border-[var(--border)] hover:border-[var(--accent-blue)] hover:bg-[var(--accent-blue)]/10 inline-flex items-center gap-1.5 text-[var(--text-secondary)]"
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

        <div className="px-6 py-2 border-b border-[var(--border)]/40 flex items-center justify-between gap-4 flex-wrap text-[10px] text-[var(--text-secondary)] opacity-70">
          <span>Run history is stored locally in your browser, unencrypted.</span>
          <span className="metric-value">Audit log size: ~{auditLogSize}</span>
        </div>

        <div className="px-6 py-3 border-b border-[var(--border)]/40 flex items-center gap-2 flex-wrap text-[10px]">
          <span className="text-[var(--text-secondary)] uppercase tracking-wider font-bold">Model</span>
          {(['all', 'basic', 'regime', 'parametric', 'portfolio', 'garch'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setFilter(m)}
              className={cn(
                'btn-press px-2.5 py-1 rounded-full uppercase tracking-wider font-bold',
                filter === m
                  ? 'bg-[var(--accent-blue)]/20 text-[var(--accent-blue)] ring-1 ring-[var(--accent-blue)]/40'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]',
              )}
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
              <thead className="sticky top-0 bg-[var(--bg-secondary)] border-b border-[var(--border)]/60 z-10">
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
                  const rowSelected = isSelected(selected, r.runId);
                  return (
                    <tr
                      key={r.runId}
                      className={cn(
                        'border-b border-[var(--border)]/30 hover:bg-[var(--bg-elevated)]/40 transition-colors',
                        rowSelected && 'bg-[var(--accent-blue)]/10',
                      )}
                    >
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={rowSelected}
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
                        className={cn(
                          'px-3 py-2 text-right metric-value',
                          r.summary.ruinProbability > 5
                            ? 'text-[var(--accent-red)]'
                            : r.summary.ruinProbability > 1
                            ? 'text-[var(--accent-amber)]'
                            : 'text-[var(--accent-green)]',
                        )}
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
          <div className="px-6 py-3 border-t border-[var(--border)]/60 bg-[var(--bg-secondary)]/60">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] uppercase tracking-wider font-bold text-[var(--text-secondary)]">
                Reproducibility Check
              </span>
              <span
                className={cn('badge', reproCompare.reproducible ? 'badge-green' : 'badge-red')}
              >
                {reproCompare.reproducible ? (
                  <>
                    <CheckCircle2 className="w-3 h-3" /> Reproducible
                  </>
                ) : (
                  <>
                    <XCircle className="w-3 h-3" /> Drift detected
                  </>
                )}
              </span>
            </div>
            {reproCompare.deltas.length === 0 ? (
              <p className="text-[10px] text-[var(--text-secondary)] opacity-80">
                Inputs differ between selected runs (seed, sampling, data, or sim count). Reproducibility check
                requires identical inputs.
              </p>
            ) : reproCompare.reproducible ? (
              <p className="text-[10px] text-[var(--text-secondary)] opacity-80">
                All summary metrics agree within numerical tolerance. The two runs are reproducible peers.
              </p>
            ) : (
              <>
                <p className="text-[10px] text-[var(--text-secondary)] opacity-80 mb-2">
                  The following fields exceed the reproducibility tolerance:
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[10px]">
                  {reproCompare.deltas
                    .filter((d) =>
                      d.field === 'prngFamily'
                        ? true
                        : d.absDelta >=
                          REPRO_TOLERANCE * Math.max(1, Math.abs(Number(d.a)))
                    )
                    .map((d) => (
                      <div
                        key={d.field}
                        className="border border-[var(--accent-red)]/40 bg-[var(--accent-red)]/10 rounded p-2"
                      >
                        <div className="text-[var(--accent-red)] uppercase tracking-wider font-bold">
                          {d.field}
                        </div>
                        <div className="metric-value text-[var(--text-primary)]">
                          {d.field === 'prngFamily'
                            ? 'mismatch'
                            : `Δ ${(d.absDelta as number).toExponential(2)}`}
                        </div>
                        <div className="text-[var(--text-secondary)] opacity-80 mt-0.5">
                          a: {typeof d.a === 'number' ? d.a.toExponential(3) : d.a}
                        </div>
                        <div className="text-[var(--text-secondary)] opacity-80">
                          b: {typeof d.b === 'number' ? d.b.toExponential(3) : d.b}
                        </div>
                      </div>
                    ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {showExportConfirm && exportPayload && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center px-4 backdrop-enter"
          style={{ background: 'rgba(0,0,0,0.7)' }}
          onClick={(e) => {
            e.stopPropagation();
            handleCancelExport();
          }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="export-confirm-title"
        >
          <div
            className="glass-card sheet-enter w-full max-w-md flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="px-6 py-4 border-b border-[var(--border)]/60 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-[var(--accent-amber)]" />
              <h3
                id="export-confirm-title"
                className="text-sm font-semibold text-[var(--text-primary)] tracking-wide"
              >
                Export Run History
              </h3>
            </header>

            <div className="px-6 py-4 space-y-3 text-xs text-[var(--text-primary)]">
              <p>
                This file contains your full trade history (PnL series, sleeve weights, factor data) for{' '}
                <span className="metric-value text-[var(--accent-blue)]">{exportPayload.count}</span>{' '}
                {exportPayload.count === 1 ? 'run' : 'runs'}, totaling{' '}
                <span className="metric-value text-[var(--accent-blue)]">~{exportPayload.size}</span>.
              </p>
              <div className="border border-[var(--accent-amber)]/40 bg-[var(--accent-amber)]/10 rounded p-3 text-[11px] text-[var(--text-primary)] flex gap-2">
                <AlertTriangle className="w-4 h-4 text-[var(--accent-amber)] shrink-0 mt-0.5" />
                <span>
                  The exported file is unencrypted. Do not share it with anyone you do not trust with your
                  trading data.
                </span>
              </div>
            </div>

            <footer className="px-6 py-3 border-t border-[var(--border)]/60 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={handleCancelExport}
                className="btn-press text-xs px-3 py-1.5 rounded-md border border-[var(--border)] hover:border-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] text-[var(--text-secondary)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmExport}
                className="btn-press text-xs px-3 py-1.5 rounded-md border border-[var(--accent-blue)] bg-[var(--accent-blue)]/15 hover:bg-[var(--accent-blue)]/25 text-[var(--accent-blue)] inline-flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" /> Download
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}
