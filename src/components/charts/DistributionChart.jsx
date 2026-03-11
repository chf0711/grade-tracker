import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell
} from 'recharts';

export default function DistributionChart({ data, highlightColor, isDarkMode }) {
  const safeData = Array.isArray(data) ? data : [];
  const maxCount = safeData.reduce((max, bucket) => Math.max(max, bucket.count || 0), 0);
  const prefersReducedMotion = typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const shouldAnimate = !prefersReducedMotion && safeData.length > 0 && safeData.length <= 42;

  return (
    <div className={`h-72 md:h-80 w-full rounded-2xl border px-2 py-3 backdrop-blur-sm ${isDarkMode ? 'bg-slate-900/30 border-white/5' : 'bg-white/86 border-slate-200/85 shadow-[0_10px_24px_rgba(15,23,42,0.06)]'}`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={safeData} margin={{ top: 6, right: 6, bottom: 38, left: -18 }}>
          <CartesianGrid stroke={isDarkMode ? '#334155' : '#94a3b8'} strokeOpacity={0.18} vertical={false} strokeDasharray="3 3" />
          <XAxis
            dataKey="range"
            tick={{ fontSize: 10, fill: isDarkMode ? '#94a3b8' : '#475569', fontWeight: 700 }}
            tickLine={false}
            axisLine={false}
            interval={0}
            angle={-45}
            textAnchor="end"
            dy={10}
          />
          <YAxis tick={{ fontSize: 10, fill: isDarkMode ? '#94a3b8' : '#475569' }} tickLine={false} axisLine={false} allowDecimals={false} />
          <Tooltip
            cursor={{ fill: isDarkMode ? '#334155' : '#cbd5e1', opacity: 0.28 }}
            contentStyle={{
              borderRadius: '14px',
              border: isDarkMode ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(148,163,184,0.25)',
              backgroundColor: isDarkMode ? 'rgba(15,23,42,0.95)' : 'rgba(255,255,255,0.96)',
              color: isDarkMode ? '#f8fafc' : '#0f172a',
              fontSize: '12px',
              fontWeight: 700,
              boxShadow: isDarkMode ? '0 14px 32px rgba(2,6,23,0.45)' : '0 18px 36px rgba(15,23,42,0.15)'
            }}
          />
          <Bar
            dataKey="count"
            name="人數"
            radius={[7, 7, 3, 3]}
            isAnimationActive={shouldAnimate}
            animationDuration={440}
            animationEasing="ease-out"
          >
            {safeData.map((entry, index) => {
              if (entry.isMyRange) {
                return <Cell key={`cell-${index}`} fill={highlightColor} fillOpacity={0.95} />;
              }
              const opacity = maxCount > 0 ? 0.25 + ((entry.count || 0) / maxCount) * 0.45 : 0.25;
              return <Cell key={`cell-${index}`} fill={isDarkMode ? '#64748b' : '#94a3b8'} fillOpacity={opacity} />;
            })}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
