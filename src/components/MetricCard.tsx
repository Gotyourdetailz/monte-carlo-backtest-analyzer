import { cn } from '../lib/utils';

export function MetricCard({ title, value, subtitle, highlight, suffix }: { title: string, value: string, subtitle: string, highlight: string, suffix?: string }) {
  const accentBorder =
    highlight === 'red' ? 'accent-left-red' :
    highlight === 'green' ? 'accent-left-green' :
    'accent-left-blue';

  const valueColor =
    highlight === 'red' ? 'text-[var(--accent-red)]' :
    highlight === 'green' ? 'text-[var(--accent-green)]' :
    'text-[var(--text-primary)]';

  return (
    <div className={cn('glass-card-hover animate-fade-in-up p-4 flex flex-col justify-between cursor-default', accentBorder)}>
      <div className="text-[10px] font-bold text-[var(--text-secondary)] uppercase mb-1 tracking-widest">{title}</div>
      <div className={cn('text-3xl font-light py-1 metric-value animate-count-up', valueColor)}>
        {value}
        {suffix && <span className="text-[var(--text-secondary)] text-lg font-normal">{suffix}</span>}
      </div>
      <div className={cn('text-[10px] mt-1', highlight === 'red' ? 'text-[var(--accent-red)]' : 'text-[var(--text-secondary)]')}>
        {subtitle}
      </div>
    </div>
  );
}
