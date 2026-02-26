import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis } from 'recharts';
import { Search, Save, Plus, Check, BarChart3, X, Lock, LayoutDashboard, GraduationCap, Calendar, Clipboard, LogOut, AlertTriangle, UserPlus, Sparkles, Edit3, Trash2, Trophy, Target, FileSpreadsheet, Moon, Sun, ChevronRight, ArrowLeft, PieChart, Users, BarChart2, ShieldCheck, ArrowDownWideNarrow, Percent, Info } from 'lucide-react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, getDoc, getDocs, deleteDoc } from 'firebase/firestore';

// --- Global Constants ---
const DEFAULT_EXAM_STARTS = [
  "04/12", "04/19", "04/26", "05/03", "05/10", "05/17", "05/24", "06/07", "06/14",
  "06/21", "06/28", "06/29", "07/12", "07/19", "07/21", "07/26", "08/02", "08/09", 
  "08/16", "08/30", "09/06", "09/13", "09/20", "09/27", "09/29", "10/04", 
  "10/11", "10/18", "10/25", "11/01", "11/08", "11/15", "11/29", "12/06", "12/13", "12/20",
  "12/27", "01/03", "01/10", "01/17", "01/24", "01/31", "02/02", "02/07", "02/13", "02/28"
];

const CLASS_DEFS = [
    { id: 'A班', label: 'A' },
    { id: 'B班', label: 'B' },
    { id: 'C班', label: 'C' },
    { id: '日A班', label: '日A' },
    { id: '日B班', label: '日B' }
];

const RAW_STUDENT_RECORDS = [];
const ENCODED_PASSWORDS = ['QmVuMTEwNzA1', 'MjQ5MTIxMg=='];
const SECURITY_CODE = '1107';

const realFirebaseConfig = {
  apiKey: "AIzaSyChK1IiE6YhHZ_DdxXzpxi8vmBA9A9So9A",
  authDomain: "grade-tracker-9ccb3.firebaseapp.com",
  projectId: "grade-tracker-9ccb3",
  storageBucket: "grade-tracker-9ccb3.firebasestorage.app",
  messagingSenderId: "55920171494",
  appId: "1:55920171494:web:0529f931aaefd930f11e27"
};

let app, auth, db, appId = 'grade-tracker-v1';

try {
  if (typeof __firebase_config !== 'undefined') {
    const config = JSON.parse(__firebase_config);
    if (!getApps().length) app = initializeApp(config);
    else app = getApp();
    if (typeof __app_id !== 'undefined') appId = __app_id;
  } 
  else if (realFirebaseConfig.apiKey !== "REPLACE_WITH_YOUR_API_KEY") {
    if (!getApps().length) app = initializeApp(realFirebaseConfig);
    else app = getApp();
  }
  if (app) { auth = getAuth(app); db = getFirestore(app); }
} catch (e) { console.error("Firebase init error:", e); }

// --- Helpers ---
const customDateSort = (a, b) => {
    try {
        if (!a || !b) return 0;
        const cleanA = String(a).replace(/[^0-9/]/g, '');
        const cleanB = String(b).replace(/[^0-9/]/g, '');
        if (!cleanA.includes('/') || !cleanB.includes('/')) return 0;
        const [m1, d1] = cleanA.split('/').map(Number);
        const [m2, d2] = cleanB.split('/').map(Number);
        if (isNaN(m1) || isNaN(d1) || isNaN(m2) || isNaN(d2)) return 0;
        const m1Adj = m1 < 4 ? m1 + 12 : m1;
        const m2Adj = m2 < 4 ? m2 + 12 : m2;
        if (m1Adj !== m2Adj) return m1Adj - m2Adj;
        return d1 - d2;
    } catch (e) { return 0; }
};

// 將日期字串轉換為 Date 物件（處理跨年）
const parseDateStr = (dateStr) => {
    if (!dateStr || !dateStr.includes('/')) return null;
    try {
        const [mStr, dStr] = dateStr.split('/');
        const m = parseInt(mStr, 10);
        const d = parseInt(dStr, 10);
        const y = m >= 4 ? 2025 : 2026;
        return new Date(y, m - 1, d);
    } catch (e) { return null; }
};

// 將 Date 物件轉換為日期字串
const formatDateStr = (dateObj) => {
    if (!dateObj) return '';
    return `${String(dateObj.getMonth() + 1).padStart(2, '0')}/${String(dateObj.getDate()).padStart(2, '0')}`;
};

// 檢查兩個日期是否連續（相差一天）
const isConsecutiveDate = (date1, date2) => {
    if (!date1 || !date2) return false;
    const diff = Math.abs((date1.getTime() - date2.getTime()) / (1000 * 60 * 60 * 24));
    return diff === 1;
};

// 取得測驗日期 ID：如果日期與 availableDates 中某個日期連續，則返回較早的日期作為統一 ID
// 如果沒有提供 availableDates，則使用舊的週末邏輯（向後兼容）
const getWeekendID = (dateStr, availableDates = null) => {
    if (!dateStr || !dateStr.includes('/')) return dateStr;
    
    try {
        const currentDate = parseDateStr(dateStr);
        if (!currentDate) return dateStr;
        
        // 如果提供了 availableDates，檢查是否有連續日期
        if (availableDates && Array.isArray(availableDates)) {
            let earliestDate = currentDate;
            let foundConsecutive = false;
            
            // 檢查 availableDates 中是否有與當前日期連續的日期
            for (const availableDateStr of availableDates) {
                const availableDate = parseDateStr(availableDateStr);
                if (!availableDate) continue;
                
                if (isConsecutiveDate(currentDate, availableDate)) {
                    foundConsecutive = true;
                    // 取較早的日期作為統一 ID
                    if (availableDate < earliestDate) {
                        earliestDate = availableDate;
                    }
                }
            }
            
            if (foundConsecutive) {
                return formatDateStr(earliestDate);
            }
        }
        
        // 如果沒有找到連續日期，使用舊的週末邏輯（向後兼容）
        const dayOfWeek = currentDate.getDay();
        if (dayOfWeek === 0) { 
            const satDate = new Date(currentDate);
            satDate.setDate(currentDate.getDate() - 1);
            return formatDateStr(satDate);
        }
        
        return dateStr;
    } catch (e) { return dateStr; }
};

const getSundayDate = (satDateStr) => {
    try {
        const [mStr, dStr] = satDateStr.split('/');
        const m = parseInt(mStr, 10);
        const d = parseInt(dStr, 10);
        const y = m >= 4 ? 2025 : 2026;
        const dateObj = new Date(y, m - 1, d);
        dateObj.setDate(dateObj.getDate() + 1); 
        return `${String(dateObj.getMonth() + 1).padStart(2, '0')}/${String(dateObj.getDate()).padStart(2, '0')}`;
    } catch(e) { return satDateStr; }
}

const getWeekendDisplayLabel = (dateStr) => {
    const satID = getWeekendID(dateStr); 
    if (!satID || !satID.includes('/')) return dateStr;
    try {
        const [mStr, dStr] = satID.split('/');
        const m = parseInt(mStr, 10);
        const d = parseInt(dStr, 10);
        const y = m >= 4 ? 2025 : 2026;
        const dateObj = new Date(y, m - 1, d);
        const sunDate = new Date(dateObj);
        sunDate.setDate(dateObj.getDate() + 1);
        const sunD = String(sunDate.getDate()).padStart(2, '0');
        return `${String(m).padStart(2,'0')}/${String(d).padStart(2,'0')}-${sunD}`;
    } catch (e) { return dateStr; }
};

const PHASES = [
    { id: 'p1', name: '第一階段', range: [0, 17] },
    { id: 'p2', name: '第二階段', range: [17, 35] },
    { id: 'mock', name: '模考班', range: [35, 100] } 
];

const COLORS = {
    total: { hex: '#0A84FF', tailwind: 'blue', label: '總分' },
    chi:   { hex: '#FF375F', tailwind: 'rose',      label: '國文' }, 
    eng:   { hex: '#FF9F0A', tailwind: 'amber',    label: '英文' }, 
    math:  { hex: '#64D2FF', tailwind: 'cyan',      label: '數學' }, 
    avg:   { hex: '#94a3b8', tailwind: 'slate',     label: '班平均' } 
};
const TAB_DOT_BG_CLASS = {
    total: 'bg-blue-500',
    chi: 'bg-rose-500',
    eng: 'bg-amber-500',
    math: 'bg-cyan-500'
};
const EMPTY_GRADE = { chi: '', eng: '', math: '', total: '', class: 'A班' };

const hasAnySubjectScore = (gradeObj) => {
    if (!gradeObj) return false;
    return (gradeObj.chi !== '' && gradeObj.chi !== undefined) ||
           (gradeObj.eng !== '' && gradeObj.eng !== undefined) ||
           (gradeObj.math !== '' && gradeObj.math !== undefined);
};

const f1 = (v) => {
    if (v === '' || v === undefined || v === null) return '';
    const num = parseFloat(v);
    return isNaN(num) ? '' : num.toFixed(1);
};

const isMockDate = (date, allDates) => {
    if (!date) return false;
    const sorted = [...allDates].sort(customDateSort);
    const idx = sorted.indexOf(date);
    return idx >= 36 || date.includes('12/20') || date.includes('09/29');
};

const getMaxScore = (date, subject, allDates) => {
    if (subject === 'total') return 300;
    if (subject === 'chi') return 100;
    const isMock = isMockDate(date, allDates);
    if (isMock) {
        if (subject === 'math') return 120;
        if (subject === 'eng') return 80;
    }
    return 100;
};

const calculateTotal = (chi, eng, math) => {
    const c = parseFloat(chi) || 0; const e = parseFloat(eng) || 0; const m = parseFloat(math) || 0;
    if (chi === '' && eng === '' && math === '') return '';
    return (c + e + m).toFixed(1);
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const getProbabilityVisual = (probValue, isDarkMode) => {
    const parsed = Number(probValue);
    if (!Number.isFinite(parsed)) return null;

    const prob = clamp(parsed, 1, 99);
    const hue = Math.round((prob / 100) * 120); // 0:red -> 120:green
    const saturation = isDarkMode ? 90 : 84;
    const textLightness = isDarkMode ? 68 : 40;
    const badgeLightness = isDarkMode ? 54 : 46;

    return {
        textStyle: { color: `hsl(${hue} ${saturation}% ${textLightness}%)` },
        badgeStyle: {
            color: `hsl(${hue} ${saturation}% ${isDarkMode ? 72 : 36}%)`,
            backgroundColor: `hsla(${hue}, ${saturation}%, ${badgeLightness}%, ${isDarkMode ? 0.2 : 0.12})`,
            border: `1px solid hsla(${hue}, ${saturation}%, ${isDarkMode ? 66 : 40}%, ${isDarkMode ? 0.45 : 0.24})`
        }
    };
};

const buildDistributionTemplate = (maxScore) => {
    const thresholds = [];
    if (maxScore === 300) {
        for (let i = 290; i >= 150; i -= 10) thresholds.push(i);
    } else {
        const floor = maxScore === 80 ? 40 : 60;
        const start = maxScore - 10;
        for (let i = start; i >= floor; i -= 10) thresholds.push(i);
    }

    const buckets = thresholds.map((min, i) => {
        let label = `${min}-${min + 9}`;
        let max = min + 9;
        if (i === 0) {
            label = `${min}-${maxScore}`;
            max = maxScore;
        }
        return { min, max, label };
    });

    const bottomThreshold = thresholds[thresholds.length - 1] || 0;
    buckets.push({ min: 0, max: bottomThreshold - 1, label: `<${bottomThreshold}` });

    return { buckets };
};

const resolveDistributionBucketIndex = (value, template) => {
    if (!Number.isFinite(value)) return -1;
    return template.buckets.findIndex((bucket) => value >= bucket.min && value <= bucket.max);
};

// --- Helper Logic for Probability ---
const calculateProbLogic = (targetStudent, scoresByDate, mathScoresByDate, studentGradeMaps, availableDates) => {
    let weightedPRSum = 0;
    let totalWeight = 0;
    let mathPRSum = 0;
    let mathWeight = 0;
    
    const myGrades = studentGradeMaps[targetStudent.id] || {};

    availableDates.forEach((date, index) => {
         const weekendID = getWeekendID(date, availableDates);
         const grade = myGrades[weekendID];
         let myTotal = null;
         let myMath = null;
         let myClass = 'A班';

         if (grade) {
             myTotal = parseFloat(grade.total);
             myMath = parseFloat(grade.math);
             myClass = grade.class || 'A班';
         }
         
         // Total PR Logic
         if (myTotal !== null && !isNaN(myTotal) && scoresByDate[weekendID] && scoresByDate[weekendID].length >= 5) {
             const scores = scoresByDate[weekendID];
             const rank = scores.indexOf(myTotal) + 1;
             let pr = Math.floor(((scores.length - rank) / scores.length) * 100);
             
             // --- Updated Logic: Define Weight and Baseline per phase ---
             const isMock = index >= 36 || date.includes('09/29') || weekendID.includes('09/29') || date.includes('12/20') || weekendID.includes('12/20'); 
             const weight = isMock ? 2.5 : 1; 
             const baseline = isMock ? 52 : 56; // Mock baseline 52, Phase 1/2 baseline 56

             // --- CLASS A PROTECTION LOGIC (Phase 1 & 2 < 100 samples) ---
             const isPhase1Or2 = index < 36;
             const isSmallSample = scores.length < 100;
             
             if (isPhase1Or2 && isSmallSample && myClass === 'A班') {
                 const count = scores.length;
                 // If bottom 3 -> PR 48
                 if (rank > count - 3) {
                     pr = 48;
                 } else {
                     // Others: Linear Interpolation from 99 down to 60
                     if (count - 3 > 1) {
                         const maxSafePR = 99;
                         const minSafePR = 60;
                         const ratio = (rank - 1) / (count - 3 - 1);
                         pr = maxSafePR - ratio * (maxSafePR - minSafePR);
                     } else {
                         pr = 99;
                     }
                 }
             }
             // ---------------------------------------------
             
             // Normalize PR to unified baseline of 52 for averaging
             const diff = pr - baseline; 
             const normalizedPR = 52 + diff;

             weightedPRSum += normalizedPR * weight;
             totalWeight += weight;
         }

         // Math Bonus
         if (myMath !== null && !isNaN(myMath) && mathScoresByDate[weekendID] && mathScoresByDate[weekendID].length >= 5) {
             const scores = mathScoresByDate[weekendID];
             const rank = scores.indexOf(myMath) + 1;
             const pr = Math.floor(((scores.length - rank) / scores.length) * 100);
             mathPRSum += pr;
             mathWeight++;
         }
    });

    if (totalWeight === 0) return '-';

    const avgPR = weightedPRSum / totalWeight;
    const avgMathPR = mathWeight > 0 ? mathPRSum / mathWeight : 0;
    
    // --- Probability Mapping (Unified Baseline: 52) ---
    let prob = 0;
    if (avgPR < 52) {
        // Curve below 52
        prob = Math.pow(avgPR / 52, 1.5) * 50;
    } else {
        // Linear above 52
        prob = 50 + ((avgPR - 52) / 48) * 49;
    }
    
    if (avgMathPR > 80) prob += 4;
    else if (avgMathPR > 60) prob += 2;
    
    return Math.min(99, Math.max(1, prob.toFixed(0)));
};

// --- Components ---
const SingleSubjectChart = ({ data, subjectKey, avgKey, colorKey, title, domain, isDarkMode }) => (
    <div className="mb-6">
        <div className="h-56 md:h-64 w-full -ml-2">
          <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 20, right: 20, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke={isDarkMode ? "#334155" : "#94a3b8"} strokeOpacity={0.2} vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{fontSize: 10, fill: isDarkMode ? '#94a3b8' : '#475569', fontWeight: 500, fontFamily: 'system-ui'}} tickLine={false} axisLine={false} dy={10} interval="preserveStartEnd" />
                  <YAxis domain={domain} tick={{fontSize: 10, fill: isDarkMode ? '#94a3b8' : '#475569', fontWeight: 500, fontFamily: 'system-ui'}} tickLine={false} axisLine={false} width={28} />
                  <Tooltip 
                      contentStyle={{ 
                          borderRadius: '16px', border: '1px solid rgba(255,255,255,0.1)', 
                          boxShadow: isDarkMode ? '0 10px 40px -10px rgba(0,0,0,0.5)' : '0 20px 25px -5px rgba(0, 0, 0, 0.1)', 
                          padding: '12px 16px', fontSize: '13px', fontWeight: '500',
                          backgroundColor: isDarkMode ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.95)',
                          color: isDarkMode ? '#f8fafc' : '#1e293b'
                      }} 
                  />
                  <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ fontSize: '12px', fontWeight: 500, color: isDarkMode ? '#94a3b8' : '#475569' }}/>
                  <Line name="班平均" type="monotone" dataKey={avgKey} stroke="#94a3b8" strokeWidth={2} strokeOpacity={0.6} dot={false} activeDot={{ r: 4, fill: '#94a3b8', stroke: 'none' }} isAnimationActive={false} connectNulls={true} />
                  <Line name={title} type="monotone" dataKey={subjectKey} stroke={COLORS[colorKey].hex} strokeWidth={3} activeDot={{ r: 6, strokeWidth: 0 }} isAnimationActive={false} connectNulls={true} />
              </LineChart>
          </ResponsiveContainer>
        </div>
    </div>
);

