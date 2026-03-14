import React, { useId } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend
} from 'recharts';

const hexToRgb = (hex) => {
  const normalized = String(hex || '').replace('#', '').trim();
  if (normalized.length !== 6) return null;
  const value = Number.parseInt(normalized, 16);
  if (Number.isNaN(value)) return null;
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255
  };
};

const hexToRgba = (hex, alpha) => {
  const rgb = hexToRgb(hex);
  if (!rgb) return `rgba(14,165,233,${alpha})`;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
};

const softMix = (hex, fallback, amount = 0.5) => {
  const rgb = hexToRgb(hex);
  const base = hexToRgb(fallback);
  if (!rgb || !base) return hex || fallback;
  const mix = (a, b) => Math.round((a * (1 - amount)) + (b * amount));
  return `rgb(${mix(rgb.r, base.r)}, ${mix(rgb.g, base.g)}, ${mix(rgb.b, base.b)})`;
};

const renderActiveDot = (props, accentColor, isDarkMode) => {
  const { cx, cy } = props || {};
  if (!Number.isFinite(cx) || !Number.isFinite(cy)) return null;
  return (
    <g>
      <circle cx={cx} cy={cy} r={11} fill={hexToRgba(accentColor, isDarkMode ? 0.16 : 0.12)} />
      <circle cx={cx} cy={cy} r={6.5} fill={isDarkMode ? '#0f172a' : '#ffffff'} stroke={hexToRgba(accentColor, 0.28)} strokeWidth={2} />
      <circle cx={cx} cy={cy} r={4} fill={accentColor} />
    </g>
  );
};

