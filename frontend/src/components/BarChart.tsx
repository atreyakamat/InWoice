import { useState } from 'react';

interface Series {
  key: string;
  label: string;
  color: string;
}

/**
 * Tiny dependency-free grouped bar chart (SVG). Replaces a charting library to
 * keep the bundle small for low-end devices.
 */
export function BarChart({
  data,
  series,
  format,
  height = 220,
}: {
  data: Record<string, number | string>[];
  series: Series[];
  format: (n: number) => string;
  height?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.flatMap((d) => series.map((s) => Number(d[s.key]) || 0)));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max);
  const W = 640;
  const padL = 56;
  const padB = 24;
  const chartH = height - padB - 8;
  const groupW = (W - padL) / Math.max(1, data.length);
  const barW = Math.min(18, (groupW - 8) / series.length);

  const label = (m: string) => {
    const [y, mo] = m.split('-');
    return new Date(Number(y), Number(mo) - 1, 1).toLocaleString('en', { month: 'short' });
  };

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-4 text-xs text-slate-600">
        {series.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} /> {s.label}
          </span>
        ))}
        {hover !== null && data[hover] && (
          <span className="ml-auto font-medium text-slate-800">
            {label(String(data[hover].month))}: {series.map((s) => `${s.label} ${format(Number(data[hover]![s.key]))}`).join(' · ')}
          </span>
        )}
      </div>
      <svg viewBox={`0 0 ${W} ${height}`} className="w-full" role="img" aria-label="Monthly chart">
        {ticks.map((t) => {
          const y = 8 + chartH - (t / max) * chartH;
          return (
            <g key={t}>
              <line x1={padL} x2={W} y1={y} y2={y} stroke="#e2e8f0" strokeWidth={1} />
              <text x={padL - 6} y={y + 3} textAnchor="end" fontSize={10} fill="#94a3b8">
                {format(t).replace(/\.00$/, '')}
              </text>
            </g>
          );
        })}
        {data.map((d, i) => {
          const x0 = padL + i * groupW + (groupW - barW * series.length) / 2;
          return (
            <g key={String(d.month)} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={padL + i * groupW} y={0} width={groupW} height={height} fill={hover === i ? '#f1f5f9' : 'transparent'} />
              {series.map((s, si) => {
                const v = Number(d[s.key]) || 0;
                const h = (v / max) * chartH;
                return <rect key={s.key} x={x0 + si * barW} y={8 + chartH - h} width={barW - 2} height={Math.max(h, v > 0 ? 1 : 0)} rx={2} fill={s.color} />;
              })}
              <text x={padL + i * groupW + groupW / 2} y={height - 6} textAnchor="middle" fontSize={10} fill="#64748b">
                {label(String(d.month))}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
