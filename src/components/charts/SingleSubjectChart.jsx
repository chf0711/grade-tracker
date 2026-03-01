import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from 'recharts';

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
  // 兼顧效能：資料點過多或使用者偏好減少動態時，自動停用動畫
  const shouldAnimate = !prefersReducedMotion && pointCount > 1 && pointCount <= 42;

  return (
    <div className={`mb-6 rounded-2xl border px-3 pt-3 pb-2 backdrop-blur-sm ${isDarkMode ? 'bg-slate-900/30 border-white/10' : 'bg-white/86 border-slate-200/85 shadow-[0_10px_24px_rgba(15,23,42,0.06)]'}`}>
      <div className="flex items-center justify-between px-1 mb-1">
        <h4 className={`text-xs font-black tracking-[0.12em] uppercase ${isDarkMode ? 'text-slate-200' : 'text-slate-700'}`}>{title} 趨勢</h4>
        <span className={`text-[10px] font-bold ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>每次測驗：個人 vs 班平均</span>
      </div>
      <div className="h-56 md:h-64 w-full -ml-1">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 20, right: 20, bottom: 0, left: 0 }}>
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
              contentStyle={{
                borderRadius: '16px',
                border: isDarkMode ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(148,163,184,0.25)',
                boxShadow: isDarkMode ? '0 10px 40px -10px rgba(0,0,0,0.5)' : '0 18px 35px -8px rgba(15, 23, 42, 0.18)',
                padding: '12px 16px',
                fontSize: '13px',
                fontWeight: '600',
                backgroundColor: isDarkMode ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.98)',
                color: isDarkMode ? '#f8fafc' : '#1e293b'
              }}
            />
            <Legend
              verticalAlign="top"
              height={36}
              iconType="circle"
              wrapperStyle={{ fontSize: '12px', fontWeight: 500, color: isDarkMode ? '#94a3b8' : '#475569' }}
            />
            <Line
              name="班平均"
              type="monotone"
              dataKey={avgKey}
              stroke="#94a3b8"
              strokeWidth={2}
              strokeOpacity={0.6}
              dot={false}
              activeDot={{ r: 4, fill: '#94a3b8', stroke: 'none' }}
              isAnimationActive={shouldAnimate}
              animationDuration={520}
              animationEasing="ease-out"
              connectNulls
            />
            <Line
              name={title}
              type="monotone"
              dataKey={subjectKey}
              stroke={lineColor}
              strokeWidth={3}
              activeDot={{ r: 6, strokeWidth: 0 }}
              isAnimationActive={shouldAnimate}
              animationBegin={70}
              animationDuration={760}
              animationEasing="ease-out"
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