const ChartTooltip = ({ active, payload, label, isDarkMode, accentColor }) => {
  if (!active || !Array.isArray(payload) || payload.length === 0) return null;
  const filteredPayload = payload.filter((entry) => entry && entry.name);

  return (
    <div className={`chart-liquid-tooltip ${isDarkMode ? 'chart-liquid-tooltip--dark' : ''}`}>
      <div className={`chart-liquid-tooltip__glow ${isDarkMode ? 'chart-liquid-tooltip__glow--dark' : ''}`} />
      <div className="relative z-[1]">
        <div className={`text-[10px] font-black uppercase tracking-[0.22em] ${isDarkMode ? 'text-emerald-100/80' : 'text-emerald-700/80'}`}>
          {label}
        </div>
        <div className="mt-2 space-y-1.5">
          {filteredPayload.map((entry) => (
            <div key={entry.dataKey || entry.name} className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="h-2.5 w-2.5 rounded-full shrink-0"
                  style={{
                    background: entry.name === '班平均' ? '#94a3b8' : accentColor,
                    boxShadow: `0 0 0 4px ${entry.name === '班平均' ? 'rgba(148,163,184,0.14)' : hexToRgba(accentColor, isDarkMode ? 0.14 : 0.12)}`
                  }}
                />
                <span className={`text-[11px] font-semibold truncate ${isDarkMode ? 'text-slate-200' : 'text-slate-700'}`}>{entry.name}</span>
              </div>
              <span className={`text-[11px] font-black tabular-nums ${entry.name === '班平均' ? (isDarkMode ? 'text-slate-100' : 'text-slate-800') : ''}`} style={entry.name === '班平均' ? undefined : { color: accentColor }}>
                {entry.value ?? '--'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const ChartLegend = ({ payload, isDarkMode, accentColor }) => {
  const items = Array.isArray(payload) ? payload.filter((entry) => entry?.value) : [];
  if (!items.length) return null;

  return (
    <div className="chart-liquid-legend">
      {items.map((entry, index) => {
        const isPrimary = entry.value !== '班平均';
        const dotColor = isPrimary ? accentColor : '#94a3b8';
        return (
          <div
            key={`${entry.value}-${index}`}
            className={`chart-liquid-legend__chip ${isDarkMode ? 'chart-liquid-legend__chip--dark' : ''}`}
          >
            <span
              className="chart-liquid-legend__dot"
              style={{
                background: dotColor,
                boxShadow: `0 0 0 4px ${isPrimary ? hexToRgba(accentColor, isDarkMode ? 0.16 : 0.12) : 'rgba(148,163,184,0.14)'}`
              }}
            />
            <span className={`text-[11px] font-semibold ${isDarkMode ? 'text-slate-200' : 'text-slate-700'}`}>{entry.value}</span>
          </div>
        );
      })}
    </div>
  );
};

export default function SingleSubjectChart({
  data,
  subjectKey,
  avgKey,
  lineColor,
  title,
  domain,
  isDarkMode
}) {
  const pointCount = Array.isArray(data) ? data.length : 0;
  const prefersReducedMotion = typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const shouldAnimate = !prefersReducedMotion && pointCount > 1 && pointCount <= 42;
  const shouldShowDots = pointCount > 1 && pointCount <= 18;
  const chartId = useId().replace(/:/g, '');
  const areaGradientId = `${chartId}-area`;
  const lineGradientId = `${chartId}-line`;
  const avgGradientId = `${chartId}-avg`;
  const glowFilterId = `${chartId}-glow`;
  const softAccent = softMix(lineColor, '#ecfeff', isDarkMode ? 0.1 : 0.62);

  return (
    <div className={`chart-stage-enter relative mb-6 rounded-2xl border px-3 pt-3 pb-2 backdrop-blur-sm overflow-hidden ${isDarkMode ? 'bg-slate-900/30 border-white/10' : 'bg-white/86 border-slate-200/85 shadow-[0_10px_24px_rgba(15,23,42,0.06)]'}`}>
      <div className={`pointer-events-none absolute inset-x-4 top-0 h-px ${isDarkMode ? 'bg-gradient-to-r from-transparent via-white/35 to-transparent' : 'bg-gradient-to-r from-transparent via-white to-transparent'}`} />
      <div className={`pointer-events-none absolute -top-10 right-8 h-24 w-32 rounded-full blur-3xl ${isDarkMode ? 'bg-emerald-300/10' : 'bg-sky-200/45'}`} />
      <div className="chart-stage-enter chart-stage-enter--delay flex items-center justify-between px-1 mb-1 relative z-[1]">
        <h4 className={`text-xs font-black tracking-[0.12em] uppercase ${isDarkMode ? 'text-slate-200' : 'text-slate-700'}`}>{title} 趨勢</h4>
        <span className={`text-[10px] font-bold ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>每次測驗：個人 vs 班平均</span>
      </div>
      <div className="chart-stage-enter chart-stage-enter--late h-56 md:h-64 w-full -ml-1 relative z-[1]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 20, right: 20, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id={lineGradientId} x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor={softAccent} />
                <stop offset="52%" stopColor={lineColor} />
                <stop offset="100%" stopColor={softMix(lineColor, '#0ea5e9', 0.18)} />
              </linearGradient>
              <linearGradient id={avgGradientId} x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor={isDarkMode ? '#cbd5e1' : '#94a3b8'} stopOpacity="0.68" />
                <stop offset="100%" stopColor={isDarkMode ? '#64748b' : '#cbd5e1'} stopOpacity="0.42" />
              </linearGradient>
              <linearGradient id={areaGradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={hexToRgba(lineColor, isDarkMode ? 0.22 : 0.2)} />
                <stop offset="55%" stopColor={hexToRgba(lineColor, isDarkMode ? 0.1 : 0.08)} />
                <stop offset="100%" stopColor={hexToRgba(lineColor, 0)} />
              </linearGradient>
              <filter id={glowFilterId} x="-20%" y="-30%" width="140%" height="170%">
                <feGaussianBlur stdDeviation="5.5" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <CartesianGrid stroke={isDarkMode ? '#334155' : '#94a3b8'} strokeOpacity={0.2} vertical={false} strokeDasharray="3 3" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: isDarkMode ? '#94a3b8' : '#475569', fontWeight: 500, fontFamily: 'system-ui' }}
              tickLine={false}
              axisLine={false}
              dy={10}
              interval="preserveStartEnd"
            />
            <YAxis
              domain={domain}
              tick={{ fontSize: 10, fill: isDarkMode ? '#94a3b8' : '#475569', fontWeight: 500, fontFamily: 'system-ui' }}
              tickLine={false}
              axisLine={false}
              width={28}
            />
            <Tooltip
              cursor={{ stroke: hexToRgba(lineColor, isDarkMode ? 0.28 : 0.24), strokeWidth: 1, strokeDasharray: '4 4' }}
              content={(props) => <ChartTooltip {...props} isDarkMode={isDarkMode} accentColor={lineColor} />}
            />
            <Legend
              verticalAlign="top"
              height={42}
              content={(props) => <ChartLegend {...props} isDarkMode={isDarkMode} accentColor={lineColor} />}
            />
            <Area
              type="monotone"
              dataKey={subjectKey}
              name=""
              stroke="none"
              fill={`url(#${areaGradientId})`}
              fillOpacity={1}
              legendType="none"
              isAnimationActive={shouldAnimate}
              animationBegin={40}
              animationDuration={660}
              animationEasing="ease-in-out"
              connectNulls
            />
            <Line
              name="班平均"
              type="monotone"
              dataKey={avgKey}
              stroke={`url(#${avgGradientId})`}
              strokeWidth={2}
              strokeDasharray="5 6"
              strokeLinecap="round"
              strokeLinejoin="round"
              dot={false}
              activeDot={{ r: 4, fill: '#94a3b8', stroke: 'none' }}
              isAnimationActive={shouldAnimate}
              animationBegin={140}
              animationDuration={620}
              animationEasing="ease-in-out"
              connectNulls
            />
            <Line
              type="monotone"
              dataKey={subjectKey}
              name=""
              stroke={hexToRgba(lineColor, isDarkMode ? 0.36 : 0.28)}
              strokeWidth={7}
              strokeLinecap="round"
              strokeLinejoin="round"
              filter={`url(#${glowFilterId})`}
              dot={false}
              activeDot={false}
              legendType="none"
              isAnimationActive={shouldAnimate}
              animationBegin={220}
              animationDuration={900}
              animationEasing="ease-in-out"
              connectNulls
            />
            <Line
              name={title}
              type="monotone"
              dataKey={subjectKey}
              stroke={`url(#${lineGradientId})`}
              strokeWidth={3.2}
              strokeLinecap="round"
              strokeLinejoin="round"
              dot={shouldShowDots ? { r: 3.5, fill: isDarkMode ? '#0f172a' : '#ffffff', stroke: lineColor, strokeWidth: 2 } : false}
              activeDot={(props) => renderActiveDot(props, lineColor, isDarkMode)}
              isAnimationActive={shouldAnimate}
              animationBegin={280}
              animationDuration={1040}
              animationEasing="ease-in-out"
              connectNulls
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
