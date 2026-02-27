import React, { Suspense, useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Search, Save, Plus, Check, BarChart3, X, Lock, LayoutDashboard, GraduationCap, Calendar, Clipboard, LogOut, AlertTriangle, UserPlus, Sparkles, Edit3, Trash2, Trophy, Target, FileSpreadsheet, ChevronRight, ArrowLeft, PieChart, Users, BarChart2, ShieldCheck, ArrowDownWideNarrow, Percent, Info } from 'lucide-react';
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
const QUERY_COUNT_RESET_INTERVAL_MS = 3 * 24 * 60 * 60 * 1000;

const runtimeFirebaseConfig =
  typeof window !== 'undefined' ? window.__firebase_config : undefined;
const runtimeAppId = typeof window !== 'undefined' ? window.__app_id : undefined;
const runtimeInitialAuthToken =
  typeof window !== 'undefined' ? window.__initial_auth_token : undefined;

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
  if (typeof runtimeFirebaseConfig !== 'undefined' && runtimeFirebaseConfig) {
    const config = JSON.parse(runtimeFirebaseConfig);
    if (!getApps().length) app = initializeApp(config);
    else app = getApp();
    if (typeof runtimeAppId !== 'undefined' && runtimeAppId) appId = runtimeAppId;
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
    } catch { return 0; }
};

const normalizeDateToken = (dateStr) => {
    if (!dateStr) return '';
    const clean = String(dateStr).replace(/[^0-9/]/g, '');
    if (!clean.includes('/')) return '';
    const [mStr, dStr] = clean.split('/');
    const m = parseInt(mStr, 10);
    const d = parseInt(dStr, 10);
    if (Number.isNaN(m) || Number.isNaN(d)) return '';
    return `${String(m).padStart(2, '0')}/${String(d).padStart(2, '0')}`;
};

const getAcademicSortValue = (dateStr) => {
    const normalized = normalizeDateToken(dateStr);
    if (!normalized) return Number.NaN;
    const [mStr, dStr] = normalized.split('/');
    const month = parseInt(mStr, 10);
    const day = parseInt(dStr, 10);
    if (Number.isNaN(month) || Number.isNaN(day)) return Number.NaN;
    const academicMonth = month < 4 ? month + 12 : month;
    return academicMonth * 100 + day;
};

const PHASE_BOUNDARIES = {
    p1End: '08/02',
    mockStart: '12/20'
};
const FORCED_MOCK_DATES = new Set(['09/29']);

const resolvePhaseByDate = (dateStr, allDates = null) => {
    const weekendID = getWeekendID(dateStr, allDates);
    const normalized = normalizeDateToken(weekendID);
    if (!normalized) return 'p2';

    if (FORCED_MOCK_DATES.has(normalized)) return 'mock';

    const dateValue = getAcademicSortValue(normalized);
    const p1EndValue = getAcademicSortValue(PHASE_BOUNDARIES.p1End);
    const mockStartValue = getAcademicSortValue(PHASE_BOUNDARIES.mockStart);
    if (Number.isNaN(dateValue) || Number.isNaN(p1EndValue) || Number.isNaN(mockStartValue)) return 'p2';

    if (dateValue >= mockStartValue) return 'mock';
    if (dateValue <= p1EndValue) return 'p1';
    return 'p2';
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
    } catch { return null; }
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
    } catch { return dateStr; }
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
    } catch { return satDateStr; }
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
    } catch { return dateStr; }
};

