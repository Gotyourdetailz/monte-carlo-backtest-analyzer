import React, { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, BarChart, Bar, Cell } from 'recharts';
import { SimulationResults } from '../types';

export const SpaghettiPlot = ({ results }: { results: SimulationResults | null }) => {
  const chartData = useMemo(() => {
    if (!results) return [];
    
    // Subsample 50 paths to avoid browser hanging
    const numPathsToPlot = Math.min(results.paths.length, 50);
    const step = Math.max(1, Math.floor(results.paths.length / numPathsToPlot));
    
    const sampledPaths = [];
    for(let i=0; i<results.paths.length; i+=step) {
        if(sampledPaths.length < 50) sampledPaths.push(results.paths[i]);
    }

    const dataLength = results.originalPath.length;
    const data = [];
    for (let t = 0; t < dataLength; t++) {
      const point: any = { trade: t, Original: results.originalPath[t] };
      for (let i = 0; i < sampledPaths.length; i++) {
        point[`Path_${i}`] = sampledPaths[i][t];
      }
      data.push(point);
    }
    return data;
  }, [results]);

  if (!results) return null;
  if (!chartData || chartData.length === 0) return null;

  const pathKeys = Object.keys(chartData[0]).filter(k => k.startsWith('Path_'));

  return (
    <div className="h-[400px] w-full mt-4">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
          <XAxis dataKey="trade" tick={{ fontSize: 12 }} tickFormatter={(v) => typeof v === 'number' && !isNaN(v) ? v.toString() : ''} />
          <YAxis tick={{ fontSize: 12 }} domain={['auto', 'auto']} tickFormatter={(v) => typeof v === 'number' && !isNaN(v) ? `$${v.toFixed(0)}` : ''} />
          <Tooltip 
            contentStyle={{backgroundColor: '#0d1117', color: '#c9d1d9', borderRadius: '8px', border: '1px solid #30363d'}} 
            labelStyle={{color: '#8b949e'}} 
            itemSorter={() => -1}
          />
          {pathKeys.map(key => (
            <Line key={key} type="monotone" dataKey={key} stroke="#58a6ff" strokeWidth={0.5} dot={false} isAnimationActive={false} opacity={0.15} />
          ))}
          <Line type="monotone" dataKey="Original" stroke="#f2cc60" strokeWidth={3} dot={false} isAnimationActive={false} strokeLinecap="round" strokeLinejoin="round" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

// Histograms using Recharts BarChart
export const Histogram = ({ data, color, referenceLine, formatter }: { data: number[], color: string, referenceLine?: number, formatter?: (val: number) => string }) => {
    const bins = useMemo(() => {
        if (!data || data.length === 0) return [];
        // Loop-based min/max to avoid stack overflow with large arrays
        let min = data[0], max = data[0];
        for (let i = 1; i < data.length; i++) {
          if (data[i] < min) min = data[i];
          if (data[i] > max) max = data[i];
        }
        const numBins = 30;
        const binSize = (max - min) / numBins;
        if(binSize === 0) return [{ binCenter: min, low: min, high: min, count: data.length }];

        const binsMap = new Array(numBins).fill(0);
        data.forEach(val => {
            const idx = Math.min(Math.floor((val - min) / binSize), numBins - 1);
            binsMap[idx]++;
        });

        return binsMap.map((count, i) => {
            const low = min + i * binSize;
            const high = low + binSize;
            return {
                binCenter: (low + high) / 2,
                low,
                high,
                count
            }
        });
    }, [data]);

    return (
    <div className="h-[250px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={bins} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.3} vertical={false} />
          <XAxis dataKey="binCenter" tick={{ fontSize: 11 }} tickFormatter={(val) => typeof val === 'number' && !isNaN(val) ? (formatter ? formatter(val) : val.toFixed(2)) : ''} />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={(val) => typeof val === 'number' && !isNaN(val) ? val.toString() : ''} />
          <Tooltip 
            formatter={(value: number) => {
              if (typeof value !== 'number' || isNaN(value)) return ['0', 'Frequency'];
              return [value, 'Frequency'];
            }}
            labelFormatter={(label: any) => typeof label === 'number' && !isNaN(label) ? (formatter ? formatter(label) : label.toFixed(2)) : '0'}
            contentStyle={{backgroundColor: '#0d1117', color: '#c9d1d9', borderRadius: '8px', border: '1px solid #30363d'}}
          />
          <Bar dataKey="count" fill={color} isAnimationActive={false}>
          {
            bins.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={color} />
            ))
          }
          </Bar>
          {referenceLine !== undefined && (
            <ReferenceLine x={referenceLine} stroke="#f2cc60" strokeWidth={1.5} strokeDasharray="3 3" />
          )}
        </BarChart>
      </ResponsiveContainer>
    </div>
    )
}
