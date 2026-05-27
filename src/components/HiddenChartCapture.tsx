import React from 'react';
import { SimulationResults } from '../types';
import { SpaghettiPlot, Histogram } from './Plots';

interface HiddenChartCaptureProps {
  resultsHistory: Record<string, SimulationResults>;
}

export function HiddenChartCapture({ resultsHistory }: HiddenChartCaptureProps) {
  const models = Object.keys(resultsHistory);

  if (models.length === 0) return null;

  return (
    <div className="absolute left-[-9999px] top-[-9999px] opacity-0 pointer-events-none">
      {models.map(modelKey => {
        const results = resultsHistory[modelKey];
        if (!results) return null;

        return (
          <div key={`capture-${modelKey}`} id={`capture-${modelKey}`} className="p-8 bg-[#0a0e17] w-[800px] flex flex-col gap-8">
            <div id={`capture-${modelKey}-spaghetti`} className="w-[800px] h-[400px] bg-[#0d1117] border border-[#30363d] p-4">
              <SpaghettiPlot results={results} />
            </div>
            
            <div className="flex gap-4 w-[800px]">
              <div id={`capture-${modelKey}-dist-balance`} className="w-[390px] h-[300px] bg-[#0d1117] border border-[#30363d] p-4">
                <Histogram 
                  data={results.finalBalances} 
                  color="#238636" 
                  formatter={(val) => `$${val.toFixed(0)}`}
                  referenceLine={results.originalPath[results.originalPath.length-1]}
                />
              </div>
              <div id={`capture-${modelKey}-dist-dd`} className="w-[390px] h-[300px] bg-[#0d1117] border border-[#30363d] p-4">
                <Histogram 
                  data={results.maxDrawdowns} 
                  color="#f85149" 
                  formatter={(val) => `${(val * 100).toFixed(1)}%`}
                  referenceLine={results.originalMaxDrawdown}
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