const DistributionChart = ({ data, colorKey, isDarkMode }) => {
    const maxCount = data.reduce((max, bucket) => Math.max(max, bucket.count || 0), 0);

    return (
        <div className={`h-60 w-full mt-6 rounded-2xl border px-2 py-3 ${isDarkMode ? 'bg-slate-900/30 border-white/5' : 'bg-white/40 border-slate-200/60'}`}>
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data} margin={{ top: 6, right: 2, bottom: 38, left: -22 }}>
                    <CartesianGrid stroke={isDarkMode ? "#334155" : "#94a3b8"} strokeOpacity={0.18} vertical={false} strokeDasharray="3 3" />
                    <XAxis dataKey="range" tick={{fontSize: 9, fill: isDarkMode ? '#94a3b8' : '#475569', fontWeight: 600}} tickLine={false} axisLine={false} interval={0} angle={-45} textAnchor="end" dy={10} />
                    <YAxis tick={{fontSize: 10, fill: isDarkMode ? '#94a3b8' : '#475569'}} tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip
                        cursor={{fill: isDarkMode ? '#334155' : '#cbd5e1', opacity: 0.28}}
                        contentStyle={{
                            borderRadius: '14px',
                            border: isDarkMode ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(148,163,184,0.2)',
                            backgroundColor: isDarkMode ? 'rgba(15,23,42,0.95)' : 'rgba(255,255,255,0.96)',
                            color: isDarkMode ? '#f8fafc' : '#0f172a',
                            fontSize: '12px',
                            fontWeight: 600
                        }}
                    />
                    <Bar dataKey="count" name="人數" radius={[7, 7, 3, 3]} isAnimationActive={false}>
                        {data.map((entry, index) => {
                            if (entry.isMyRange) {
                                return <Cell key={`cell-${index}`} fill={COLORS[colorKey].hex} fillOpacity={0.95} />;
                            }
                            const opacity = maxCount > 0 ? 0.25 + ((entry.count || 0) / maxCount) * 0.45 : 0.25;
                            return <Cell key={`cell-${index}`} fill={isDarkMode ? '#64748b' : '#94a3b8'} fillOpacity={opacity} />;
                        })}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
};

const ParentAbilityRadar = ({ data, maxValue, isDarkMode }) => (
    <div className={`mb-8 rounded-3xl border px-4 pt-4 pb-2 ${isDarkMode ? 'bg-[#0f1914]/70 border-emerald-200/15' : 'bg-white border-slate-200/70'}`}>
        <div className="flex items-end justify-between mb-2 px-1">
            <div>
                <h4 className={`text-sm font-black tracking-wide ${isDarkMode ? 'text-emerald-100' : 'text-slate-800'}`}>三科能力雷達圖</h4>
                <p className={`text-[11px] font-semibold ${isDarkMode ? 'text-emerald-200/70' : 'text-slate-500'}`}>個人平均 vs 班平均（當前階段）</p>
            </div>
            <span className={`text-[10px] font-bold tracking-wider ${isDarkMode ? 'text-emerald-300/60' : 'text-slate-400'}`}>SCORE</span>
        </div>
        <div className="h-60 w-full">
            <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={data} outerRadius="74%">
                    <PolarGrid stroke={isDarkMode ? 'rgba(167,243,208,0.24)' : 'rgba(148,163,184,0.28)'} />
                    <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11, fontWeight: 700, fill: isDarkMode ? '#d1fae5' : '#334155' }} />
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
                    <Legend verticalAlign="top" wrapperStyle={{ fontSize: '11px', fontWeight: 700, color: isDarkMode ? '#a7f3d0' : '#64748b' }} />
                    <Radar name="個人平均" dataKey="student" stroke="#22c55e" fill="#22c55e" fillOpacity={isDarkMode ? 0.36 : 0.22} strokeWidth={2.5} isAnimationActive={false} />
                    <Radar name="班平均" dataKey="classAvg" stroke="#94a3b8" fill="#94a3b8" fillOpacity={isDarkMode ? 0.2 : 0.1} strokeWidth={2} isAnimationActive={false} />
                </RadarChart>
            </ResponsiveContainer>
        </div>
    </div>
);

