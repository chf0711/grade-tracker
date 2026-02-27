import React from 'react';
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Tooltip,
  ResponsiveContainer
} from 'recharts';

const f1 = (v) => {
  if (v === '' || v === undefined || v === null) return '';
  const num = parseFloat(v);
  return Number.isNaN(num) ? '' : num.toFixed(1);
};

export default function ParentAbilityRadar({
  data,
  maxValue,
  isDarkMode,
  recordCount = 0,
  phaseName = ''
}) {
  if (!data || !data.length) return null;

  const wrapperClass = `mt-3 mb-7 rounded-3xl border px-4 pt-4 pb-3 ${isDarkMode ? 'bg-[#0f1914]/75 border-emerald-200/18' : 'bg-white/92 border-slate-200/80'}`;
  const subjectRows = data.map((item) => {
    const delta = Number((item.student - item.classAvg).toFixed(1));
    const relativePct = item.classAvg > 0 ? Number(((delta / item.classAvg) * 100).toFixed(1)) : 0;
    const trendLabel = delta >= 5 ? '明顯領先' : delta >= 1 ? '略優' : delta > -1 ? '持平' : delta > -5 ? '待補強' : '需追蹤';
    return {
      ...item,
      delta,
      deltaLabel: delta > 0 ? `+${delta}` : `${delta}`,
      relativePct,
      relativePctLabel: relativePct > 0 ? `+${relativePct}%` : `${relativePct}%`,
      trendLabel
    };
  });
  const avgDelta = subjectRows.length
    ? Number((subjectRows.reduce((sum, row) => sum + row.delta, 0) / subjectRows.length).toFixed(1))
    : 0;
  const leadingCount = subjectRows.filter((row) => row.delta > 0).length;
  const trailingCount = subjectRows.filter((row) => row.delta < 0).length;

  return (
    <div className={wrapperClass}>
      <div className="flex items-center justify-between mb-3 px-1">
        <div>
          <h4 className={`text-sm font-black tracking-wide ${isDarkMode ? 'text-emerald-100' : 'text-slate-800'}`}>三科能力雷達圖</h4>
          <p className={`text-[11px] font-semibold mt-0.5 ${isDarkMode ? 'text-emerald-200/75' : 'text-slate-500'}`}>{phaseName || '目前階段'} | 樣本 {recordCount} 次</p>
        </div>
        <div className={`flex items-center gap-3 text-[10px] font-bold ${isDarkMode ? 'text-emerald-200/80' : 'text-slate-500'}`}>
          <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" />個人</span>
          <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-slate-400" />班平均</span>
        </div>
      </div>
      <div className="h-72 lg:h-[24rem] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={data} outerRadius="88%">
            <PolarGrid stroke={isDarkMode ? 'rgba(167,243,208,0.24)' : 'rgba(148,163,184,0.28)'} />
            <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11, fontWeight: 800, fill: isDarkMode ? '#d1fae5' : '#334155' }} />
            <PolarRadiusAxis
              angle={25}
              domain={[0, maxValue]}
              tickCount={6}
              tick={{ fontSize: 10, fill: isDarkMode ? '#86efac' : '#64748b' }}
              axisLine={false}
            />
            <Tooltip
              contentStyle={{
                borderRadius: '14px',
                border: isDarkMode ? '1px solid rgba(110,231,183,0.24)' : '1px solid rgba(148,163,184,0.22)',
                backgroundColor: isDarkMode ? 'rgba(7,20,15,0.95)' : 'rgba(255,255,255,0.96)',
                color: isDarkMode ? '#ecfdf5' : '#0f172a',
                fontSize: '12px',
                fontWeight: 600
              }}
            />
            <Radar name="個人平均" dataKey="student" stroke="#22c55e" fill="#22c55e" fillOpacity={isDarkMode ? 0.36 : 0.22} strokeWidth={2.2} isAnimationActive={false} />
            <Radar name="班平均" dataKey="classAvg" stroke="#94a3b8" fill="#94a3b8" fillOpacity={isDarkMode ? 0.2 : 0.1} strokeWidth={2} isAnimationActive={false} />
          </RadarChart>
        </ResponsiveContainer>
      </div>
      <div className="grid grid-cols-3 gap-2 mt-1 mb-2">
        <div className={`rounded-xl border px-2.5 py-2 ${isDarkMode ? 'bg-white/5 border-white/10' : 'bg-slate-50 border-slate-200/70'}`}>
          <div className={`text-[10px] font-bold tracking-wide ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>平均差值</div>
          <div className={`text-sm font-black ${avgDelta >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>{avgDelta > 0 ? `+${avgDelta}` : avgDelta}</div>
        </div>
        <div className={`rounded-xl border px-2.5 py-2 ${isDarkMode ? 'bg-white/5 border-white/10' : 'bg-slate-50 border-slate-200/70'}`}>
          <div className={`text-[10px] font-bold tracking-wide ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>優勢科目</div>
          <div className={`text-sm font-black ${isDarkMode ? 'text-emerald-200' : 'text-emerald-700'}`}>{leadingCount} / 3</div>
        </div>
        <div className={`rounded-xl border px-2.5 py-2 ${isDarkMode ? 'bg-white/5 border-white/10' : 'bg-slate-50 border-slate-200/70'}`}>
          <div className={`text-[10px] font-bold tracking-wide ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>待補強</div>
          <div className={`text-sm font-black ${trailingCount > 0 ? 'text-amber-500' : (isDarkMode ? 'text-slate-200' : 'text-slate-700')}`}>{trailingCount} / 3</div>
        </div>
      </div>
      <div className={`mt-2 rounded-2xl border overflow-hidden ${isDarkMode ? 'border-white/10' : 'border-slate-200/70'}`}>
        <div className={`grid grid-cols-[1fr_auto_auto_auto_auto] text-[10px] font-bold px-3 py-2 ${isDarkMode ? 'bg-white/5 text-slate-300' : 'bg-slate-50 text-slate-500'}`}>
          <span>科目</span>
          <span>個人</span>
          <span>班均</span>
          <span>差值</span>
          <span>判讀</span>
        </div>
        <div className={isDarkMode ? 'bg-[#0b1510]' : 'bg-white'}>
          {subjectRows.map((row) => (
            <div key={row.subject} className={`grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-2 px-3 py-2.5 text-xs border-t ${isDarkMode ? 'border-white/5' : 'border-slate-100'}`}>
              <span className={`font-bold ${isDarkMode ? 'text-slate-100' : 'text-slate-700'}`}>{row.subject}</span>
              <span className={`font-semibold ${isDarkMode ? 'text-emerald-200' : 'text-emerald-700'}`}>{f1(row.student)}</span>
              <span className={`font-semibold ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>{f1(row.classAvg)}</span>
              <span className={`font-black ${row.delta >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>{row.deltaLabel} ({row.relativePctLabel})</span>
              <span className={`text-[10px] font-bold rounded-full px-2 py-1 text-center ${row.delta >= 0 ? (isDarkMode ? 'bg-emerald-500/15 text-emerald-200' : 'bg-emerald-50 text-emerald-700') : (isDarkMode ? 'bg-amber-500/15 text-amber-200' : 'bg-amber-50 text-amber-700')}`}>{row.trendLabel}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
