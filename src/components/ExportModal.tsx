import { useState } from 'react';
import { FileText, CheckCircle2 } from 'lucide-react';
import { SimulationResults } from '../types';
import { cn } from '../lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from './ui/dialog';
import { Button } from './ui/button';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  resultsHistory: Record<string, SimulationResults>;
  onExport: (selectedModels: string[]) => void;
  isExportingPdf: boolean;
}

export function ExportModal({ isOpen, onClose, resultsHistory, onExport, isExportingPdf }: ExportModalProps) {
  const models = [
    { id: 'basic', label: 'Trade Sequence MC' },
    { id: 'regime', label: 'Regime-Switching' },
    { id: 'parametric', label: 'Parametric (Student-t)' },
    { id: 'portfolio', label: 'Multi-Strategy Portfolio' },
    { id: 'garch', label: 'GARCH(1,1)' }
  ];

  const [selected, setSelected] = useState<Record<string, boolean>>(() => {
    // Select all available by default
    const acc: Record<string, boolean> = {};
    for (const m of models) {
      if (resultsHistory[m.id]) acc[m.id] = true;
    }
    return acc;
  });

  const handleToggle = (id: string) => {
    if (!resultsHistory[id]) return;
    setSelected(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const selectedCount = Object.values(selected).filter(Boolean).length;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-[var(--accent-blue)]" />
            Export Institutional Tear Sheet
          </DialogTitle>
        </DialogHeader>

        <div>
          <p className="text-sm text-[var(--text-secondary)] mb-4">
            Select the backtest models to include in your PDF report. Models you haven't run yet are disabled.
          </p>

          <div className="space-y-3 mb-2">
            {models.map(m => {
              const isAvailable = !!resultsHistory[m.id];
              const isSelected = selected[m.id];

              return (
                <label
                  key={m.id}
                  className={cn(
                    'flex items-center gap-3 p-3 rounded-xl border transition-all',
                    !isAvailable
                      ? 'border-[var(--border)]/50 bg-[var(--border)]/20 opacity-50 cursor-not-allowed'
                      : isSelected
                        ? 'border-[var(--accent-blue)] bg-[var(--accent-blue)]/10 cursor-pointer shadow-[0_0_15px_rgba(88,166,255,0.1)]'
                        : 'border-[var(--border)] bg-[#161b22] cursor-pointer hover:border-[var(--text-secondary)]',
                  )}
                >
                  <input
                    type="checkbox"
                    className="hidden"
                    checked={isSelected}
                    onChange={() => handleToggle(m.id)}
                    disabled={!isAvailable}
                  />
                  <div className={cn(
                    'w-5 h-5 rounded flex items-center justify-center shrink-0 border transition-colors',
                    isSelected ? 'bg-[var(--accent-blue)] border-[var(--accent-blue)]' : 'border-[var(--text-secondary)] bg-transparent',
                  )}>
                    {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-[var(--bg-secondary)]" />}
                  </div>
                  <span className={cn('font-medium', !isAvailable ? 'text-[var(--text-secondary)]' : 'text-white')}>
                    {m.label}
                  </span>
                  {!isAvailable && (
                    <span className="ml-auto text-xs text-[var(--text-secondary)]">Not run yet</span>
                  )}
                </label>
              );
            })}
          </div>
        </div>

        <DialogFooter className="border-t border-[var(--border)] pt-4">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              const keys = Object.keys(selected).filter(k => selected[k]);
              onExport(keys);
            }}
            disabled={selectedCount === 0 || isExportingPdf}
          >
            {isExportingPdf ? 'Generating PDF...' : `Export PDF (${selectedCount} selected)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
