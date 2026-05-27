import React, { useState } from 'react';
import { X, FileText, CheckCircle2 } from 'lucide-react';
import { SimulationResults } from '../types';

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

  if (!isOpen) return null;

  const handleToggle = (id: string) => {
    if (!resultsHistory[id]) return;
    setSelected(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const selectedCount = Object.values(selected).filter(Boolean).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#0d1117] border border-[#30363d] rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden glass-card animate-scale-in">
        <div className="flex justify-between items-center px-6 py-4 border-b border-[#30363d]">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <FileText className="w-5 h-5 text-[#58a6ff]" />
            Export Institutional Tear Sheet
          </h3>
          <button onClick={onClose} className="text-[#8b949e] hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-6">
          <p className="text-sm text-[#8b949e] mb-4">
            Select the backtest models to include in your PDF report. Models you haven't run yet are disabled.
          </p>

          <div className="space-y-3 mb-6">
            {models.map(m => {
              const isAvailable = !!resultsHistory[m.id];
              const isSelected = selected[m.id];
              
              return (
                <label 
                  key={m.id}
                  className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                    !isAvailable 
                      ? 'border-[#30363d]/50 bg-[#30363d]/20 opacity-50 cursor-not-allowed'
                      : isSelected
                        ? 'border-[#58a6ff] bg-[#58a6ff]/10 cursor-pointer shadow-[0_0_15px_rgba(88,166,255,0.1)]'
                        : 'border-[#30363d] bg-[#161b22] cursor-pointer hover:border-[#8b949e]'
                  }`}
                >
                  <input 
                    type="checkbox" 
                    className="hidden"
                    checked={isSelected}
                    onChange={() => handleToggle(m.id)}
                    disabled={!isAvailable}
                  />
                  <div className={`w-5 h-5 rounded flex items-center justify-center shrink-0 border transition-colors ${
                    isSelected ? 'bg-[#58a6ff] border-[#58a6ff]' : 'border-[#8b949e] bg-transparent'
                  }`}>
                    {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-[#0d1117]" />}
                  </div>
                  <span className={`font-medium ${!isAvailable ? 'text-[#8b949e]' : 'text-white'}`}>
                    {m.label}
                  </span>
                  {!isAvailable && (
                    <span className="ml-auto text-xs text-[#8b949e]">Not run yet</span>
                  )}
                </label>
              );
            })}
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-[#30363d]">
            <button 
              onClick={onClose}
              className="px-4 py-2 text-sm font-semibold text-white bg-[#21262d] hover:bg-[#30363d] rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button 
              onClick={() => {
                const keys = Object.keys(selected).filter(k => selected[k]);
                onExport(keys);
              }}
              disabled={selectedCount === 0 || isExportingPdf}
              className="px-4 py-2 text-sm font-semibold text-white bg-[#238636] hover:bg-[#2ea043] rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isExportingPdf ? 'Generating PDF...' : `Export PDF (${selectedCount} selected)`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