const BatchRow = React.memo(({ student, sIndex, dateGrades, prValue, probValue, darkMode, handleBatchGradeChange, handleKeyDown, handlePaste }) => {
    const probVisual = getProbabilityVisual(probValue, darkMode);

    return (
        <tr className={`${darkMode ? 'hover:bg-slate-800/50' : 'hover:bg-white/50'} transition-colors`}>
            <td className="px-3 py-2 text-xs font-bold text-slate-500">{sIndex + 1}</td>
            <td className="px-3 py-2 font-mono text-xs font-bold text-slate-500">{student.id}</td>
            <td className={`px-3 py-2 font-bold text-xs ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>{student.name}</td>
            <td className="px-1 py-1">
                <select 
                    value={dateGrades.class || 'A班'} 
                    onChange={(e) => handleBatchGradeChange(student.id, 'class', e.target.value)}
                    className={`w-full text-center text-xs font-bold py-1.5 rounded-lg opacity-70 border-none outline-none appearance-none cursor-pointer hover:opacity-100 transition-opacity ${darkMode ? 'bg-slate-900/50 text-slate-400 focus:text-slate-200' : 'bg-slate-100 text-slate-600 focus:text-slate-900'}`}
                >
                    {CLASS_DEFS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
            </td>
            {['chi', 'eng', 'math'].map((sub) => (
                <td key={sub} className="px-1 py-1">
                    <input 
                        id={`cell-${sIndex}-${sub}`} 
                        type="text" 
                        className={`w-full text-center p-1.5 rounded-lg border border-transparent outline-none text-sm font-bold transition-all shadow-inner focus:ring-1 ${darkMode ? 'bg-slate-950/50 text-slate-300 focus:bg-slate-900 focus:border-blue-500/50 focus:ring-blue-500/20' : 'bg-slate-50 text-slate-600 focus:bg-white focus:border-blue-200 focus:ring-blue-200'}`} 
                        value={dateGrades[sub] || ''} 
                        onChange={(e) => handleBatchGradeChange(student.id, sub, e.target.value)} 
                        onKeyDown={(e) => handleKeyDown(e, sIndex, sub)} 
                        onPaste={(e) => handlePaste(e, sIndex, sub)} 
                        placeholder="-" 
                    />
                </td>
            ))}
            <td className="px-1 py-1 text-center"><div className="text-sm font-bold text-blue-500">{dateGrades.total}</div></td>
            <td className="px-1 py-1 text-center"><div className={`text-xs font-bold ${darkMode ? 'text-indigo-300' : 'text-indigo-600'}`}>{prValue !== '-' ? prValue : ''}</div></td>
            <td className="px-1 py-1 text-center">
                <div className="text-xs font-black inline-block px-2 py-0.5 rounded-full min-w-[56px] text-center" style={probVisual ? probVisual.badgeStyle : undefined}>
                    {probValue !== '-' ? `${probValue}%` : ''}
                </div>
            </td>
        </tr>
    );
});

const ExamCountdown = ({ isDarkMode }) => {
    const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });

    useEffect(() => {
        const targetDate = new Date('2026-03-14T08:00:00');
        const calculateTimeLeft = () => {
            const now = new Date();
            const difference = targetDate - now;
            if (difference > 0) {
                const days = Math.floor(difference / (1000 * 60 * 60 * 24));
                const hours = Math.floor((difference / (1000 * 60 * 60)) % 24);
                const minutes = Math.floor((difference / 1000 / 60) % 60);
                const seconds = Math.floor((difference / 1000) % 60);
                setTimeLeft({ days, hours, minutes, seconds });
            } else {
                setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 });
            }
        };
        calculateTimeLeft();
        const timer = setInterval(calculateTimeLeft, 1000); 
        return () => clearInterval(timer);
    }, []);

    return (
        <div className={`flex items-center gap-3 mt-4 px-5 py-2 rounded-full border backdrop-blur-md transition-all duration-500 shadow-sm ${isDarkMode ? 'bg-emerald-500/10 border-emerald-200/20 text-slate-100 shadow-black/20' : 'bg-white/70 border-emerald-100 text-slate-700 shadow-slate-200/50'}`}>
            <Target className="w-4 h-4 text-emerald-500" />
            <div className="flex items-baseline gap-1.5 font-mono text-sm">
                <span className="font-bold">{timeLeft.days}</span><span className="text-[10px] opacity-50 mr-1">DAYS</span>
                <span className="font-bold">{String(timeLeft.hours).padStart(2,'0')}</span><span className="opacity-30">:</span>
                <span className="font-bold">{String(timeLeft.minutes).padStart(2,'0')}</span><span className="opacity-30">:</span>
                <span className="font-bold text-emerald-500">{String(timeLeft.seconds).padStart(2,'0')}</span>
            </div>
        </div>
    );
};

export default function App() {
  const [user, setUser] = useState(null);
  const [mode, setMode] = useState('landing'); 
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [loginError, setLoginError] = useState(false);
    
  const [studentName, setStudentName] = useState('');
  const [currentStudentId, setCurrentStudentId] = useState(null);
  const [grades, setGrades] = useState({});
  const [classAverages, setClassAverages] = useState({}); 
  const [availableDates, setAvailableDates] = useState(DEFAULT_EXAM_STARTS);
  const [newDateInput, setNewDateInput] = useState('');
    
  const [statusMsg, setStatusMsg] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [studentToDelete, setStudentToDelete] = useState(null);
  const [showAddStudentModal, setShowAddStudentModal] = useState(false);
  const [newStudentIdInput, setNewStudentIdInput] = useState('');
  const [showAvgModal, setShowAvgModal] = useState(false);
  
  const [showSecurityModal, setShowSecurityModal] = useState(false);
  const [securityInput, setSecurityInput] = useState('');
  const [pendingAction, setPendingAction] = useState(null);
  const securityInputRef = useRef(null);
    
  const [teacherViewMode, setTeacherViewMode] = useState('single');
  const [teacherClassFilter, setTeacherClassFilter] = useState('A班'); 
  const [avgSettingsClassFilter, setAvgSettingsClassFilter] = useState('A班'); 
  const [batchDate, setBatchDate] = useState(''); 
  const [allStudentsData, setAllStudentsData] = useState([]); 
  const [cachedClassData, setCachedClassData] = useState([]); 
  const [sortByPR, setSortByPR] = useState(false);
  const [sortByProb, setSortByProb] = useState(false);
    
  const [loading, setLoading] = useState(false);
  const [searchId, setSearchId] = useState('');
  const [viewData, setViewData] = useState(null);
  const [searchError, setSearchError] = useState('');
  const [activeTab, setActiveTab] = useState('total');
  
  const [activePhase, setActivePhase] = useState('mock');

  const [statsModalData, setStatsModalData] = useState(null);
  const [statsActiveTab, setStatsActiveTab] = useState('total');

  // --- OPTIMIZATION: State for probabilities to debounce updates ---
  const [admissionProbabilities, setAdmissionProbabilities] = useState({});

  const [xlsxLoaded, setXlsxLoaded] = useState(false);
  const [darkMode, setDarkMode] = useState(false);

  // 預先建立依照考試日期排序好的日期清單，避免在 render 階段重複 sort
  const sortedAvailableDatesAsc = useMemo(
      () => [...availableDates].sort(customDateSort),
      [availableDates]
  );
  const sortedAvailableDatesDesc = useMemo(
      () => [...sortedAvailableDatesAsc].slice().reverse(),
      [sortedAvailableDatesAsc]
  );

  // 包裝 getWeekendID，自動傳入 availableDates，讓連續兩天的日期可以歸類為同一次測驗
  const getTestDateID = useCallback((dateStr) => {
      return getWeekendID(dateStr, availableDates);
  }, [availableDates]);

  useEffect(() => {
      const storedAuth = localStorage.getItem('teacher_auth');
      if (storedAuth === 'true') setIsAuthenticated(true);
  }, []);

  const hasPriorHistory = useMemo(() => {
      if (!viewData || !viewData.chartData) return true;
      const sortedAllDates = sortedAvailableDatesAsc;
      return viewData.chartData.some(d => {
          const weekendID = getTestDateID(d.weekendID || d.date);
          const idx = sortedAllDates.indexOf(weekendID);
          return idx >= 0 && idx < 36;
      });
  }, [viewData, sortedAvailableDatesAsc, getTestDateID]);

  // --- OPTIMIZATION: Debounced Calculation Effect ---
  useEffect(() => {
      const shouldCompute = mode === 'teacher' && teacherViewMode === 'batch';
      if (!shouldCompute || allStudentsData.length === 0) return;

      let rafId = null;
      const timer = setTimeout(() => {
          // 1. Prepare ranking lists
          const scoresByDate = {}; 
          const mathScoresByDate = {}; 
          
          availableDates.forEach(d => {
              scoresByDate[d] = [];
              mathScoresByDate[d] = [];
          });
          
          // Build Score Arrays
          allStudentsData.forEach(s => {
              if (!s.grades) return;
              Object.entries(s.grades).forEach(([date, g]) => {
                  const weekendID = getTestDateID(date);
                  if (g.total && !isNaN(parseFloat(g.total))) {
                      if (!scoresByDate[weekendID]) scoresByDate[weekendID] = [];
                      scoresByDate[weekendID].push(parseFloat(g.total));
                  }
                  if (g.math && !isNaN(parseFloat(g.math))) {
                      if (!mathScoresByDate[weekendID]) mathScoresByDate[weekendID] = [];
                      mathScoresByDate[weekendID].push(parseFloat(g.math));
                  }
              });
          });

          // Sort scores for ranking
          Object.keys(scoresByDate).forEach(d => scoresByDate[d].sort((a, b) => b - a));
          Object.keys(mathScoresByDate).forEach(d => mathScoresByDate[d].sort((a, b) => b - a));

          // 2. Pre-process student grades into fast lookup maps
          const studentGradeMaps = {};
          allStudentsData.forEach(s => {
              if (!s.grades) return;
              const map = {};
              Object.entries(s.grades).forEach(([date, g]) => {
                  map[getTestDateID(date)] = g;
              });
              studentGradeMaps[s.id] = map;
          });

          const probs = {};
          
          // 3. Calculate probs using fast lookups
          allStudentsData.forEach(s => {
              probs[s.id] = calculateProbLogic(s, scoresByDate, mathScoresByDate, studentGradeMaps, availableDates);
          });
          
          rafId = requestAnimationFrame(() => setAdmissionProbabilities(probs));
      }, 500);

      return () => {
          clearTimeout(timer);
          if (rafId) cancelAnimationFrame(rafId);
      };
  }, [allStudentsData, availableDates, getTestDateID, mode, teacherViewMode]);

  useEffect(() => {
      if (mode === 'parent' && viewData) {
          setActivePhase('mock'); 
      }
  }, [viewData, mode]);

  useEffect(() => {
      if (mode === 'parent') {
          setViewData(null);
          setSearchError('');
      }
  }, [mode]);

  useEffect(() => {
    const checkTime = () => {
      const now = new Date();
      const hour = now.getHours();
      const min = now.getMinutes();
      if (hour > 17 || (hour === 17 && min >= 30) || hour < 6) {
          setDarkMode(true);
      } else {
          setDarkMode(false);
      }
    };
    checkTime();
  }, []);

  const toggleDarkMode = () => setDarkMode(!darkMode);

  useEffect(() => {
    const script = document.createElement('script');
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
    script.onload = () => setXlsxLoaded(true);
    document.body.appendChild(script);
    return () => { if (document.body.contains(script)) document.body.removeChild(script); }
  }, []);

  useEffect(() => {
    const initAuth = async () => {
      try {
        if (!auth) return;
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) await signInWithCustomToken(auth, __initial_auth_token);
        else await signInAnonymously(auth);
      } catch (e) { console.error(e); }
    };
    if (auth) {
        initAuth();
        const unsubscribe = onAuthStateChanged(auth, (u) => {
          setUser(u);
          if (u) { loadDates(); loadClassAverages(); }
        });
        return () => unsubscribe();
    }
  }, []);

  useEffect(() => {
      if (availableDates.length > 0 && !batchDate) setBatchDate(availableDates[availableDates.length - 1]);
  }, [availableDates]);

  const loadDates = async () => {
      if (!db) return [...availableDates].sort(customDateSort);
      try {
          const docSnap = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'dates'));
          if (docSnap.exists() && docSnap.data().list) {
              const loadedDates = [...docSnap.data().list].sort(customDateSort);
              setAvailableDates(loadedDates);
              return loadedDates;
          } else {
             const initialDates = [...DEFAULT_EXAM_STARTS].sort(customDateSort);
             setAvailableDates(initialDates);
             return initialDates;
          }
      } catch(e) {
          console.error("Error loading dates:", e);
          return [...availableDates].sort(customDateSort);
      }
  };

  const executeWithSecurity = (action) => {
      setPendingAction(() => action);
      setSecurityInput('');
      setShowSecurityModal(true);
      setTimeout(() => {
          if (securityInputRef.current) securityInputRef.current.focus();
      }, 100);
  };

  const handleSecurityInput = (e) => {
      const val = e.target.value;
      setSecurityInput(val);
      if (val === SECURITY_CODE) {
          if (pendingAction) pendingAction();
          setShowSecurityModal(false);
          setPendingAction(null);
          setSecurityInput('');
      }
  };

  const addDate = async () => {
      if (!newDateInput || availableDates.includes(newDateInput)) return;
      const newList = [...availableDates, newDateInput].sort(customDateSort);
      setAvailableDates(newList);
      setNewDateInput('');
      if (db) await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'dates'), { list: newList }, { merge: true });
      setStatusMsg(`已新增: ${newDateInput}`); setTimeout(() => setStatusMsg(''), 2000);
  };

  const localComputedAverages = useMemo(() => {
      const avgs = {};
      const validClassSet = new Set(CLASS_DEFS.map(c => c.id));

      const createBuckets = () => {
          const buckets = { all: { t:0, c:0, e:0, m:0, count:0 } };
          CLASS_DEFS.forEach(c => {
              buckets[c.id] = { t:0, c:0, e:0, m:0, count:0 };
          });
          return buckets;
      };

      const dateToWeekendID = {};
      const groupsByWeekendID = {};

      availableDates.forEach(date => {
          const weekendID = getTestDateID(date);
          dateToWeekendID[date] = weekendID;
          if (!groupsByWeekendID[weekendID]) {
              groupsByWeekendID[weekendID] = createBuckets();
          }
      });

      allStudentsData.forEach(student => {
          Object.entries(student.grades || {}).forEach(([gradeDate, grade]) => {
              const weekendID = getTestDateID(gradeDate);
              const groups = groupsByWeekendID[weekendID];
              if (!groups) return;

              const total = parseFloat(grade.total) || 0;
              if (grade.total === '' || total <= 0) return;

              const math = parseFloat(grade.math) || 0;
              const eng = parseFloat(grade.eng) || 0;
              const chi = parseFloat(grade.chi) || 0;

              let studentClass = grade.class || 'A班';
              if (!validClassSet.has(studentClass)) studentClass = 'A班';

              if (groups[studentClass]) {
                  groups[studentClass].t += total;
                  groups[studentClass].m += math;
                  groups[studentClass].e += eng;
                  groups[studentClass].c += chi;
                  groups[studentClass].count++;
              }

              groups.all.t += total;
              groups.all.m += math;
              groups.all.e += eng;
              groups.all.c += chi;
              groups.all.count++;
          });
      });

      availableDates.forEach(date => {
          const weekendID = dateToWeekendID[date];
          const groups = groupsByWeekendID[weekendID] || createBuckets();
          avgs[date] = {};

          Object.keys(groups).forEach(key => {
              const g = groups[key];
              if (g.count > 0) {
                  avgs[date][key] = {
                      total: (g.t / g.count).toFixed(1),
                      chi: (g.c / g.count).toFixed(1),
                      eng: (g.e / g.count).toFixed(1),
                      math: (g.m / g.count).toFixed(1)
                  };
              }
          });
      });
      return avgs;
  }, [availableDates, allStudentsData, getTestDateID]);

  const loadClassAverages = async () => {
      if (!db) { setClassAverages(localComputedAverages); return; }
      try {
          const docSnap = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'class_averages_v18'));
          let dbAverages = {};
          if (docSnap.exists()) dbAverages = docSnap.data().averages || {};
          setClassAverages({ ...localComputedAverages, ...dbAverages });
      } catch (e) { setClassAverages(localComputedAverages); }
  };

  useEffect(() => {
      if (allStudentsData.length > 0) {
          setClassAverages(prev => ({ ...prev, ...localComputedAverages }));
      }
  }, [localComputedAverages, allStudentsData.length]);

  const handleManualAverageChange = (date, classId, subject, value) => {
      setClassAverages(prev => {
          const dateData = prev[date] || {};
          const classData = dateData[classId] || { chi: '', eng: '', math: '', total: '' };
          const updatedClassData = { ...classData, [subject]: value };
          
          if (subject !== 'total') {
              updatedClassData.total = calculateTotal(
                  subject === 'chi' ? value : updatedClassData.chi,
                  subject === 'eng' ? value : updatedClassData.eng,
                  subject === 'math' ? value : updatedClassData.math
              );
          }
          return { ...prev, [date]: { ...dateData, [classId]: updatedClassData } };
      });
  };

  const saveManualClassAverages = async () => {
      if (!db) return;
      try {
          await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'class_averages_v18'), { averages: classAverages }, { merge: true });
          setStatusMsg("設定已儲存"); setTimeout(() => setStatusMsg(''), 2000); setShowAvgModal(false);
      } catch (e) { setStatusMsg("儲存失敗"); }
  };

  const handleDeleteDate = (dateToDelete) => setDeleteTarget(dateToDelete);
  const confirmDeleteDate = async () => {
      if (!deleteTarget) return;
      const newList = availableDates.filter(d => d !== deleteTarget);
      setAvailableDates(newList);
      if (db) await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'dates'), { list: newList }, { merge: true });
      setStatusMsg(`已刪除: ${deleteTarget}`); setTimeout(() => setStatusMsg(''), 2000); setDeleteTarget(null);
  };

  const handleLoginSubmit = () => {
      const inputEncoded = btoa(passwordInput);
      if (ENCODED_PASSWORDS.includes(inputEncoded)) { 
          setIsAuthenticated(true); localStorage.setItem('teacher_auth', 'true'); setMode('teacher'); loadAllStudents();
      } else { setLoginError(true); }
  };

  const handleLogout = () => { setIsAuthenticated(false); localStorage.removeItem('teacher_auth'); setMode('landing'); };

  const loadAllStudents = async () => {
      setLoading(true);
      try {
          let studentsMap = {};
          RAW_STUDENT_RECORDS.forEach(s => { studentsMap[s.id] = { ...s, grades: normalizeGrades(s.grades) }; });
          if (db) {
              const querySnapshot = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'students'));
              querySnapshot.forEach(doc => {
                  const data = doc.data();
                  if (studentsMap[data.id]) { studentsMap[data.id] = { ...studentsMap[data.id], ...data, grades: { ...studentsMap[data.id].grades, ...data.grades } }; } 
                  else { studentsMap[data.id] = data; }
              });
          }
          const sortedStudents = Object.values(studentsMap).sort((a,b) => a.id.localeCompare(b.id));
          setAllStudentsData(sortedStudents);
      } catch (e) { console.error("Load error:", e); }
      setLoading(false);
  };

  const normalizeGrades = (grades) => {
      if (!grades) return {};
      const normalized = {};
      Object.keys(grades).forEach(date => {
          const g = grades[date];
          let normalizedG;
          if (Array.isArray(g)) { normalizedG = { math: g[0]||0, eng: g[1]||0, chi: g[2]||0, total: (g[0]||0)+(g[1]||0)+(g[2]||0), class: 'A班' }; } 
          else { normalizedG = { ...g }; }
          if (!normalizedG.class) normalizedG.class = 'A班';
          normalized[date] = normalizedG;
      });
      return normalized;
  };

  const loadStudentForTeacher = async (id) => {
    if (!user) return;
    setLoading(true);
    try {
      let data = null;
      if (db) {
          const docSnap = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', 'students', `student_${id}`));
          if (docSnap.exists()) data = docSnap.data();
      }
      if (data) {
        setCurrentStudentId(data.id); setStudentName(data.name);
        let loadedGrades = data.grades || {};
        availableDates.forEach(d => { 
             const weekendID = getTestDateID(d);
             const existingGradeKey = Object.keys(loadedGrades).find(k => getTestDateID(k) === weekendID);
             if (!existingGradeKey) {
                 loadedGrades[d] = { chi: '', eng: '', math: '', total: '', class: 'A班' }; 
             }
        }); 
        setGrades(loadedGrades); setStatusMsg(`已載入：${data.name}`);
      } else {
        setCurrentStudentId(id); setStudentName('');
        const gradesObj = {}; availableDates.forEach(d => gradesObj[d] = { chi: '', eng: '', math: '', total: '', class: 'A班' });
        setGrades(gradesObj); setStatusMsg('新學生模式');
      }
    } catch (e) { setStatusMsg('讀取錯誤'); }
    setLoading(false);
  };

  const handleAddNewStudent = () => {
      if(newStudentIdInput.trim()) {
          loadStudentForTeacher(newStudentIdInput.toUpperCase().trim());
          setShowAddStudentModal(false); setNewStudentIdInput(''); setTeacherViewMode('single');
      }
  };

  const handleGradeChange = (dateKey, subject, value) => {
    setGrades(prev => {
        const currentData = prev[dateKey] || { chi: '', eng: '', math: '', total: '', class: 'A班' };
        const updatedData = { ...currentData, [subject]: value };
        if (subject !== 'total' && subject !== 'class') updatedData.total = calculateTotal(subject==='chi'?value:updatedData.chi, subject==='eng'?value:updatedData.eng, subject==='math'?value:updatedData.math);
        return { ...prev, [dateKey]: updatedData };
    });
  };

  const handleBatchGradeChange = useCallback((studentId, subject, value) => {
      setAllStudentsData(prev => prev.map(s => {
          if (s.id !== studentId) return s;
          const currentGrades = s.grades || {};
          let targetDate = batchDate;
          const batchDateID = getTestDateID(batchDate);
          const existingKey = Object.keys(currentGrades).find(k => getTestDateID(k) === batchDateID);
          if (existingKey) targetDate = existingKey;
          else {
             // 對於日A班/日B班，嘗試找連續的日期（例如週日的日期）
             // 但現在連續日期邏輯已經在 getTestDateID 中處理，所以這裡可以簡化
             // 如果找不到，就使用 batchDate 作為新日期
          }
          const currentDateGrades = currentGrades[targetDate] || { chi: '', eng: '', math: '', total: '', class: teacherClassFilter }; 
          let updatedDateGrades;
          if (subject === 'class') {
              updatedDateGrades = { ...currentDateGrades, class: value };
          } else {
              updatedDateGrades = { ...currentDateGrades, [subject]: value };
              updatedDateGrades.total = calculateTotal(
                  subject==='chi'?value:updatedDateGrades.chi, 
                  subject==='eng'?value:updatedDateGrades.eng, 
                  subject==='math'?value:updatedDateGrades.math
              );
          }
          return { ...s, grades: { ...currentGrades, [targetDate]: updatedDateGrades } };
      }));
  }, [batchDate, teacherClassFilter, getTestDateID]); 

  const handleExcelUpload = (e) => {
    if (!xlsxLoaded) { setStatusMsg("載入中，請稍後"); return; }
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target.result;
        const wb = window.XLSX.read(bstr, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = window.XLSX.utils.sheet_to_json(ws, { header: 1 });
          
        let headerRowIndex = -1;
        const colMap = { id: -1, name: -1, date: -1, chi: -1, eng: -1, math: -1, class: -1 };

        // 強化版表頭偵測 (Smart Column Detection)
        for (let i = 0; i < Math.min(data.length, 10); i++) {
            const row = data[i];
            const rowStr = row.map(c => (c !== undefined && c !== null) ? String(c).trim() : '');
            
            // Check for student ID or Name to identify header row
            if (rowStr.some(c => c.includes('學號') || c.toUpperCase().includes('ID') || c.includes('姓名') || c.toUpperCase().includes('NAME'))) {
                headerRowIndex = i;
                
                rowStr.forEach((cell, idx) => {
                    const text = cell.replace(/\s+/g, ''); // Remove all spaces for easier matching
                    const lowerText = text.toLowerCase();
                    
                    // 1. Basic Info
                    if (text.includes('學號') || lowerText === 'id' || lowerText.includes('studentid')) colMap.id = idx;
                    else if (text.includes('姓名') || lowerText.includes('name')) colMap.name = idx;
                    else if (text.includes('日期') || text.includes('測驗日')) colMap.date = idx;
                    else if (text.includes('班') || text.includes('類別')) colMap.class = idx;
                    
                    // 2. Score Columns - Strict "Total" priority
                    // Chinese
                    else if (text.includes('國') && (text.includes('總') || text.includes('實得') || text.includes('Score') || text.includes('Total'))) {
                        colMap.chi = idx;
                    }
                    // English
                    else if (text.includes('英') && (text.includes('總') || text.includes('實得') || text.includes('Score') || text.includes('Total'))) {
                        colMap.eng = idx;
                    }
                    // Math
                    else if (text.includes('數') && (text.includes('總') || text.includes('實得') || text.includes('Score') || text.includes('Total'))) {
                        colMap.math = idx;
                    }
                });

                // Fallback for scores if "Total" not found
                if (colMap.chi === -1) {
                     rowStr.forEach((cell, idx) => { if (cell.includes('國') && colMap.chi === -1) colMap.chi = idx; });
                }
                if (colMap.eng === -1) {
                     rowStr.forEach((cell, idx) => { if (cell.includes('英') && colMap.eng === -1) colMap.eng = idx; });
                }
                if (colMap.math === -1) {
                     rowStr.forEach((cell, idx) => { if (cell.includes('數') && colMap.math === -1) colMap.math = idx; });
                }
                break; 
            }
        }

        if (headerRowIndex === -1 || colMap.id === -1) {
             headerRowIndex = 0; 
             colMap.id = 0; colMap.name = 1; colMap.date = 2; colMap.chi = 3; colMap.eng = 4; colMap.math = 5;
        }

        // Default Class column to first column if not detected
        if (colMap.class === -1) colMap.class = 0;

        const newStudentsMap = allStudentsData.reduce((acc, s) => { acc[s.id] = { ...s, grades: { ...s.grades } }; return acc; }, {});
        const newDates = new Set(availableDates);
        let importCount = 0;
        let lastImportedDate = '';
        let hasError = false; 

        for (let i = headerRowIndex + 1; i < data.length; i++) {
          const row = data[i];
          if (!row || row[colMap.id] === undefined) continue; 
          
          const rawId = String(row[colMap.id]).toUpperCase().trim();
          
          if (rawId.length > 15 || !/\d/.test(rawId)) {
               continue; 
          }

          const rawName = colMap.name !== -1 && row[colMap.name] ? String(row[colMap.name]).trim() : '';
          
          // --- Date Normalization ---
          let dateStr = '';
          if (colMap.date !== -1 && row[colMap.date]) {
               const rawDate = row[colMap.date];
               let dString = String(rawDate).trim();
               
               dString = dString.replace(/\./g, '/').replace(/-/g, '/');
               
               const parts = dString.split('/');
               if (parts.length >= 2) {
                   const m = parseInt(parts[parts.length - 2], 10);
                   const d = parseInt(parts[parts.length - 1], 10);
                   if (!isNaN(m) && !isNaN(d)) {
                       dateStr = `${String(m).padStart(2, '0')}/${String(d).padStart(2, '0')}`;
                   }
               } else if (dString.length === 3 || dString.length === 4) {
                   const m = dString.length === 3 ? dString.slice(0,1) : dString.slice(0,2);
                   const d = dString.slice(-2);
                   dateStr = `${String(m).padStart(2, '0')}/${String(d).padStart(2, '0')}`;
               } else {
                   dateStr = dString; 
               }
          }
          // ------------------------

          if (!dateStr || !dateStr.includes('/')) continue; 

          const getVal = (idx) => {
            if (idx !== -1 && row[idx] !== undefined && row[idx] !== null) {
                const val = String(row[idx]).trim();
                if (val === '') return '';
                const num = parseFloat(val);
                return isNaN(num) ? val : Math.round(num * 10) / 10;
            }
            return '';
          };
          const chi = getVal(colMap.chi);
          const eng = getVal(colMap.eng);
          const math = getVal(colMap.math);
          
          // --- Class Normalization ---
          let rawClass = (colMap.class !== -1 && row[colMap.class]) ? String(row[colMap.class]).trim().toUpperCase() : 'A班';
          let className = 'A班';

          if (rawClass.includes('日') || rawClass.includes('SUN')) {
               if (rawClass.includes('B')) className = '日B班';
               else className = '日A班';
          }
          else if (rawClass.includes('C')) className = 'C班'; // Priority check for C
          else if (rawClass.includes('B')) className = 'B班';
          else if (rawClass.includes('A')) className = 'A班';
          else className = 'A班'; 
          // ---------------------------

          // Excel 匯入時，使用新的連續日期邏輯，但需要考慮已存在的 availableDates
          const weekendID = getWeekendID(dateStr, [...availableDates, ...Array.from(newDates)]);
          if (!newDates.has(weekendID)) newDates.add(weekendID); 
          
          lastImportedDate = weekendID;

          let student = newStudentsMap[rawId];
          if (!student) { 
              student = { id: rawId, name: rawName || '未命名', grades: {} }; 
              newStudentsMap[rawId] = student; 
          } else if (rawName) {
              student.name = rawName;
          }
          
          student.grades[dateStr] = {
              chi: chi, 
              eng: eng, 
              math: math, 
              total: calculateTotal(chi, eng, math),
              class: className
          };
          importCount++;
        }

        if (hasError) {
             setStatusMsg("匯入已取消");
             return; 
        }

        const sortedDates = Array.from(newDates).sort(customDateSort);
        setAvailableDates(sortedDates);
        
        // ** IMMEDIATE DISPLAY FIX **
        // Automatically switch batch view to the imported date
        if (lastImportedDate) {
             setBatchDate(lastImportedDate);
        } else if (sortedDates.length > 0 && !batchDate) {
             setBatchDate(sortedDates[sortedDates.length - 1]);
        }
        
        if (db) setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'dates'), { list: sortedDates }, { merge: true });

        const sortedStudents = Object.values(newStudentsMap).sort((a,b) => a.id.localeCompare(b.id));
        setAllStudentsData([...sortedStudents]); 
        
        setStatusMsg(`匯入 ${importCount} 筆資料 (最新日期: ${lastImportedDate})`);
      } catch (error) { console.error(error); setStatusMsg("匯入失敗: 格式錯誤"); }
    };
    reader.readAsBinaryString(file);
  };

  const handleGridKeyDown = useCallback((e, index, subject, type, totalItems) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
        let nextIndex = index;
        let nextSubject = subject;
        const subjects = type === 'avg' ? ['chi', 'eng', 'math', 'total'] : ['chi', 'eng', 'math'];
        const subjectIndex = subjects.indexOf(subject);
        
        if (e.key === 'ArrowUp') nextIndex = Math.max(0, index - 1);
        else if (e.key === 'ArrowDown') nextIndex = Math.min(totalItems - 1, index + 1);
        else if (e.key === 'ArrowLeft' && subjectIndex > 0) nextSubject = subjects[subjectIndex - 1];
        else if (e.key === 'ArrowRight' && subjectIndex < subjects.length - 1) nextSubject = subjects[subjectIndex + 1];
        
        let nextInputId = '';
        if (type === 'batch') nextInputId = `cell-${nextIndex}-${nextSubject}`;
        else if (type === 'single') nextInputId = `single-${nextIndex}-${nextSubject}`;
        else if (type === 'avg') nextInputId = `avg-${nextIndex}-${nextSubject}`;

        const nextInput = document.getElementById(nextInputId);
        if (nextInput) { nextInput.focus(); nextInput.select(); }
    }
  }, []);

  const handleKeyDown = useCallback((e, studentIndex, subject) => handleGridKeyDown(e, studentIndex, subject, 'batch', allStudentsData.length), [allStudentsData.length, handleGridKeyDown]);
  const handleSingleKeyDown = useCallback((e, dateIndex, subject) => handleGridKeyDown(e, dateIndex, subject, 'single', availableDates.length), [availableDates.length, handleGridKeyDown]);
  const handleAvgKeyDown = useCallback((e, dateIndex, subject) => handleGridKeyDown(e, dateIndex, subject, 'avg', availableDates.length), [availableDates.length, handleGridKeyDown]);

  const handlePaste = useCallback((e, startStudentIndex, startSubject) => {
      e.preventDefault();
      const pasteData = e.clipboardData.getData('text');
      const rows = pasteData.trim().split(/\r\n|\n|\r/);
      const subjects = ['chi', 'eng', 'math'];
      const startSubjectIndex = subjects.indexOf(startSubject);
      
      setAllStudentsData(prev => {
          const newData = [...prev];
          let updated = false;
          rows.forEach((row, rIndex) => {
              const studentIndex = startStudentIndex + rIndex;
              if (studentIndex >= newData.length) return;
              const cols = row.split('\t');
              const student = { ...newData[studentIndex] };
              const currentGrades = student.grades || {};
              const currentDateGrades = { ...(currentGrades[batchDate] || { chi: '', eng: '', math: '', total: '', class: 'A班' }) }; 
              let rowUpdated = false;
              cols.forEach((val, cIndex) => {
                  const subjectIndex = startSubjectIndex + cIndex;
                  if (subjectIndex >= 3) return;
                  const subject = subjects[subjectIndex];
                  currentDateGrades[subject] = val.trim();
                  rowUpdated = true;
              });
              if (rowUpdated) {
                  currentDateGrades.total = calculateTotal(currentDateGrades.chi, currentDateGrades.eng, currentDateGrades.math);
                  student.grades = { ...currentGrades, [batchDate]: currentDateGrades };
                  newData[studentIndex] = student;
                  updated = true;
              }
          });
          if(updated) { setStatusMsg(`已貼上 ${rows.length} 筆資料`); setTimeout(() => setStatusMsg(''), 2000); }
          return newData;
      });
  }, [batchDate]); // Added batchDate dependency

  const handleSinglePaste = (e, startDateIndex, startSubject) => {
      e.preventDefault();
      const pasteData = e.clipboardData.getData('text');
      const rows = pasteData.trim().split(/\r\n|\n|\r/); 
      const subjects = ['chi', 'eng', 'math'];
      const startSubjectIndex = subjects.indexOf(startSubject);
      const reversedDates = sortedAvailableDatesDesc;

      setGrades(prev => {
          const newGrades = { ...prev };
          let updated = false;
          rows.forEach((row, rIndex) => {
              const dateIndex = startDateIndex + rIndex;
              if (dateIndex >= reversedDates.length) return;
              const targetDate = reversedDates[dateIndex];
              const cols = row.split('\t');
              const currentData = { ...(newGrades[targetDate] || { chi: '', eng: '', math: '', total: '', class: 'A班' }) }; // Default to A班
              let rowUpdated = false;
              cols.forEach((val, cIndex) => {
                  const subjectIndex = startSubjectIndex + cIndex;
                  if (subjectIndex >= 3) return;
                  const subject = subjects[subjectIndex];
                  currentData[subject] = val.trim();
                  rowUpdated = true;
              });
              if (rowUpdated) {
                  currentData.total = calculateTotal(currentData.chi, currentData.eng, currentData.math);
                  newGrades[targetDate] = currentData;
                  updated = true;
              }
          });
          if (updated) { setStatusMsg(`已貼上 ${rows.length} 筆資料`); setTimeout(() => setStatusMsg(''), 2000); }
          return newGrades;
      });
  };

  const handleAvgPaste = (e, startDateIndex, startSubject) => {
      e.preventDefault();
      const pasteData = e.clipboardData.getData('text');
      const rows = pasteData.trim().split(/\r\n|\n|\r/);
      const subjects = ['chi', 'eng', 'math', 'total'];
      const startSubjectIndex = subjects.indexOf(startSubject);
      const reversedDates = sortedAvailableDatesDesc;

      setClassAverages(prev => {
          const newAvgs = { ...prev };
          let updated = false;
          rows.forEach((row, rIndex) => {
              const dateIndex = startDateIndex + rIndex;
              if (dateIndex >= reversedDates.length) return;
              const targetDate = reversedDates[dateIndex];
              const cols = row.split('\t');
              
              const currentDataDate = newAvgs[targetDate] || {};
              const currentData = { ...(currentDataDate[avgSettingsClassFilter] || { chi: '', eng: '', math: '', total: '' }) };
              
              let rowUpdated = false;
              cols.forEach((val, cIndex) => {
                  const subjectIndex = startSubjectIndex + cIndex;
                  if (subjectIndex >= 4) return;
                  const subject = subjects[subjectIndex];
                  if (subject !== 'total') {
                      currentData[subject] = val.trim();
                      rowUpdated = true;
                  }
              });
              if (rowUpdated) {
                  currentData.total = calculateTotal(currentData.chi, currentData.eng, currentData.math);
                  newAvgs[targetDate] = { ...currentDataDate, [avgSettingsClassFilter]: currentData };
                  updated = true;
              }
          });
          if (updated) { setStatusMsg(`已貼上 ${rows.length} 筆資料`); setTimeout(() => setStatusMsg(''), 2000); }
          return newAvgs;
      });
  };

  const handleDeleteStudent = () => { if (currentStudentId) setStudentToDelete({ id: currentStudentId, name: studentName }); };
  const confirmDeleteStudent = async () => {
    if (!studentToDelete) return;
    try {
        if (db) await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'students', `student_${studentToDelete.id}`));
        setAllStudentsData(prev => prev.filter(s => s.id !== studentToDelete.id));
        setCurrentStudentId(null); setStudentName(''); setGrades({});
        setStatusMsg(`已刪除`); setTimeout(() => setStatusMsg(''), 2000); setStudentToDelete(null);
    } catch (e) { setStatusMsg("刪除失敗"); }
  };

  const handleSaveGrades = async () => {
    if (!user || !currentStudentId) return;
    if (!studentName.trim()) { setStatusMsg('請輸入姓名'); return; }
    setStatusMsg('儲存中...');
    try {
      if (db) await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'students', `student_${currentStudentId}`), { id: currentStudentId, name: studentName, grades: grades, lastUpdated: new Date().toISOString() }, { merge: true });
      setAllStudentsData(prev => {
          const exists = prev.find(s => s.id === currentStudentId);
          if(exists) return prev.map(s => s.id === currentStudentId ? { ...s, name: studentName, grades } : s);
          return [...prev, { id: currentStudentId, name: studentName, grades }].sort((a,b) => a.id.localeCompare(b.id));
      });
      setStatusMsg('儲存成功'); setTimeout(() => setStatusMsg(''), 2000);
    } catch (e) { setStatusMsg('儲存失敗'); }
  };

  const handleSaveBatchGrades = async () => {
      setStatusMsg("批次儲存中...");
      try {
          if (db) {
              const batchPromises = allStudentsData.map(student => setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'students', `student_${student.id}`), { id: student.id, name: student.name, grades: student.grades, lastUpdated: new Date().toISOString() }, { merge: true }));
              await Promise.all(batchPromises);
              setStatusMsg("全班儲存成功"); setTimeout(() => setStatusMsg(''), 2000);
          }
      } catch (e) { setStatusMsg("儲存失敗"); }
  };

  const handleParentSearch = async () => {
    if (!user || !searchId.trim()) return;
    setSearchError(''); setViewData(null); setLoading(true);
    try {
      const latestDates = await loadDates();
      const effectiveDates = (latestDates && latestDates.length > 0) ? latestDates : sortedAvailableDatesAsc;
      const sortedDates = [...effectiveDates].sort(customDateSort);
      const getSearchDateID = (dateStr) => getWeekendID(dateStr, effectiveDates);
      let data = null;
      let fullClassData = [];
      if (db) {
          const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'students', `student_${searchId.toUpperCase()}`);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
              data = docSnap.data();
              if (cachedClassData.length > 0) fullClassData = cachedClassData;
              else {
                  const qSnap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'students'));
                  fullClassData = [];
                  qSnap.forEach(d => fullClassData.push(d.data()));
                  setCachedClassData(fullClassData);
              }
          }
      }
      if (data) {
        const allChartData = [];
        
        // 建立 availableDates 的 weekendID Set，用於快速查找（使用新的連續日期邏輯）
        const availableWeekendIDs = new Set(sortedDates.map(d => getSearchDateID(d)));
        
        // 遍歷學生所有成績，確保連續日期的成績也能被找到
        if (data.grades) {
          Object.entries(data.grades).forEach(([gradeDate, weekData]) => {
            if (!weekData || !weekData.total) return;
            
            const weekendID = getSearchDateID(gradeDate);
            // 只處理在 availableDates 範圍內的成績
            if (!availableWeekendIDs.has(weekendID)) return;
            
            const t = parseFloat(weekData.total);
            if (isNaN(t) || t <= 0) return;
            
            const weekClass = weekData.class || 'A班';
            const avgData = (classAverages[weekendID] && classAverages[weekendID][weekClass]) 
                          ? classAverages[weekendID][weekClass] 
                          : {};
            
            // 決定顯示日期：日A班/日B班顯示週日，其他顯示週六
            let displayDate = weekendID;
            if (weekClass === '日A班' || weekClass === '日B班') {
                displayDate = getSundayDate(weekendID);
            } 
            
            allChartData.push({
                date: displayDate, 
                weekendID: weekendID, // 保存 weekendID 用於排序
                total: t, 
                chi: parseFloat(weekData.chi)||0, 
                eng: parseFloat(weekData.eng)||0, 
                math: parseFloat(weekData.math)||0,
                avgTotal: parseFloat(avgData.total)||null, 
                avgChi: parseFloat(avgData.chi)||null, 
                avgEng: parseFloat(avgData.eng)||null, 
                avgMath: parseFloat(avgData.math)||null,
                class: weekClass
            });
          });
        }
        
        // 依照 weekendID 在 sortedDates 中的位置排序，確保折線圖順序正確
        allChartData.sort((a, b) => {
          const indexA = sortedDates.indexOf(a.weekendID);
          const indexB = sortedDates.indexOf(b.weekendID);
          if (indexA === -1 && indexB === -1) return 0;
          if (indexA === -1) return 1;
          if (indexB === -1) return -1;
          return indexA - indexB;
        });
        const avg = allChartData.length > 0 ? (allChartData.reduce((a,b)=>a+b.total,0)/allChartData.length).toFixed(1) : 0;
        
        const contextData = fullClassData.length > 0 ? fullClassData : cachedClassData;
        let studentProb = '-';
        
        if (contextData.length > 0) {
            // Re-build the scores map quickly for this calculation
            const scoresByDate = {}; 
            const mathScoresByDate = {}; 
            sortedDates.forEach(d => { scoresByDate[d] = []; mathScoresByDate[d] = []; });
            
            contextData.forEach(s => {
                if (!s.grades) return;
                Object.entries(s.grades).forEach(([date, g]) => {
                    const wid = getSearchDateID(date);
                    if (g.total && !isNaN(parseFloat(g.total))) {
                         if (!scoresByDate[wid]) scoresByDate[wid] = [];
                         scoresByDate[wid].push(parseFloat(g.total));
                    }
                    if (g.math && !isNaN(parseFloat(g.math))) {
                         if (!mathScoresByDate[wid]) mathScoresByDate[wid] = [];
                         mathScoresByDate[wid].push(parseFloat(g.math));
                    }
                });
            });
            Object.keys(scoresByDate).forEach(d => scoresByDate[d].sort((a, b) => b - a));
            Object.keys(mathScoresByDate).forEach(d => mathScoresByDate[d].sort((a, b) => b - a));
            
            // Build simple grade map for target student
            const studentGradeMap = {};
            studentGradeMap[data.id] = {};
            Object.entries(data.grades || {}).forEach(([date, g]) => {
                studentGradeMap[data.id][getSearchDateID(date)] = g;
            });
            
            studentProb = calculateProbLogic(data, scoresByDate, mathScoresByDate, studentGradeMap, sortedDates);
        }

        setViewData({ ...data, chartData: allChartData, average: avg, prob: studentProb });
      } else { setSearchError('查無此學號'); }
    } catch (e) { setSearchError('系統忙碌'); }
    setLoading(false);
  };

  const parentPhaseData = useMemo(() => {
      if (!viewData?.chartData) return [];
      const currentPhaseConfig = PHASES.find((p) => p.id === activePhase) || PHASES[0];
      const [start, end] = currentPhaseConfig.range;
      const targetDates = sortedAvailableDatesAsc.slice(start, end);

      return viewData.chartData.filter((d) => {
          const wid = d.weekendID || getTestDateID(d.date);
          return targetDates.includes(wid);
      });
  }, [viewData, activePhase, sortedAvailableDatesAsc, getTestDateID]);

  const parentRadarData = useMemo(() => {
      if (!parentPhaseData.length) return [];

      const summarize = (label, scoreKey, avgKey) => {
          const selfValues = parentPhaseData
              .map((item) => parseFloat(item[scoreKey]))
              .filter((v) => !isNaN(v));
          const avgValues = parentPhaseData
              .map((item) => parseFloat(item[avgKey]))
              .filter((v) => !isNaN(v));

          const selfMean = selfValues.length ? selfValues.reduce((sum, v) => sum + v, 0) / selfValues.length : 0;
          const classMean = avgValues.length ? avgValues.reduce((sum, v) => sum + v, 0) / avgValues.length : 0;

          return {
              subject: label,
              student: Number(selfMean.toFixed(1)),
              classAvg: Number(classMean.toFixed(1))
          };
      };

      return [
          summarize('國文', 'chi', 'avgChi'),
          summarize('英文', 'eng', 'avgEng'),
          summarize('數學', 'math', 'avgMath')
      ];
  }, [parentPhaseData]);

  const parentRadarMax = useMemo(() => {
      const values = parentRadarData
          .flatMap((item) => [item.student, item.classAvg])
          .filter((v) => !isNaN(v));

      if (!values.length) return 100;

      const maxValue = Math.max(...values, 80);
      return Math.min(120, Math.ceil(maxValue / 10) * 10);
  }, [parentRadarData]);

  // 預先為每個週末 / 班級 / 科目建立排序好的成績索引，避免在畫面 render 時重複掃描全班資料
  const scoreIndexByWeekendAndClass = useMemo(() => {
      const index = {};

      if (!cachedClassData.length) return index;

      cachedClassData.forEach(student => {
          Object.entries(student.grades || {}).forEach(([date, g]) => {
              const weekendId = getTestDateID(date);
              if (!weekendId) return;

              const cls = g.class || 'A班';
              if (!index[weekendId]) index[weekendId] = {};

              // 班級索引
              if (!index[weekendId][cls]) {
                  index[weekendId][cls] = { total: [], chi: [], eng: [], math: [] };
              }
              // 全部學生（跨班）索引，用於本部 PR
              if (!index[weekendId].all) {
                  index[weekendId].all = { total: [], chi: [], eng: [], math: [] };
              }

              ['total', 'chi', 'eng', 'math'].forEach(subject => {
                  const val = parseFloat(g[subject]);
                  if (!isNaN(val)) {
                      index[weekendId][cls][subject].push(val);
                      index[weekendId].all[subject].push(val);
                  }
              });
          });
      });

      // 每個 bucket 的分數都事先由高到低排序好
      Object.values(index).forEach(byClass => {
          Object.values(byClass).forEach(bySubject => {
              Object.keys(bySubject).forEach(subjectKey => {
                  bySubject[subjectKey].sort((a, b) => b - a);
              });
          });
      });

      return index;
  }, [cachedClassData, getTestDateID]);

  const distributionProfileByWeekendClass = useMemo(() => {
      const profile = {};

      Object.entries(scoreIndexByWeekendAndClass).forEach(([weekendID, byClass]) => {
          profile[weekendID] = {};

          Object.entries(byClass).forEach(([classKey, bySubject]) => {
              profile[weekendID][classKey] = {};

              ['total', 'chi', 'eng', 'math'].forEach((subject) => {
                  const maxScore = getMaxScore(weekendID, subject, availableDates);
                  const template = buildDistributionTemplate(maxScore);
                  const counts = new Array(template.buckets.length).fill(0);
                  const scoreList = bySubject[subject] || [];

                  scoreList.forEach((score) => {
                      const bucketIdx = resolveDistributionBucketIndex(score, template);
                      if (bucketIdx >= 0) counts[bucketIdx] += 1;
                  });

                  profile[weekendID][classKey][subject] = { template, counts };
              });
          });
      });

      return profile;
  }, [scoreIndexByWeekendAndClass, availableDates]);

  // 計算單科或總分在「本班」中的名次（#1, #2...）
  const calculateRank = (date, subject, myScore, myClass) => {
      if (!cachedClassData.length || !myScore) return '-';
      const myVal = parseFloat(myScore);
      if (isNaN(myVal)) return '-';
      
      const targetClass = myClass || 'A班';
      const currentWeekendID = getTestDateID(date);

      const byWeekend = scoreIndexByWeekendAndClass[currentWeekendID];
      if (!byWeekend || !byWeekend[targetClass]) return '-';

      const scores = byWeekend[targetClass][subject] || [];
      if (!scores.length) return '-';

      const rank = scores.indexOf(myVal) + 1;
      return rank > 0 ? rank : '-';
  };

  // 計算「本部全部學生」的 PR（需樣本數達門檻）
  const calculateGlobalPR = (date, subject, myScore) => {
      if (!cachedClassData.length || !myScore) return '-';
      const myVal = parseFloat(myScore);
      if (isNaN(myVal)) return '-';

      const currentWeekendID = getTestDateID(date);

      const byWeekend = scoreIndexByWeekendAndClass[currentWeekendID];
      if (!byWeekend || !byWeekend.all) return null;

      const scores = byWeekend.all[subject] || [];
      if (scores.length < 100) return null;

      const rank = scores.indexOf(myVal) + 1;
      const total = scores.length;
      
      const pr = Math.floor(((total - rank) / total) * 100);
      return pr;
  };

  // 計算某次測驗的成績分布，用於家長端的「落點分析」長條圖
  const calculateDistribution = (date, subject, myScore, allDates, myClass) => {
      if (!cachedClassData.length) return [];
      const myVal = parseFloat(myScore);
      const currentWeekendID = getTestDateID(date);
      const targetClass = myClass || 'A班';
      const precomputed = distributionProfileByWeekendClass[currentWeekendID]?.[targetClass]?.[subject];

      const fallbackTemplate = buildDistributionTemplate(getMaxScore(date, subject, allDates));
      const template = precomputed?.template || fallbackTemplate;
      const counts = precomputed?.counts || new Array(template.buckets.length).fill(0);
      const myBucketIdx = resolveDistributionBucketIndex(myVal, template);

      return template.buckets.map((bucket, idx) => ({
          range: bucket.label,
          count: counts[idx] || 0,
          isMyRange: idx === myBucketIdx
      }));
  };

  const batchRowsForDisplay = useMemo(() => {
      const weekendID = getTestDateID(batchDate);
      const rows = [];
      const totals = [];
      const totalByStudentId = {};

      allStudentsData.forEach(student => {
          const studentGrades = student.grades || {};
          const targetDate = Object.keys(studentGrades).find(k => getTestDateID(k) === weekendID);
          if (!targetDate) return;

          const dateGrades = studentGrades[targetDate] || EMPTY_GRADE;
          const totalVal = parseFloat(dateGrades.total);
          if (!isNaN(totalVal)) {
              totals.push(totalVal);
              totalByStudentId[student.id] = totalVal;
          }

          const currentClass = dateGrades.class || 'A班';
          if (currentClass !== teacherClassFilter) return;
          if (!hasAnySubjectScore(dateGrades)) return;

          rows.push({ student, dateGrades });
      });

      const prByStudentId = {};
      if (totals.length >= 50) {
          const sortedTotals = [...totals].sort((a, b) => b - a);
          Object.entries(totalByStudentId).forEach(([studentId, totalVal]) => {
              const rank = sortedTotals.indexOf(totalVal) + 1;
              prByStudentId[studentId] = rank > 0 ? Math.floor(((sortedTotals.length - rank) / sortedTotals.length) * 100) : '-';
          });
      }

      const computedRows = rows.map((row) => {
          const prValue = prByStudentId[row.student.id] ?? '-';
          const probValue = admissionProbabilities[row.student.id] || '-';
          const prSortValue = prValue === '-' ? -1 : prValue;
          const probNumeric = probValue === '-' ? -1 : Number(probValue);
          const probSortValue = isNaN(probNumeric) ? -1 : probNumeric;

          return {
              ...row,
              prValue,
              probValue,
              prSortValue,
              probSortValue
          };
      });

      if (sortByPR) {
          computedRows.sort((a, b) => b.prSortValue - a.prSortValue);
      } else if (sortByProb) {
          computedRows.sort((a, b) => b.probSortValue - a.probSortValue);
      }

      return computedRows;
  }, [allStudentsData, batchDate, teacherClassFilter, getTestDateID, sortByPR, sortByProb, admissionProbabilities]);


  const openStatsModal = (date, grades, className) => {
      setStatsModalData({
          date,
          className: className || 'A班',
          total: calculateDistribution(date, 'total', grades.total, availableDates, className),
          chi: calculateDistribution(date, 'chi', grades.chi, availableDates, className),
          eng: calculateDistribution(date, 'eng', grades.eng, availableDates, className),
          math: calculateDistribution(date, 'math', grades.math, availableDates, className),
          myGrades: grades
      });
  };

  const parentProbVisual = useMemo(
      () => getProbabilityVisual(viewData?.prob, darkMode),
      [viewData, darkMode]
  );

  const statsSummary = useMemo(() => {
      if (!statsModalData) return null;
      const distribution = statsModalData[statsActiveTab] || [];
      const sampleCount = distribution.reduce((sum, bucket) => sum + (bucket.count || 0), 0);
      const myRange = distribution.find((bucket) => bucket.isMyRange)?.range || '-';
      const peakBucket = distribution.reduce((top, bucket) => {
          if (!top || (bucket.count || 0) > (top.count || 0)) return bucket;
          return top;
      }, null);

      return {
          sampleCount,
          myRange,
          peakRange: peakBucket?.range || '-',
          peakCount: peakBucket?.count || 0
      };
  }, [statsModalData, statsActiveTab]);

  if (!user && !db) return <div className="flex items-center justify-center h-screen bg-slate-50 text-slate-400 text-sm font-mono tracking-widest uppercase">Initializing...</div>;
  if (!user) return <div className="flex items-center justify-center h-screen bg-slate-50 text-slate-400 text-sm font-mono tracking-widest uppercase">Connecting...</div>;

  return (
    <div className={`min-h-screen font-sans antialiased transition-colors duration-500 ease-in-out pb-32 relative overflow-x-hidden ${darkMode ? 'bg-[#111714] text-slate-200' : 'bg-[#f5f5f7] text-slate-800'}`}>
      {mode === 'landing' && (
        <div
          className="fixed inset-0 pointer-events-none z-0"
          style={darkMode ? {
            backgroundImage: 'radial-gradient(circle at 13% 18%, rgba(16,185,129,0.38) 0%, transparent 42%), radial-gradient(circle at 86% 10%, rgba(110,231,183,0.3) 0%, transparent 35%), radial-gradient(circle at 50% 100%, rgba(22,163,74,0.18) 0%, transparent 42%)'
          } : {
            backgroundImage: 'radial-gradient(circle at 12% 16%, rgba(16,185,129,0.24) 0%, transparent 44%), radial-gradient(circle at 88% 10%, rgba(5,150,105,0.18) 0%, transparent 34%), radial-gradient(circle at 52% 100%, rgba(16,185,129,0.12) 0%, transparent 40%)'
          }}
        />
      )}

      {/* Header */}
      <header className={`fixed top-0 w-full backdrop-blur-2xl z-30 border-b transition-all duration-300 ${darkMode ? 'bg-[#121a17]/88 border-emerald-200/10 shadow-lg shadow-black/25' : 'bg-white/90 border-slate-200/80 shadow-sm'}`}>
        <div className="max-w-4xl mx-auto px-6 h-16 flex justify-between items-center relative z-10">
          <div className="flex items-center gap-3 cursor-pointer group" onClick={() => setMode('landing')}>
            <div className={`p-2 rounded-xl transition-transform group-hover:scale-105 duration-300 ${darkMode ? 'bg-emerald-500/10 text-emerald-200 ring-1 ring-emerald-300/35' : 'bg-white text-blue-600 ring-1 ring-slate-200 shadow-sm'}`}><GraduationCap className="h-5 w-5" /></div>
            <div>
                <h1 className={`text-2xl font-black tracking-widest font-serif uppercase leading-none bg-clip-text text-transparent ${darkMode ? 'bg-gradient-to-r from-emerald-50 via-emerald-200 to-lime-200' : 'bg-gradient-to-r from-slate-800 via-blue-700 to-cyan-600'}`}>
                  HSINRU
                </h1>
                <p className="text-[9px] text-slate-400 font-bold tracking-widest uppercase mt-0.5 opacity-80">Grade Tracker</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={toggleDarkMode} className={`p-2 rounded-full transition-colors active:scale-95 duration-200 ${darkMode ? 'text-yellow-400 hover:bg-white/5' : 'text-slate-500 hover:bg-white/40'}`}>
                {darkMode ? <Moon className="w-4 h-4 fill-current"/> : <Sun className="w-4 h-4"/>}
            </button>
            <div className={`flex p-1 rounded-full border backdrop-blur-md ${darkMode ? 'bg-white/5 border-white/5 shadow-inner' : 'bg-white/40 border-white/40 shadow-inner'}`}>
                <button onClick={() => isAuthenticated ? setMode('teacher') : setMode('teacher_login')} className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all duration-300 ${mode.includes('teacher') ? (darkMode ? 'bg-[#1c2722] text-emerald-300 shadow-lg shadow-black/35 ring-1 ring-emerald-200/20' : 'bg-white text-blue-700 shadow-md shadow-slate-200/50 ring-1 ring-black/5') : 'text-slate-400 hover:text-slate-500'}`}>{isAuthenticated ? '後台' : '老師'}</button>
                <button onClick={() => { setViewData(null); setSearchError(''); setMode('parent'); }} className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all duration-300 ${mode === 'parent' ? (darkMode ? 'bg-[#1c2722] text-emerald-300 shadow-lg shadow-black/35 ring-1 ring-emerald-200/20' : 'bg-white text-blue-700 shadow-md shadow-slate-200/50 ring-1 ring-black/5') : 'text-slate-400 hover:text-slate-500'}`}>家長</button>
            </div>
            {isAuthenticated && (
                <button onClick={handleLogout} className="ml-1 p-2 text-red-400 hover:text-red-500 hover:bg-red-500/10 rounded-full transition-colors" title="登出"><LogOut className="w-5 h-5"/></button>
            )}
          </div>
        </div>
      </header>

      <main className="pt-28 px-4 max-w-4xl mx-auto relative z-10">
        {mode === 'landing' && (
          <div className="flex flex-col items-center justify-center min-h-[calc(100vh-120px)]">
            <div className={`relative w-full max-w-3xl rounded-[2.5rem] overflow-hidden ${darkMode ? 'bg-[#121b17]/92 shadow-[0_18px_50px_rgba(0,0,0,0.28)]' : 'bg-white/96 shadow-[0_16px_44px_rgba(15,23,42,0.09)]'}`}>
              <div
                className="pointer-events-none absolute inset-0"
                style={darkMode ? {
                  backgroundImage: 'radial-gradient(circle at 10% 8%, rgba(16,185,129,0.62) 0%, rgba(16,185,129,0) 44%), radial-gradient(circle at 90% 12%, rgba(110,231,183,0.52) 0%, rgba(110,231,183,0) 37%), linear-gradient(152deg, rgba(20,35,28,0.08) 0%, rgba(6,15,11,0.56) 85%)'
                } : {
                  backgroundImage: 'radial-gradient(circle at 10% 10%, rgba(16,185,129,0.4) 0%, transparent 46%), radial-gradient(circle at 90% 12%, rgba(5,150,105,0.32) 0%, transparent 36%), linear-gradient(150deg, rgba(236,253,245,0.84) 0%, rgba(255,255,255,0.97) 74%)'
                }}
              />

              <div className="relative z-10 flex flex-col items-center justify-center px-6 py-12 md:py-14">
                <div className={`p-5 rounded-full mb-6 ring-1 backdrop-blur-xl transition-transform duration-700 hover:scale-105 ${darkMode ? 'bg-gradient-to-br from-emerald-500/28 to-green-400/16 ring-emerald-200/40' : 'bg-gradient-to-br from-emerald-100 to-green-100 ring-emerald-200 shadow-sm'}`}>
                    <Sparkles className={`w-10 h-10 ${darkMode ? 'text-emerald-100' : 'text-emerald-700'}`} />
                </div>
                <h2 className={`text-[2.05rem] md:text-[3.45rem] font-black font-serif tracking-tight mb-4 text-center leading-[1.16] bg-clip-text text-transparent ${darkMode ? 'bg-gradient-to-r from-emerald-50 via-emerald-200 to-lime-200' : 'bg-gradient-to-r from-slate-900 via-emerald-700 to-green-600'}`}>Make Progress Visible</h2>
                <p className={`text-xs font-semibold tracking-[0.18em] mb-6 uppercase ${darkMode ? 'text-emerald-100/75' : 'text-slate-500'}`}>2025-2026 Learning Journey</p>
                <ExamCountdown isDarkMode={darkMode} />
                  
                <div className="w-full max-w-md space-y-4 mt-8">
                   <button onClick={() => isAuthenticated ? setMode('teacher') : setMode('teacher_login')} className={`group w-full p-5 rounded-[1.5rem] border flex items-center gap-5 hover:scale-[1.01] active:scale-[0.98] transition-all duration-300 backdrop-blur-xl ${darkMode ? 'bg-[#121c17]/88 border-emerald-200/18 hover:border-emerald-300/45 shadow-lg shadow-black/30' : 'bg-gradient-to-br from-white to-slate-50 border-slate-200/80 hover:border-emerald-200 shadow-sm'}`}>
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-colors shadow-inner ${darkMode ? 'bg-gradient-to-br from-emerald-500/30 to-green-400/20 text-emerald-200 ring-1 ring-emerald-200/35' : 'bg-gradient-to-br from-emerald-100 to-green-100 text-emerald-700'}`}><LayoutDashboard className="w-6 h-6" /></div>
                      <div className="text-left flex-1"><h3 className={`text-lg font-bold ${darkMode ? 'text-slate-100' : 'text-slate-800'}`}>老師通道</h3><p className="text-xs text-slate-400 mt-0.5">管理成績與設定</p></div>
                      <ChevronRight className="w-5 h-5 text-slate-400 opacity-50 group-hover:opacity-100 group-hover:translate-x-1 transition-all"/>
                   </button>
                   <button onClick={() => { setViewData(null); setSearchError(''); setMode('parent'); }} className={`group w-full p-5 rounded-[1.5rem] border flex items-center gap-5 hover:scale-[1.01] active:scale-[0.98] transition-all duration-300 backdrop-blur-xl ${darkMode ? 'bg-[#121c17]/88 border-emerald-200/18 hover:border-emerald-300/45 shadow-lg shadow-black/30' : 'bg-gradient-to-br from-white to-slate-50 border-slate-200/80 hover:border-emerald-200 shadow-sm'}`}>
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-colors shadow-inner ${darkMode ? 'bg-gradient-to-br from-emerald-500/30 to-green-400/20 text-emerald-200 ring-1 ring-emerald-200/35' : 'bg-gradient-to-br from-emerald-100 to-green-100 text-emerald-700'}`}><BarChart3 className="w-6 h-6" /></div>
                      <div className="text-left flex-1"><h3 className={`text-lg font-bold ${darkMode ? 'text-slate-100' : 'text-slate-800'}`}>家長查詢</h3><p className="text-xs text-slate-400 mt-0.5">輸入學號查看分析</p></div>
                      <ChevronRight className="w-5 h-5 text-slate-400 opacity-50 group-hover:opacity-100 group-hover:translate-x-1 transition-all"/>
                   </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {mode === 'teacher_login' && (
            <div className="flex items-center justify-center min-h-[50vh]">
                <div className={`backdrop-blur-2xl p-8 rounded-[2.5rem] w-full max-w-sm text-center border ${darkMode ? 'bg-[#111827]/88 border-white/10 shadow-lg shadow-black/35' : 'bg-white/94 border-slate-200/80 shadow-sm'}`}>
                    <div className={`inline-flex p-4 rounded-2xl mb-6 shadow-inner ${darkMode ? 'bg-blue-500/10 text-blue-400 ring-1 ring-blue-500/20' : 'bg-blue-50 text-blue-600'}`}><Lock className="w-6 h-6" /></div>
                    <h2 className={`text-xl font-bold mb-6 ${darkMode ? 'text-white' : 'text-slate-800'}`}>身份驗證</h2>
                    <input type="password" value={passwordInput} onChange={(e) => { setPasswordInput(e.target.value); setLoginError(false); }} onKeyDown={(e) => e.key === 'Enter' && handleLoginSubmit()} className={`w-full p-4 rounded-2xl text-center text-xl font-bold tracking-widest outline-none transition-all mb-6 placeholder:text-base placeholder:tracking-normal placeholder:font-medium border shadow-inner ${darkMode ? 'bg-[#020617]/50 border-white/5 text-white focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20' : 'bg-slate-50 border-transparent text-slate-800 focus:bg-white focus:ring-2 focus:ring-blue-100 placeholder:text-slate-400'}`} placeholder="輸入密碼" autoFocus />
                    {loginError && <p className="text-red-500 text-xs font-bold mb-4">密碼錯誤</p>}
                    <button onClick={handleLoginSubmit} className="w-full bg-blue-600 hover:bg-blue-500 text-white py-3.5 rounded-2xl font-bold shadow-sm active:scale-[0.98] transition-all">登入</button>
                </div>
            </div>
        )}

        {mode === 'teacher' && (
          <div className="space-y-6">
            <div className={`p-6 rounded-[2rem] border backdrop-blur-2xl ${darkMode ? 'bg-[#0f172a]/70 border-white/10 shadow-xl shadow-black/20 ring-1 ring-white/5' : 'bg-white/70 border-white/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)]'}`}>
                <div className="flex justify-between items-center mb-4">
                    <div className={`flex items-center gap-2 font-bold ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}><Calendar className="w-4 h-4 text-blue-500"/>管理日期</div>
                    <div className="flex gap-2">
                         <input type="text" placeholder="MM/DD" className={`w-20 p-2 rounded-lg text-xs text-center font-bold outline-none transition-colors tracking-widest border shadow-sm ${darkMode ? 'bg-[#020617]/50 border-white/10 text-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20' : 'bg-white border-slate-200 text-slate-700 focus:border-blue-400'}`} value={newDateInput} onChange={e=>setNewDateInput(e.target.value)} />
                         <button onClick={addDate} className={`px-3 rounded-lg transition-colors shadow-sm ${darkMode ? 'bg-slate-800 text-white hover:bg-slate-700 border border-white/5' : 'bg-slate-800 text-white hover:bg-slate-700'}`}><Plus className="w-4 h-4"/></button>
                    </div>
                </div>
                <div className={`flex flex-wrap gap-2 max-h-24 overflow-y-auto p-2 rounded-xl border mb-6 no-scrollbar shadow-inner ${darkMode ? 'bg-[#020617]/30 border-white/5' : 'bg-slate-50/50 border-slate-200/60'}`}>
                    {sortedAvailableDatesDesc.map(d => (
                        <div key={d} className={`flex items-center px-2.5 py-1 rounded-lg text-[10px] font-bold border shadow-sm ${darkMode ? 'bg-slate-800 text-slate-300 border-white/5' : 'bg-white text-slate-600 border-slate-100'}`}>
                            {getWeekendDisplayLabel(d)} <button onClick={() => { setDeleteTarget(d); executeWithSecurity(confirmDeleteDate); }} className="ml-1.5 text-slate-400 hover:text-red-500"><X className="w-3 h-3"/></button>
                        </div>
                    ))}
                </div>

                <div className={`flex p-1 rounded-xl mb-6 shadow-inner ${darkMode ? 'bg-[#020617]/50' : 'bg-slate-100/80'}`}>
                     <button onClick={() => setTeacherViewMode('single')} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${teacherViewMode==='single' ? (darkMode ? 'bg-slate-800 text-slate-200 shadow-md border border-white/5 ring-1 ring-white/5' : 'bg-white text-slate-700 shadow-sm') : 'text-slate-500'}`}>個人檢視</button>
                     <button onClick={() => setTeacherViewMode('batch')} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${teacherViewMode==='batch' ? (darkMode ? 'bg-slate-800 text-blue-400 shadow-md border border-white/5 ring-1 ring-white/5' : 'bg-white text-blue-700 shadow-sm') : 'text-slate-500'}`}>批量檢視</button>
                </div>

                {teacherViewMode === 'single' && (
                    <div className="flex flex-col gap-4">
                        <div className="flex gap-2">
                            <div className="relative flex-1">
                                <input id="loadIdInput" type="text" placeholder="輸入學號..." className={`w-full p-3 pl-9 rounded-xl border text-sm font-bold outline-none uppercase tracking-widest placeholder:tracking-normal text-center shadow-inner transition-all ${darkMode ? 'bg-[#020617]/50 border-white/5 text-slate-200 focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20' : 'bg-white border-slate-200 text-slate-700 focus:border-blue-300 focus:ring-2 focus:ring-blue-100'}`} />
                                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
                            </div>
                            <button onClick={() => document.getElementById('loadIdInput').value && loadStudentForTeacher(document.getElementById('loadIdInput').value.toUpperCase())} className={`px-4 rounded-xl text-xs font-bold whitespace-nowrap transition-colors shadow-sm border ${darkMode ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-white/5' : 'bg-white hover:bg-slate-50 text-slate-600 border-slate-200'}`}>載入</button>
                        </div>
                        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                            <button onClick={() => setShowAddStudentModal(true)} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-3 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-blue-600/20 active:scale-[0.98] transition-all whitespace-nowrap"><UserPlus className="w-4 h-4"/> 新增學生</button>
                            <label className="cursor-pointer bg-blue-600 hover:bg-blue-500 text-white px-4 py-3 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-blue-600/20 active:scale-[0.98] transition-all whitespace-nowrap">
                                <FileSpreadsheet className="w-4 h-4" /> 匯入 Excel
                                <input type="file" accept=".xlsx, .xls" className="hidden" onChange={handleExcelUpload} />
                            </label>
                            <button onClick={() => setShowAvgModal(true)} className={`px-4 py-3 rounded-xl text-xs font-bold flex items-center gap-1.5 whitespace-nowrap transition-colors border ${darkMode ? 'text-indigo-300 bg-indigo-500/10 border-indigo-500/20 hover:bg-indigo-500/20' : 'text-indigo-700 bg-white border-indigo-100 hover:bg-indigo-50 shadow-sm'}`}><Edit3 className="w-4 h-4"/> 平均設定</button>
                        </div>
                    </div>
                )}

                {teacherViewMode === 'batch' && (
                    <div className="pt-2">
                        <div className="flex justify-between items-center mb-4">
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-slate-500">日期</span>
                                <select className={`border rounded-lg px-2 py-1.5 text-xs font-bold outline-none shadow-sm ${darkMode ? 'bg-[#020617]/50 border-white/10 text-slate-300' : 'bg-white border-slate-200 text-slate-700'}`} value={batchDate} onChange={(e) => setBatchDate(e.target.value)}>
                                    {sortedAvailableDatesDesc.map(d => <option key={d} value={d}>{getWeekendDisplayLabel(d)}</option>)}
                                </select>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={() => setSortByPR(!sortByPR)} className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 transition-all shadow-sm ${sortByPR ? 'bg-indigo-600 text-white shadow-indigo-500/30' : (darkMode ? 'bg-slate-800 text-slate-400 border border-white/5' : 'bg-white text-slate-600 border border-slate-200')}`}>
                                    <ArrowDownWideNarrow className="w-3.5 h-3.5" /> PR排序
                                </button>
                                <button onClick={() => setSortByProb(!sortByProb)} className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 transition-all shadow-sm ${sortByProb ? 'bg-blue-600 text-white shadow-blue-500/30' : (darkMode ? 'bg-slate-800 text-slate-400 border border-white/5' : 'bg-white text-slate-600 border border-slate-200')}`}>
                                    <Percent className="w-3.5 h-3.5" /> 機率排序
                                </button>
                                <button onClick={handleSaveBatchGrades} className="bg-blue-600 text-white px-4 py-1.5 rounded-lg text-xs font-bold shadow-md shadow-blue-600/20 hover:bg-blue-500 transition-all active:scale-[0.98] flex items-center gap-1"><Save className="w-3.5 h-3.5"/> 儲存</button>
                            </div>
                        </div>

                        {/* Class Filter Tabs */}
                        <div className={`flex p-1 mb-4 rounded-xl border overflow-x-auto justify-center shadow-inner ${darkMode ? 'bg-[#020617]/50 border-white/5' : 'bg-slate-50 border-slate-100'}`}>
                            {CLASS_DEFS.map(c => (
                                <button key={c.id} onClick={() => setTeacherClassFilter(c.id)} className={`flex-1 whitespace-nowrap px-3 py-2 text-xs font-bold rounded-lg transition-all ${teacherClassFilter === c.id ? (darkMode ? 'bg-slate-800 text-white shadow-md border border-white/5 ring-1 ring-white/5' : 'bg-white text-slate-700 shadow-sm border border-slate-200/50') : 'text-slate-500 hover:text-slate-400'}`}>{c.label}</button>
                            ))}
                        </div>

                        {/* Fix: Overflow handling for mobile */}
                        <div className={`overflow-x-auto rounded-xl border shadow-inner ${darkMode ? 'border-white/5 bg-[#020617]/30' : 'border-slate-200 bg-white'}`}>
                            <table className="w-full text-sm text-left min-w-[500px]">
                                <thead className={`text-[10px] uppercase sticky top-0 z-10 ${darkMode ? 'text-slate-400 bg-slate-900' : 'text-slate-400 bg-slate-50'}`}>
                                    <tr>
                                        <th className="px-3 py-3 font-bold w-12">#</th>
                                        <th className="px-3 py-3 font-bold">學號</th>
                                        <th className="px-3 py-3 font-bold">姓名</th>
                                        <th className="px-2 py-3 text-center text-slate-500">班級</th>
                                        <th className="px-2 py-3 text-center text-rose-500">國文</th>
                                        <th className="px-2 py-3 text-center text-amber-500">英文</th>
                                        <th className="px-2 py-3 text-center text-cyan-500">數學</th>
                                        <th className="px-2 py-3 text-center font-bold text-blue-500">總分</th>
                                        <th className="px-2 py-3 text-center font-bold text-indigo-500">PR</th>
                                        <th className="px-2 py-3 text-center font-bold text-slate-500">錄取機率</th>
                                    </tr>
                                </thead>
                                <tbody className={`divide-y ${darkMode ? 'divide-slate-800' : 'divide-slate-100'}`}>
                                    {batchRowsForDisplay.map((row, sIndex) => (
                                        <BatchRow 
                                            key={row.student.id} 
                                            student={row.student} 
                                            sIndex={sIndex} 
                                            dateGrades={row.dateGrades} 
                                            prValue={row.prValue}
                                            probValue={row.probValue}
                                            darkMode={darkMode} 
                                            handleBatchGradeChange={handleBatchGradeChange} 
                                            handleKeyDown={handleKeyDown} 
                                            handlePaste={handlePaste} 
                                        />
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
            {/* ... other modals ... */}
            {statusMsg && <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-900/90 text-white px-5 py-3 rounded-full flex items-center text-xs font-bold shadow-2xl backdrop-blur-md z-50 border border-white/10"><Check className="w-4 h-4 mr-2 text-blue-400" /> {statusMsg}</div>}
              
            {/* ... Single View ... */}
            {teacherViewMode === 'single' && currentStudentId && !loading && (
              <div className={`rounded-[2rem] shadow-2xl border overflow-hidden backdrop-blur-md ${darkMode ? 'bg-[#0f172a]/70 border-white/10 ring-1 ring-white/5' : 'bg-white/80 border-white/60'}`}>
                <div className={`p-6 border-b flex justify-between items-center ${darkMode ? 'border-white/5 bg-[#0f172a]/50' : 'border-slate-50 bg-white/50'}`}>
                  <div className="flex-1 mr-4">
                      <input type="text" value={studentName} onChange={(e) => setStudentName(e.target.value)} className={`text-2xl font-bold bg-transparent border-none outline-none w-full transition-all tracking-tight ${darkMode ? 'text-white placeholder:text-slate-700' : 'text-slate-800 placeholder:text-slate-200'}`} placeholder="學生姓名"/>
                      <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border mt-1 inline-block opacity-60 ${darkMode ? 'border-slate-600 text-slate-400' : 'border-slate-200 text-slate-400'}`}>{currentStudentId}</span>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => { setStudentToDelete({ id: currentStudentId, name: studentName }); executeWithSecurity(confirmDeleteStudent); }} className="bg-red-500/10 text-red-500 p-2.5 rounded-xl hover:bg-red-500/20 transition-colors active:scale-95"><Trash2 className="w-5 h-5"/></button>
                    <button onClick={handleSaveGrades} className="bg-blue-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-blue-500 shadow-lg shadow-blue-900/20 transition-all active:scale-95 flex items-center gap-2"><Save className="w-4 h-4"/> 儲存</button>
                  </div>
                </div>
                <div className="max-h-[60vh] overflow-y-auto">
                    <table className={`w-full text-sm text-left ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                        <thead className={`text-[10px] uppercase sticky top-0 z-10 backdrop-blur-md ${darkMode ? 'text-slate-500 bg-[#020617]/90' : 'text-slate-400 bg-white/90'}`}>
                            <tr>
                                <th className="px-4 py-3 font-bold">日期</th>
                                <th className="px-2 py-3 text-center text-rose-500 font-bold">國文</th>
                                <th className="px-2 py-3 text-center text-amber-500 font-bold">英文</th>
                                <th className="px-2 py-3 text-center text-cyan-500 font-bold">數學</th>
                                <th className="px-2 py-3 text-center font-bold text-blue-500">總分</th>
                            </tr>
                        </thead>
                        <tbody className={`divide-y ${darkMode ? 'divide-white/5' : 'divide-slate-100'}`}>
                            {sortedAvailableDatesDesc.map((date, dateIndex) => {
                                const g = grades[date] || { chi: '', eng: '', math: '', total: '', class: 'A班' };
                                return (
                                    <tr key={date} className={`${darkMode ? 'hover:bg-white/5' : 'hover:bg-slate-50/80'} transition-colors`}>
                                            <td className="px-4 py-3 font-mono text-xs font-bold opacity-60">{getWeekendDisplayLabel(date)}</td>
                                            <td className="px-2 py-2 text-center">
                                                <select 
                                                    value={g.class || 'A班'} 
                                                    onChange={(e) => handleGradeChange(date, 'class', e.target.value)}
                                                    className={`w-full text-center p-2 rounded-lg bg-transparent border border-transparent outline-none text-base font-bold transition-all cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 ${darkMode ? 'text-slate-200 focus:bg-slate-800' : 'text-slate-700 focus:bg-white'}`}
                                                >
                                                    {CLASS_DEFS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                                                </select>
                                            </td>
                                            {['chi', 'eng', 'math'].map(sub => (
                                                <td key={sub} className="px-2 py-2 text-center">
                                                    <input id={`single-${dateIndex}-${sub}`} type="text" className={`w-full text-center p-2 rounded-lg bg-transparent border border-transparent outline-none text-base font-bold transition-all ${darkMode ? 'focus:bg-slate-800 focus:border-blue-500/50 text-slate-200' : 'focus:bg-white focus:border-blue-200 text-slate-700'}`} value={g[sub]} onChange={(e) => handleGradeChange(date, sub, e.target.value)} onKeyDown={(e) => handleSingleKeyDown(e, dateIndex, sub)} onPaste={(e) => handleSinglePaste(e, dateIndex, sub)} placeholder="-" />
                                                </td>
                                            ))}
                                            <td className="px-2 py-2 text-center"><div className="text-base font-bold text-blue-500 py-2">{g.total}</div></td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ... Parent View ... */}
        {mode === 'parent' && (
          <div className="max-w-md mx-auto space-y-6 pt-10"> 
            {!viewData && (
            <div className={`backdrop-blur-2xl p-8 rounded-[2.5rem] shadow-2xl border text-center relative overflow-hidden ${darkMode ? 'bg-[#121c17]/88 border-emerald-200/15 shadow-black/30' : 'bg-white/94 border-slate-200/80 shadow-sm'}`}>
              <div className="absolute top-0 left-0 w-full h-1 bg-emerald-500/80"></div>
              <h2 className={`text-2xl font-bold mb-8 tracking-tight ${darkMode ? 'text-white' : 'text-slate-800'}`}>查詢成績</h2>
              <div className={`w-full p-2 rounded-2xl border transition-all mb-6 shadow-inner ${darkMode ? 'bg-[#08120d]/70 border-emerald-200/15 focus-within:ring-2 focus-within:ring-emerald-500/20' : 'bg-slate-50 border-slate-200 focus-within:bg-white focus-within:ring-2 focus-within:ring-blue-100'}`}>
                <input type="text" placeholder="請輸入學號" className={`w-full bg-transparent border-none px-4 py-3 outline-none text-xl uppercase font-bold text-center tracking-widest placeholder:text-base placeholder:tracking-normal placeholder:font-medium ${darkMode ? 'text-white placeholder:text-slate-600' : 'text-slate-800 placeholder:text-slate-400'}`} value={searchId} onChange={(e) => setSearchId(e.target.value)} />
              </div>
              <button onClick={handleParentSearch} disabled={loading} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-4 rounded-2xl font-bold text-lg shadow-sm transition-all active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100 tracking-wide">{loading ? '查詢中...' : '開始查詢'}</button>
              {searchError && <p className="mt-6 text-red-500 text-xs font-bold bg-red-500/10 inline-block px-4 py-2 rounded-full animate-pulse">{searchError}</p>}
            </div>
            )}

            {viewData && (
              <div className={`rounded-[2.5rem] shadow-2xl overflow-hidden border backdrop-blur-2xl ${darkMode ? 'bg-[#121c17]/88 border-emerald-200/15 shadow-black/30' : 'bg-white/95 border-slate-200/80 shadow-sm'}`}>
                <div className={`p-8 pb-6 relative overflow-hidden ${darkMode ? 'bg-[#0d1712] text-white border-b border-emerald-200/10' : 'bg-gradient-to-r from-emerald-50 to-white text-slate-800 border-b border-slate-100'}`}>
                   <div className={`absolute top-0 right-0 w-64 h-64 rounded-full -mr-20 -mt-20 blur-3xl ${darkMode ? 'bg-emerald-500 opacity-20' : 'bg-emerald-300 opacity-25'}`}></div>
                   
                   <div className="relative z-10 flex justify-between items-start mb-6">
                       {/* Left Side: Name & ID */}
                       <div>
                           <div className={`text-[9px] font-bold uppercase tracking-widest mb-2 border inline-block px-2 py-1 rounded ${darkMode ? 'text-emerald-300 border-emerald-300/25' : 'text-emerald-700 border-emerald-200'}`}>Student Profile</div>
                           <h3 className={`text-3xl font-bold tracking-tighter ${darkMode ? 'text-white' : 'text-slate-800'}`}>{viewData.name}</h3>
                           <p className="font-mono text-xs mt-1 font-bold text-slate-500">{viewData.id}</p>
                       </div>

                       {/* Right Side: Logout & Prob */}
                       <div className="flex flex-col items-end gap-4">
                           <button onClick={() => setViewData(null)} className={`p-2 rounded-full backdrop-blur-md transition-colors ${darkMode ? 'text-slate-400 hover:text-white bg-white/5' : 'text-slate-500 hover:text-slate-700 bg-white/70 border border-slate-200'}`}><LogOut className="w-4 h-4"/></button>
                           
                           {/* --- NEW PROBABILITY DISPLAY --- */}
                           {viewData.prob && viewData.prob !== '-' && (
                               <div className="text-right mt-2">
                                   <div className={`text-[10px] font-bold uppercase tracking-widest mb-0.5 ${darkMode ? 'text-emerald-300/80' : 'text-emerald-700/80'}`}>錄取機率</div>
                                   <div className="text-4xl font-black flex items-baseline justify-end gap-1" style={parentProbVisual ? parentProbVisual.textStyle : undefined}>
                                       {viewData.prob}<span className="text-lg font-bold" style={parentProbVisual ? parentProbVisual.textStyle : undefined}>%</span>
                                   </div>
                                   <div className="mt-1 flex items-center justify-end gap-1.5 opacity-50">
                                        <p className={`text-[9px] font-medium ${darkMode ? 'text-slate-300' : 'text-slate-500'}`}>
                                            系統綜合歷史成績運算，<span className={`${darkMode ? 'text-white/90 border-white/20' : 'text-slate-700 border-slate-300'} border-b pb-0.5`}>僅供參考</span>
                                        </p>
                                   </div>
                               </div>
                           )}
                       </div>
                   </div>
                </div>

                <div className="p-6">
                  {hasPriorHistory && (
                  <div className={`flex p-1 mb-6 rounded-xl border overflow-x-auto justify-center shadow-inner ${darkMode ? 'bg-[#08120d]/70 border-emerald-200/10' : 'bg-slate-50 border-slate-100'}`}>
                      {PHASES.map(phase => (
                          <button key={phase.id} onClick={() => setActivePhase(phase.id)} className={`flex-1 whitespace-nowrap px-3 py-2 text-xs font-bold rounded-lg transition-all ${activePhase === phase.id ? (darkMode ? 'bg-[#1f2a24] text-emerald-100 shadow-md border border-emerald-200/20 ring-1 ring-emerald-200/10' : 'bg-white text-slate-800 shadow-sm border border-slate-100') : 'text-slate-500 hover:text-slate-400'}`}>{phase.name}</button>
                      ))}
                  </div>
                  )}

                  <ParentAbilityRadar data={parentRadarData} maxValue={parentRadarMax} isDarkMode={darkMode} />

                  <div className={`flex p-1 rounded-2xl mb-8 justify-center shadow-inner ${darkMode ? 'bg-[#08120d]/70' : 'bg-slate-100'}`}>
                      {['總分', '國文', '英文', '數學'].map(tab => {
                          const tabKey = tab === '總分' ? 'total' : tab === '國文' ? 'chi' : tab === '英文' ? 'eng' : 'math';
                          const isActive = activeTab === tabKey;
                          return (
                              <button key={tabKey} onClick={() => setActiveTab(tabKey)} className={`flex-1 py-2.5 text-xs font-bold rounded-xl transition-all duration-300 ${isActive ? (darkMode ? 'bg-[#1f2a24] text-emerald-100 shadow-md border border-emerald-200/15 ring-1 ring-emerald-200/10' : 'bg-white text-slate-800 shadow-sm border border-slate-100') : 'text-slate-400'}`}>
                                {isActive && <span className={`inline-block w-1.5 h-1.5 rounded-full ${TAB_DOT_BG_CLASS[tabKey]} mr-1.5 mb-0.5`}></span>}{tab}
                              </button>
                          )
                      })}
                  </div>

                  {activeTab === 'total' && <SingleSubjectChart data={parentPhaseData} subjectKey="total" avgKey="avgTotal" colorKey="total" title="總分" domain={[0, 300]} isDarkMode={darkMode} />}
                  {activeTab === 'chi' && <SingleSubjectChart data={parentPhaseData} subjectKey="chi" avgKey="avgChi" colorKey="chi" title="國文" domain={[0, 100]} isDarkMode={darkMode} />}
                  {activeTab === 'eng' && <SingleSubjectChart data={parentPhaseData} subjectKey="eng" avgKey="avgEng" colorKey="eng" title="英文" domain={activePhase === 'mock' ? [0, 80] : [0, 100]} isDarkMode={darkMode} />}
                  {activeTab === 'math' && <SingleSubjectChart data={parentPhaseData} subjectKey="math" avgKey="avgMath" colorKey="math" title="數學" domain={activePhase === 'mock' ? [0, 120] : [0, 100]} isDarkMode={darkMode} />}
                </div>
                  
                <div className={`p-6 border-t ${darkMode ? 'bg-[#101a15] border-emerald-200/10' : 'bg-white border-slate-50'}`}>
                    <h4 className={`font-bold mb-6 text-xs flex items-center justify-center gap-2 tracking-widest uppercase ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>詳細紀錄</h4>
                    <div className="space-y-4">
                        {parentPhaseData.slice().reverse().map((d) => {
                             // 使用 weekendID（如果存在）或 date，確保日A班/日B班的週日日期也能正確計算排名
                             const dateForRank = d.weekendID || d.date;
                             const totalRank = calculateRank(dateForRank, 'total', d.total, d.class);
                             const globalPR = calculateGlobalPR(dateForRank, 'total', d.total);
                             return (
                             <div key={d.date} className={`group p-5 rounded-3xl border transition-all duration-300 ${darkMode ? 'bg-white/5 border-white/5 hover:border-blue-500/20' : 'bg-white border-slate-100 hover:border-blue-200 hover:shadow-lg hover:shadow-blue-50/20'}`}>
                                <div className="flex justify-between items-start mb-4">
                                    <div className="flex flex-col gap-2 items-start">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-bold text-slate-400 font-mono">{d.date}</span>
                                            {d.class && <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold opacity-60 ${darkMode ? 'bg-white/10 text-white' : 'bg-slate-100 text-slate-600'}`}>{d.class}</span>}
                                        </div>
                                        <button onClick={() => openStatsModal(dateForRank, { total: d.total, chi: d.chi, eng: d.eng, math: d.math }, d.class)} className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all hover:scale-105 active:scale-95 shadow-md shadow-slate-200/50 dark:shadow-none bg-slate-700 text-white hover:bg-slate-600 border border-white/10`}>
                                            <BarChart2 className="w-3.5 h-3.5" /> 
                                            查看落點分析
                                            <ChevronRight className="w-3 h-3 opacity-80" />
                                        </button>
                                    </div>
                                    <div className="text-right">
                                        <div className={`text-3xl font-bold tracking-tighter text-blue-500`}>{f1(d.total)}</div>
                                        <div className="flex items-center justify-end gap-2 mt-1">
                                            {totalRank !== '-' && <span className="bg-amber-100 text-amber-700 text-[10px] px-1.5 py-0.5 rounded font-bold flex items-center gap-0.5"><Trophy className="w-3 h-3"/> #{totalRank}</span>}
                                            {globalPR !== null && globalPR !== '-' && <span className="bg-indigo-100 text-indigo-700 text-[10px] px-1.5 py-0.5 rounded font-bold flex items-center gap-0.5">本部PR {globalPR}</span>}
                                        </div>
                                        {d.avgTotal && <div className="text-[10px] font-bold text-slate-400 tracking-wide text-right mt-1">Avg {f1(d.avgTotal)}</div>}
                                    </div>
                                </div>
                                <div className={`grid grid-cols-3 gap-2 mt-3 pt-3 border-t ${darkMode ? 'border-white/5' : 'border-slate-50'}`}>
                                    {['chi', 'eng', 'math'].map(sub => {
                                        const subColor = sub === 'chi' ? 'text-rose-500' : sub === 'eng' ? 'text-amber-500' : 'text-cyan-500';
                                        const subLabel = sub === 'chi' ? '國文' : sub === 'eng' ? '英文' : '數學';
                                        const subScore = d[sub];
                                        const subRank = calculateRank(dateForRank, sub, subScore, d.class);
                                        return (
                                            <div key={sub} className={`rounded-2xl p-2 text-center ${darkMode ? 'bg-slate-900' : 'bg-slate-50/50'}`}>
                                                <div className={`text-[9px] font-bold opacity-80 mb-0.5 ${subColor}`}>{subLabel}</div>
                                                <div className={`font-bold ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>{f1(subScore)}</div>
                                                {subRank !== '-' && <div className="text-[9px] font-bold text-slate-400 mt-0.5">#{subRank}</div>}
                                            </div>
                                        )
                                    })}
                                </div>
                             </div>
                        )})}
                    </div>
                </div>
              </div>
            )}
          </div>
        )}

        {showAvgModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowAvgModal(false)}>
              <div className={`rounded-[2.5rem] w-full max-w-2xl max-h-[85vh] flex flex-col ${darkMode ? 'bg-slate-800 border border-white/10' : 'bg-white shadow-2xl'}`} onClick={e => e.stopPropagation()}>
                  <div className={`p-6 border-b flex justify-between items-center ${darkMode ? 'border-white/5' : 'border-slate-100'}`}>
                      <h3 className={`text-xl font-bold flex items-center gap-3 ${darkMode ? 'text-white' : 'text-slate-800'}`}><Edit3 className="w-5 h-5 text-indigo-500"/> 設定班級平均</h3>
                      <button onClick={() => setShowAvgModal(false)} className={`p-2 rounded-full transition ${darkMode ? 'bg-white/5 hover:bg-white/10 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-500'}`}><X className="w-5 h-5"/></button>
                  </div>
                  <div className={`px-6 pt-6 pb-2`}>
                      <div className={`flex p-1 rounded-xl border overflow-x-auto justify-center shadow-inner ${darkMode ? 'bg-[#020617]/50 border-white/5' : 'bg-slate-50 border-slate-100'}`}>
                          {CLASS_DEFS.map(c => (
                              <button key={c.id} onClick={() => setAvgSettingsClassFilter(c.id)} className={`flex-1 whitespace-nowrap px-3 py-2 text-xs font-bold rounded-lg transition-all ${avgSettingsClassFilter === c.id ? (darkMode ? 'bg-slate-800 text-white shadow-md border border-white/5' : 'bg-white text-slate-800 shadow-sm border border-slate-200') : 'text-slate-500 hover:text-slate-400'}`}>{c.label}</button>
                          ))}
                      </div>
                  </div>
                  <div className={`px-6 pb-6 overflow-y-auto flex-1 ${darkMode ? 'bg-[#020617]/30' : 'bg-slate-50/50'}`}>
                      <div className="mb-4 text-xs font-bold text-amber-500 bg-amber-500/10 p-3 rounded-xl border border-amber-500/20 flex items-center gap-2">
                        <Sparkles className="w-4 h-4" />
                        系統已自動計算 <span className="font-black text-amber-600 dark:text-amber-400 mx-1">{CLASS_DEFS.find(c=>c.id===avgSettingsClassFilter)?.label}</span> 班平均。若需調整，請直接修改。
                      </div>
                      <table className="w-full text-sm text-left">
                          <thead className={`text-xs uppercase sticky top-0 backdrop-blur z-10 ${darkMode ? 'text-slate-500 bg-slate-800/95' : 'text-slate-400 bg-slate-50/95'}`}>
                              <tr>
                                  <th className="px-4 py-4 font-bold tracking-wider">日期</th>
                                  <th className="px-2 py-4 text-center text-rose-500">國文</th>
                                  <th className="px-2 py-4 text-center text-amber-500">英文</th>
                                  <th className="px-2 py-4 text-center text-cyan-500">數學</th>
                                  <th className="px-2 py-4 text-center text-blue-500 font-bold">總分</th>
                              </tr>
                          </thead>
                          <tbody className={`divide-y ${darkMode ? 'divide-white/5' : 'divide-slate-100'}`}>
                              {sortedAvailableDatesDesc.map((date, dateIndex) => {
                                  const dateData = classAverages[date] || {};
                                  const avg = dateData[avgSettingsClassFilter] || { chi: '', eng: '', math: '', total: '' };
                                  return (
                                      <tr key={date} className={darkMode ? 'bg-transparent' : 'bg-white'}>
                                          <td className="px-4 py-3 font-mono font-bold text-slate-500">{getWeekendDisplayLabel(date)}</td>
                                          {['chi', 'eng', 'math', 'total'].map(sub => (
                                              <td key={sub} className="px-1 py-1.5">
                                                  <input id={`avg-${dateIndex}-${sub}`} type="number" className={`w-full text-center p-2 rounded-xl border outline-none transition-all font-bold ${darkMode ? 'bg-slate-900 border-transparent focus:bg-slate-800 focus:border-blue-500/50 text-slate-200' : 'bg-slate-50 border-slate-100 focus:bg-white focus:border-indigo-300 text-slate-600'} ${sub==='total'?'text-blue-500':''}`} value={avg[sub] || ''} onChange={(e) => handleManualAverageChange(date, avgSettingsClassFilter, sub, e.target.value)} onKeyDown={(e) => handleAvgKeyDown(e, dateIndex, sub)} onPaste={(e) => handleAvgPaste(e, dateIndex, sub)} placeholder="-" />
                                              </td>
                                          ))}
                                      </tr>
                                  )
                              })}
                          </tbody>
                      </table>
                  </div>
                  <div className={`p-6 border-t rounded-b-[2rem] flex justify-end gap-3 ${darkMode ? 'border-white/5 bg-slate-800' : 'border-slate-100 bg-white'}`}>
                      <button onClick={() => setShowAvgModal(false)} className={`px-6 py-3 rounded-xl font-bold transition text-sm ${darkMode ? 'text-slate-400 hover:bg-white/5' : 'text-slate-500 hover:bg-slate-100'}`}>取消</button>
                      <button onClick={saveManualClassAverages} className="px-6 py-3 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-500 shadow-lg shadow-indigo-900/20 transition active:scale-95 text-sm">儲存設定</button>
                  </div>
              </div>
          </div>
        )}

        {statsModalData && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setStatsModalData(null)}>
                <div className={`rounded-[2.5rem] w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh] ${darkMode ? 'bg-slate-800 border border-white/10' : 'bg-white shadow-2xl'}`} onClick={e => e.stopPropagation()}>
                    <div className={`p-6 border-b flex justify-between items-center ${darkMode ? 'border-white/5 bg-slate-800/60' : 'border-slate-100 bg-slate-50/50'}`}>
                        <div>
                            <div className={`text-[10px] font-bold uppercase tracking-widest mb-1 ${darkMode ? 'text-blue-400' : 'text-blue-600'}`}>Score Distribution</div>
                            <h3 className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-slate-800'}`}>{statsModalData.date} 落點分析</h3>
                        </div>
                        <button onClick={() => setStatsModalData(null)} className={`p-2 rounded-full transition ${darkMode ? 'bg-white/5 hover:bg-white/10 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-500'}`}><X className="w-5 h-5"/></button>
                    </div>
                    <div className="p-6 overflow-y-auto">
                        <div className={`flex p-1 rounded-xl mb-6 shadow-inner ${darkMode ? 'bg-[#020617]/50 border border-white/5' : 'bg-slate-100 border border-slate-200'}`}>
                            {['總分', '國文', '英文', '數學'].map(tab => {
                                const tabKey = tab === '總分' ? 'total' : tab === '國文' ? 'chi' : tab === '英文' ? 'eng' : 'math';
                                const isActive = statsActiveTab === tabKey;
                                return (
                                    <button key={tabKey} onClick={() => setStatsActiveTab(tabKey)} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${isActive ? (darkMode ? 'bg-slate-800 text-white shadow-md border border-white/5' : 'bg-white text-slate-800 shadow-sm border border-slate-200') : 'text-slate-500'}`}>
                                    {isActive && <span className={`inline-block w-1.5 h-1.5 rounded-full ${TAB_DOT_BG_CLASS[tabKey]} mr-1.5 mb-0.5`}></span>}{tab}
                                    </button>
                                )
                            })}
                        </div>
                        <div className="grid grid-cols-3 gap-2 mb-4">
                            <div className={`rounded-xl px-3 py-2 border ${darkMode ? 'bg-slate-900/60 border-white/10' : 'bg-slate-50 border-slate-200'}`}>
                                <div className={`text-[10px] font-bold uppercase tracking-wide ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>樣本數</div>
                                <div className={`text-lg font-black ${darkMode ? 'text-white' : 'text-slate-800'}`}>{statsSummary?.sampleCount || 0}</div>
                            </div>
                            <div className={`rounded-xl px-3 py-2 border ${darkMode ? 'bg-slate-900/60 border-white/10' : 'bg-slate-50 border-slate-200'}`}>
                                <div className={`text-[10px] font-bold uppercase tracking-wide ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>我的區間</div>
                                <div className={`text-sm font-black ${darkMode ? 'text-blue-300' : 'text-blue-700'}`}>{statsSummary?.myRange || '-'}</div>
                            </div>
                            <div className={`rounded-xl px-3 py-2 border ${darkMode ? 'bg-slate-900/60 border-white/10' : 'bg-slate-50 border-slate-200'}`}>
                                <div className={`text-[10px] font-bold uppercase tracking-wide ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>最多人區間</div>
                                <div className={`text-sm font-black ${darkMode ? 'text-amber-300' : 'text-amber-700'}`}>{statsSummary?.peakRange || '-'}</div>
                            </div>
                        </div>
                        <div className="mb-6">
                            <DistributionChart data={statsModalData[statsActiveTab]} colorKey={statsActiveTab} isDarkMode={darkMode} />
                        </div>
                        <div className={`p-4 rounded-2xl flex justify-between items-center border ${darkMode ? 'bg-white/5 border-white/5' : 'bg-slate-50 border-slate-200'}`}>
                            <span className={`text-sm font-bold ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>我的分數</span>
                            <span className={`text-2xl font-black ${darkMode ? 'text-white' : 'text-slate-800'}`}>{statsModalData.myGrades[statsActiveTab]}</span>
                        </div>
                    </div>
                </div>
            </div>
        )}

        {showSecurityModal && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-[60] p-6 animate-in fade-in duration-200" onClick={() => {setShowSecurityModal(false); setSecurityInput('');}}>
                <div className={`p-8 rounded-[2rem] shadow-2xl max-w-xs w-full text-center transform transition-all scale-100 border ${darkMode ? 'bg-slate-800 border-white/10' : 'bg-white border-white/50'}`} onClick={e => e.stopPropagation()}>
                    <div className={`mx-auto mb-6 p-4 rounded-full inline-block shadow-inner ${darkMode ? 'bg-blue-500/10 text-blue-400' : 'bg-blue-50 text-blue-600'}`}>
                        <ShieldCheck className="w-8 h-8" />
                    </div>
                    <h3 className={`text-lg font-bold mb-2 ${darkMode ? 'text-white' : 'text-slate-800'}`}>安全驗證</h3>
                    <p className={`text-xs mb-6 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>請輸入安全密碼以繼續</p>
                    <input 
                        ref={securityInputRef}
                        type="password" 
                        maxLength={4}
                        value={securityInput}
                        onChange={handleSecurityInput}
                        className={`w-full text-center text-3xl font-bold tracking-[0.5em] p-4 rounded-xl outline-none border-2 transition-all shadow-inner ${darkMode ? 'bg-slate-900 border-slate-800 text-white focus:border-blue-500/50' : 'bg-slate-50 border-slate-200 text-slate-800 focus:border-blue-200 focus:bg-white'}`}
                        placeholder=""
                    />
                </div>
            </div>
        )}

        {(deleteTarget || studentToDelete) && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => { setDeleteTarget(null); setStudentToDelete(null); }}>
              <div className={`rounded-[2.5rem] p-8 shadow-2xl max-w-sm w-full animate-in zoom-in duration-300 ${darkMode ? 'bg-slate-800 border border-white/10' : 'bg-white'}`} onClick={e => e.stopPropagation()}>
                  <div className="flex items-center gap-4 mb-6">
                      <div className="bg-red-500/10 p-4 rounded-2xl text-red-500"><AlertTriangle className="w-8 h-8" /></div>
                      <div><h3 className={`font-bold text-xl ${darkMode ? 'text-white' : 'text-slate-800'}`}>確認刪除</h3><p className="text-slate-400 text-xs mt-1 font-bold opacity-80">此動作無法復原</p></div>
                  </div>
                  <p className={`mb-8 text-sm font-medium leading-relaxed ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                    確定要刪除 <span className={`font-bold px-2 py-0.5 rounded-md mx-1 text-base ${darkMode ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-900'}`}>{deleteTarget || studentToDelete?.name}</span> 的資料嗎？
                  </p>
                  <div className="flex gap-3 justify-end">
                      <button onClick={() => { setDeleteTarget(null); setStudentToDelete(null); }} className={`flex-1 px-4 py-3.5 rounded-xl font-bold text-sm transition-colors ${darkMode ? 'bg-slate-800 text-slate-300 hover:bg-slate-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>取消</button>
                      <button onClick={() => executeWithSecurity(deleteTarget ? confirmDeleteDate : confirmDeleteStudent)} className="flex-1 px-4 py-3.5 rounded-xl bg-red-500 text-white hover:bg-red-600 font-bold text-sm shadow-lg shadow-red-900/20 transition-all active:scale-95">刪除</button>
                  </div>
              </div>
          </div>
        )}
      </main>
    </div>
  );
}