const PHASES = [
    { id: 'p1', name: '第一階段' },
    { id: 'p2', name: '第二階段' },
    { id: 'mock', name: '模考班' } 
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
    return resolvePhaseByDate(date, allDates) === 'mock';
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
    if (prob <= 25) {
        return {
            textStyle: {
                color: isDarkMode ? '#fecaca' : '#dc2626',
                textShadow: isDarkMode
                    ? '0 0 14px rgba(248,113,113,0.55)'
                    : '0 1px 2px rgba(220,38,38,0.38)'
            },
            badgeStyle: {
                color: '#ffffff',
                background: isDarkMode
                    ? 'linear-gradient(135deg, rgba(255,89,89,0.86) 0%, rgba(255,42,42,0.9) 56%, rgba(168,15,15,0.96) 100%)'
                    : 'linear-gradient(135deg, rgba(255,99,99,0.95) 0%, rgba(255,44,44,0.97) 55%, rgba(185,18,27,0.98) 100%)',
                border: isDarkMode
                    ? '1px solid rgba(254,202,202,0.65)'
                    : '1px solid rgba(220,38,38,0.65)',
                boxShadow: isDarkMode
                    ? '0 0 0 1px rgba(254,202,202,0.2), 0 10px 22px -12px rgba(239,68,68,0.75)'
                    : '0 0 0 1px rgba(220,38,38,0.28), 0 10px 22px -12px rgba(220,38,38,0.62)'
            }
        };
    }

    const hue = Math.round(Math.pow(prob / 100, 0.72) * 130);
    const saturation = isDarkMode ? 96 : 94;
    const textLightness = isDarkMode ? 72 : 36;
    const badgeTextColor = `hsl(${hue} ${saturation}% ${isDarkMode ? 78 : 34}%)`;
    const badgeAlphaStart = isDarkMode ? 0.48 : 0.3;
    const badgeAlphaEnd = isDarkMode ? 0.64 : 0.44;
    const hueEnd = clamp(hue + 14, 0, 140);

    return {
        textStyle: {
            color: `hsl(${hue} ${saturation}% ${textLightness}%)`,
            textShadow: 'none'
        },
        badgeStyle: {
            color: badgeTextColor,
            background: `linear-gradient(135deg, hsla(${hue}, ${saturation}%, ${isDarkMode ? 56 : 54}%, ${badgeAlphaStart}) 0%, hsla(${hueEnd}, ${saturation}%, ${isDarkMode ? 48 : 50}%, ${badgeAlphaEnd}) 100%)`,
            border: `1px solid hsla(${hue}, ${saturation}%, ${isDarkMode ? 72 : 42}%, ${isDarkMode ? 0.5 : 0.3})`,
            boxShadow: `0 8px 18px -12px hsla(${hue}, ${saturation}%, ${isDarkMode ? 62 : 42}%, 0.4)`
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

    availableDates.forEach((date) => {
         const weekendID = getWeekendID(date, availableDates);
         const grade = myGrades[weekendID];
         let myTotal = null;
         let myMath = null;

         if (grade) {
             myTotal = parseFloat(grade.total);
             myMath = parseFloat(grade.math);
         }
         
         // Total PR Logic
         if (myTotal !== null && !isNaN(myTotal) && scoresByDate[weekendID] && scoresByDate[weekendID].length >= 5) {
             const scores = scoresByDate[weekendID];
             const rank = scores.indexOf(myTotal) + 1;
             const pr = Math.floor(((scores.length - rank) / scores.length) * 100);
             
             // PDF 規則：一般週考(前兩階段)基準 PR55；模考衝刺基準 PR48。
             const isMock = resolvePhaseByDate(weekendID, availableDates) === 'mock';
             const weight = isMock ? 2.5 : 1; 
             const baseline = isMock ? 48 : 55;

             // 達標即 50%：先把各階段 PR 正規化到共同軸，再做加權平均
             const diff = pr - baseline; 
             const normalizedPR = 50 + diff;

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

    const avgPR = clamp(weightedPRSum / totalWeight, 0, 100);
    const avgMathPR = mathWeight > 0 ? mathPRSum / mathWeight : 0;
    
    // PDF 規則：高於標準線性上升；低於標準加速下跌（最低 1%、最高 99%）
    let prob = 0;
    if (avgPR < 50) {
        prob = Math.pow(avgPR / 50, 1.5) * 50;
    } else {
        prob = 50 + ((avgPR - 50) / 50) * 49;
    }

    // PDF 規則：數學 >60 +2、>80 +4，並採動態增幅，上限 +5
    let mathBonus = 0;
    if (avgMathPR > 80) {
        mathBonus = 4 + ((avgMathPR - 80) / 20);
    } else if (avgMathPR > 60) {
        mathBonus = 2 + ((avgMathPR - 60) / 20) * 2;
    }

    prob += clamp(mathBonus, 0, 5);

    return Math.min(99, Math.max(1, Math.round(prob)));
};

// --- Components ---
const SingleSubjectChart = React.lazy(() => import('./components/charts/SingleSubjectChart'));
const DistributionChart = React.lazy(() => import('./components/charts/DistributionChart'));
const ParentAbilityRadar = React.lazy(() => import('./components/charts/ParentAbilityRadar'));

const ChartFallback = ({ heightClass = 'h-60' }) => (
    <div className={`${heightClass} rounded-2xl border border-slate-200/70 bg-white/60 flex items-center justify-center text-xs font-bold text-slate-400`}>
        載入圖表中...
    </div>
);

const BatchRow = React.memo(({ student, sIndex, dateGrades, prValue, probValue, darkMode, handleBatchGradeChange, handleKeyDown, handlePaste }) => {
    const probVisual = getProbabilityVisual(probValue, darkMode);

    return (
        <tr className={`${darkMode ? 'hover:bg-slate-800/50' : 'hover:bg-white/50'} transition-colors`}>
            <td className="w-8 px-1.5 py-2 text-center text-xs font-bold text-slate-500">{sIndex + 1}</td>
            <td className="w-[4.9rem] px-1.5 py-2 text-center font-mono text-xs font-bold text-slate-500">{student.id}</td>
            <td className={`w-[6.1rem] px-1.5 py-2 text-center font-bold text-xs ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                <div className="truncate">{student.name}</div>
            </td>
            <td className="w-[3.9rem] px-1 py-1">
                <select 
                    value={dateGrades.class || 'A班'} 
                    onChange={(e) => handleBatchGradeChange(student.id, 'class', e.target.value)}
                    className={`w-full text-center text-xs font-bold py-1.5 rounded-lg opacity-70 border-none outline-none appearance-none cursor-pointer hover:opacity-100 transition-opacity ${darkMode ? 'bg-slate-900/50 text-slate-400 focus:text-slate-200' : 'bg-slate-100 text-slate-600 focus:text-slate-900'}`}
                >
                    {CLASS_DEFS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
            </td>
            {['chi', 'eng', 'math'].map((sub) => (
                <td key={sub} className="w-[3.9rem] px-1 py-1">
                    <input 
                        id={`cell-${sIndex}-${sub}`} 
                        type="text" 
                        className={`w-full text-center p-1.5 rounded-lg border border-transparent outline-none text-xs font-bold transition-all shadow-inner focus:ring-1 ${darkMode ? 'bg-slate-950/50 text-slate-300 focus:bg-slate-900 focus:border-blue-500/50 focus:ring-blue-500/20' : 'bg-slate-50 text-slate-600 focus:bg-white focus:border-blue-200 focus:ring-blue-200'}`} 
                        value={dateGrades[sub] || ''} 
                        onChange={(e) => handleBatchGradeChange(student.id, sub, e.target.value)} 
                        onKeyDown={(e) => handleKeyDown(e, sIndex, sub)} 
                        onPaste={(e) => handlePaste(e, sIndex, sub)} 
                        placeholder="-" 
                    />
                </td>
            ))}
            <td className="w-[4rem] px-1 py-1 text-center"><div className="text-xs font-bold text-blue-500">{dateGrades.total}</div></td>
            <td className="w-[3.1rem] px-1 py-1 text-center"><div className={`text-xs font-bold ${darkMode ? 'text-indigo-300' : 'text-indigo-600'}`}>{prValue !== '-' ? prValue : ''}</div></td>
            <td className="w-[5.2rem] px-1 py-1 text-center">
                <div className="text-[11px] leading-none font-black inline-block px-1.5 py-1 rounded-full min-w-[52px] text-center" style={probVisual ? probVisual.badgeStyle : undefined}>
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
        <div className={`flex items-center gap-3 mt-4 px-5 py-2 rounded-full border backdrop-blur-md transition-all duration-500 shadow-sm ${isDarkMode ? 'bg-emerald-500/10 border-emerald-200/20 text-slate-100 shadow-black/20' : 'bg-white/74 border-white text-slate-700 shadow-slate-200/50'}`}>
            <Target className="w-4 h-4 text-sky-600" />
            <div className="flex items-baseline gap-1.5 font-mono text-sm">
                <span className="font-bold">{timeLeft.days}</span><span className="text-[10px] opacity-50 mr-1">DAYS</span>
                <span className="font-bold">{String(timeLeft.hours).padStart(2,'0')}</span><span className="opacity-30">:</span>
                <span className="font-bold">{String(timeLeft.minutes).padStart(2,'0')}</span><span className="opacity-30">:</span>
                <span className="font-bold text-orange-500">{String(timeLeft.seconds).padStart(2,'0')}</span>
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
  const [isBatchDirty, setIsBatchDirty] = useState(false);
  const [allStudentsData, setAllStudentsData] = useState([]); 
  const [cachedClassData, setCachedClassData] = useState([]); 
  const [sortByPR, setSortByPR] = useState(false);
  const [sortByProb, setSortByProb] = useState(false);
  const [queryStatsById, setQueryStatsById] = useState({});
  const [queryStatsLastResetAt, setQueryStatsLastResetAt] = useState('');
  const [queryStatsLoading, setQueryStatsLoading] = useState(false);
    
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

  const [_xlsxLoaded, setXlsxLoaded] = useState(false);
  const xlsxLoadingPromiseRef = useRef(null);
  const darkMode = false;

  const ensureXlsxReady = useCallback(async () => {
      if (typeof window === 'undefined') return false;
      if (window.XLSX) {
          setXlsxLoaded(true);
          return true;
      }
      if (xlsxLoadingPromiseRef.current) return xlsxLoadingPromiseRef.current;

      xlsxLoadingPromiseRef.current = new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
          script.async = true;
          script.onload = () => {
              setXlsxLoaded(true);
              resolve(true);
          };
          script.onerror = () => reject(new Error('xlsx-load-failed'));
          document.body.appendChild(script);
      });

      try {
          return await xlsxLoadingPromiseRef.current;
      } catch (error) {
          xlsxLoadingPromiseRef.current = null;
          throw error;
      } finally {
          if (window.XLSX) xlsxLoadingPromiseRef.current = null;
      }
  }, []);

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

  const weekendLabelByDate = useMemo(() => {
      const labels = {};
      sortedAvailableDatesDesc.forEach((date) => {
          labels[date] = getWeekendDisplayLabel(date);
      });
      return labels;
  }, [sortedAvailableDatesDesc]);

  const dateOrderByWeekendId = useMemo(() => {
      const orderMap = new Map();
      sortedAvailableDatesAsc.forEach((date, index) => {
          orderMap.set(getTestDateID(date), index);
      });
      return orderMap;
  }, [sortedAvailableDatesAsc, getTestDateID]);

  // 將每位學生的日期成績先依週末 ID 正規化，避免在多個流程中重複掃描 grades 物件
  const studentGradeMapsByStudentId = useMemo(() => {
      const gradeMaps = {};
      allStudentsData.forEach((student) => {
          const weekendGrades = {};
          Object.entries(student.grades || {}).forEach(([date, grade]) => {
              const weekendID = getTestDateID(date);
              if (!(weekendID in weekendGrades)) {
                  weekendGrades[weekendID] = grade;
              }
          });
          gradeMaps[student.id] = weekendGrades;
      });
      return gradeMaps;
  }, [allStudentsData, getTestDateID]);

  useEffect(() => {
      const storedAuth = localStorage.getItem('teacher_auth');
      if (storedAuth === 'true') setIsAuthenticated(true);
  }, []);

  const hasPriorHistory = useMemo(() => {
      if (!viewData || !viewData.chartData) return true;
      return viewData.chartData.some(d => {
          const weekendID = getTestDateID(d.weekendID || d.date);
          const idx = dateOrderByWeekendId.get(weekendID);
          return idx >= 0 && idx < 36;
      });
  }, [viewData, getTestDateID, dateOrderByWeekendId]);

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

          const studentGradeMaps = studentGradeMapsByStudentId;

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
  }, [allStudentsData, availableDates, getTestDateID, mode, teacherViewMode, studentGradeMapsByStudentId]);

  useEffect(() => {
      if (mode !== 'parent' || !viewData?.chartData?.length) return;
      const latest = viewData.chartData[viewData.chartData.length - 1];
      const nextPhase = resolvePhaseByDate(latest.weekendID || latest.date, sortedAvailableDatesAsc);
      setActivePhase(nextPhase);
  }, [viewData, mode, sortedAvailableDatesAsc]);

  useEffect(() => {
      if (mode === 'parent') {
          setViewData(null);
          setSearchError('');
      }
  }, [mode]);

  useEffect(() => {
      if (mode !== 'teacher') return;
      ensureXlsxReady().catch(() => {});
  }, [mode, ensureXlsxReady]);

  // Intentionally initialize auth listener once at app bootstrap.
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (!auth) return;
        if (typeof runtimeInitialAuthToken !== 'undefined' && runtimeInitialAuthToken) {
          await signInWithCustomToken(auth, runtimeInitialAuthToken);
        }
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
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
      if (!sortedAvailableDatesAsc.length) return;
      const latestDate = sortedAvailableDatesAsc[sortedAvailableDatesAsc.length - 1];
      if (!batchDate || !sortedAvailableDatesAsc.includes(batchDate)) {
          setBatchDate(latestDate);
      }
  }, [sortedAvailableDatesAsc, batchDate]);

  useEffect(() => {
      if (mode !== 'teacher' || !sortedAvailableDatesAsc.length) return;
      const latestDate = sortedAvailableDatesAsc[sortedAvailableDatesAsc.length - 1];
      setBatchDate(latestDate);
  }, [mode, sortedAvailableDatesAsc]);

  const hasPendingBatchChanges = mode === 'teacher' && teacherViewMode === 'batch' && isBatchDirty;

  const confirmDiscardBatchChanges = useCallback(() => {
      if (!hasPendingBatchChanges) return true;
      return window.confirm('批量成績尚未儲存，確定要離開目前頁面嗎？');
  }, [hasPendingBatchChanges]);

  const runWithBatchDiscardGuard = useCallback((action) => {
      if (!confirmDiscardBatchChanges()) return;
      action();
  }, [confirmDiscardBatchChanges]);

  useEffect(() => {
      if (!hasPendingBatchChanges) return undefined;

      const handleBeforeUnload = (e) => {
          e.preventDefault();
          e.returnValue = '';
      };

      window.addEventListener('beforeunload', handleBeforeUnload);
      return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasPendingBatchChanges]);

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

  const shouldResetQueryStats = useCallback((lastResetAt) => {
      if (!lastResetAt) return true;
      const ts = new Date(lastResetAt).getTime();
      if (Number.isNaN(ts)) return true;
      return Date.now() - ts >= QUERY_COUNT_RESET_INTERVAL_MS;
  }, []);

  const loadQueryStats = useCallback(async () => {
      if (!db) {
          setQueryStatsById({});
          setQueryStatsLastResetAt('');
          return;
      }

      setQueryStatsLoading(true);
      try {
          const nowIso = new Date().toISOString();
          const queryStatsDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'query_stats_v1');
          const docSnap = await getDoc(queryStatsDocRef);
          const raw = docSnap.exists() ? docSnap.data() : {};
          let counts = (raw.counts && typeof raw.counts === 'object') ? raw.counts : {};
          let lastResetAt = raw.lastResetAt || nowIso;

          if (shouldResetQueryStats(lastResetAt)) {
              counts = {};
              lastResetAt = nowIso;
              await setDoc(queryStatsDocRef, { counts, lastResetAt, updatedAt: nowIso }, { merge: true });
          }

          setQueryStatsById(counts);
          setQueryStatsLastResetAt(lastResetAt);
      } catch (e) {
          console.error('Load query stats error:', e);
      } finally {
          setQueryStatsLoading(false);
      }
  }, [shouldResetQueryStats]);

  const incrementQueryCount = useCallback(async (studentId) => {
      const normalizedId = String(studentId || '').toUpperCase().trim();
      if (!normalizedId) return;

      setQueryStatsById((prev) => ({ ...prev, [normalizedId]: (prev[normalizedId] || 0) + 1 }));

      if (!db) return;

      try {
          const nowIso = new Date().toISOString();
          const queryStatsDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'query_stats_v1');
          const docSnap = await getDoc(queryStatsDocRef);
          const raw = docSnap.exists() ? docSnap.data() : {};
          let counts = (raw.counts && typeof raw.counts === 'object') ? raw.counts : {};
          let lastResetAt = raw.lastResetAt || nowIso;

          if (shouldResetQueryStats(lastResetAt)) {
              counts = {};
              lastResetAt = nowIso;
          }

          counts[normalizedId] = (Number(counts[normalizedId]) || 0) + 1;
          await setDoc(queryStatsDocRef, { counts, lastResetAt, updatedAt: nowIso }, { merge: true });

          setQueryStatsById(counts);
          setQueryStatsLastResetAt(lastResetAt);
      } catch (e) {
          console.error('Increment query count error:', e);
      }
  }, [shouldResetQueryStats]);

  const handleResetQueryStats = useCallback(async () => {
      if (!window.confirm('確定要手動重置所有查詢次數嗎？')) return;

      const nowIso = new Date().toISOString();
      setQueryStatsLoading(true);
      try {
          if (db) {
              const queryStatsDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'query_stats_v1');
              await setDoc(queryStatsDocRef, { counts: {}, lastResetAt: nowIso, updatedAt: nowIso }, { merge: true });
          }

          setQueryStatsById({});
          setQueryStatsLastResetAt(nowIso);
          setStatusMsg('查詢次數已重置');
          setTimeout(() => setStatusMsg(''), 2000);
      } catch (e) {
          console.error('Reset query stats error:', e);
          setStatusMsg('重置失敗');
          setTimeout(() => setStatusMsg(''), 2000);
      } finally {
          setQueryStatsLoading(false);
      }
  }, []);

  useEffect(() => {
      if (mode === 'teacher' && isAuthenticated) {
          loadQueryStats();
      }
  }, [mode, isAuthenticated, loadQueryStats]);
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
      } catch (e) {
          console.error('Load class averages error:', e);
          setClassAverages(localComputedAverages);
      }
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
      } catch (e) {
          console.error('Save class averages error:', e);
          setStatusMsg("儲存失敗");
      }
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

  const handleLogout = () => {
      runWithBatchDiscardGuard(() => {
          setIsAuthenticated(false);
          localStorage.removeItem('teacher_auth');
          setMode('landing');
      });
  };

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
          setIsBatchDirty(false);
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
    } catch (e) {
      console.error('Load student error:', e);
      setStatusMsg('讀取錯誤');
    }
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
      setIsBatchDirty(true);
  }, [batchDate, teacherClassFilter, getTestDateID]); 

  const handleExcelUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!window.XLSX) {
        setStatusMsg('Excel 模組載入中，請稍後');
        try {
            await ensureXlsxReady();
        } catch (error) {
            console.error('XLSX load error:', error);
            setStatusMsg('Excel 模組載入失敗');
            setTimeout(() => setStatusMsg(''), 2000);
            return;
        }
    }

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
        setIsBatchDirty(true);
        
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
          if(updated) {
              setStatusMsg(`已貼上 ${rows.length} 筆資料`);
              setTimeout(() => setStatusMsg(''), 2000);
              setIsBatchDirty(true);
          }
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
    } catch (e) {
      console.error('Delete student error:', e);
      setStatusMsg("刪除失敗");
    }
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
    } catch (e) {
      console.error('Save grades error:', e);
      setStatusMsg('儲存失敗');
    }
  };

  const handleSaveBatchGrades = async () => {
      setStatusMsg("批次儲存中...");
      try {
          if (db) {
              const batchPromises = allStudentsData.map(student => setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'students', `student_${student.id}`), { id: student.id, name: student.name, grades: student.grades, lastUpdated: new Date().toISOString() }, { merge: true }));
              await Promise.all(batchPromises);
              setIsBatchDirty(false);
              setStatusMsg("全班儲存成功"); setTimeout(() => setStatusMsg(''), 2000);
          }
      } catch (e) {
          console.error('Save batch grades error:', e);
          setStatusMsg("儲存失敗");
      }
  };

  const handleExportBatchExcel = async () => {
      if (!window.XLSX) {
          setStatusMsg('Excel 模組載入中，請稍後');
          try {
              await ensureXlsxReady();
          } catch (error) {
              console.error('XLSX load error:', error);
              setStatusMsg('Excel 模組載入失敗');
              setTimeout(() => setStatusMsg(''), 2000);
              return;
          }
      }
      if (!batchRowsForDisplay.length) {
          setStatusMsg('目前沒有可匯出的資料');
          setTimeout(() => setStatusMsg(''), 2000);
          return;
      }

      const rows = batchRowsForDisplay.map((row, index) => ({
          '序號': index + 1,
          '學號': row.student.id,
          '姓名': row.student.name || '',
          '班級': row.dateGrades.class || '',
          '國文': row.dateGrades.chi ?? '',
          '英文': row.dateGrades.eng ?? '',
          '數學': row.dateGrades.math ?? '',
          '總分': row.dateGrades.total ?? '',
          'PR': row.prValue === '-' ? '' : row.prValue,
          '錄取機率(%)': row.probValue === '-' ? '' : row.probValue,
          '查詢次數': queryStatsById[row.student.id] || 0
      }));

      const worksheet = window.XLSX.utils.json_to_sheet(rows);
      worksheet['!cols'] = [
          { wch: 6 }, { wch: 12 }, { wch: 12 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 12 }, { wch: 10 }
      ];

      const workbook = window.XLSX.utils.book_new();
      window.XLSX.utils.book_append_sheet(workbook, worksheet, '批量成績');

      const safeClass = String(teacherClassFilter).replace(/[^\w\u4e00-\u9fa5-]/g, '');
      const safeDate = String(batchDate || '').replace('/', '-');
      window.XLSX.writeFile(workbook, `batch_${safeDate}_${safeClass}.xlsx`);
      setStatusMsg('已下載批量 Excel');
      setTimeout(() => setStatusMsg(''), 2000);
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
        incrementQueryCount(data.id);
      } else { setSearchError('查無此學號'); }
    } catch (e) {
      console.error('Parent search error:', e);
      setSearchError('系統忙碌');
    }
    setLoading(false);
  };

  const shouldBuildParentAnalytics = mode === 'parent' && Boolean(viewData?.chartData);

  const parentPhaseData = useMemo(() => {
      if (!shouldBuildParentAnalytics) return [];
      return viewData.chartData.filter((d) => {
          const dateKey = d.weekendID || getTestDateID(d.date);
          return resolvePhaseByDate(dateKey, sortedAvailableDatesAsc) === activePhase;
      });
  }, [shouldBuildParentAnalytics, viewData, activePhase, sortedAvailableDatesAsc, getTestDateID]);

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

  const activePhaseLabel = useMemo(() => {
      const phase = PHASES.find((item) => item.id === activePhase);
      return phase ? phase.name : '';
  }, [activePhase]);

  const parentPhaseDataDesc = useMemo(
      () => [...parentPhaseData].reverse(),
      [parentPhaseData]
  );

  // 預先為每個週末 / 班級 / 科目建立排序好的成績索引，避免在畫面 render 時重複掃描全班資料
  const scoreIndexByWeekendAndClass = useMemo(() => {
      const index = {};

      if (!shouldBuildParentAnalytics || !cachedClassData.length) return index;

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
  }, [shouldBuildParentAnalytics, cachedClassData, getTestDateID]);

  const distributionProfileByWeekendClass = useMemo(() => {
      const profile = {};
      if (!shouldBuildParentAnalytics) return profile;

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
  }, [shouldBuildParentAnalytics, scoreIndexByWeekendAndClass, availableDates]);

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
      if (mode !== 'teacher' || teacherViewMode !== 'batch' || !batchDate) return [];

      const weekendID = getTestDateID(batchDate);
      const rows = [];
      const totals = [];
      const totalByStudentId = {};

      allStudentsData.forEach(student => {
          const dateGrades = studentGradeMapsByStudentId[student.id]?.[weekendID];
          if (!dateGrades) return;
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
  }, [mode, teacherViewMode, allStudentsData, batchDate, teacherClassFilter, getTestDateID, sortByPR, sortByProb, admissionProbabilities, studentGradeMapsByStudentId]);

  const queryStatsRows = useMemo(() => {
      const nameById = {};
      allStudentsData.forEach((student) => {
          nameById[student.id] = student.name || '';
      });

      return Object.entries(queryStatsById)
          .map(([id, count]) => ({
              id,
              name: nameById[id] || '',
              count: Number(count) || 0
          }))
          .sort((a, b) => b.count - a.count);
  }, [queryStatsById, allStudentsData]);

  const queryStatsLastResetText = useMemo(() => {
      if (!queryStatsLastResetAt) return '尚未初始化';
      const date = new Date(queryStatsLastResetAt);
      if (Number.isNaN(date.getTime())) return '尚未初始化';
      return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }, [queryStatsLastResetAt]);


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

  const isLandingMode = mode === 'landing';
  const sharedBackgroundOpacity = isLandingMode
      ? 1
      : mode === 'teacher'
          ? 0.82
          : mode === 'parent'
              ? 0.9
              : 0.87;

  if (!user && !db) return <div className="flex items-center justify-center h-screen bg-slate-50 text-slate-400 text-sm font-mono tracking-widest uppercase">Initializing...</div>;
  if (!user) return <div className="flex items-center justify-center h-screen bg-slate-50 text-slate-400 text-sm font-mono tracking-widest uppercase">Connecting...</div>;

  return (
    <div className={`${isLandingMode ? 'h-[100svh] overflow-hidden' : 'min-h-screen pb-32 overflow-x-hidden'} font-sans antialiased transition-colors duration-500 ease-in-out relative ${darkMode ? 'bg-[#111714] text-slate-200' : 'bg-transparent text-slate-800'}`}>
      <div
        aria-hidden="true"
        className="fixed inset-0 pointer-events-none z-0 transition-opacity duration-500"
        style={{
          opacity: sharedBackgroundOpacity,
          backgroundImage: 'repeating-linear-gradient(0deg, rgba(148,163,184,0.1) 0px, rgba(148,163,184,0.1) 1px, transparent 1px, transparent 24px), repeating-linear-gradient(90deg, rgba(148,163,184,0.08) 0px, rgba(148,163,184,0.08) 1px, transparent 1px, transparent 24px), radial-gradient(circle at 12% 15%, rgba(99,102,241,0.22) 0%, transparent 40%), radial-gradient(circle at 86% 12%, rgba(14,165,233,0.22) 0%, transparent 40%), radial-gradient(circle at 80% 84%, rgba(236,72,153,0.16) 0%, transparent 36%), linear-gradient(138deg, #f8fafc 0%, #f3f7ff 46%, #eefcf5 100%)'
        }}
      />

      {/* Header */}
      <header className={`fixed top-0 w-full backdrop-blur-2xl z-30 border-b transition-all duration-300 ${darkMode ? 'bg-[#121a17]/88 border-emerald-200/10 shadow-lg shadow-black/25' : 'bg-white/40 border-white/60 shadow-[0_10px_35px_rgba(15,23,42,0.08)]'}`}>
        <div className="max-w-4xl mx-auto px-6 h-16 flex justify-between items-center relative z-10">
          <div
            className="flex items-center gap-3 cursor-pointer group"
            onClick={() => runWithBatchDiscardGuard(() => setMode('landing'))}
          >
            <div className={`p-2 rounded-xl transition-transform group-hover:scale-105 duration-300 ${darkMode ? 'bg-emerald-500/10 text-emerald-200 ring-1 ring-emerald-300/35' : 'bg-white/74 text-emerald-700 ring-1 ring-white/90 shadow-sm'}`}><GraduationCap className="h-5 w-5" /></div>
            <div>
                <h1 className={`text-2xl font-black tracking-widest font-serif uppercase leading-none bg-clip-text text-transparent ${darkMode ? 'bg-gradient-to-r from-emerald-50 via-emerald-200 to-lime-200' : 'bg-[linear-gradient(112deg,#0f172a_0%,#047857_34%,#0f766e_66%,#0369a1_100%)] drop-shadow-[0_1px_0_rgba(255,255,255,0.55)]'}`}>
                  HSINRU
                </h1>
                <p className="text-[9px] text-slate-500/90 font-bold tracking-widest uppercase mt-0.5">Grade Tracker</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
                <button
                  onClick={() => runWithBatchDiscardGuard(() => {
                    if (isAuthenticated) {
                      setMode('teacher');
                      loadAllStudents();
                    } else {
                      setMode('teacher_login');
                    }
                  })}
                  className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all duration-300 ${mode.includes('teacher') ? (darkMode ? 'bg-[#1c2722] text-emerald-300 shadow-lg shadow-black/35 ring-1 ring-emerald-200/20' : 'bg-white/92 text-emerald-700 shadow-md shadow-slate-300/40 ring-1 ring-white/95') : 'text-slate-600 hover:text-slate-800 bg-white/52 hover:bg-white/70'}`}
                >
                  {isAuthenticated ? '後台' : '老師'}
                </button>
                <button
                  onClick={() => runWithBatchDiscardGuard(() => {
                    setViewData(null);
                    setSearchError('');
                    setMode('parent');
                  })}
                  className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all duration-300 ${mode === 'parent' ? (darkMode ? 'bg-[#1c2722] text-emerald-300 shadow-lg shadow-black/35 ring-1 ring-emerald-200/20' : 'bg-white/92 text-emerald-700 shadow-md shadow-slate-300/40 ring-1 ring-white/95') : 'text-slate-600 hover:text-slate-800 bg-white/52 hover:bg-white/70'}`}
                >
                  家長
                </button>
            {isAuthenticated && (
                <button onClick={handleLogout} className="ml-1 p-2 text-red-400 hover:text-red-500 hover:bg-red-500/10 rounded-full transition-colors" title="登出"><LogOut className="w-5 h-5"/></button>
            )}
          </div>
        </div>
      </header>

      <main className={`${isLandingMode ? 'pt-16' : 'pt-28'} px-4 max-w-4xl mx-auto relative z-10`}>
        {mode === 'landing' && (
          <div className="h-[calc(100svh-64px)] flex items-center justify-center">
            <div className="w-full max-w-3xl h-full">
              <div className="relative z-10 h-full flex flex-col items-center justify-center px-4 md:px-6 py-6 md:py-8">
                <div className="px-4 py-1.5 rounded-full mb-5 border border-white/90 bg-white/72 text-[10px] tracking-[0.2em] font-black uppercase text-slate-600">
                    HSINRU CENTRAL
                </div>
                <h2 className="whitespace-nowrap text-[clamp(1.38rem,6.8vw,2.7rem)] sm:text-[1.9rem] md:text-[2.7rem] font-black font-serif tracking-[-0.02em] sm:tracking-tight mb-3 text-center leading-[1.1] bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 via-sky-700 to-emerald-700">Make Progress Visible</h2>
                <p className="text-[11px] font-bold tracking-[0.18em] mb-6 uppercase text-slate-600">2025-2026 Learning Journey</p>
                <ExamCountdown isDarkMode={darkMode} />
                  
                <div className="w-full max-w-xl grid grid-cols-1 md:grid-cols-2 gap-3 mt-6">
                   <button
                      onClick={() => runWithBatchDiscardGuard(() => {
                        if (isAuthenticated) {
                          setMode('teacher');
                          loadAllStudents();
                        } else {
                          setMode('teacher_login');
                        }
                      })}
                      className="group w-full p-5 rounded-[1.45rem] border flex items-center gap-4 transition-all duration-200 backdrop-blur-xl bg-white/76 border-white/85 hover:bg-white/92 hover:border-orange-200/90"
                    >
                      <div className="w-11 h-11 rounded-2xl flex items-center justify-center transition-colors bg-gradient-to-br from-indigo-100 to-sky-100 text-indigo-700"><LayoutDashboard className="w-5 h-5" /></div>
                      <div className="text-left flex-1"><h3 className="text-base font-black text-slate-800">老師通道</h3><p className="text-[11px] text-slate-500 mt-0.5">管理成績與設定</p></div>
                      <ChevronRight className="w-4.5 h-4.5 text-slate-400 opacity-50 group-hover:opacity-100 group-hover:translate-x-1 transition-all"/>
                   </button>
                   <button
                      onClick={() => runWithBatchDiscardGuard(() => {
                        setViewData(null);
                        setSearchError('');
                        setMode('parent');
                      })}
                      className="group w-full p-5 rounded-[1.45rem] border flex items-center gap-4 transition-all duration-200 backdrop-blur-xl bg-white/76 border-white/85 hover:bg-white/92 hover:border-sky-200/90"
                    >
                      <div className="w-11 h-11 rounded-2xl flex items-center justify-center transition-colors bg-gradient-to-br from-sky-100 to-emerald-100 text-sky-700"><BarChart3 className="w-5 h-5" /></div>
                      <div className="text-left flex-1"><h3 className="text-base font-black text-slate-800">家長查詢</h3><p className="text-[11px] text-slate-500 mt-0.5">輸入學號查看分析</p></div>
                      <ChevronRight className="w-4.5 h-4.5 text-slate-400 opacity-50 group-hover:opacity-100 group-hover:translate-x-1 transition-all"/>
                   </button>
                </div>

                <p className="mt-6 md:mt-8 text-[11px] font-serif font-semibold tracking-[0.14em] text-slate-500/90">
                  Created by CH.Fan
                </p>
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
                            {(weekendLabelByDate[d] || getWeekendDisplayLabel(d))} <button onClick={() => { handleDeleteDate(d); executeWithSecurity(confirmDeleteDate); }} className="ml-1.5 text-slate-400 hover:text-red-500"><X className="w-3 h-3"/></button>
                        </div>
                    ))}
                </div>

                <div className={`flex p-1 rounded-xl mb-6 shadow-inner ${darkMode ? 'bg-[#020617]/50' : 'bg-slate-100/80'}`}>
                     <button
                       onClick={() => {
                         if (teacherViewMode === 'single') return;
                         if (!confirmDiscardBatchChanges()) return;
                         setTeacherViewMode('single');
                       }}
                       className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${teacherViewMode==='single' ? (darkMode ? 'bg-slate-800 text-slate-200 shadow-md border border-white/5 ring-1 ring-white/5' : 'bg-white text-slate-700 shadow-sm') : 'text-slate-500'}`}
                     >
                       個人檢視
                     </button>
                     <button
                       onClick={() => setTeacherViewMode('batch')}
                       className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${teacherViewMode==='batch' ? (darkMode ? 'bg-slate-800 text-blue-400 shadow-md border border-white/5 ring-1 ring-white/5' : 'bg-white text-blue-700 shadow-sm') : 'text-slate-500'}`}
                     >
                       批量檢視
                     </button>
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
                                    {sortedAvailableDatesDesc.map(d => <option key={d} value={d}>{weekendLabelByDate[d] || getWeekendDisplayLabel(d)}</option>)}
                                </select>
                                <span className={`text-[11px] font-bold px-2 py-1 rounded-full ${darkMode ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-600'}`}>
                                    共 {batchRowsForDisplay.length} 筆
                                </span>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={() => { setSortByPR((prev) => !prev); setSortByProb(false); }} className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 transition-all shadow-sm ${sortByPR ? 'bg-indigo-600 text-white shadow-indigo-500/30' : (darkMode ? 'bg-slate-800 text-slate-400 border border-white/5' : 'bg-white text-slate-600 border border-slate-200')}`}>
                                    <ArrowDownWideNarrow className="w-3.5 h-3.5" /> PR排序
                                </button>
                                <button onClick={() => { setSortByProb((prev) => !prev); setSortByPR(false); }} className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 transition-all shadow-sm ${sortByProb ? 'bg-blue-600 text-white shadow-blue-500/30' : (darkMode ? 'bg-slate-800 text-slate-400 border border-white/5' : 'bg-white text-slate-600 border border-slate-200')}`}>
                                    <Percent className="w-3.5 h-3.5" /> 機率排序
                                </button>
                                <button onClick={handleExportBatchExcel} className={`px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm transition-all flex items-center gap-1 border ${darkMode ? 'bg-slate-800 text-slate-300 border-white/10 hover:bg-slate-700' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
                                    <FileSpreadsheet className="w-3.5 h-3.5" /> 下載 Excel
                                </button>
                                <button
                                  onClick={handleSaveBatchGrades}
                                  className={`text-white px-4 py-1.5 rounded-lg text-xs font-bold shadow-md transition-all active:scale-[0.98] flex items-center gap-1 ${
                                    isBatchDirty
                                      ? 'bg-orange-500 hover:bg-orange-400 animate-pulse shadow-orange-500/30'
                                      : 'bg-blue-600 hover:bg-blue-500 shadow-blue-600/20'
                                  }`}
                                >
                                  <Save className="w-3.5 h-3.5"/> {isBatchDirty ? '儲存變更' : '儲存'}
                                </button>
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
                            <table className="w-full text-sm text-left min-w-[660px] table-fixed">
                                <colgroup>
                                    <col className="w-8" />
                                    <col className="w-[4.9rem]" />
                                    <col className="w-[6.1rem]" />
                                    <col className="w-[3.9rem]" />
                                    <col className="w-[3.9rem]" />
                                    <col className="w-[3.9rem]" />
                                    <col className="w-[3.9rem]" />
                                    <col className="w-[4rem]" />
                                    <col className="w-[3.1rem]" />
                                    <col className="w-[5.2rem]" />
                                </colgroup>
                                <thead className={`text-[10px] uppercase sticky top-0 z-10 ${darkMode ? 'text-slate-400 bg-slate-900' : 'text-slate-400 bg-slate-50'}`}>
                                    <tr>
                                        <th className="px-2 py-3 text-center font-bold">#</th>
                                        <th className="px-2 py-3 text-center font-bold">學號</th>
                                        <th className="px-2 py-3 text-center font-bold">姓名</th>
                                        <th className="px-2 py-3 text-center font-bold text-slate-500">班級</th>
                                        <th className="px-1 py-3 text-center font-bold text-rose-500">國文</th>
                                        <th className="px-1 py-3 text-center font-bold text-amber-500">英文</th>
                                        <th className="px-1 py-3 text-center font-bold text-cyan-500">數學</th>
                                        <th className="px-1 py-3 text-center font-bold text-blue-500">總分</th>
                                        <th className="px-1 py-3 text-center font-bold text-indigo-500">PR</th>
                                        <th className="px-1 py-3 text-center font-bold text-slate-500">錄取機率</th>
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
                                    {batchRowsForDisplay.length === 0 && (
                                        <tr>
                                            <td colSpan={10} className={`px-4 py-8 text-center text-xs font-bold ${darkMode ? 'text-slate-400' : 'text-slate-400'}`}>
                                                目前此日期與班級沒有可顯示資料
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>

                        <div className={`mt-4 rounded-2xl border p-4 ${darkMode ? 'bg-slate-900/40 border-white/10' : 'bg-white/75 border-slate-200/80'}`}>
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                    <Info className={`w-4 h-4 ${darkMode ? 'text-slate-300' : 'text-slate-500'}`} />
                                    <h4 className={`text-xs font-black tracking-widest uppercase ${darkMode ? 'text-slate-200' : 'text-slate-600'}`}>查詢次數監控</h4>
                                </div>
                                <button
                                  onClick={handleResetQueryStats}
                                  disabled={queryStatsLoading}
                                  className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-colors ${
                                    queryStatsLoading
                                      ? 'bg-slate-300 text-white cursor-not-allowed'
                                      : 'bg-red-500 text-white hover:bg-red-400'
                                  }`}
                                >
                                  手動重置
                                </button>
                            </div>
                            <div className={`text-[11px] font-semibold mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-500'}`}>
                                上次重置：{queryStatsLastResetText}
                            </div>
                            <div className={`rounded-xl border overflow-hidden ${darkMode ? 'border-white/10' : 'border-slate-200'}`}>
                                <div className={`grid grid-cols-[6rem_1fr_5rem] px-3 py-2 text-[10px] font-bold tracking-wide ${darkMode ? 'bg-slate-800 text-slate-300' : 'bg-slate-50 text-slate-500'}`}>
                                    <span className="text-center">學號</span>
                                    <span className="text-center">姓名</span>
                                    <span className="text-center">次數</span>
                                </div>
                                <div className={`${darkMode ? 'bg-slate-900/50' : 'bg-white'}`}>
                                    {(queryStatsRows.slice(0, 12)).map((row) => (
                                        <div key={row.id} className={`grid grid-cols-[6rem_1fr_5rem] px-3 py-2 text-xs border-t items-center ${darkMode ? 'border-white/5 text-slate-200' : 'border-slate-100 text-slate-700'}`}>
                                            <span className="font-mono text-center">{row.id}</span>
                                            <span className="truncate text-center">{row.name || '-'}</span>
                                            <span className="font-black text-center text-emerald-600">{row.count}</span>
                                        </div>
                                    ))}
                                    {!queryStatsRows.length && (
                                        <div className={`px-3 py-3 text-center text-xs ${darkMode ? 'text-slate-400' : 'text-slate-400'}`}>
                                            目前尚無查詢紀錄
                                        </div>
                                    )}
                                </div>
                            </div>
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
                    <button onClick={() => { handleDeleteStudent(); executeWithSecurity(confirmDeleteStudent); }} className="bg-red-500/10 text-red-500 p-2.5 rounded-xl hover:bg-red-500/20 transition-colors active:scale-95"><Trash2 className="w-5 h-5"/></button>
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
                                            <td className="px-4 py-3 font-mono text-xs font-bold opacity-60">{weekendLabelByDate[date] || getWeekendDisplayLabel(date)}</td>
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

                  {parentPhaseData.length > 0 ? (
                    <Suspense fallback={<ChartFallback heightClass="h-72" />}>
                      {activeTab === 'total' && <SingleSubjectChart data={parentPhaseData} subjectKey="total" avgKey="avgTotal" lineColor={COLORS.total.hex} title="總分" domain={[0, 300]} isDarkMode={darkMode} />}
                      {activeTab === 'chi' && <SingleSubjectChart data={parentPhaseData} subjectKey="chi" avgKey="avgChi" lineColor={COLORS.chi.hex} title="國文" domain={[0, 100]} isDarkMode={darkMode} />}
                      {activeTab === 'eng' && <SingleSubjectChart data={parentPhaseData} subjectKey="eng" avgKey="avgEng" lineColor={COLORS.eng.hex} title="英文" domain={activePhase === 'mock' ? [0, 80] : [0, 100]} isDarkMode={darkMode} />}
                      {activeTab === 'math' && <SingleSubjectChart data={parentPhaseData} subjectKey="math" avgKey="avgMath" lineColor={COLORS.math.hex} title="數學" domain={activePhase === 'mock' ? [0, 120] : [0, 100]} isDarkMode={darkMode} />}
                      <ParentAbilityRadar data={parentRadarData} maxValue={parentRadarMax} isDarkMode={darkMode} recordCount={parentPhaseData.length} phaseName={activePhaseLabel} />
                    </Suspense>
                  ) : (
                    <div className={`rounded-2xl border px-4 py-8 text-center text-xs font-bold ${darkMode ? 'bg-white/5 border-white/10 text-slate-300' : 'bg-slate-50 border-slate-200 text-slate-500'}`}>
                      目前「{activePhaseLabel || '此階段'}」暫無資料，請切換其他階段查看
                    </div>
                  )}
                </div>
                  
                <div className={`p-6 border-t ${darkMode ? 'bg-[#101a15] border-emerald-200/10' : 'bg-white border-slate-50'}`}>
                    <h4 className={`font-bold mb-6 text-xs flex items-center justify-center gap-2 tracking-widest uppercase ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>詳細紀錄</h4>
                    <div className="space-y-4">
                        {parentPhaseDataDesc.map((d, rowIndex) => {
                             // 使用 weekendID（如果存在）或 date，確保日A班/日B班的週日日期也能正確計算排名
                             const dateForRank = d.weekendID || d.date;
                             const totalRank = calculateRank(dateForRank, 'total', d.total, d.class);
                             const globalPR = calculateGlobalPR(dateForRank, 'total', d.total);
                             return (
                             <div key={`${d.weekendID || d.date}-${rowIndex}`} className={`group p-5 rounded-3xl border transition-all duration-300 ${darkMode ? 'bg-white/5 border-white/5 hover:border-blue-500/20' : 'bg-white border-slate-100 hover:border-blue-200 hover:shadow-lg hover:shadow-blue-50/20'}`}>
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
                        {parentPhaseDataDesc.length === 0 && (
                            <div className={`rounded-2xl border px-4 py-6 text-center text-xs font-bold ${darkMode ? 'bg-white/5 border-white/10 text-slate-300' : 'bg-slate-50 border-slate-200 text-slate-500'}`}>
                                這個階段目前沒有測驗紀錄
                            </div>
                        )}
                    </div>
                </div>
              </div>
            )}
          </div>
        )}

        {showAddStudentModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowAddStudentModal(false)}>
              <div className={`rounded-[2.2rem] p-7 w-full max-w-sm ${darkMode ? 'bg-slate-800 border border-white/10' : 'bg-white shadow-2xl'}`} onClick={e => e.stopPropagation()}>
                  <h3 className={`text-lg font-black mb-4 ${darkMode ? 'text-white' : 'text-slate-800'}`}>新增學生</h3>
                  <p className={`text-xs mb-4 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>輸入學號後可建立新學生，或載入既有資料。</p>
                  <input
                    type="text"
                    value={newStudentIdInput}
                    onChange={(e) => setNewStudentIdInput(e.target.value.toUpperCase())}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddNewStudent()}
                    className={`w-full p-3 rounded-xl text-center text-lg font-black tracking-widest uppercase outline-none border ${
                      darkMode
                        ? 'bg-slate-900 border-white/10 text-white focus:border-blue-400'
                        : 'bg-slate-50 border-slate-200 text-slate-700 focus:bg-white focus:border-blue-300'
                    }`}
                    placeholder="輸入學號"
                    autoFocus
                  />
                  <div className="flex justify-end gap-2 mt-5">
                      <button onClick={() => setShowAddStudentModal(false)} className={`px-4 py-2 rounded-lg text-sm font-bold ${darkMode ? 'text-slate-300 hover:bg-slate-700' : 'text-slate-500 hover:bg-slate-100'}`}>取消</button>
                      <button onClick={handleAddNewStudent} className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold">確認</button>
                  </div>
              </div>
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
                                          <td className="px-4 py-3 font-mono font-bold text-slate-500">{weekendLabelByDate[date] || getWeekendDisplayLabel(date)}</td>
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
                            <Suspense fallback={<ChartFallback heightClass="h-60" />}>
                                <DistributionChart
                                  data={statsModalData[statsActiveTab]}
                                  highlightColor={COLORS[statsActiveTab].hex}
                                  isDarkMode={darkMode}
                                />
                            </Suspense>
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
