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
  return (
    <div className="mb-6">
      <div className="h-56 md:h-64 w-full -ml-2">
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
                border: '1px solid rgba(255,255,255,0.1)',
                boxShadow: isDarkMode ? '0 10px 40px -10px rgba(0,0,0,0.5)' : '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
                padding: '12px 16px',
                fontSize: '13px',
                fontWeight: '500',
                backgroundColor: isDarkMode ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.95)',
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
              isAnimationActive={false}
              connectNulls
            />
            <Line
              name={title}
              type="monotone"
              dataKey={subjectKey}
              stroke={lineColor}
              strokeWidth={3}
              activeDot={{ r: 6, strokeWidth: 0 }}
              isAnimationActive={false}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
