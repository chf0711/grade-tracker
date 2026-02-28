import React, { Suspense, useState, useEffect, useMemo, useRef, useCallback, startTransition } from 'react';
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
const FULL_ACCESS_PASSWORD_ENCODED = 'QmVuMTEwNzA1';
const LIMITED_ACCESS_PASSWORD_ENCODED = 'MjQ5MTIxMg==';
const TEACHER_ROLE = Object.freeze({
    FULL: 'full',
    LIMITED: 'limited'
});
const SECURITY_CODE = String.fromCharCode(49, 49, 48, 55);
const QUERY_COUNT_RESET_INTERVAL_MS = 3 * 24 * 60 * 60 * 1000;
const MAX_QUERY_EVENTS = 3000;
const TEACHER_MESSAGE_DOC_ID = 'teacher_parent_message_v1';
const SETTINGS_CACHE_TTL_MS = 10 * 60 * 1000;
const LOCAL_CACHE_KEYS = Object.freeze({
    dates: 'grade_tracker_cache_dates_v1',
    classAverages: 'grade_tracker_cache_class_averages_v18'
});

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

const readLocalCache = (key, ttlMs = SETTINGS_CACHE_TTL_MS) => {
    if (typeof window === 'undefined' || !key) return null;
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        const ts = Number(parsed?.ts) || 0;
        if (!ts || Date.now() - ts > ttlMs) return null;
        return parsed?.data ?? null;
    } catch {
        return null;
    }
};

const writeLocalCache = (key, data) => {
    if (typeof window === 'undefined' || !key) return;
    try {
        localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data }));
    } catch {
        return;
    }
};

// --- Helpers ---
const customDateSort = (a, b) => {
    try {
        const normalizedA = normalizeDateToken(a);
        const normalizedB = normalizeDateToken(b);
        if (!normalizedA && !normalizedB) return 0;
        if (!normalizedA) return 1;
        if (!normalizedB) return -1;
        const [m1, d1] = normalizedA.split('/').map(Number);
        const [m2, d2] = normalizedB.split('/').map(Number);
        if (Number.isNaN(m1) || Number.isNaN(d1) || Number.isNaN(m2) || Number.isNaN(d2)) return 0;
        const m1Adj = m1 < 4 ? m1 + 12 : m1;
        const m2Adj = m2 < 4 ? m2 + 12 : m2;
        if (m1Adj !== m2Adj) return m1Adj - m2Adj;
        return d1 - d2;
    } catch { return 0; }
};

const normalizeDateToken = (dateStr) => {
    if (!dateStr) return '';
    const clean = String(dateStr)
        .trim()
        .replace(/\./g, '/')
        .replace(/-/g, '/')
        .replace(/[^0-9/]/g, '')
        .replace(/\/+/g, '/');
    if (!clean.includes('/')) return '';
    const parts = clean.split('/').filter(Boolean);
    if (parts.length !== 2) return '';
    const [mStr, dStr] = parts;
    const m = parseInt(mStr, 10);
    const d = parseInt(dStr, 10);
    if (Number.isNaN(m) || Number.isNaN(d)) return '';
    if (m < 1 || m > 12 || d < 1 || d > 31) return '';
    const y = m >= 4 ? 2025 : 2026;
    const validatedDate = new Date(y, m - 1, d);
    if (
        validatedDate.getFullYear() !== y ||
        validatedDate.getMonth() !== (m - 1) ||
        validatedDate.getDate() !== d
    ) {
        return '';
    }
    return `${String(m).padStart(2, '0')}/${String(d).padStart(2, '0')}`;
};

const sanitizeDateList = (rawDates) => {
    const unique = new Set();
    (Array.isArray(rawDates) ? rawDates : []).forEach((rawDate) => {
        const normalized = normalizeDateToken(rawDate);
        if (normalized) unique.add(normalized);
    });
    return Array.from(unique).sort(customDateSort);
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
    p1Start: '04/19',
    p1End: '08/02',
    p2Start: '08/09',
    p2End: '12/20',
    mockStart: '12/27',
    mockEnd: '03/15'
};

const resolvePhaseByDate = (dateStr, allDates = null) => {
    const weekendID = getWeekendID(dateStr, allDates);
    const normalized = normalizeDateToken(weekendID);
    if (!normalized) return 'p2';

    const dateValue = getAcademicSortValue(normalized);
    const p1StartValue = getAcademicSortValue(PHASE_BOUNDARIES.p1Start);
    const p1EndValue = getAcademicSortValue(PHASE_BOUNDARIES.p1End);
    const p2StartValue = getAcademicSortValue(PHASE_BOUNDARIES.p2Start);
    const p2EndValue = getAcademicSortValue(PHASE_BOUNDARIES.p2End);
    const mockStartValue = getAcademicSortValue(PHASE_BOUNDARIES.mockStart);
    const mockEndValue = getAcademicSortValue(PHASE_BOUNDARIES.mockEnd);
    if (
        Number.isNaN(dateValue) ||
        Number.isNaN(p1StartValue) ||
        Number.isNaN(p1EndValue) ||
        Number.isNaN(p2StartValue) ||
        Number.isNaN(p2EndValue) ||
        Number.isNaN(mockStartValue) ||
        Number.isNaN(mockEndValue)
    ) {
        return 'p2';
    }

    if (dateValue >= p1StartValue && dateValue <= p1EndValue) return 'p1';
    if (dateValue >= p2StartValue && dateValue <= p2EndValue) return 'p2';
    if (dateValue >= mockStartValue && dateValue <= mockEndValue) return 'mock';

    // 補齊沒有考試的空窗日期，維持最接近下一階段的歸類。
    if (dateValue < p2StartValue) return 'p1';
    if (dateValue < mockStartValue) return 'p2';
    if (dateValue > mockEndValue) return 'mock';
    return 'p2';
};

// 將日期字串轉換為 Date 物件（處理跨年）
const parseDateStr = (dateStr) => {
    const normalized = normalizeDateToken(dateStr);
    if (!normalized) return null;
    try {
        const [mStr, dStr] = normalized.split('/');
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
    if (!dateStr || !String(dateStr).includes('/')) return '';
    
    try {
        const currentDate = parseDateStr(dateStr);
        if (!currentDate) return '';
        
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
        
        return normalizeDateToken(dateStr);
    } catch { return ''; }
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
const BATCH_INSIGHT_TABS = [
    { id: 'grades', label: '成績總表' },
    { id: 'risk', label: '風險預警' },
    { id: 'heatmap', label: '成績熱點圖' },
    { id: 'messages', label: '老師的話' },
    { id: 'query', label: '查詢監控' }
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

const toNumberOrNull = (value) => {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
};

const PROBABILITY_RULES = Object.freeze({
    NORMAL_WEIGHT: 1,
    MOCK_WEIGHT: 2.5,
    NORMAL_BASELINE: 55,
    MOCK_BASELINE: 47,
    POSITIVE_BASE_SLOPE: 1.48,
    POSITIVE_SOFT_THRESHOLD: 16,
    POSITIVE_SOFT_SLOPE: 1.05,
    POSITIVE_HARD_THRESHOLD: 30,
    POSITIVE_HARD_SLOPE: 0.7,
    NEGATIVE_GENTLE_SLOPE: 0.95,
    NEGATIVE_HARD_THRESHOLD: -18,
    NEGATIVE_HARD_SLOPE: 1.3,
    MATH_BONUS_THRESHOLD: 60,
    MATH_BONUS_SCALE: 0.1,
    MAX_MATH_BONUS: 5,
    FULL_CONFIDENCE_WEIGHT: 10
});

const getProbabilityProfileByWeekend = (weekendID, availableDates) => {
    const phase = resolvePhaseByDate(weekendID, availableDates);
    const weight = phase === 'mock' ? PROBABILITY_RULES.MOCK_WEIGHT : PROBABILITY_RULES.NORMAL_WEIGHT;
    const baseline = phase === 'mock' ? PROBABILITY_RULES.MOCK_BASELINE : PROBABILITY_RULES.NORMAL_BASELINE;
    return { weight, baseline };
};

const resolveRiskLevel = (score) => {
    if (score >= 70) return '高風險';
    if (score >= 45) return '中風險';
    return '觀察';
};

const getHeatCellStyle = (ratio, isDarkMode) => {
    if (!Number.isFinite(ratio)) {
        return isDarkMode
            ? { background: 'rgba(15,23,42,0.45)', color: '#94a3b8', border: '1px solid rgba(148,163,184,0.2)' }
            : { background: 'rgba(248,250,252,0.85)', color: '#94a3b8', border: '1px solid rgba(148,163,184,0.25)' };
    }

    const bounded = clamp(ratio, 0, 1);
    const hue = Math.round(bounded * 120);
    const lightnessStart = isDarkMode ? 32 : 90;
    const lightnessEnd = isDarkMode ? 24 : 82;
    const textColor = bounded <= 0.34 ? '#ffffff' : (isDarkMode ? '#dcfce7' : '#052e16');

    return {
        color: textColor,
        border: `1px solid hsla(${hue}, 85%, ${isDarkMode ? 62 : 34}%, ${isDarkMode ? 0.35 : 0.25})`,
        background: `linear-gradient(135deg, hsla(${hue}, 94%, ${lightnessStart}%, ${isDarkMode ? 0.55 : 0.95}) 0%, hsla(${hue}, 90%, ${lightnessEnd}%, ${isDarkMode ? 0.72 : 0.98}) 100%)`,
        boxShadow: `inset 0 0 0 1px hsla(${hue}, 80%, ${isDarkMode ? 70 : 45}%, ${isDarkMode ? 0.16 : 0.18})`
    };
};

const getProbabilityVisual = (probValue, isDarkMode) => {
    const parsed = Number(probValue);
    if (!Number.isFinite(parsed)) return null;

    const prob = clamp(parsed, 1, 99);
    const progress = prob / 100;
    // 連續色譜：低機率鮮紅(0deg) -> 中段金黃 -> 高機率翠綠(120deg)
    const hue = Math.round(progress * 120);
    const hueStart = clamp(hue - 16, 0, 120);
    const hueMid = clamp(hue + 2, 0, 120);
    const hueEnd = clamp(hue + 18, 0, 120);
    const saturation = isDarkMode ? 92 : 94;
    const textLightness = isDarkMode ? 76 : 30;
    const badgeTextColor = prob <= 45
        ? '#ffffff'
        : `hsl(${hue} ${saturation}% ${isDarkMode ? 84 : 24}%)`;
    const badgeAlphaStart = isDarkMode ? 0.72 : 0.88;
    const badgeAlphaMid = isDarkMode ? 0.82 : 0.95;
    const badgeAlphaEnd = isDarkMode ? 0.9 : 0.99;

    return {
        textStyle: {
            color: `hsl(${hue} ${saturation}% ${textLightness}%)`,
            textShadow: prob <= 25
                ? (isDarkMode ? '0 0 12px rgba(248,113,113,0.45)' : '0 1px 2px rgba(220,38,38,0.35)')
                : 'none'
        },
        badgeStyle: {
            color: badgeTextColor,
            background: `linear-gradient(132deg, hsla(${hueStart}, ${saturation}%, ${isDarkMode ? 57 : 50}%, ${badgeAlphaStart}) 0%, hsla(${hueMid}, ${Math.min(saturation + 3, 99)}%, ${isDarkMode ? 50 : 45}%, ${badgeAlphaMid}) 52%, hsla(${hueEnd}, ${saturation}%, ${isDarkMode ? 43 : 40}%, ${badgeAlphaEnd}) 100%)`,
            border: `1px solid hsla(${hue}, ${Math.min(saturation + 1, 99)}%, ${isDarkMode ? 80 : 30}%, ${isDarkMode ? 0.56 : 0.4})`,
            boxShadow: `0 10px 22px -14px hsla(${hue}, ${saturation}%, ${isDarkMode ? 64 : 34}%, ${prob <= 25 ? 0.72 : 0.46}), inset 0 1px 0 rgba(255,255,255,${isDarkMode ? 0.14 : 0.28})`
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

const buildPRLookupByScore = (scoresDesc) => {
    if (!Array.isArray(scoresDesc) || scoresDesc.length === 0) return null;
    const lookup = new Map();
    const total = scoresDesc.length;

    for (let i = 0; i < total; i++) {
        const score = scoresDesc[i];
        if (!lookup.has(score)) {
            const rank = i + 1;
            const pr = Math.floor(((total - rank) / total) * 100);
            lookup.set(score, pr);
        }
    }

    return lookup;
};

const normalizeQueryEvent = (rawEvent) => {
    const id = String(rawEvent?.id || '').toUpperCase().trim();
    const at = String(rawEvent?.at || '');
    if (!id || !at) return null;
    const ts = new Date(at).getTime();
    if (Number.isNaN(ts)) return null;
    return { id, at, ts };
};

const sanitizeQueryEvents = (rawEvents, lastResetAt = '') => {
    const resetTs = new Date(lastResetAt || '').getTime();
    const validResetTs = Number.isNaN(resetTs) ? null : resetTs;
    const normalized = (Array.isArray(rawEvents) ? rawEvents : [])
        .map(normalizeQueryEvent)
        .filter(Boolean)
        .filter((event) => {
            if (validResetTs === null) return true;
            return event.ts >= validResetTs;
        })
        .sort((a, b) => a.ts - b.ts);

    return normalized.slice(-MAX_QUERY_EVENTS);
};

const normalizeTeacherStudentMessages = (rawMessages) => {
    if (!rawMessages || typeof rawMessages !== 'object') return {};
    const normalized = {};

    Object.entries(rawMessages).forEach(([rawId, rawMessage]) => {
        const id = String(rawId || '').toUpperCase().trim();
        const message = String(rawMessage || '').trim();
        if (!id || !message) return;
        normalized[id] = message;
    });

    return normalized;
};

// --- Helper Logic for Probability ---
const calculateProbLogic = (
    targetStudent,
    scoresByDate,
    mathScoresByDate,
    studentGradeMaps,
    availableDates,
    probabilityProfiles = null,
    totalPRLookupByDate = null,
    mathPRLookupByDate = null
) => {
    let weightedDiffSum = 0;
    let totalWeight = 0;
    let weightedMathPRSum = 0;
    let totalMathWeight = 0;
    
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
         
         const profile = probabilityProfiles?.[weekendID] || getProbabilityProfileByWeekend(weekendID, availableDates);
         const weight = profile.weight;

         // Total PR Logic
         if (myTotal !== null && !isNaN(myTotal) && scoresByDate[weekendID] && scoresByDate[weekendID].length >= 5) {
             let pr = null;
             const fastLookup = totalPRLookupByDate?.[weekendID];
             if (fastLookup && fastLookup.has(myTotal)) {
                 pr = fastLookup.get(myTotal);
             } else {
                 const scores = scoresByDate[weekendID];
                 const rank = scores.indexOf(myTotal) + 1;
                 if (rank > 0) {
                     pr = Math.floor(((scores.length - rank) / scores.length) * 100);
                 }
             }
             if (pr !== null) {
                 const diff = pr - profile.baseline;
                 weightedDiffSum += diff * weight;
                 totalWeight += weight;
             }
         }

         // Math Bonus
         if (myMath !== null && !isNaN(myMath) && mathScoresByDate[weekendID] && mathScoresByDate[weekendID].length >= 5) {
             let pr = null;
             const fastLookup = mathPRLookupByDate?.[weekendID];
             if (fastLookup && fastLookup.has(myMath)) {
                 pr = fastLookup.get(myMath);
             } else {
                 const scores = mathScoresByDate[weekendID];
                 const rank = scores.indexOf(myMath) + 1;
                 if (rank > 0) {
                     pr = Math.floor(((scores.length - rank) / scores.length) * 100);
                 }
             }
             if (pr !== null) {
                 weightedMathPRSum += pr * weight;
                 totalMathWeight += weight;
             }
         }
    });

    if (totalWeight === 0) return '-';

    const avgDiff = weightedDiffSum / totalWeight;
    const avgMathPR = totalMathWeight > 0 ? weightedMathPRSum / totalMathWeight : 0;
    
    // 達標即 50%：低於標準先溫和下降，只有明顯落後才加大線性下降。
    let modelProb = 50;
    if (avgDiff >= 0) {
        const softThreshold = PROBABILITY_RULES.POSITIVE_SOFT_THRESHOLD;
        const hardThreshold = PROBABILITY_RULES.POSITIVE_HARD_THRESHOLD;
        if (avgDiff <= softThreshold) {
            modelProb = 50 + avgDiff * PROBABILITY_RULES.POSITIVE_BASE_SLOPE;
        } else if (avgDiff <= hardThreshold) {
            const softThresholdProb = 50 + softThreshold * PROBABILITY_RULES.POSITIVE_BASE_SLOPE;
            modelProb = softThresholdProb + (avgDiff - softThreshold) * PROBABILITY_RULES.POSITIVE_SOFT_SLOPE;
        } else {
            const softThresholdProb = 50 + softThreshold * PROBABILITY_RULES.POSITIVE_BASE_SLOPE;
            const hardThresholdProb = softThresholdProb + (hardThreshold - softThreshold) * PROBABILITY_RULES.POSITIVE_SOFT_SLOPE;
            modelProb = hardThresholdProb + (avgDiff - hardThreshold) * PROBABILITY_RULES.POSITIVE_HARD_SLOPE;
        }
    } else {
        const hardThreshold = PROBABILITY_RULES.NEGATIVE_HARD_THRESHOLD;
        if (avgDiff >= hardThreshold) {
            modelProb = 50 + avgDiff * PROBABILITY_RULES.NEGATIVE_GENTLE_SLOPE;
        } else {
            const thresholdProb = 50 + hardThreshold * PROBABILITY_RULES.NEGATIVE_GENTLE_SLOPE;
            const extraDrop = Math.abs(avgDiff - hardThreshold) * PROBABILITY_RULES.NEGATIVE_HARD_SLOPE;
            modelProb = thresholdProb - extraDrop;
        }
    }

    // 數學加分：平均 PR > 60 起算，連續增幅，上限 +5。
    const mathBonus = clamp(
        (avgMathPR - PROBABILITY_RULES.MATH_BONUS_THRESHOLD) * PROBABILITY_RULES.MATH_BONUS_SCALE,
        0,
        PROBABILITY_RULES.MAX_MATH_BONUS
    );

    const boostedProb = modelProb + mathBonus;
    const confidence = clamp(totalWeight / PROBABILITY_RULES.FULL_CONFIDENCE_WEIGHT, 0, 1);
    const stabilizedProb = 50 + (boostedProb - 50) * confidence;

    return Math.round(clamp(stabilizedProb, 1, 99));
};

const buildProbabilityContext = (students, availableDates, getDateID) => {
    const normalizedDates = Array.isArray(availableDates) ? availableDates : [];
    const scoresByDate = {};
    const mathScoresByDate = {};
    const probabilityProfiles = {};

    const ensureWeekendBucket = (weekendID) => {
        if (!weekendID) return;
        if (!scoresByDate[weekendID]) scoresByDate[weekendID] = [];
        if (!mathScoresByDate[weekendID]) mathScoresByDate[weekendID] = [];
        if (!probabilityProfiles[weekendID]) {
            probabilityProfiles[weekendID] = getProbabilityProfileByWeekend(weekendID, normalizedDates);
        }
    };

    normalizedDates.forEach((date) => {
        ensureWeekendBucket(getDateID(date));
    });

    students.forEach((student) => {
        if (!student?.grades) return;
        Object.entries(student.grades).forEach(([date, grade]) => {
            const weekendID = getDateID(date);
            if (!weekendID) return;
            ensureWeekendBucket(weekendID);

            const totalRaw = grade?.total;
            if (totalRaw && !Number.isNaN(parseFloat(totalRaw))) {
                scoresByDate[weekendID].push(parseFloat(totalRaw));
            }

            const mathRaw = grade?.math;
            if (mathRaw && !Number.isNaN(parseFloat(mathRaw))) {
                mathScoresByDate[weekendID].push(parseFloat(mathRaw));
            }
        });
    });

    const totalPRLookupByDate = {};
    const mathPRLookupByDate = {};

    Object.keys(scoresByDate).forEach((weekendID) => {
        scoresByDate[weekendID].sort((a, b) => b - a);
        totalPRLookupByDate[weekendID] = buildPRLookupByScore(scoresByDate[weekendID]);
    });

    Object.keys(mathScoresByDate).forEach((weekendID) => {
        mathScoresByDate[weekendID].sort((a, b) => b - a);
        mathPRLookupByDate[weekendID] = buildPRLookupByScore(mathScoresByDate[weekendID]);
    });

    return {
        normalizedDates,
        scoresByDate,
        mathScoresByDate,
        probabilityProfiles,
        totalPRLookupByDate,
        mathPRLookupByDate
    };
};

// --- Components ---
const SingleSubjectChart = React.lazy(() => import('./components/charts/SingleSubjectChart'));
const DistributionChart = React.lazy(() => import('./components/charts/DistributionChart'));
const ParentAbilityRadar = React.lazy(() => import('./components/charts/ParentAbilityRadar'));

const ChartFallback = ({ heightClass = 'h-60' }) => (
    <div className={`${heightClass} rounded-2xl border border-slate-200/80 bg-white flex items-center justify-center text-xs font-bold text-slate-400`}>
        載入圖表中...
    </div>
);

const BatchRow = React.memo(({ student, sIndex, dateGrades, prValue, probValue, darkMode, canEdit, handleBatchGradeChange, handleKeyDown, handlePaste }) => {
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
                    disabled={!canEdit}
                    onChange={(e) => handleBatchGradeChange(student.id, 'class', e.target.value)}
                    className={`w-full text-center text-xs font-bold py-1.5 rounded-lg opacity-70 border-none outline-none appearance-none transition-opacity ${canEdit ? 'cursor-pointer hover:opacity-100' : 'cursor-not-allowed opacity-55'} ${darkMode ? 'bg-slate-900/50 text-slate-400 focus:text-slate-200' : 'bg-slate-100 text-slate-600 focus:text-slate-900'}`}
                >
                    {CLASS_DEFS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
            </td>
            {['chi', 'eng', 'math'].map((sub) => (
                <td key={sub} className="w-[3.9rem] px-1 py-1">
                    <input 
                        id={`cell-${sIndex}-${sub}`} 
                        type="text" 
                        disabled={!canEdit}
                        className={`w-full text-center p-1.5 rounded-lg border border-transparent outline-none text-xs font-bold transition-all shadow-inner focus:ring-1 ${darkMode ? 'bg-slate-950/50 text-slate-300 focus:bg-slate-900 focus:border-blue-500/50 focus:ring-blue-500/20' : 'bg-slate-50 text-slate-600 focus:bg-white focus:border-blue-200 focus:ring-blue-200'}`} 
                        value={dateGrades[sub] || ''} 
                        onChange={(e) => handleBatchGradeChange(student.id, sub, e.target.value)} 
                        onKeyDown={canEdit ? (e) => handleKeyDown(e, sIndex, sub) : undefined} 
                        onPaste={canEdit ? (e) => handlePaste(e, sIndex, sub) : undefined} 
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
  const [authReady, setAuthReady] = useState(false);
  const [mode, setMode] = useState('landing'); 
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [teacherAuthRole, setTeacherAuthRole] = useState(TEACHER_ROLE.FULL);
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
  const [isClassAveragesDirty, setIsClassAveragesDirty] = useState(false);
  
  const [showSecurityModal, setShowSecurityModal] = useState(false);
  const [securityInput, setSecurityInput] = useState('');
  const [pendingAction, setPendingAction] = useState(null);
  const [pendingActionTitle, setPendingActionTitle] = useState('安全驗證');
  const securityInputRef = useRef(null);
    
  const [teacherViewMode, setTeacherViewMode] = useState('batch');
  const [teacherClassFilter, setTeacherClassFilter] = useState('A班'); 
  const [avgSettingsClassFilter, setAvgSettingsClassFilter] = useState('A班'); 
  const [batchDate, setBatchDate] = useState(''); 
  const [batchInsightTab, setBatchInsightTab] = useState('grades');
  const [isBatchDirty, setIsBatchDirty] = useState(false);
  const [allStudentsData, setAllStudentsData] = useState([]); 
  const [cachedClassData, setCachedClassData] = useState([]); 
  const [sortByPR, setSortByPR] = useState(false);
  const [sortByProb, setSortByProb] = useState(false);
  const [queryStatsById, setQueryStatsById] = useState({});
  const [queryEvents, setQueryEvents] = useState([]);
  const [queryStatsLastResetAt, setQueryStatsLastResetAt] = useState('');
  const [queryStatsLoading, setQueryStatsLoading] = useState(false);
  const [queryMonitorKeyword, setQueryMonitorKeyword] = useState('');
  const [queryMonitorDateFilter, setQueryMonitorDateFilter] = useState('all');
  const [queryMonitorScope, setQueryMonitorScope] = useState('all');
  const [queryMonitorSort, setQueryMonitorSort] = useState('count_desc');
  const [teacherGlobalMessage, setTeacherGlobalMessage] = useState('');
  const [teacherGlobalMessageDraft, setTeacherGlobalMessageDraft] = useState('');
  const [teacherStudentMessages, setTeacherStudentMessages] = useState({});
  const [teacherStudentMessageDrafts, setTeacherStudentMessageDrafts] = useState({});
  const [teacherMessageLoading, setTeacherMessageLoading] = useState(false);
  const [teacherMessageSaving, setTeacherMessageSaving] = useState(false);
  const [teacherStudentMessageSavingId, setTeacherStudentMessageSavingId] = useState('');
    
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
  const isLimitedTeacherRole = teacherAuthRole === TEACHER_ROLE.LIMITED;
  const canEditStudentGrades = !isLimitedTeacherRole;
  const canImportExcel = canEditStudentGrades || isLimitedTeacherRole;
  const canDeleteDates = !isLimitedTeacherRole;

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

  const orderedWeekendIds = useMemo(() => {
      const ids = [];
      const seen = new Set();
      sortedAvailableDatesAsc.forEach((date) => {
          const weekendID = getTestDateID(date);
          if (!weekendID || seen.has(weekendID)) return;
          seen.add(weekendID);
          ids.push(weekendID);
      });
      return ids;
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
      const storedRole = localStorage.getItem('teacher_role');
      if (storedAuth === 'true') {
          setIsAuthenticated(true);
          setTeacherAuthRole(storedRole === TEACHER_ROLE.LIMITED ? TEACHER_ROLE.LIMITED : TEACHER_ROLE.FULL);
      }
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
          const context = buildProbabilityContext(allStudentsData, availableDates, getTestDateID);
          const {
              scoresByDate,
              mathScoresByDate,
              probabilityProfiles,
              totalPRLookupByDate,
              mathPRLookupByDate,
              normalizedDates
          } = context;

          const studentGradeMaps = studentGradeMapsByStudentId;

          const probs = {};
          
          // 3. Calculate probs using fast lookups
          allStudentsData.forEach((s) => {
              probs[s.id] = calculateProbLogic(
                  s,
                  scoresByDate,
                  mathScoresByDate,
                  studentGradeMaps,
                  normalizedDates,
                  probabilityProfiles,
                  totalPRLookupByDate,
                  mathPRLookupByDate
              );
          });
          
          rafId = requestAnimationFrame(() => {
              startTransition(() => {
                  setAdmissionProbabilities(probs);
              });
          });
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
      if (teacherViewMode !== 'batch' && batchInsightTab !== 'grades') {
          setBatchInsightTab('grades');
      }
  }, [teacherViewMode, batchInsightTab]);

  useEffect(() => {
      if (mode !== 'teacher') return;
      ensureXlsxReady().catch(() => {});
  }, [mode, ensureXlsxReady]);

  // 預先載入圖表 chunk，降低第一次打開分析視圖的等待感
  useEffect(() => {
      if (typeof window === 'undefined') return undefined;

      const preloadCharts = () => {
          void import('./components/charts/SingleSubjectChart');
          void import('./components/charts/DistributionChart');
          void import('./components/charts/ParentAbilityRadar');
      };

      if ('requestIdleCallback' in window) {
          const idleId = window.requestIdleCallback(preloadCharts, { timeout: 1500 });
          return () => window.cancelIdleCallback?.(idleId);
      }

      const timer = window.setTimeout(preloadCharts, 700);
      return () => window.clearTimeout(timer);
  }, []);

  // Intentionally initialize auth listener once at app bootstrap.
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (!auth) {
          setAuthReady(true);
          return;
        }
        if (typeof runtimeInitialAuthToken !== 'undefined' && runtimeInitialAuthToken) {
          await signInWithCustomToken(auth, runtimeInitialAuthToken);
        }
        else await signInAnonymously(auth);
      } catch (e) {
          console.error(e);
          setAuthReady(true);
      }
    };
    if (auth) {
        initAuth();
        const unsubscribe = onAuthStateChanged(auth, (u) => {
          setAuthReady(true);
          setUser(u);
          if (u) { loadDates(); loadClassAverages(); }
        });
        return () => unsubscribe();
    } else {
        setAuthReady(true);
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

  const notifyPermissionDenied = useCallback((message) => {
      setStatusMsg(message);
      setTimeout(() => setStatusMsg(''), 2200);
  }, []);

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
      const fallbackDates = sanitizeDateList(DEFAULT_EXAM_STARTS);
      const cachedDates = sanitizeDateList(readLocalCache(LOCAL_CACHE_KEYS.dates) || []);
      if (cachedDates.length) {
          if (cachedDates.join('|') !== availableDates.join('|')) {
              setAvailableDates(cachedDates);
          }
          return cachedDates;
      }
      if (!db) {
          const cleanedLocalDates = sanitizeDateList(availableDates);
          const nextDates = cleanedLocalDates.length ? cleanedLocalDates : fallbackDates;
          if (nextDates.join('|') !== availableDates.join('|')) {
              setAvailableDates(nextDates);
          }
          writeLocalCache(LOCAL_CACHE_KEYS.dates, nextDates);
          return nextDates;
      }
      try {
          const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'dates');
          const docSnap = await getDoc(docRef);
          const rawList = docSnap.exists() && Array.isArray(docSnap.data().list)
              ? docSnap.data().list
              : DEFAULT_EXAM_STARTS;
          const cleanedDates = sanitizeDateList(rawList);
          const nextDates = cleanedDates.length ? cleanedDates : fallbackDates;

          setAvailableDates(nextDates);
          writeLocalCache(LOCAL_CACHE_KEYS.dates, nextDates);

          const rawFingerprint = (Array.isArray(rawList) ? rawList : []).map((date) => String(date || '')).join('|');
          const cleanedFingerprint = nextDates.join('|');
          if (cleanedFingerprint !== rawFingerprint) {
              await setDoc(docRef, { list: nextDates }, { merge: true });
          }
          return nextDates;
      } catch(e) {
          console.error("Error loading dates:", e);
          const cleanedFallback = sanitizeDateList(availableDates);
          const nextDates = cleanedFallback.length ? cleanedFallback : fallbackDates;
          setAvailableDates(nextDates);
          writeLocalCache(LOCAL_CACHE_KEYS.dates, nextDates);
          return nextDates;
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
          setQueryEvents([]);
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
          let events = sanitizeQueryEvents(raw.events, lastResetAt);

          if (shouldResetQueryStats(lastResetAt)) {
              counts = {};
              events = [];
              lastResetAt = nowIso;
              await setDoc(queryStatsDocRef, { counts, events, lastResetAt, updatedAt: nowIso }, { merge: true });
          }

          setQueryStatsById(counts);
          setQueryEvents(events);
          setQueryStatsLastResetAt(lastResetAt);
      } catch (e) {
          console.error('Load query stats error:', e);
      } finally {
          setQueryStatsLoading(false);
      }
  }, [shouldResetQueryStats]);

  const loadTeacherMessage = useCallback(async () => {
      if (!db) {
          setTeacherGlobalMessage('');
          setTeacherGlobalMessageDraft('');
          setTeacherStudentMessages({});
          setTeacherStudentMessageDrafts({});
          return;
      }

      setTeacherMessageLoading(true);
      try {
          const messageDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'settings', TEACHER_MESSAGE_DOC_ID);
          const docSnap = await getDoc(messageDocRef);
          const raw = docSnap.exists() ? docSnap.data() : {};
          const nextGlobalMessage = String(raw?.globalMessage ?? raw?.message ?? '').trim();
          const nextByStudentMessages = normalizeTeacherStudentMessages(raw?.byStudent);

          setTeacherGlobalMessage(nextGlobalMessage);
          setTeacherGlobalMessageDraft(nextGlobalMessage);
          setTeacherStudentMessages(nextByStudentMessages);
          setTeacherStudentMessageDrafts(nextByStudentMessages);
      } catch (e) {
          console.error('Load teacher message error:', e);
      } finally {
          setTeacherMessageLoading(false);
      }
  }, []);

  const incrementQueryCount = useCallback(async (studentId) => {
      const normalizedId = String(studentId || '').toUpperCase().trim();
      if (!normalizedId) return;
      const nowTs = Date.now();
      const nowIso = new Date(nowTs).toISOString();

      setQueryStatsById((prev) => ({ ...prev, [normalizedId]: (prev[normalizedId] || 0) + 1 }));
      setQueryEvents((prev) => {
          const next = [...prev, { id: normalizedId, at: nowIso, ts: nowTs }];
          return next.slice(-MAX_QUERY_EVENTS);
      });

      if (!db) return;

      try {
          const queryStatsDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'query_stats_v1');
          const docSnap = await getDoc(queryStatsDocRef);
          const raw = docSnap.exists() ? docSnap.data() : {};
          let counts = (raw.counts && typeof raw.counts === 'object') ? raw.counts : {};
          let lastResetAt = raw.lastResetAt || nowIso;
          let events = sanitizeQueryEvents(raw.events, lastResetAt);

          if (shouldResetQueryStats(lastResetAt)) {
              counts = {};
              events = [];
              lastResetAt = nowIso;
          }

          counts[normalizedId] = (Number(counts[normalizedId]) || 0) + 1;
          events = sanitizeQueryEvents([...events, { id: normalizedId, at: nowIso }], lastResetAt);
          await setDoc(queryStatsDocRef, { counts, events, lastResetAt, updatedAt: nowIso }, { merge: true });

          setQueryStatsById(counts);
          setQueryEvents(events);
          setQueryStatsLastResetAt(lastResetAt);
      } catch (e) {
          console.error('Increment query count error:', e);
      }
  }, [shouldResetQueryStats]);

  const handleResetQueryStats = useCallback(async () => {
      const nowIso = new Date().toISOString();
      setQueryStatsLoading(true);
      try {
          if (db) {
              const queryStatsDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'query_stats_v1');
              await setDoc(queryStatsDocRef, { counts: {}, events: [], lastResetAt: nowIso, updatedAt: nowIso }, { merge: true });
          }

          setQueryStatsById({});
          setQueryEvents([]);
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

  useEffect(() => {
      if (mode !== 'teacher') return;
      setTeacherViewMode('batch');
  }, [mode]);

  useEffect(() => {
      if (!user) return;
      loadTeacherMessage();
  }, [user, loadTeacherMessage]);
  const closeSecurityModal = useCallback(() => {
      setShowSecurityModal(false);
      setPendingAction(null);
      setSecurityInput('');
      setPendingActionTitle('安全驗證');
  }, []);

  const executeWithSecurity = useCallback((action, options = {}) => {
      const { title = '安全驗證' } = options;
      setPendingAction(() => action);
      setPendingActionTitle(title);
      setSecurityInput('');
      setShowSecurityModal(true);
      setTimeout(() => {
          if (securityInputRef.current) securityInputRef.current.focus();
      }, 100);
  }, []);

  const handleSecurityInput = (e) => {
      const val = e.target.value;
      setSecurityInput(val);
      if (val === SECURITY_CODE) {
          if (pendingAction) pendingAction();
          closeSecurityModal();
      }
  };

  const addDate = async () => {
      const normalizedInput = normalizeDateToken(newDateInput);
      if (!normalizedInput) {
          setStatusMsg('日期錯誤，請輸入有效日期（例如 02/15）');
          setTimeout(() => setStatusMsg(''), 2200);
          return;
      }
      if (availableDates.includes(normalizedInput)) return;
      const newList = sanitizeDateList([...availableDates, normalizedInput]);
      setAvailableDates(newList);
      writeLocalCache(LOCAL_CACHE_KEYS.dates, newList);
      setNewDateInput('');
      if (db) await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'dates'), { list: newList }, { merge: true });
      setStatusMsg(`已新增: ${normalizedInput}`); setTimeout(() => setStatusMsg(''), 2000);
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
      const cachedAverages = readLocalCache(LOCAL_CACHE_KEYS.classAverages);
      if (cachedAverages && typeof cachedAverages === 'object') {
          setClassAverages({ ...localComputedAverages, ...cachedAverages });
          return;
      }
      if (!db) {
          setClassAverages(localComputedAverages);
          writeLocalCache(LOCAL_CACHE_KEYS.classAverages, localComputedAverages);
          return;
      }
      try {
          const docSnap = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'class_averages_v18'));
          let dbAverages = {};
          if (docSnap.exists()) dbAverages = docSnap.data().averages || {};
          const mergedAverages = { ...localComputedAverages, ...dbAverages };
          setClassAverages(mergedAverages);
          writeLocalCache(LOCAL_CACHE_KEYS.classAverages, mergedAverages);
      } catch (e) {
          console.error('Load class averages error:', e);
          setClassAverages(localComputedAverages);
          writeLocalCache(LOCAL_CACHE_KEYS.classAverages, localComputedAverages);
      }
  };

  useEffect(() => {
      if (allStudentsData.length > 0) {
          setClassAverages(prev => {
              const next = { ...prev, ...localComputedAverages };
              writeLocalCache(LOCAL_CACHE_KEYS.classAverages, next);
              return next;
          });
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
      setIsClassAveragesDirty(true);
  };

  const persistClassAverages = useCallback(async (nextAverages, options = {}) => {
      const { closeModal = false, showToast = false, toastMessage = '設定已儲存' } = options;
      writeLocalCache(LOCAL_CACHE_KEYS.classAverages, nextAverages);
      if (!db) {
          if (closeModal) setShowAvgModal(false);
          return true;
      }
      try {
          await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'class_averages_v18'), { averages: nextAverages }, { merge: true });
          if (showToast) {
              setStatusMsg(toastMessage);
              setTimeout(() => setStatusMsg(''), 2000);
          }
          if (closeModal) setShowAvgModal(false);
          return true;
      } catch (e) {
          console.error('Save class averages error:', e);
          if (showToast) {
              setStatusMsg('儲存失敗');
              setTimeout(() => setStatusMsg(''), 2000);
          }
          return false;
      }
  }, []);

  useEffect(() => {
      if (!isClassAveragesDirty) return undefined;
      const timer = setTimeout(async () => {
          const ok = await persistClassAverages(classAverages);
          if (ok) setIsClassAveragesDirty(false);
      }, 900);
      return () => clearTimeout(timer);
  }, [isClassAveragesDirty, classAverages, persistClassAverages]);

  const saveManualClassAverages = async () => {
      const ok = await persistClassAverages(classAverages, { closeModal: true, showToast: true, toastMessage: '設定已儲存' });
      if (ok) setIsClassAveragesDirty(false);
  };

  const persistTeacherMessages = useCallback(async (nextGlobalMessage, nextByStudentMessages) => {
      const normalizedGlobal = String(nextGlobalMessage || '').trim();
      const normalizedByStudent = normalizeTeacherStudentMessages(nextByStudentMessages);
      if (db) {
          const messageDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'settings', TEACHER_MESSAGE_DOC_ID);
          await setDoc(messageDocRef, {
              globalMessage: normalizedGlobal,
              message: normalizedGlobal,
              byStudent: normalizedByStudent,
              updatedAt: new Date().toISOString(),
              updatedBy: user?.uid || ''
          });
      }
      return { normalizedGlobal, normalizedByStudent };
  }, [user]);

  const handleSaveGlobalTeacherMessage = useCallback(async () => {
      if (!user) return;
      setTeacherMessageSaving(true);
      try {
          const { normalizedGlobal, normalizedByStudent } = await persistTeacherMessages(
              teacherGlobalMessageDraft,
              teacherStudentMessages
          );
          setTeacherGlobalMessage(normalizedGlobal);
          setTeacherGlobalMessageDraft(normalizedGlobal);
          setTeacherStudentMessages(normalizedByStudent);
          setTeacherStudentMessageDrafts(normalizedByStudent);
          setStatusMsg(normalizedGlobal ? '已儲存全班老師的話' : '已清空全班老師的話');
          setTimeout(() => setStatusMsg(''), 2000);
      } catch (e) {
          console.error('Save global teacher message error:', e);
          setStatusMsg('全班老師的話儲存失敗');
          setTimeout(() => setStatusMsg(''), 2000);
      } finally {
          setTeacherMessageSaving(false);
      }
  }, [teacherGlobalMessageDraft, teacherStudentMessages, user, persistTeacherMessages]);

  const handleSaveStudentTeacherMessage = useCallback(async (studentId) => {
      if (!user) return;
      const normalizedId = String(studentId || '').toUpperCase().trim();
      if (!normalizedId) return;
      const draftMessage = String(teacherStudentMessageDrafts[normalizedId] || '').trim();
      const nextByStudentMessages = { ...teacherStudentMessages };
      if (draftMessage) nextByStudentMessages[normalizedId] = draftMessage;
      else delete nextByStudentMessages[normalizedId];

      setTeacherStudentMessageSavingId(normalizedId);
      try {
          const { normalizedGlobal, normalizedByStudent } = await persistTeacherMessages(
              teacherGlobalMessage,
              nextByStudentMessages
          );
          setTeacherGlobalMessage(normalizedGlobal);
          setTeacherGlobalMessageDraft(normalizedGlobal);
          setTeacherStudentMessages(normalizedByStudent);
          setTeacherStudentMessageDrafts((prev) => {
              const next = { ...prev };
              if (draftMessage) next[normalizedId] = draftMessage;
              else delete next[normalizedId];
              return next;
          });
          setStatusMsg(draftMessage ? `已儲存 ${normalizedId} 的個別老師的話` : `已清空 ${normalizedId} 的個別老師的話`);
          setTimeout(() => setStatusMsg(''), 2000);
      } catch (e) {
          console.error('Save student teacher message error:', e);
          setStatusMsg('個別老師的話儲存失敗');
          setTimeout(() => setStatusMsg(''), 2000);
      } finally {
          setTeacherStudentMessageSavingId('');
      }
  }, [teacherStudentMessages, teacherStudentMessageDrafts, teacherGlobalMessage, user, persistTeacherMessages]);

  const handleDeleteDate = (dateToDelete) => {
      if (!canDeleteDates) {
          notifyPermissionDenied('2491212 權限無法刪除日期');
          return;
      }
      setDeleteTarget(dateToDelete);
  };
  const confirmDeleteDate = async () => {
      if (!canDeleteDates) {
          notifyPermissionDenied('2491212 權限無法刪除日期');
          setDeleteTarget(null);
          return;
      }
      if (!deleteTarget) return;
      const newList = availableDates.filter(d => d !== deleteTarget);
      setAvailableDates(newList);
      writeLocalCache(LOCAL_CACHE_KEYS.dates, newList);
      if (db) await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'dates'), { list: newList }, { merge: true });
      setStatusMsg(`已刪除: ${deleteTarget}`); setTimeout(() => setStatusMsg(''), 2000); setDeleteTarget(null);
  };

  const handleLoginSubmit = () => {
      if (!user) return;
      const inputEncoded = btoa(passwordInput);
      let nextRole = null;
      if (inputEncoded === FULL_ACCESS_PASSWORD_ENCODED) nextRole = TEACHER_ROLE.FULL;
      if (inputEncoded === LIMITED_ACCESS_PASSWORD_ENCODED) nextRole = TEACHER_ROLE.LIMITED;

      if (nextRole) {
          setIsAuthenticated(true);
          setTeacherAuthRole(nextRole);
          localStorage.setItem('teacher_auth', 'true');
          localStorage.setItem('teacher_role', nextRole);
          setMode('teacher');
          loadAllStudents();
      } else { setLoginError(true); }
  };

  const handleLogout = () => {
      runWithBatchDiscardGuard(() => {
          setIsAuthenticated(false);
          setTeacherAuthRole(TEACHER_ROLE.FULL);
          localStorage.removeItem('teacher_auth');
          localStorage.removeItem('teacher_role');
          setMode('landing');
      });
  };

  const loadAllStudents = async () => {
      setLoading(true);
      try {
          let studentsMap = {};
          RAW_STUDENT_RECORDS.forEach(s => { studentsMap[s.id] = { ...s, grades: normalizeGrades(s.grades) }; });
          let cleanedInvalidDateCount = 0;
          const cleanupPayloads = [];
          if (db) {
              const querySnapshot = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'students'));
              querySnapshot.forEach(doc => {
                  const data = doc.data();
                  const normalizedResult = normalizeGrades(data.grades, { withMeta: true });
                  const sanitizedData = { ...data, grades: normalizedResult.normalized };

                  if (normalizedResult.removedInvalidDates > 0 && data.id) {
                      cleanedInvalidDateCount += normalizedResult.removedInvalidDates;
                      cleanupPayloads.push({
                          id: data.id,
                          payload: { ...sanitizedData, lastUpdated: new Date().toISOString() }
                      });
                  }

                  if (studentsMap[data.id]) {
                      studentsMap[data.id] = {
                          ...studentsMap[data.id],
                          ...sanitizedData,
                          grades: { ...studentsMap[data.id].grades, ...sanitizedData.grades }
                      };
                  } else {
                      studentsMap[data.id] = sanitizedData;
                  }
              });
          }
          const sortedStudents = Object.values(studentsMap).sort((a,b) => a.id.localeCompare(b.id));
          setAllStudentsData(sortedStudents);
          setCachedClassData(sortedStudents);
          setIsBatchDirty(false);

          if (db && cleanupPayloads.length > 0) {
              await Promise.all(
                  cleanupPayloads.map((item) =>
                      setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'students', `student_${item.id}`), item.payload)
                  )
              );
              setStatusMsg(`已自動刪除 ${cleanedInvalidDateCount} 筆不合理日期資料`);
              setTimeout(() => setStatusMsg(''), 2400);
          }
      } catch (e) { console.error("Load error:", e); }
      setLoading(false);
  };

  useEffect(() => {
      if (mode !== 'parent' || !user || !db || cachedClassData.length > 0) return;
      let cancelled = false;

      const preloadClassData = async () => {
          try {
              const qSnap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'students'));
              if (cancelled) return;
              const preloaded = [];
              const cleanupPayloads = [];
              qSnap.forEach((d) => {
                  const rawData = d.data();
                  const normalizedResult = normalizeGrades(rawData.grades, { withMeta: true });
                  preloaded.push({ ...rawData, grades: normalizedResult.normalized });
                  if (normalizedResult.removedInvalidDates > 0 && rawData.id) {
                      cleanupPayloads.push({
                          id: rawData.id,
                          payload: { ...rawData, grades: normalizedResult.normalized, lastUpdated: new Date().toISOString() }
                      });
                  }
              });
              if (cleanupPayloads.length > 0) {
                  void Promise.all(
                      cleanupPayloads.map((item) =>
                          setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'students', `student_${item.id}`), item.payload)
                      )
                  ).catch((err) => console.error('Preload cleanup invalid date error:', err));
              }
              if (cancelled) return;
              setCachedClassData(preloaded);
          } catch (e) {
              console.error('Preload class data error:', e);
          }
      };

      preloadClassData();
      return () => {
          cancelled = true;
      };
  }, [mode, user, cachedClassData.length]);

  const normalizeGrades = (grades, options = {}) => {
      const withMeta = Boolean(options.withMeta);
      if (!grades || typeof grades !== 'object') {
          return withMeta ? { normalized: {}, removedInvalidDates: 0, changed: false } : {};
      }

      const normalized = {};
      let removedInvalidDates = 0;
      let changed = false;

      Object.keys(grades).forEach(date => {
          const normalizedDate = normalizeDateToken(date);
          if (!normalizedDate) {
              removedInvalidDates += 1;
              changed = true;
              return;
          }

          const g = grades[date];
          let normalizedG;
          if (Array.isArray(g)) {
              normalizedG = { math: g[0]||0, eng: g[1]||0, chi: g[2]||0, total: (g[0]||0)+(g[1]||0)+(g[2]||0), class: 'A班' };
              changed = true;
          } else if (g && typeof g === 'object') {
              normalizedG = { ...g };
          } else {
              normalizedG = { chi: '', eng: '', math: '', total: '', class: 'A班' };
              changed = true;
          }

          if (!normalizedG.class) {
              normalizedG.class = 'A班';
              changed = true;
          }
          if (date !== normalizedDate) changed = true;
          if (normalized[normalizedDate]) changed = true;
          normalized[normalizedDate] = normalizedG;
      });

      if (withMeta) {
          return { normalized, removedInvalidDates, changed };
      }
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
        const normalizedResult = normalizeGrades(data.grades, { withMeta: true });
        let loadedGrades = { ...normalizedResult.normalized };
        if (normalizedResult.removedInvalidDates > 0 && db) {
            setDoc(
                doc(db, 'artifacts', appId, 'public', 'data', 'students', `student_${data.id}`),
                { ...data, grades: normalizedResult.normalized, lastUpdated: new Date().toISOString() }
            ).catch((err) => console.error('Cleanup invalid student date error:', err));
        }
        availableDates.forEach(d => { 
             const weekendID = getTestDateID(d);
             const existingGradeKey = Object.keys(loadedGrades).find(k => getTestDateID(k) === weekendID);
             if (!existingGradeKey) {
                 loadedGrades[d] = { chi: '', eng: '', math: '', total: '', class: 'A班' }; 
             }
        }); 
        setGrades(loadedGrades);
        setStatusMsg(
            normalizedResult.removedInvalidDates > 0
                ? `已載入：${data.name}（已刪除 ${normalizedResult.removedInvalidDates} 筆異常日期）`
                : `已載入：${data.name}`
        );
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
    if (!canEditStudentGrades) {
        notifyPermissionDenied('2491212 權限無法修改學生成績');
        return;
    }
    setGrades(prev => {
        const currentData = prev[dateKey] || { chi: '', eng: '', math: '', total: '', class: 'A班' };
        const updatedData = { ...currentData, [subject]: value };
        if (subject !== 'total' && subject !== 'class') updatedData.total = calculateTotal(subject==='chi'?value:updatedData.chi, subject==='eng'?value:updatedData.eng, subject==='math'?value:updatedData.math);
        return { ...prev, [dateKey]: updatedData };
    });
  };

  const handleBatchGradeChange = useCallback((studentId, subject, value) => {
      if (!canEditStudentGrades) {
          notifyPermissionDenied('2491212 權限無法修改學生成績');
          return;
      }
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
  }, [batchDate, teacherClassFilter, getTestDateID, canEditStudentGrades, notifyPermissionDenied]); 

  const handleExcelUpload = async (e) => {
    if (!canImportExcel) {
        notifyPermissionDenied('目前權限無法匯入 Excel');
        return;
    }
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
        let skippedInvalidDateCount = 0;

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

          const normalizedImportDate = normalizeDateToken(dateStr);
          if (!normalizedImportDate) {
              skippedInvalidDateCount += 1;
              continue;
          }

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
          const weekendID = getWeekendID(normalizedImportDate, [...availableDates, ...Array.from(newDates)]);
          if (!newDates.has(weekendID)) newDates.add(weekendID); 
          
          lastImportedDate = weekendID;

          let student = newStudentsMap[rawId];
          if (!student) { 
              student = { id: rawId, name: rawName || '未命名', grades: {} }; 
              newStudentsMap[rawId] = student; 
          } else if (rawName) {
              student.name = rawName;
          }
          
          student.grades[normalizedImportDate] = {
              chi: chi, 
              eng: eng, 
              math: math, 
              total: calculateTotal(chi, eng, math),
              class: className
          };
          importCount++;
        }

        const sortedDates = Array.from(newDates).sort(customDateSort);
        setAvailableDates(sortedDates);
        writeLocalCache(LOCAL_CACHE_KEYS.dates, sortedDates);
        
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
        setCachedClassData([...sortedStudents]);
        setIsBatchDirty(true);

        if (importCount === 0) {
            if (skippedInvalidDateCount > 0) {
                setStatusMsg(`匯入失敗：已略過 ${skippedInvalidDateCount} 筆日期錯誤資料`);
            } else {
                setStatusMsg("匯入失敗: 格式錯誤");
            }
            setTimeout(() => setStatusMsg(''), 2200);
            return;
        }

        const invalidDateSuffix = skippedInvalidDateCount > 0 ? `，略過 ${skippedInvalidDateCount} 筆日期錯誤` : '';
        setStatusMsg(`匯入 ${importCount} 筆資料${invalidDateSuffix} (最新日期: ${lastImportedDate})`);
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
      if (!canEditStudentGrades) {
          notifyPermissionDenied('2491212 權限無法修改學生成績');
          return;
      }
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
  }, [batchDate, canEditStudentGrades, notifyPermissionDenied]); // Added batchDate dependency

  const handleSinglePaste = (e, startDateIndex, startSubject) => {
      if (!canEditStudentGrades) {
          notifyPermissionDenied('2491212 權限無法修改學生成績');
          return;
      }
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
          if (updated) {
              setIsClassAveragesDirty(true);
              setStatusMsg(`已貼上 ${rows.length} 筆資料`);
              setTimeout(() => setStatusMsg(''), 2000);
          }
          return newAvgs;
      });
  };

  const handleDeleteStudent = () => { if (currentStudentId) setStudentToDelete({ id: currentStudentId, name: studentName }); };
  const confirmDeleteStudent = async () => {
    if (!studentToDelete) return;
    try {
        if (db) await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'students', `student_${studentToDelete.id}`));
        setAllStudentsData(prev => prev.filter(s => s.id !== studentToDelete.id));
        setCachedClassData(prev => prev.filter(s => s.id !== studentToDelete.id));
        setCurrentStudentId(null); setStudentName(''); setGrades({});
        setStatusMsg(`已刪除`); setTimeout(() => setStatusMsg(''), 2000); setStudentToDelete(null);
    } catch (e) {
      console.error('Delete student error:', e);
      setStatusMsg("刪除失敗");
    }
  };

  const handleSaveGrades = async () => {
    if (!user || !currentStudentId) return;
    if (!canEditStudentGrades) {
      notifyPermissionDenied('2491212 權限無法修改學生成績');
      return;
    }
    if (!studentName.trim()) { setStatusMsg('請輸入姓名'); return; }
    setStatusMsg('儲存中...');
    try {
      if (db) await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'students', `student_${currentStudentId}`), { id: currentStudentId, name: studentName, grades: grades, lastUpdated: new Date().toISOString() }, { merge: true });
      const savedStudent = { id: currentStudentId, name: studentName, grades };
      setAllStudentsData(prev => {
          const exists = prev.find(s => s.id === currentStudentId);
          if(exists) return prev.map(s => s.id === currentStudentId ? { ...s, name: studentName, grades } : s);
          return [...prev, savedStudent].sort((a,b) => a.id.localeCompare(b.id));
      });
      setCachedClassData(prev => {
          const exists = prev.find(s => s.id === currentStudentId);
          if (exists) return prev.map(s => s.id === currentStudentId ? { ...s, name: studentName, grades } : s);
          return [...prev, savedStudent].sort((a, b) => a.id.localeCompare(b.id));
      });
      setStatusMsg('儲存成功'); setTimeout(() => setStatusMsg(''), 2000);
    } catch (e) {
      console.error('Save grades error:', e);
      setStatusMsg('儲存失敗');
    }
  };

  const handleSaveBatchGrades = async () => {
      if (!canEditStudentGrades) {
          notifyPermissionDenied('2491212 權限無法修改學生成績');
          return;
      }
      setStatusMsg("批次儲存中...");
      try {
          if (db) {
              const batchPromises = allStudentsData.map(student => setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'students', `student_${student.id}`), { id: student.id, name: student.name, grades: student.grades, lastUpdated: new Date().toISOString() }, { merge: true }));
              await Promise.all(batchPromises);
              setCachedClassData(allStudentsData);
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

  const handleExportWeeklyReportExcel = async () => {
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

      const workbook = window.XLSX.utils.book_new();
      const displayDateLabel = weekendLabelByDate[batchDate] || getWeekendDisplayLabel(batchDate) || batchDate;

      const summaryRows = [
          { 指標: '日期', 數值: displayDateLabel },
          { 指標: '班級', 數值: teacherClassFilter },
          { 指標: '人數', 數值: batchWeeklySummary?.count ?? batchRowsForDisplay.length },
          { 指標: '平均總分', 數值: batchWeeklySummary?.avgTotal !== null && batchWeeklySummary?.avgTotal !== undefined ? Number(f1(batchWeeklySummary.avgTotal)) : '' },
          { 指標: '平均 PR', 數值: batchWeeklySummary?.avgPR !== null && batchWeeklySummary?.avgPR !== undefined ? Number(f1(batchWeeklySummary.avgPR)) : '' },
          { 指標: '平均錄取機率(%)', 數值: batchWeeklySummary?.avgProb !== null && batchWeeklySummary?.avgProb !== undefined ? Number(f1(batchWeeklySummary.avgProb)) : '' },
          { 指標: '風險學生數', 數值: batchWeeklySummary?.riskCount ?? batchRiskAlerts.length },
          { 指標: 'PR下滑人數', 數值: batchWeeklySummary?.prDropCount ?? 0 },
          { 指標: '匯出時間', 數值: new Date().toLocaleString() }
      ];
      const summarySheet = window.XLSX.utils.json_to_sheet(summaryRows);
      summarySheet['!cols'] = [{ wch: 16 }, { wch: 24 }];
      window.XLSX.utils.book_append_sheet(workbook, summarySheet, '週報摘要');

      const detailRows = batchRowsForDisplay.map((row, index) => ({
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
      const detailSheet = window.XLSX.utils.json_to_sheet(detailRows);
      detailSheet['!cols'] = [
          { wch: 6 }, { wch: 12 }, { wch: 12 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 12 }, { wch: 10 }
      ];
      window.XLSX.utils.book_append_sheet(workbook, detailSheet, '班級成績總表');

      const riskRows = batchRiskAlerts.map((item, index) => ({
          '序號': index + 1,
          '學號': item.id,
          '姓名': item.name,
          '風險等級': item.riskLevel,
          '風險分數': item.riskScore,
          '總分': item.total ?? '',
          'PR': item.pr ?? '',
          '錄取機率(%)': item.prob ?? '',
          '本部PR較上次變化': item.prDelta === null ? '' : item.prDelta,
          '原因': item.reasons.join('、')
      }));
      const riskSheet = window.XLSX.utils.json_to_sheet(
          riskRows.length ? riskRows : [{ 序號: '', 學號: '', 姓名: '', 風險等級: '', 風險分數: '', 原因: '本次無高風險名單' }]
      );
      riskSheet['!cols'] = [{ wch: 6 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 8 }, { wch: 8 }, { wch: 12 }, { wch: 12 }, { wch: 36 }];
      window.XLSX.utils.book_append_sheet(workbook, riskSheet, '風險預警');

      const heatmapRows = batchHeatmapRows.map((row) => ({
          '學號': row.id,
          '姓名': row.name,
          '國文': row.values.chi ?? '',
          '國文強度(0-1)': row.ratios.chi !== null ? Number(row.ratios.chi.toFixed(3)) : '',
          '英文': row.values.eng ?? '',
          '英文強度(0-1)': row.ratios.eng !== null ? Number(row.ratios.eng.toFixed(3)) : '',
          '數學': row.values.math ?? '',
          '數學強度(0-1)': row.ratios.math !== null ? Number(row.ratios.math.toFixed(3)) : '',
          '總分': row.values.total ?? '',
          '總分強度(0-1)': row.ratios.total !== null ? Number(row.ratios.total.toFixed(3)) : '',
          'PR': row.values.pr ?? '',
          'PR強度(0-1)': row.ratios.pr !== null ? Number(row.ratios.pr.toFixed(3)) : '',
          '錄取機率(%)': row.values.prob ?? '',
          '機率強度(0-1)': row.ratios.prob !== null ? Number(row.ratios.prob.toFixed(3)) : '',
          '風險分數': row.riskScore || ''
      }));
      const heatmapSheet = window.XLSX.utils.json_to_sheet(heatmapRows);
      heatmapSheet['!cols'] = [
          { wch: 12 }, { wch: 12 }, { wch: 8 }, { wch: 12 }, { wch: 8 }, { wch: 12 }, { wch: 8 }, { wch: 12 },
          { wch: 8 }, { wch: 12 }, { wch: 8 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 10 }
      ];
      window.XLSX.utils.book_append_sheet(workbook, heatmapSheet, '成績熱點圖數據');

      const latestQueryLabelById = {};
      queryStatsRows.forEach((item) => {
          latestQueryLabelById[item.id] = item.latestAtLabel;
      });
      const queryRows = batchRowsForDisplay.map((row) => ({
          '學號': row.student.id,
          '姓名': row.student.name || '',
          '查詢次數': Number(queryStatsById[row.student.id] || 0),
          '最後查詢': latestQueryLabelById[row.student.id] || '--'
      })).sort((a, b) => b['查詢次數'] - a['查詢次數']);
      const querySheet = window.XLSX.utils.json_to_sheet(queryRows);
      querySheet['!cols'] = [{ wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 18 }];
      window.XLSX.utils.book_append_sheet(workbook, querySheet, '查詢次數');

      const queryTimelineRows = queryEventTimeline.map((event, index) => ({
          '序號': index + 1,
          '日期': event.dateKey,
          '時間': event.timeLabel,
          '學號': event.id,
          '姓名': event.name || ''
      }));
      const queryTimelineSheet = window.XLSX.utils.json_to_sheet(
          queryTimelineRows.length ? queryTimelineRows : [{ 序號: '', 日期: '', 時間: '', 學號: '', 姓名: '' }]
      );
      queryTimelineSheet['!cols'] = [{ wch: 8 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }];
      window.XLSX.utils.book_append_sheet(workbook, queryTimelineSheet, '查詢時間序');

      const safeClass = String(teacherClassFilter).replace(/[^\w\u4e00-\u9fa5-]/g, '');
      const safeDate = String(batchDate || '').replace('/', '-');
      window.XLSX.writeFile(workbook, `weekly_report_${safeDate}_${safeClass}.xlsx`);
      setStatusMsg('已下載週報 Excel');
      setTimeout(() => setStatusMsg(''), 2000);
  };

  const parentSearchScoreContext = useMemo(() => {
      if (!cachedClassData.length || !sortedAvailableDatesAsc.length) return null;
      return buildProbabilityContext(cachedClassData, sortedAvailableDatesAsc, getTestDateID);
  }, [cachedClassData, sortedAvailableDatesAsc, getTestDateID]);

  const handleParentSearch = async () => {
    if (!searchId.trim()) return;
    if (!user) {
      setSearchError('系統連線中，請稍候再查詢');
      return;
    }
    setSearchError(''); setViewData(null); setLoading(true);
    try {
      const effectiveDates = sortedAvailableDatesAsc.length > 0
          ? sortedAvailableDatesAsc
          : await loadDates();
      const sortedDates = effectiveDates;
      const getSearchDateID = (dateStr) => getWeekendID(dateStr, effectiveDates);
      const weekendOrder = new Map();
      sortedDates.forEach((date, index) => {
          const weekendID = getSearchDateID(date);
          if (weekendID && !weekendOrder.has(weekendID)) {
              weekendOrder.set(weekendID, index);
          }
      });
      let data = null;
      let fullClassData = [];
      const normalizedSearchId = searchId.toUpperCase().trim();

      if (cachedClassData.length > 0) {
          fullClassData = cachedClassData;
          data = cachedClassData.find((student) => String(student.id || '').toUpperCase() === normalizedSearchId) || null;
      } else if (allStudentsData.length > 0) {
          fullClassData = allStudentsData;
          data = allStudentsData.find((student) => String(student.id || '').toUpperCase() === normalizedSearchId) || null;
      }

      if (db && !data) {
          const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'students', `student_${normalizedSearchId}`);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
              const rawData = docSnap.data();
              const normalizedResult = normalizeGrades(rawData.grades, { withMeta: true });
              data = { ...rawData, grades: normalizedResult.normalized };
              if (normalizedResult.removedInvalidDates > 0 && rawData.id) {
                  void setDoc(
                      doc(db, 'artifacts', appId, 'public', 'data', 'students', `student_${rawData.id}`),
                      { ...rawData, grades: normalizedResult.normalized, lastUpdated: new Date().toISOString() }
                  ).catch((err) => console.error('Parent search cleanup invalid date error:', err));
              }
          }
      }

      if (db && data && fullClassData.length === 0) {
          const qSnap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'students'));
          fullClassData = [];
          const cleanupPayloads = [];
          qSnap.forEach(d => {
              const rawData = d.data();
              const normalizedResult = normalizeGrades(rawData.grades, { withMeta: true });
              fullClassData.push({ ...rawData, grades: normalizedResult.normalized });
              if (normalizedResult.removedInvalidDates > 0 && rawData.id) {
                  cleanupPayloads.push({
                      id: rawData.id,
                      payload: { ...rawData, grades: normalizedResult.normalized, lastUpdated: new Date().toISOString() }
                  });
              }
          });
          if (cleanupPayloads.length > 0) {
              void Promise.all(
                  cleanupPayloads.map((item) =>
                      setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'students', `student_${item.id}`), item.payload)
                  )
              ).catch((err) => console.error('Parent search cleanup invalid date error:', err));
          }
          setCachedClassData(fullClassData);
      }
      if (data) {
        const allChartData = [];
        
        // 建立 availableDates 的 weekendID Set，用於快速查找（使用新的連續日期邏輯）
        const availableWeekendIDs = new Set(weekendOrder.keys());
        
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
            const avgAllData = (classAverages[weekendID] && classAverages[weekendID].all)
                          ? classAverages[weekendID].all
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
                avgAllTotal: parseFloat(avgAllData.total)||null,
                avgAllChi: parseFloat(avgAllData.chi)||null,
                avgAllEng: parseFloat(avgAllData.eng)||null,
                avgAllMath: parseFloat(avgAllData.math)||null,
                class: weekClass
            });
          });
        }
        
        // 依照 weekendID 在 sortedDates 中的位置排序，確保折線圖順序正確
        allChartData.sort((a, b) => {
          const indexA = weekendOrder.has(a.weekendID) ? weekendOrder.get(a.weekendID) : Number.POSITIVE_INFINITY;
          const indexB = weekendOrder.has(b.weekendID) ? weekendOrder.get(b.weekendID) : Number.POSITIVE_INFINITY;
          if (indexA === indexB) return 0;
          return indexA - indexB;
        });
        const avg = allChartData.length > 0 ? (allChartData.reduce((a,b)=>a+b.total,0)/allChartData.length).toFixed(1) : 0;
        
        const contextData = fullClassData.length > 0
            ? fullClassData
            : (cachedClassData.length > 0 ? cachedClassData : allStudentsData);
        let studentProb = '-';
        
        if (contextData.length > 0) {
            const shouldReuseParentContext = sortedAvailableDatesAsc.length > 0 && effectiveDates === sortedAvailableDatesAsc;
            const scoreContext = shouldReuseParentContext && parentSearchScoreContext
                ? parentSearchScoreContext
                : buildProbabilityContext(contextData, sortedDates, getSearchDateID);
            
            // Build simple grade map for target student
            const studentGradeMap = {};
            studentGradeMap[data.id] = {};
            Object.entries(data.grades || {}).forEach(([date, g]) => {
                studentGradeMap[data.id][getSearchDateID(date)] = g;
            });
            
            studentProb = calculateProbLogic(
                data,
                scoreContext.scoresByDate,
                scoreContext.mathScoresByDate,
                studentGradeMap,
                scoreContext.normalizedDates,
                scoreContext.probabilityProfiles,
                scoreContext.totalPRLookupByDate,
                scoreContext.mathPRLookupByDate
            );
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
          summarize('國文', 'chi', 'avgAllChi'),
          summarize('英文', 'eng', 'avgAllEng'),
          summarize('數學', 'math', 'avgAllMath')
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

  const rankLookupByWeekendClassSubject = useMemo(() => {
      const lookup = {};
      if (!shouldBuildParentAnalytics) return lookup;

      Object.entries(scoreIndexByWeekendAndClass).forEach(([weekendID, byClass]) => {
          lookup[weekendID] = {};
          Object.entries(byClass).forEach(([classKey, bySubject]) => {
              lookup[weekendID][classKey] = {};
              ['total', 'chi', 'eng', 'math'].forEach((subject) => {
                  const scores = bySubject[subject] || [];
                  const rankMap = {};
                  scores.forEach((score, index) => {
                      if (rankMap[score] === undefined) {
                          rankMap[score] = index + 1;
                      }
                  });
                  lookup[weekendID][classKey][subject] = rankMap;
              });
          });
      });

      return lookup;
  }, [shouldBuildParentAnalytics, scoreIndexByWeekendAndClass]);

  const globalPRLookupByWeekendSubject = useMemo(() => {
      const lookup = {};
      if (!shouldBuildParentAnalytics) return lookup;

      Object.entries(scoreIndexByWeekendAndClass).forEach(([weekendID, byClass]) => {
          const allScores = byClass?.all;
          if (!allScores) return;

          lookup[weekendID] = {};
          ['total', 'chi', 'eng', 'math'].forEach((subject) => {
              const scores = allScores[subject] || [];
              if (scores.length < 100) return;
              lookup[weekendID][subject] = buildPRLookupByScore(scores);
          });
      });

      return lookup;
  }, [shouldBuildParentAnalytics, scoreIndexByWeekendAndClass]);

  // 計算單科或總分在「本班」中的名次（#1, #2...）
  const calculateRank = (date, subject, myScore, myClass) => {
      if (!cachedClassData.length || !myScore) return '-';
      const myVal = parseFloat(myScore);
      if (isNaN(myVal)) return '-';
      
      const targetClass = myClass || 'A班';
      const currentWeekendID = getTestDateID(date);

      const rankLookup = rankLookupByWeekendClassSubject[currentWeekendID]?.[targetClass]?.[subject];
      if (!rankLookup) return '-';

      const rank = rankLookup[myVal];
      return rank !== undefined ? rank : '-';
  };

  // 計算「本部全部學生」的 PR（需樣本數達門檻）
  const calculateGlobalPR = (date, subject, myScore) => {
      if (!cachedClassData.length || !myScore) return '-';
      const myVal = parseFloat(myScore);
      if (isNaN(myVal)) return '-';

      const currentWeekendID = getTestDateID(date);
      const lookup = globalPRLookupByWeekendSubject[currentWeekendID]?.[subject];
      if (!lookup) return null;

      const pr = lookup.get(myVal);
      return pr !== undefined ? pr : '-';
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

  const globalPRByStudentAndWeekend = useMemo(() => {
      const totalsByWeekend = {};
      Object.entries(studentGradeMapsByStudentId).forEach(([studentId, weekendGrades]) => {
          Object.entries(weekendGrades || {}).forEach(([weekendID, grade]) => {
              const total = toNumberOrNull(grade?.total);
              if (total === null) return;
              if (!totalsByWeekend[weekendID]) totalsByWeekend[weekendID] = [];
              totalsByWeekend[weekendID].push({ studentId, total });
          });
      });

      const prByStudent = {};
      Object.entries(totalsByWeekend).forEach(([weekendID, entries]) => {
          if (entries.length < 50) return;
          const sortedTotals = entries.map((item) => item.total).sort((a, b) => b - a);
          const prLookup = buildPRLookupByScore(sortedTotals);
          entries.forEach(({ studentId, total }) => {
              const pr = prLookup.get(total);
              if (pr === undefined) return;
              if (!prByStudent[studentId]) prByStudent[studentId] = {};
              prByStudent[studentId][weekendID] = pr;
          });
      });

      return prByStudent;
  }, [studentGradeMapsByStudentId]);

  const batchRowsForDisplay = useMemo(() => {
      if (mode !== 'teacher' || teacherViewMode !== 'batch' || !batchDate) return [];

      const weekendID = getTestDateID(batchDate);
      const rows = [];

      allStudentsData.forEach(student => {
          const dateGrades = studentGradeMapsByStudentId[student.id]?.[weekendID];
          if (!dateGrades) return;

          const currentClass = dateGrades.class || 'A班';
          if (currentClass !== teacherClassFilter) return;
          if (!hasAnySubjectScore(dateGrades)) return;

          rows.push({ student, dateGrades });
      });

      const computedRows = rows.map((row) => {
          const prValue = globalPRByStudentAndWeekend[row.student.id]?.[weekendID] ?? '-';
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
  }, [
      mode,
      teacherViewMode,
      allStudentsData,
      batchDate,
      teacherClassFilter,
      getTestDateID,
      sortByPR,
      sortByProb,
      admissionProbabilities,
      studentGradeMapsByStudentId,
      globalPRByStudentAndWeekend
  ]);

  const batchRiskAlerts = useMemo(() => {
      if (mode !== 'teacher' || teacherViewMode !== 'batch' || !batchDate || !batchRowsForDisplay.length) return [];

      const selectedWeekendID = getTestDateID(batchDate);
      const selectedIndex = orderedWeekendIds.indexOf(selectedWeekendID);
      const alerts = batchRowsForDisplay.map((row) => {
          const prob = toNumberOrNull(row.probValue);
          const currentPR = toNumberOrNull(globalPRByStudentAndWeekend[row.student.id]?.[selectedWeekendID]);
          const pr = currentPR;
          const total = toNumberOrNull(row.dateGrades.total);
          const queryCount = Number(queryStatsById[row.student.id] || 0);

          const reasons = [];
          let riskScore = 0;
          let prDelta = null;

          if (prob === null) {
              riskScore += 10;
              reasons.push('機率資料不足');
          } else if (prob <= 30) {
              riskScore += 44;
              reasons.push(`錄取機率偏低 ${prob}%`);
          } else if (prob <= 50) {
              riskScore += 22;
              reasons.push(`錄取機率需關注 ${prob}%`);
          }

          if (pr === null) {
              riskScore += 10;
              reasons.push('本部PR樣本不足');
          } else if (pr <= 35) {
              riskScore += 28;
              reasons.push(`本部PR偏低 ${pr}`);
          } else if (pr <= 50) {
              riskScore += 14;
              reasons.push(`本部PR低於達標線 ${pr}`);
          }

          if (selectedIndex > 0 && currentPR !== null) {
              const previousWeekendIds = orderedWeekendIds.slice(0, selectedIndex).reverse();
              for (const prevWeekendID of previousWeekendIds) {
                  const prevPR = toNumberOrNull(globalPRByStudentAndWeekend[row.student.id]?.[prevWeekendID]);
                  if (prevPR === null) continue;
                  prDelta = currentPR - prevPR;
                  if (prDelta <= -12) {
                      riskScore += 28;
                      reasons.push(`本部PR較上次下降 ${Math.abs(prDelta)}`);
                  } else if (prDelta <= -6) {
                      riskScore += 14;
                      reasons.push(`本部PR較上次下降 ${Math.abs(prDelta)}`);
                  } else if (prDelta >= 8) {
                      reasons.push(`本部PR較上次提升 ${prDelta}`);
                  }
                  break;
              }
          }

          if (queryCount >= 8) {
              riskScore += 8;
              reasons.push('查詢次數偏高');
          }

          riskScore = Math.round(clamp(riskScore, 0, 100));
          if (riskScore < 25) return null;

          return {
              id: row.student.id,
              name: row.student.name || '',
              className: row.dateGrades.class || teacherClassFilter,
              total,
              pr,
              prob,
              prDelta,
              queryCount,
              riskScore,
              riskLevel: resolveRiskLevel(riskScore),
              reasons: reasons.slice(0, 3)
          };
      }).filter(Boolean);

      return alerts
          .sort((a, b) => {
              if (b.riskScore !== a.riskScore) return b.riskScore - a.riskScore;
              const probA = a.prob ?? 999;
              const probB = b.prob ?? 999;
              return probA - probB;
          })
          .slice(0, 12);
  }, [
      mode,
      teacherViewMode,
      batchDate,
      batchRowsForDisplay,
      getTestDateID,
      orderedWeekendIds,
      globalPRByStudentAndWeekend,
      teacherClassFilter,
      queryStatsById
  ]);

  const batchHeatmapRows = useMemo(() => {
      if (mode !== 'teacher' || teacherViewMode !== 'batch' || !batchDate || !batchRowsForDisplay.length) return [];

      const fallbackMaxByMetric = {
          chi: getMaxScore(batchDate, 'chi', sortedAvailableDatesAsc),
          eng: getMaxScore(batchDate, 'eng', sortedAvailableDatesAsc),
          math: getMaxScore(batchDate, 'math', sortedAvailableDatesAsc),
          total: 300,
          pr: 99,
          prob: 99
      };

      const metricKeys = ['chi', 'eng', 'math', 'total', 'pr', 'prob'];
      const rawRows = batchRowsForDisplay.map((row) => ({
          id: row.student.id,
          name: row.student.name || '',
          values: {
              chi: toNumberOrNull(row.dateGrades.chi),
              eng: toNumberOrNull(row.dateGrades.eng),
              math: toNumberOrNull(row.dateGrades.math),
              total: toNumberOrNull(row.dateGrades.total),
              pr: toNumberOrNull(row.prValue),
              prob: toNumberOrNull(row.probValue)
          }
      }));

      const metricStats = {};
      metricKeys.forEach((metric) => {
          const values = rawRows.map((row) => row.values[metric]).filter((value) => value !== null);
          if (!values.length) {
              metricStats[metric] = { min: 0, max: fallbackMaxByMetric[metric], fallbackMax: fallbackMaxByMetric[metric] };
              return;
          }
          metricStats[metric] = {
              min: Math.min(...values),
              max: Math.max(...values),
              fallbackMax: fallbackMaxByMetric[metric]
          };
      });

      const riskScoreById = {};
      batchRiskAlerts.forEach((item) => {
          riskScoreById[item.id] = item.riskScore;
      });

      const toRatio = (value, metric) => {
          if (value === null) return null;
          const stats = metricStats[metric];
          if (stats.max > stats.min) {
              return clamp((value - stats.min) / (stats.max - stats.min), 0, 1);
          }
          return clamp(value / Math.max(stats.fallbackMax, 1), 0, 1);
      };

      return rawRows.map((row) => ({
          ...row,
          riskScore: riskScoreById[row.id] || 0,
          ratios: {
              chi: toRatio(row.values.chi, 'chi'),
              eng: toRatio(row.values.eng, 'eng'),
              math: toRatio(row.values.math, 'math'),
              total: toRatio(row.values.total, 'total'),
              pr: toRatio(row.values.pr, 'pr'),
              prob: toRatio(row.values.prob, 'prob')
          }
      }));
  }, [
      mode,
      teacherViewMode,
      batchDate,
      batchRowsForDisplay,
      sortedAvailableDatesAsc,
      batchRiskAlerts
  ]);

  const batchWeeklySummary = useMemo(() => {
      if (!batchRowsForDisplay.length) return null;

      const totalValues = batchRowsForDisplay
          .map((row) => toNumberOrNull(row.dateGrades.total))
          .filter((value) => value !== null);
      const probValues = batchRowsForDisplay
          .map((row) => toNumberOrNull(row.probValue))
          .filter((value) => value !== null);
      const prValues = batchRowsForDisplay
          .map((row) => toNumberOrNull(row.prValue))
          .filter((value) => value !== null);

      const avgTotal = totalValues.length ? totalValues.reduce((sum, value) => sum + value, 0) / totalValues.length : null;
      const avgProb = probValues.length ? probValues.reduce((sum, value) => sum + value, 0) / probValues.length : null;
      const avgPR = prValues.length ? prValues.reduce((sum, value) => sum + value, 0) / prValues.length : null;
      const prDropCount = batchRiskAlerts.filter((item) => item.prDelta !== null && item.prDelta < 0).length;

      return {
          count: batchRowsForDisplay.length,
          avgTotal,
          avgProb,
          avgPR,
          riskCount: batchRiskAlerts.length,
          prDropCount
      };
  }, [batchRowsForDisplay, batchRiskAlerts]);

  const studentNameById = useMemo(() => {
      const map = {};
      allStudentsData.forEach((student) => {
          map[student.id] = student.name || '';
      });
      return map;
  }, [allStudentsData]);

  const queryEventTimeline = useMemo(() => {
      return queryEvents
          .map((event) => {
              const ts = Number.isFinite(event?.ts) ? event.ts : new Date(event?.at).getTime();
              if (Number.isNaN(ts)) return null;
              const dateObj = new Date(ts);
              return {
                  id: event.id,
                  name: studentNameById[event.id] || '',
                  ts,
                  dateKey: dateObj.toISOString().slice(0, 10),
                  dateLabel: dateObj.toLocaleDateString('zh-TW', { month: '2-digit', day: '2-digit', weekday: 'short' }),
                  timeLabel: dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
              };
          })
          .filter(Boolean)
          .sort((a, b) => a.ts - b.ts);
  }, [queryEvents, studentNameById]);

  const queryEventsByDay = useMemo(() => {
      const grouped = {};
      queryEventTimeline.forEach((event) => {
          if (!grouped[event.dateKey]) {
              grouped[event.dateKey] = { dateKey: event.dateKey, dateLabel: event.dateLabel, items: [] };
          }
          grouped[event.dateKey].items.push(event);
      });
      return Object.values(grouped)
          .sort((a, b) => b.dateKey.localeCompare(a.dateKey));
  }, [queryEventTimeline]);

  const queryStatsRows = useMemo(() => {
      const latestTsById = {};
      queryEventTimeline.forEach((event) => {
          latestTsById[event.id] = event.ts;
      });

      return Object.entries(queryStatsById)
          .map(([id, count]) => {
              const latestTs = latestTsById[id] || 0;
              const latestAtLabel = latestTs
                  ? new Date(latestTs).toLocaleString([], { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
                  : '--';
              return {
                  id,
                  name: studentNameById[id] || '',
                  count: Number(count) || 0,
                  latestTs,
                  latestAtLabel
              };
          })
          .sort((a, b) => {
              if (b.count !== a.count) return b.count - a.count;
              return b.latestTs - a.latestTs;
          });
  }, [queryStatsById, studentNameById, queryEventTimeline]);

  const latestQueryTsById = useMemo(() => {
      const map = {};
      queryEventTimeline.forEach((event) => {
          map[event.id] = event.ts;
      });
      return map;
  }, [queryEventTimeline]);

  const queryClassCoverageRows = useMemo(() => {
      const rows = batchRowsForDisplay.map((row) => {
          const id = String(row.student.id || '').toUpperCase();
          const count = Number(queryStatsById[id] || 0);
          const latestTs = Number(latestQueryTsById[id]) || 0;
          const latestAtLabel = latestTs
              ? new Date(latestTs).toLocaleString([], {
                  month: '2-digit',
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: false
              })
              : '--';

          return {
              id,
              name: row.student.name || '',
              count,
              latestTs,
              latestAtLabel
          };
      });

      return rows.sort((a, b) => {
          if (b.count !== a.count) return b.count - a.count;
          return b.latestTs - a.latestTs;
      });
  }, [batchRowsForDisplay, queryStatsById, latestQueryTsById]);

  const queryClassStudentIdSet = useMemo(() => {
      const idSet = new Set();
      queryClassCoverageRows.forEach((row) => {
          const id = String(row.id || '').toUpperCase();
          if (id) idSet.add(id);
      });
      return idSet;
  }, [queryClassCoverageRows]);

  const queryMonitorBaseRows = useMemo(() => {
      return queryMonitorScope === 'class' ? queryClassCoverageRows : queryStatsRows;
  }, [queryMonitorScope, queryClassCoverageRows, queryStatsRows]);

  const queryStatsRowsFiltered = useMemo(() => {
      const keyword = queryMonitorKeyword.trim();
      const hasKeyword = keyword.length > 0;
      const upperKeyword = keyword.toUpperCase();
      const lowerKeyword = keyword.toLowerCase();

      const rows = queryMonitorBaseRows.filter((row) => {
          if (!hasKeyword) return true;
          const idText = String(row.id || '').toUpperCase();
          const nameText = String(row.name || '').toLowerCase();
          return idText.includes(upperKeyword) || nameText.includes(lowerKeyword);
      });

      if (queryMonitorSort === 'latest_desc') {
          rows.sort((a, b) => {
              if (b.latestTs !== a.latestTs) return b.latestTs - a.latestTs;
              return b.count - a.count;
          });
          return rows;
      }

      if (queryMonitorSort === 'id_asc') {
          rows.sort((a, b) => String(a.id || '').localeCompare(String(b.id || '')));
          return rows;
      }

      rows.sort((a, b) => {
          if (b.count !== a.count) return b.count - a.count;
          return b.latestTs - a.latestTs;
      });
      return rows;
  }, [queryMonitorBaseRows, queryMonitorKeyword, queryMonitorSort]);

  const queryEventsByDayFiltered = useMemo(() => {
      const keyword = queryMonitorKeyword.trim();
      const hasKeyword = keyword.length > 0;
      const upperKeyword = keyword.toUpperCase();
      const lowerKeyword = keyword.toLowerCase();
      const shouldLimitToClass = queryMonitorScope === 'class';

      return queryEventsByDay
          .filter((day) => queryMonitorDateFilter === 'all' || day.dateKey === queryMonitorDateFilter)
          .map((day) => {
              let items = day.items;
              if (shouldLimitToClass) {
                  items = items.filter((event) => queryClassStudentIdSet.has(String(event.id || '').toUpperCase()));
              }
              if (hasKeyword) {
                  items = items.filter((event) => {
                      const idText = String(event.id || '').toUpperCase();
                      const nameText = String(event.name || '').toLowerCase();
                      return idText.includes(upperKeyword) || nameText.includes(lowerKeyword);
                  });
              }
              return { ...day, items };
          })
          .filter((day) => day.items.length > 0);
  }, [queryEventsByDay, queryMonitorDateFilter, queryMonitorKeyword, queryMonitorScope, queryClassStudentIdSet]);

  const queryFilteredEventList = useMemo(
      () => queryEventsByDayFiltered.flatMap((day) => day.items),
      [queryEventsByDayFiltered]
  );

  const queryFilteredSummary = useMemo(() => {
      const hourCounts = Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 }));
      queryFilteredEventList.forEach((event) => {
          const hour = new Date(event.ts).getHours();
          hourCounts[hour].count += 1;
      });

      const peak = hourCounts.reduce((top, current) => {
          if (!top || current.count > top.count) return current;
          return top;
      }, null);

      const uniqueStudentCount = queryStatsRowsFiltered.filter((row) => Number(row.count) > 0).length;

      return {
          totalQueries: queryFilteredEventList.length,
          uniqueStudentCount,
          peakHourLabel: peak && peak.count > 0 ? `${String(peak.hour).padStart(2, '0')}:00-${String((peak.hour + 1) % 24).padStart(2, '0')}:00` : '--',
          peakHourCount: peak?.count || 0,
          latestDayCount: queryEventsByDayFiltered[0]?.items.length || 0
      };
  }, [queryFilteredEventList, queryStatsRowsFiltered, queryEventsByDayFiltered]);

  const queryRecentWindowSummary = useMemo(() => {
      const now = Date.now();
      const oneDayAgo = now - (24 * 60 * 60 * 1000);
      const threeDaysAgo = now - (3 * 24 * 60 * 60 * 1000);
      const sevenDaysAgo = now - (7 * 24 * 60 * 60 * 1000);
      let last24h = 0;
      let last3d = 0;
      let last7d = 0;

      queryFilteredEventList.forEach((event) => {
          if (event.ts >= sevenDaysAgo) {
              last7d += 1;
              if (event.ts >= threeDaysAgo) {
                  last3d += 1;
                  if (event.ts >= oneDayAgo) {
                      last24h += 1;
                  }
              }
          }
      });

      return { last24h, last3d, last7d };
  }, [queryFilteredEventList]);

  const queryBiHourBuckets = useMemo(() => {
      const buckets = Array.from({ length: 12 }, (_, index) => ({
          key: index,
          startHour: index * 2,
          endHour: (index * 2) + 2,
          count: 0
      }));

      queryFilteredEventList.forEach((event) => {
          const hour = new Date(event.ts).getHours();
          const bucketIndex = Math.floor(hour / 2);
          buckets[bucketIndex].count += 1;
      });

      const maxCount = buckets.reduce((max, item) => Math.max(max, item.count), 0);
      const safeMax = maxCount > 0 ? maxCount : 1;
      return buckets.map((bucket) => ({
          ...bucket,
          label: `${String(bucket.startHour).padStart(2, '0')}-${String(bucket.endHour % 24).padStart(2, '0')}`,
          ratio: bucket.count / safeMax
      }));
  }, [queryFilteredEventList]);

  const queryDailyTrend = useMemo(() => {
      const trendDays = [...queryEventsByDayFiltered].slice(0, 14).reverse();
      const maxCount = trendDays.reduce((max, day) => Math.max(max, day.items.length), 0);
      const safeMax = maxCount > 0 ? maxCount : 1;
      return trendDays.map((day) => ({
          dateKey: day.dateKey,
          label: day.dateLabel,
          count: day.items.length,
          ratio: day.items.length / safeMax
      }));
  }, [queryEventsByDayFiltered]);

  const queryDayCountByIdMap = useMemo(() => {
      const map = {};
      queryEventsByDayFiltered.forEach((day) => {
          const dayCount = {};
          day.items.forEach((event) => {
              const id = String(event.id || '').toUpperCase();
              if (!id) return;
              dayCount[id] = (dayCount[id] || 0) + 1;
          });
          Object.entries(dayCount).forEach(([id, count]) => {
              if (!map[id]) map[id] = [];
              map[id].push(count);
          });
      });
      return map;
  }, [queryEventsByDayFiltered]);

  const queryRecent48hCountById = useMemo(() => {
      const cutoff = Date.now() - (48 * 60 * 60 * 1000);
      const map = {};
      queryFilteredEventList.forEach((event) => {
          if (event.ts < cutoff) return;
          const id = String(event.id || '').toUpperCase();
          if (!id) return;
          map[id] = (map[id] || 0) + 1;
      });
      return map;
  }, [queryFilteredEventList]);

  const queryMonitorAlertRows = useMemo(() => {
      const now = Date.now();
      return queryStatsRowsFiltered
          .map((row) => {
              const latestTs = Number(row.latestTs) || 0;
              const daysSinceLast = latestTs ? Math.floor((now - latestTs) / (24 * 60 * 60 * 1000)) : null;
              const dayCounts = queryDayCountByIdMap[row.id] || [];
              const maxDayCount = dayCounts.length ? Math.max(...dayCounts) : 0;
              const recent48hCount = Number(queryRecent48hCountById[row.id] || 0);
              const tags = [];
              let alertScore = 0;

              if (Number(row.count) === 0) {
                  alertScore += 100;
                  tags.push('尚未查詢');
              }

              if (daysSinceLast !== null) {
                  if (daysSinceLast >= 14) {
                      alertScore += 34;
                      tags.push(`${daysSinceLast} 天未查`);
                  } else if (daysSinceLast >= 7) {
                      alertScore += 20;
                      tags.push(`${daysSinceLast} 天未查`);
                  }
              }

              if (maxDayCount >= 6) {
                  alertScore += 24;
                  tags.push(`單日 ${maxDayCount} 次`);
              } else if (maxDayCount >= 4) {
                  alertScore += 12;
                  tags.push(`單日 ${maxDayCount} 次`);
              }

              if (recent48hCount >= 5) {
                  alertScore += 16;
                  tags.push(`48h ${recent48hCount} 次`);
              } else if (recent48hCount >= 3) {
                  alertScore += 8;
                  tags.push(`48h ${recent48hCount} 次`);
              }

              if (alertScore <= 0) return null;

              return {
                  ...row,
                  alertScore,
                  daysSinceLast,
                  maxDayCount,
                  recent48hCount,
                  tags: tags.slice(0, 3)
              };
          })
          .filter(Boolean)
          .sort((a, b) => {
              if (b.alertScore !== a.alertScore) return b.alertScore - a.alertScore;
              if (b.count !== a.count) return b.count - a.count;
              return b.latestTs - a.latestTs;
          })
          .slice(0, 12);
  }, [queryStatsRowsFiltered, queryDayCountByIdMap, queryRecent48hCountById]);

  const queryClassCoverageSummary = useMemo(() => {
      const total = queryClassCoverageRows.length;
      const queried = queryClassCoverageRows.filter((row) => row.count > 0).length;
      const unqueried = Math.max(total - queried, 0);
      const coverageRate = total > 0 ? Math.round((queried / total) * 100) : 0;
      return { total, queried, unqueried, coverageRate };
  }, [queryClassCoverageRows]);

  const queryClassUnqueriedPreview = useMemo(
      () => queryClassCoverageRows.filter((row) => row.count === 0).slice(0, 12),
      [queryClassCoverageRows]
  );

  useEffect(() => {
      if (queryMonitorDateFilter === 'all') return;
      const exists = queryEventsByDay.some((day) => day.dateKey === queryMonitorDateFilter);
      if (!exists) setQueryMonitorDateFilter('all');
  }, [queryMonitorDateFilter, queryEventsByDay]);

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

  const teacherMessageForParent = useMemo(
      () => {
          const studentId = String(viewData?.id || '').toUpperCase().trim();
          if (!studentId) return '';
          const personalMessage = String(teacherStudentMessages[studentId] || '').trim();
          if (personalMessage) return personalMessage;
          return String(teacherGlobalMessage || '').trim();
      },
      [viewData, teacherStudentMessages, teacherGlobalMessage]
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
  const isConnectionReady = Boolean(user);
  const sharedBackgroundOpacity = isLandingMode
      ? 1
      : mode === 'teacher'
          ? 0.68
          : mode === 'parent'
              ? 0.74
              : 0.72;

  if (!db) return <div className="flex items-center justify-center h-screen bg-slate-50 text-slate-400 text-sm font-mono tracking-widest uppercase">Initializing...</div>;

  return (
    <div className={`${isLandingMode ? 'h-[100dvh] min-h-[100svh] overflow-hidden' : 'min-h-screen pb-32 overflow-x-hidden'} font-sans antialiased transition-colors duration-500 ease-in-out relative ${darkMode ? 'bg-[#111714] text-slate-200' : 'bg-transparent text-slate-800'}`}>
      <div
        aria-hidden="true"
        className="fixed inset-0 pointer-events-none z-0 transition-opacity duration-500"
        style={{
          opacity: sharedBackgroundOpacity,
          backgroundImage: 'repeating-linear-gradient(0deg, rgba(148,163,184,0.1) 0px, rgba(148,163,184,0.1) 1px, transparent 1px, transparent 24px), repeating-linear-gradient(90deg, rgba(148,163,184,0.08) 0px, rgba(148,163,184,0.08) 1px, transparent 1px, transparent 24px), radial-gradient(circle at 12% 15%, rgba(99,102,241,0.22) 0%, transparent 40%), radial-gradient(circle at 86% 12%, rgba(14,165,233,0.22) 0%, transparent 40%), radial-gradient(circle at 80% 84%, rgba(236,72,153,0.16) 0%, transparent 36%), linear-gradient(138deg, #f8fafc 0%, #f3f7ff 46%, #eefcf5 100%)'
        }}
      />

      {!isConnectionReady && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-40 rounded-full px-3 py-1.5 text-[10px] font-black tracking-wide border border-white/90 bg-white/95 text-slate-600 shadow-lg">
          {authReady ? '連線同步中，資料功能即將可用' : '正在建立連線...'}
        </div>
      )}

      {/* Header */}
      <header className={`fixed top-0 w-full backdrop-blur-xl z-30 border-b transition-all duration-300 ${darkMode ? 'bg-[#121a17]/88 border-emerald-200/10 shadow-lg shadow-black/25' : 'bg-[linear-gradient(108deg,rgba(255,255,255,0.78)_0%,rgba(244,252,248,0.84)_52%,rgba(241,247,255,0.8)_100%)] border-white/75 shadow-[0_14px_36px_rgba(15,23,42,0.12)]'}`}>
        <div className="max-w-5xl mx-auto px-6 h-16 flex justify-between items-center relative z-10">
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
                      if (!user) return;
                      setMode('teacher');
                      loadAllStudents();
                    } else {
                      setMode('teacher_login');
                    }
                  })}
                  className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all duration-300 ${mode.includes('teacher') ? (darkMode ? 'bg-[#1c2722] text-emerald-300 shadow-lg shadow-black/35 ring-1 ring-emerald-200/20' : 'bg-white/96 text-emerald-700 shadow-md shadow-slate-300/35 ring-1 ring-white/95 border border-white/80') : 'text-slate-600 hover:text-slate-800 bg-white/60 border border-white/70 hover:bg-white/85'}`}
                >
                  {isAuthenticated ? '後台' : '老師'}
                </button>
                <button
                  onClick={() => runWithBatchDiscardGuard(() => {
                    setViewData(null);
                    setSearchError('');
                    setMode('parent');
                  })}
                  className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all duration-300 ${mode === 'parent' ? (darkMode ? 'bg-[#1c2722] text-emerald-300 shadow-lg shadow-black/35 ring-1 ring-emerald-200/20' : 'bg-white/96 text-emerald-700 shadow-md shadow-slate-300/35 ring-1 ring-white/95 border border-white/80') : 'text-slate-600 hover:text-slate-800 bg-white/60 border border-white/70 hover:bg-white/85'}`}
                >
                  家長
                </button>
            {isAuthenticated && (
                <button onClick={handleLogout} className="ml-1 p-2 text-red-400 hover:text-red-500 hover:bg-red-500/10 rounded-full transition-colors" title="登出"><LogOut className="w-5 h-5"/></button>
            )}
          </div>
        </div>
      </header>

      <main className={`${isLandingMode ? 'pt-16' : 'pt-28'} px-4 max-w-5xl mx-auto relative z-10`}>
        {mode === 'landing' && (
          <div className="h-[calc(100dvh-64px)] min-h-[calc(100svh-64px)] flex items-center justify-center">
            <div className="w-full max-w-4xl h-full">
              <div className="relative z-10 h-full flex flex-col items-center justify-center px-[clamp(0.9rem,3.6vw,1.55rem)] py-[clamp(0.8rem,2.8vh,1.45rem)]">
                <div className="px-4 py-1.5 rounded-full mb-[clamp(0.55rem,1.9vh,1.25rem)] border border-white/95 bg-white/92 text-[10px] tracking-[0.22em] font-black uppercase text-slate-600 shadow-[0_8px_24px_rgba(15,23,42,0.08)]">
                    HSINRU CENTRAL
                </div>
                <h2 className="w-full px-[clamp(0.2rem,1vw,0.7rem)] whitespace-nowrap text-[clamp(1.2rem,5.35vw,2.9rem)] sm:text-[clamp(1.8rem,4.4vw,2.9rem)] font-black font-serif tracking-[-0.016em] sm:tracking-tight mb-[clamp(0.35rem,1.2vh,0.9rem)] text-center leading-[1.18] bg-clip-text text-transparent bg-[linear-gradient(104deg,#047857_0%,#0f766e_24%,#0891b2_56%,#1d4ed8_100%)] drop-shadow-[0_1px_0_rgba(255,255,255,0.45)]">Make Progress Visible</h2>
                <p className="text-[clamp(10px,2.35vw,11px)] font-bold tracking-[0.2em] mb-[clamp(0.7rem,2.4vh,1.6rem)] uppercase text-slate-600">2025-2026 Learning Journey</p>
                <ExamCountdown isDarkMode={darkMode} />
                  
                <div className="w-full max-w-xl grid grid-cols-1 md:grid-cols-2 gap-3 mt-[clamp(0.9rem,2.7vh,1.6rem)]">
                   <button
                      onClick={() => runWithBatchDiscardGuard(() => {
                        if (isAuthenticated) {
                          if (!user) return;
                          setMode('teacher');
                          loadAllStudents();
                        } else {
                          setMode('teacher_login');
                        }
                      })}
                      className="group w-full p-5 rounded-[1.45rem] border flex items-center gap-4 transition-all duration-200 backdrop-blur-xl bg-white/94 border-white/95 shadow-[0_14px_32px_rgba(15,23,42,0.09)] hover:bg-white hover:border-sky-200/90 hover:-translate-y-0.5"
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
                      className="group w-full p-5 rounded-[1.45rem] border flex items-center gap-4 transition-all duration-200 backdrop-blur-xl bg-white/94 border-white/95 shadow-[0_14px_32px_rgba(15,23,42,0.09)] hover:bg-white hover:border-emerald-200/90 hover:-translate-y-0.5"
                    >
                      <div className="w-11 h-11 rounded-2xl flex items-center justify-center transition-colors bg-gradient-to-br from-sky-100 to-emerald-100 text-sky-700"><BarChart3 className="w-5 h-5" /></div>
                      <div className="text-left flex-1"><h3 className="text-base font-black text-slate-800">家長查詢</h3><p className="text-[11px] text-slate-500 mt-0.5">輸入學號查看分析</p></div>
                      <ChevronRight className="w-4.5 h-4.5 text-slate-400 opacity-50 group-hover:opacity-100 group-hover:translate-x-1 transition-all"/>
                   </button>
                </div>

                <p className="mt-[clamp(0.9rem,3vh,1.8rem)] text-[11px] font-serif font-semibold tracking-[0.14em] text-slate-500/90">
                  Created by CH.Fan
                </p>
              </div>
            </div>
          </div>
        )}

        {mode === 'teacher_login' && (
            <div className="flex items-center justify-center min-h-[50vh]">
                <div className={`backdrop-blur-2xl p-8 rounded-[2.5rem] w-full max-w-sm text-center border relative overflow-hidden ${darkMode ? 'bg-[#111827]/88 border-white/10 shadow-lg shadow-black/35' : 'bg-white/96 border-white/80 shadow-[0_24px_55px_rgba(15,23,42,0.11)]'}`}>
                    <div className={`absolute top-0 left-0 right-0 h-1 ${darkMode ? 'bg-blue-400/50' : 'bg-gradient-to-r from-sky-500 via-emerald-500 to-indigo-500'}`} />
                    <div className={`inline-flex p-4 rounded-2xl mb-6 shadow-inner ${darkMode ? 'bg-blue-500/10 text-blue-400 ring-1 ring-blue-500/20' : 'bg-blue-50 text-blue-600'}`}><Lock className="w-6 h-6" /></div>
                    <h2 className={`text-xl font-black mb-6 tracking-tight ${darkMode ? 'text-white' : 'text-slate-800'}`}>身份驗證</h2>
                    <input type="password" value={passwordInput} onChange={(e) => { setPasswordInput(e.target.value); setLoginError(false); }} onKeyDown={(e) => e.key === 'Enter' && handleLoginSubmit()} className={`w-full p-4 rounded-2xl text-center text-xl font-bold tracking-widest outline-none transition-all mb-6 placeholder:text-base placeholder:tracking-normal placeholder:font-medium border shadow-inner ${darkMode ? 'bg-[#020617]/50 border-white/5 text-white focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 placeholder:text-slate-500' : 'bg-slate-50 border-slate-200/60 text-slate-800 focus:bg-white focus:ring-2 focus:ring-blue-100 placeholder:text-slate-400'}`} placeholder="輸入密碼" autoFocus />
                    {loginError && <p className="text-red-500 text-xs font-bold mb-4">密碼錯誤</p>}
                    <button onClick={handleLoginSubmit} className="w-full bg-blue-600 hover:bg-blue-500 text-white py-3.5 rounded-2xl font-bold shadow-lg shadow-blue-500/30 active:scale-[0.98] transition-all">登入</button>
                </div>
            </div>
        )}

        {mode === 'teacher' && (
          <div className="space-y-7">
            <div className={`p-6 rounded-[2rem] border backdrop-blur-2xl relative overflow-hidden ${darkMode ? 'bg-[#0f172a]/70 border-white/10 shadow-xl shadow-black/20 ring-1 ring-white/5' : 'bg-white border-white shadow-[0_24px_52px_rgba(15,23,42,0.1)]'}`}>
                <div className={`absolute inset-x-0 top-0 h-1 ${darkMode ? 'bg-emerald-300/35' : 'bg-gradient-to-r from-sky-500 via-emerald-500 to-indigo-500'}`} />
                {isLimitedTeacherRole && (
                    <div className={`mb-4 mt-1 inline-flex items-center gap-2 text-[10px] font-black tracking-widest uppercase px-3 py-1.5 rounded-full border ${darkMode ? 'bg-amber-500/10 border-amber-300/25 text-amber-200' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>
                        2491212 權限：唯讀成績
                    </div>
                )}
                <div className="flex justify-between items-center mb-4 pt-1">
                    <div className={`flex items-center gap-2 font-black tracking-wide ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}><Calendar className="w-4 h-4 text-blue-500"/>管理日期</div>
                    <div className="flex gap-2">
                         <input type="text" placeholder="MM/DD" className={`w-20 p-2 rounded-lg text-xs text-center font-bold outline-none transition-colors tracking-widest border shadow-sm ${darkMode ? 'bg-[#020617]/50 border-white/10 text-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20' : 'bg-white border-slate-200 text-slate-700 focus:border-blue-400'}`} value={newDateInput} onChange={e=>setNewDateInput(e.target.value)} />
                         <button onClick={addDate} className={`px-3 rounded-lg transition-colors shadow-sm ${darkMode ? 'bg-slate-800 text-white hover:bg-slate-700 border border-white/5' : 'bg-slate-800 text-white hover:bg-slate-700'}`}><Plus className="w-4 h-4"/></button>
                    </div>
                </div>
                <div className={`flex flex-wrap gap-2 max-h-24 overflow-y-auto p-2 rounded-xl border mb-6 no-scrollbar shadow-inner ${darkMode ? 'bg-[#020617]/30 border-white/5' : 'bg-white border-slate-200'}`}>
                    {sortedAvailableDatesDesc.map(d => (
                        <div key={d} className={`flex items-center px-2.5 py-1 rounded-lg text-[10px] font-bold border shadow-sm ${darkMode ? 'bg-slate-800 text-slate-300 border-white/5' : 'bg-white text-slate-600 border-slate-200/60'}`}>
                            {(weekendLabelByDate[d] || getWeekendDisplayLabel(d))}
                            {canDeleteDates ? (
                                <button onClick={() => handleDeleteDate(d)} className="ml-1.5 text-slate-400 hover:text-red-500" title="危險操作：刪除日期">
                                    <X className="w-3 h-3"/>
                                </button>
                            ) : (
                                <span className="ml-1.5 text-slate-300" title="2491212 權限不可刪除日期">
                                    <Lock className="w-3 h-3"/>
                                </span>
                            )}
                        </div>
                    ))}
                </div>

                <div className={`flex p-1 rounded-xl mb-6 shadow-inner border ${darkMode ? 'bg-[#020617]/50 border-white/5' : 'bg-slate-100/90 border-slate-200/70'}`}>
                     <button
                       onClick={() => setTeacherViewMode('batch')}
                       className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${teacherViewMode==='batch' ? (darkMode ? 'bg-slate-800 text-blue-400 shadow-md border border-white/5 ring-1 ring-white/5' : 'bg-white text-blue-700 shadow-sm') : 'text-slate-500'}`}
                     >
                       批量檢視
                     </button>
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
                </div>

                {teacherViewMode === 'single' && (
                    <div className="flex flex-col gap-4">
                        <div className="flex gap-2">
                            <div className="relative flex-1">
                                <input id="loadIdInput" type="text" placeholder="輸入學號..." className={`w-full p-3 pl-9 rounded-xl border text-sm font-bold outline-none uppercase tracking-widest placeholder:tracking-normal text-center shadow-inner transition-all ${darkMode ? 'bg-[#020617]/50 border-white/5 text-slate-200 focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20' : 'bg-white border-slate-200 text-slate-700 focus:border-blue-300 focus:ring-2 focus:ring-blue-100'}`} />
                                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
                            </div>
                            <button
                              onClick={() => {
                                const loadInput = document.getElementById('loadIdInput');
                                const studentId = loadInput?.value?.trim().toUpperCase();
                                if (studentId) loadStudentForTeacher(studentId);
                              }}
                              className={`px-4 rounded-xl text-xs font-bold whitespace-nowrap transition-colors shadow-sm border ${darkMode ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-white/5' : 'bg-white hover:bg-slate-50 text-slate-600 border-slate-200'}`}
                            >
                              載入
                            </button>
                        </div>
                        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                            <button onClick={() => setShowAddStudentModal(true)} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-3 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-blue-600/20 active:scale-[0.98] transition-all whitespace-nowrap"><UserPlus className="w-4 h-4"/> 新增學生</button>
                            {canImportExcel ? (
                                <label className="cursor-pointer bg-blue-600 hover:bg-blue-500 text-white px-4 py-3 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-blue-600/20 active:scale-[0.98] transition-all whitespace-nowrap">
                                    <FileSpreadsheet className="w-4 h-4" /> 匯入 Excel
                                    <input type="file" accept=".xlsx, .xls" className="hidden" onChange={handleExcelUpload} />
                                </label>
                            ) : (
                                <button type="button" disabled className="bg-slate-300 text-white px-4 py-3 rounded-xl text-xs font-bold flex items-center gap-1.5 whitespace-nowrap cursor-not-allowed">
                                    <FileSpreadsheet className="w-4 h-4" /> 匯入 Excel（唯讀）
                                </button>
                            )}
                            <button onClick={() => setShowAvgModal(true)} className={`px-4 py-3 rounded-xl text-xs font-bold flex items-center gap-1.5 whitespace-nowrap transition-colors border ${darkMode ? 'text-indigo-300 bg-indigo-500/10 border-indigo-500/20 hover:bg-indigo-500/20' : 'text-indigo-700 bg-white border-indigo-100 hover:bg-indigo-50 shadow-sm'}`}><Edit3 className="w-4 h-4"/> 平均設定</button>
                        </div>
                    </div>
                )}

                {teacherViewMode === 'batch' && (
                    <div className="pt-2 space-y-4">
                        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-bold text-slate-500">日期</span>
                                <select className={`border rounded-lg px-2 py-1.5 text-xs font-bold outline-none shadow-sm ${darkMode ? 'bg-[#020617]/50 border-white/10 text-slate-300' : 'bg-white border-slate-200 text-slate-700'}`} value={batchDate} onChange={(e) => setBatchDate(e.target.value)}>
                                    {sortedAvailableDatesDesc.map(d => <option key={d} value={d}>{weekendLabelByDate[d] || getWeekendDisplayLabel(d)}</option>)}
                                </select>
                                <span className={`text-[11px] font-bold px-2 py-1 rounded-full ${darkMode ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-600'}`}>
                                    共 {batchRowsForDisplay.length} 筆
                                </span>
                            </div>
                            <div className="flex gap-2 flex-wrap items-center">
                                <button onClick={() => { setSortByPR((prev) => !prev); setSortByProb(false); }} className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 transition-all shadow-sm ${sortByPR ? 'bg-indigo-600 text-white shadow-indigo-500/30' : (darkMode ? 'bg-slate-800 text-slate-400 border border-white/5' : 'bg-white text-slate-600 border border-slate-200')}`}>
                                    <ArrowDownWideNarrow className="w-3.5 h-3.5" /> PR排序
                                </button>
                                <button onClick={() => { setSortByProb((prev) => !prev); setSortByPR(false); }} className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 transition-all shadow-sm ${sortByProb ? (darkMode ? 'bg-emerald-700 text-white shadow-emerald-900/45 ring-1 ring-emerald-200/30' : 'bg-emerald-600 text-white shadow-emerald-600/25') : (darkMode ? 'bg-slate-800 text-slate-400 border border-white/5' : 'bg-white text-slate-600 border border-slate-200')}`}>
                                    <Percent className="w-3.5 h-3.5" /> 機率排序
                                </button>
                                <button onClick={handleExportBatchExcel} className={`px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm transition-all flex items-center gap-1 border ${darkMode ? 'bg-slate-800 text-slate-300 border-white/10 hover:bg-slate-700' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
                                    <FileSpreadsheet className="w-3.5 h-3.5" /> 下載 Excel
                                </button>
                                <button onClick={handleExportWeeklyReportExcel} className={`px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm transition-all flex items-center gap-1 border ${darkMode ? 'bg-emerald-900/40 text-emerald-200 border-emerald-400/30 hover:bg-emerald-800/50' : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'}`}>
                                    <FileSpreadsheet className="w-3.5 h-3.5" /> 下載週報
                                </button>
                                <button
                                  onClick={handleSaveBatchGrades}
                                  disabled={!canEditStudentGrades}
                                  className={`text-white px-4 py-1.5 rounded-lg text-xs font-bold shadow-md transition-all active:scale-[0.98] flex items-center gap-1 ${
                                    !canEditStudentGrades
                                      ? 'bg-slate-400 cursor-not-allowed shadow-none'
                                      : isBatchDirty
                                      ? 'bg-orange-500 hover:bg-orange-400 animate-pulse shadow-orange-500/30'
                                      : 'bg-blue-600 hover:bg-blue-500 shadow-blue-600/20'
                                  }`}
                                >
                                  <Save className="w-3.5 h-3.5"/> {!canEditStudentGrades ? '唯讀鎖定' : (isBatchDirty ? '儲存變更' : '儲存')}
                                </button>
                            </div>
                        </div>

                        <div className={`flex p-1 rounded-xl border overflow-x-auto justify-center shadow-inner ${darkMode ? 'bg-[#020617]/50 border-white/5' : 'bg-slate-50 border-slate-100'}`}>
                            {CLASS_DEFS.map(c => (
                                <button key={c.id} onClick={() => setTeacherClassFilter(c.id)} className={`flex-1 whitespace-nowrap px-3 py-2 text-xs font-bold rounded-lg transition-all ${teacherClassFilter === c.id ? (darkMode ? 'bg-slate-800 text-white shadow-md border border-white/5 ring-1 ring-white/5' : 'bg-white text-slate-700 shadow-sm border border-slate-200/50') : 'text-slate-500 hover:text-slate-400'}`}>{c.label}</button>
                            ))}
                        </div>

                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                            <div className={`rounded-xl border px-3 py-2 ${darkMode ? 'bg-slate-900/40 border-white/10' : 'bg-white border-slate-200'}`}>
                                <div className={`text-[10px] font-bold tracking-wider uppercase ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>平均 PR</div>
                                <div className={`text-xl font-black ${darkMode ? 'text-indigo-200' : 'text-indigo-700'}`}>{batchWeeklySummary?.avgPR !== null && batchWeeklySummary?.avgPR !== undefined ? f1(batchWeeklySummary.avgPR) : '--'}</div>
                            </div>
                            <div className={`rounded-xl border px-3 py-2 ${darkMode ? 'bg-slate-900/40 border-white/10' : 'bg-white border-slate-200'}`}>
                                <div className={`text-[10px] font-bold tracking-wider uppercase ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>平均機率</div>
                                <div className={`text-xl font-black ${darkMode ? 'text-emerald-200' : 'text-emerald-700'}`}>{batchWeeklySummary?.avgProb !== null && batchWeeklySummary?.avgProb !== undefined ? `${f1(batchWeeklySummary.avgProb)}%` : '--'}</div>
                            </div>
                            <div className={`rounded-xl border px-3 py-2 ${darkMode ? 'bg-slate-900/40 border-white/10' : 'bg-white border-slate-200'}`}>
                                <div className={`text-[10px] font-bold tracking-wider uppercase ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>風險人數</div>
                                <div className={`text-xl font-black ${darkMode ? 'text-rose-200' : 'text-rose-700'}`}>{batchWeeklySummary?.riskCount ?? 0}</div>
                            </div>
                            <div className={`rounded-xl border px-3 py-2 ${darkMode ? 'bg-slate-900/40 border-white/10' : 'bg-white border-slate-200'}`}>
                                <div className={`text-[10px] font-bold tracking-wider uppercase ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>PR下滑</div>
                                <div className={`text-xl font-black ${darkMode ? 'text-amber-200' : 'text-amber-700'}`}>{batchWeeklySummary?.prDropCount ?? 0}</div>
                            </div>
                        </div>

                        <div className={`flex p-1 rounded-xl border overflow-x-auto shadow-inner ${darkMode ? 'bg-[#020617]/50 border-white/5' : 'bg-slate-50 border-slate-100'}`}>
                            {BATCH_INSIGHT_TABS.map((tab) => (
                                <button
                                  key={tab.id}
                                  onClick={() => setBatchInsightTab(tab.id)}
                                  className={`flex-1 whitespace-nowrap px-3 py-2 text-xs font-bold rounded-lg transition-all ${batchInsightTab === tab.id ? (darkMode ? 'bg-slate-800 text-emerald-100 shadow-md border border-white/5 ring-1 ring-white/5' : 'bg-white text-slate-700 shadow-sm border border-slate-200/50') : 'text-slate-500 hover:text-slate-400'}`}
                                >
                                  {tab.label}
                                </button>
                            ))}
                        </div>

                        {batchInsightTab === 'grades' && (
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
                                                canEdit={canEditStudentGrades}
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
                        )}

                        {batchInsightTab === 'risk' && (
                            <div className={`rounded-2xl border p-4 ${darkMode ? 'bg-slate-900/40 border-white/10' : 'bg-white border-slate-200'}`}>
                                <div className="flex items-center justify-between mb-3">
                                    <h4 className={`text-xs font-black tracking-widest uppercase ${darkMode ? 'text-slate-200' : 'text-slate-600'}`}>風險預警清單</h4>
                                    <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${darkMode ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-500'}`}>{batchRiskAlerts.length} 人</span>
                                </div>
                                <div className={`text-[11px] mb-3 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                                    進退步以本部 PR 變化為主，搭配機率與查詢異常次數做綜合預警。
                                </div>
                                <div className="space-y-2">
                                    {batchRiskAlerts.map((item) => {
                                        const riskHue = Math.round(clamp((100 - item.riskScore) * 1.2, 0, 120));
                                        return (
                                            <div key={item.id} className={`rounded-xl border px-3 py-3 ${darkMode ? 'border-white/10 bg-slate-900/40' : 'border-slate-200 bg-white'}`}>
                                                <div className="flex items-start justify-between gap-2">
                                                    <div className="min-w-0">
                                                        <div className={`text-xs font-black ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>{item.name || '-'} <span className="font-mono ml-1 opacity-70">{item.id}</span></div>
                                                        <div className={`text-[11px] mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                                                            {item.reasons.join('、')}
                                                        </div>
                                                    </div>
                                                    <div
                                                      className="text-[10px] font-black px-2 py-1 rounded-full shrink-0"
                                                      style={{
                                                          color: '#fff',
                                                          border: `1px solid hsla(${riskHue}, 90%, 60%, 0.42)`,
                                                          background: `linear-gradient(135deg, hsla(${riskHue}, 95%, 42%, 0.92) 0%, hsla(${Math.max(riskHue - 12, 0)}, 95%, 34%, 0.98) 100%)`
                                                      }}
                                                    >
                                                        {item.riskLevel} {item.riskScore}
                                                    </div>
                                                </div>
                                                <div className={`mt-2 text-[11px] font-bold ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                                                    {item.prob !== null ? `${item.prob}%` : '--'} / {item.pr !== null ? `PR ${item.pr}` : 'PR --'} / {item.prDelta !== null ? `PR變化 ${item.prDelta > 0 ? '+' : ''}${item.prDelta}` : 'PR變化 --'}
                                                </div>
                                            </div>
                                        );
                                    })}
                                    {batchRiskAlerts.length === 0 && (
                                        <div className={`rounded-xl border px-3 py-4 text-center text-xs font-bold ${darkMode ? 'border-white/10 bg-slate-900/40 text-slate-300' : 'border-slate-200 bg-white text-slate-500'}`}>
                                            本次沒有需要優先處理的高風險學生
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {batchInsightTab === 'heatmap' && (
                            <div className={`rounded-2xl border p-4 ${darkMode ? 'bg-slate-900/40 border-white/10' : 'bg-white border-slate-200'}`}>
                                <div className="flex items-center justify-between mb-3">
                                    <h4 className={`text-xs font-black tracking-widest uppercase ${darkMode ? 'text-slate-200' : 'text-slate-600'}`}>班級成績熱點圖</h4>
                                    <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${darkMode ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-500'}`}>紅色低分 / 綠色高分</span>
                                </div>
                                <div className={`overflow-x-auto rounded-xl border ${darkMode ? 'border-white/10 bg-slate-900/45' : 'border-slate-200 bg-white'}`}>
                                    <table className="w-full min-w-[620px] text-[11px] table-fixed">
                                        <colgroup>
                                            <col className="w-[5.2rem]" />
                                            <col className="w-[6.4rem]" />
                                            <col className="w-[3.8rem]" />
                                            <col className="w-[3.8rem]" />
                                            <col className="w-[3.8rem]" />
                                            <col className="w-[4rem]" />
                                            <col className="w-[3.5rem]" />
                                            <col className="w-[5rem]" />
                                        </colgroup>
                                        <thead className={darkMode ? 'bg-slate-800 text-slate-300' : 'bg-slate-50 text-slate-500'}>
                                            <tr>
                                                <th className="px-2 py-2 text-center font-bold">學號</th>
                                                <th className="px-2 py-2 text-center font-bold">姓名</th>
                                                <th className="px-1 py-2 text-center font-bold">國</th>
                                                <th className="px-1 py-2 text-center font-bold">英</th>
                                                <th className="px-1 py-2 text-center font-bold">數</th>
                                                <th className="px-1 py-2 text-center font-bold">總</th>
                                                <th className="px-1 py-2 text-center font-bold">PR</th>
                                                <th className="px-1 py-2 text-center font-bold">機率</th>
                                            </tr>
                                        </thead>
                                        <tbody className={darkMode ? 'divide-y divide-white/10' : 'divide-y divide-slate-100'}>
                                            {batchHeatmapRows.map((row) => (
                                                <tr key={row.id} className={darkMode ? 'hover:bg-slate-800/40' : 'hover:bg-slate-50/50'}>
                                                    <td className={`px-2 py-2 text-center font-mono font-bold ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>{row.id}</td>
                                                    <td className={`px-2 py-2 text-center font-bold truncate ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>{row.name || '-'}</td>
                                                    <td className="px-1 py-1"><div className="text-center font-black rounded-md py-1" style={getHeatCellStyle(row.ratios.chi, darkMode)}>{f1(row.values.chi) || '-'}</div></td>
                                                    <td className="px-1 py-1"><div className="text-center font-black rounded-md py-1" style={getHeatCellStyle(row.ratios.eng, darkMode)}>{f1(row.values.eng) || '-'}</div></td>
                                                    <td className="px-1 py-1"><div className="text-center font-black rounded-md py-1" style={getHeatCellStyle(row.ratios.math, darkMode)}>{f1(row.values.math) || '-'}</div></td>
                                                    <td className="px-1 py-1"><div className="text-center font-black rounded-md py-1" style={getHeatCellStyle(row.ratios.total, darkMode)}>{f1(row.values.total) || '-'}</div></td>
                                                    <td className="px-1 py-1"><div className="text-center font-black rounded-md py-1" style={getHeatCellStyle(row.ratios.pr, darkMode)}>{row.values.pr ?? '-'}</div></td>
                                                    <td className="px-1 py-1"><div className="text-center font-black rounded-md py-1" style={getHeatCellStyle(row.ratios.prob, darkMode)}>{row.values.prob !== null ? `${row.values.prob}%` : '-'}</div></td>
                                                </tr>
                                            ))}
                                            {batchHeatmapRows.length === 0 && (
                                                <tr>
                                                    <td colSpan={8} className={`px-3 py-6 text-center text-xs font-bold ${darkMode ? 'text-slate-400' : 'text-slate-400'}`}>
                                                        目前沒有可顯示的成績熱點圖資料
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {batchInsightTab === 'messages' && (
                            <div className={`rounded-2xl border p-4 space-y-4 ${darkMode ? 'bg-slate-900/40 border-white/10' : 'bg-white border-slate-200'}`}>
                                <div className={`rounded-xl border p-3 ${darkMode ? 'bg-slate-900/45 border-white/10' : 'bg-slate-50 border-slate-200'}`}>
                                    <div className="flex items-center justify-between gap-2 mb-2">
                                        <h4 className={`text-xs font-black tracking-widest uppercase ${darkMode ? 'text-slate-200' : 'text-slate-600'}`}>全班老師的話</h4>
                                        <span className={`text-[10px] font-bold ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                                            {teacherMessageLoading ? '讀取中...' : (teacherGlobalMessage ? '已設定' : '未設定')}
                                        </span>
                                    </div>
                                    <textarea
                                      value={teacherGlobalMessageDraft}
                                      onChange={(e) => setTeacherGlobalMessageDraft(e.target.value)}
                                      rows={3}
                                      maxLength={200}
                                      placeholder="可發給全班；若某位學生有個別留言，家長端會優先顯示個別留言"
                                      className={`w-full resize-y rounded-xl px-3 py-2 text-sm font-medium outline-none border transition-all ${darkMode ? 'bg-slate-950/60 border-white/10 text-slate-100 focus:border-emerald-400/40' : 'bg-white border-slate-200 text-slate-700 focus:border-emerald-300'}`}
                                    />
                                    <div className="mt-2 flex items-center justify-between gap-2">
                                        <span className={`text-[10px] font-bold ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                                            {teacherGlobalMessageDraft.length}/200
                                        </span>
                                        <button
                                          onClick={handleSaveGlobalTeacherMessage}
                                          disabled={teacherMessageSaving || teacherMessageLoading || !user}
                                          className="px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                        >
                                          {teacherMessageSaving ? '儲存中...' : '儲存全班訊息'}
                                        </button>
                                    </div>
                                </div>

                                <div className={`rounded-xl border p-3 ${darkMode ? 'bg-slate-900/45 border-white/10' : 'bg-slate-50 border-slate-200'}`}>
                                    <div className="flex items-center justify-between gap-2 mb-2">
                                        <h4 className={`text-xs font-black tracking-widest uppercase ${darkMode ? 'text-slate-200' : 'text-slate-600'}`}>個別老師的話（優先顯示）</h4>
                                        <span className={`text-[10px] font-bold ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                                            目前名單 {batchRowsForDisplay.length} 人
                                        </span>
                                    </div>
                                    <div className="max-h-[18rem] overflow-y-auto pr-1 space-y-2">
                                        {batchRowsForDisplay.map((row) => {
                                            const studentId = String(row.student.id || '').toUpperCase().trim();
                                            if (!studentId) return null;
                                            const isSaving = teacherStudentMessageSavingId === studentId;
                                            const currentDraft = teacherStudentMessageDrafts[studentId] ?? teacherStudentMessages[studentId] ?? '';
                                            return (
                                                <div key={studentId} className={`grid grid-cols-[6.8rem_1fr_auto] gap-2 items-center rounded-lg border px-2 py-2 ${darkMode ? 'bg-slate-950/50 border-white/10' : 'bg-white border-slate-200'}`}>
                                                    <div className="min-w-0">
                                                        <div className={`text-[11px] font-mono font-black truncate ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>{studentId}</div>
                                                        <div className={`text-[10px] font-bold truncate ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>{row.student.name || '-'}</div>
                                                    </div>
                                                    <input
                                                      type="text"
                                                      value={currentDraft}
                                                      maxLength={120}
                                                      onChange={(e) => {
                                                          const value = e.target.value;
                                                          setTeacherStudentMessageDrafts((prev) => ({ ...prev, [studentId]: value }));
                                                      }}
                                                      placeholder="留空 = 使用全班訊息"
                                                      className={`w-full rounded-lg px-2 py-1.5 text-xs font-medium outline-none border ${darkMode ? 'bg-slate-900/70 border-white/10 text-slate-100 focus:border-emerald-400/40' : 'bg-white border-slate-200 text-slate-700 focus:border-emerald-300'}`}
                                                    />
                                                    <button
                                                      onClick={() => handleSaveStudentTeacherMessage(studentId)}
                                                      disabled={isSaving || teacherMessageLoading || !user}
                                                      className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-white bg-sky-600 hover:bg-sky-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                                    >
                                                      {isSaving ? '儲存中' : '儲存'}
                                                    </button>
                                                </div>
                                            );
                                        })}
                                        {!batchRowsForDisplay.length && (
                                            <div className={`rounded-lg border px-3 py-4 text-center text-xs font-bold ${darkMode ? 'border-white/10 bg-slate-950/40 text-slate-400' : 'border-slate-200 bg-white text-slate-500'}`}>
                                                目前這個日期與班級沒有學生資料，請切換日期或班級後再設定個別老師的話
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        {batchInsightTab === 'query' && (
                            <div className={`rounded-2xl border p-4 space-y-3 ${darkMode ? 'bg-slate-900/40 border-white/10' : 'bg-white border-slate-200'}`}>
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="flex items-center gap-2">
                                        <Info className={`w-4 h-4 ${darkMode ? 'text-slate-300' : 'text-slate-500'}`} />
                                        <h4 className={`text-xs font-black tracking-widest uppercase ${darkMode ? 'text-slate-200' : 'text-slate-600'}`}>查詢監控中心</h4>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                          onClick={loadQueryStats}
                                          disabled={queryStatsLoading}
                                          className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-colors ${
                                            queryStatsLoading
                                              ? 'bg-slate-300 text-white cursor-not-allowed'
                                              : 'bg-slate-700 text-white hover:bg-slate-600'
                                          }`}
                                        >
                                          重新整理
                                        </button>
                                        <button
                                          onClick={() => executeWithSecurity(handleResetQueryStats, {
                                              title: '重置查詢次數'
                                          })}
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
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-[1fr_9.4rem_auto] gap-2">
                                    <div className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${darkMode ? 'border-white/10 bg-slate-900/50' : 'border-slate-200 bg-white'}`}>
                                        <Search className={`w-3.5 h-3.5 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`} />
                                        <input
                                          type="text"
                                          value={queryMonitorKeyword}
                                          onChange={(e) => setQueryMonitorKeyword(e.target.value)}
                                          placeholder="搜尋學號或姓名"
                                          className={`w-full bg-transparent outline-none text-xs font-bold ${darkMode ? 'text-slate-100 placeholder:text-slate-500' : 'text-slate-700 placeholder:text-slate-400'}`}
                                        />
                                    </div>
                                    <select
                                      value={queryMonitorDateFilter}
                                      onChange={(e) => setQueryMonitorDateFilter(e.target.value)}
                                      className={`rounded-xl border px-2.5 py-2 text-xs font-bold outline-none ${darkMode ? 'border-white/10 bg-slate-900/50 text-slate-200' : 'border-slate-200 bg-white text-slate-700'}`}
                                    >
                                        <option value="all">全部日期</option>
                                        {queryEventsByDay.map((day) => (
                                            <option key={day.dateKey} value={day.dateKey}>{day.dateLabel}</option>
                                        ))}
                                    </select>
                                    <button
                                      onClick={() => {
                                          setQueryMonitorKeyword('');
                                          setQueryMonitorDateFilter('all');
                                      }}
                                      className={`rounded-xl border px-3 py-2 text-[11px] font-bold transition-colors ${darkMode ? 'border-white/10 bg-slate-900/50 text-slate-200 hover:bg-slate-800' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
                                    >
                                      清除條件
                                    </button>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-[13rem_12rem] gap-2">
                                    <div className={`rounded-xl border p-1 flex ${darkMode ? 'border-white/10 bg-slate-900/50' : 'border-slate-200 bg-white'}`}>
                                        <button
                                          onClick={() => setQueryMonitorScope('all')}
                                          className={`flex-1 rounded-lg px-2 py-1.5 text-[11px] font-black transition-colors ${queryMonitorScope === 'all' ? 'bg-emerald-600 text-white' : (darkMode ? 'text-slate-300 hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-50')}`}
                                        >
                                          全部學生
                                        </button>
                                        <button
                                          onClick={() => setQueryMonitorScope('class')}
                                          className={`flex-1 rounded-lg px-2 py-1.5 text-[11px] font-black transition-colors ${queryMonitorScope === 'class' ? 'bg-emerald-600 text-white' : (darkMode ? 'text-slate-300 hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-50')}`}
                                        >
                                          目前班級
                                        </button>
                                    </div>
                                    <select
                                      value={queryMonitorSort}
                                      onChange={(e) => setQueryMonitorSort(e.target.value)}
                                      className={`rounded-xl border px-2.5 py-2 text-xs font-bold outline-none ${darkMode ? 'border-white/10 bg-slate-900/50 text-slate-200' : 'border-slate-200 bg-white text-slate-700'}`}
                                    >
                                        <option value="count_desc">依查詢次數</option>
                                        <option value="latest_desc">依最近查詢</option>
                                        <option value="id_asc">依學號排序</option>
                                    </select>
                                </div>

                                <div className={`flex flex-wrap items-center justify-between gap-2 text-[11px] font-semibold ${darkMode ? 'text-slate-300' : 'text-slate-500'}`}>
                                    <span>上次重置：{queryStatsLastResetText}</span>
                                    <span>
                                        監控範圍：{queryMonitorScope === 'class' ? `目前班級（${teacherClassFilter}）` : '全部學生'} / 排行 {queryStatsRowsFiltered.length} 人 / 事件 {queryFilteredEventList.length} 筆
                                    </span>
                                </div>

                                <div className="grid grid-cols-2 lg:grid-cols-6 gap-2">
                                    <div className={`rounded-xl border px-3 py-2 ${darkMode ? 'bg-slate-900/45 border-white/10' : 'bg-slate-50 border-slate-200'}`}>
                                        <div className={`text-[10px] font-bold tracking-wider uppercase ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>篩選後查詢</div>
                                        <div className={`text-lg font-black ${darkMode ? 'text-emerald-200' : 'text-emerald-700'}`}>{queryFilteredSummary.totalQueries}</div>
                                    </div>
                                    <div className={`rounded-xl border px-3 py-2 ${darkMode ? 'bg-slate-900/45 border-white/10' : 'bg-slate-50 border-slate-200'}`}>
                                        <div className={`text-[10px] font-bold tracking-wider uppercase ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>有查詢學號數</div>
                                        <div className={`text-lg font-black ${darkMode ? 'text-sky-200' : 'text-sky-700'}`}>{queryFilteredSummary.uniqueStudentCount}</div>
                                    </div>
                                    <div className={`rounded-xl border px-3 py-2 ${darkMode ? 'bg-slate-900/45 border-white/10' : 'bg-slate-50 border-slate-200'}`}>
                                        <div className={`text-[10px] font-bold tracking-wider uppercase ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>近24小時</div>
                                        <div className={`text-lg font-black ${darkMode ? 'text-indigo-200' : 'text-indigo-700'}`}>{queryRecentWindowSummary.last24h}</div>
                                    </div>
                                    <div className={`rounded-xl border px-3 py-2 ${darkMode ? 'bg-slate-900/45 border-white/10' : 'bg-slate-50 border-slate-200'}`}>
                                        <div className={`text-[10px] font-bold tracking-wider uppercase ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>近3天</div>
                                        <div className={`text-lg font-black ${darkMode ? 'text-cyan-200' : 'text-cyan-700'}`}>{queryRecentWindowSummary.last3d}</div>
                                    </div>
                                    <div className={`rounded-xl border px-3 py-2 ${darkMode ? 'bg-slate-900/45 border-white/10' : 'bg-slate-50 border-slate-200'}`}>
                                        <div className={`text-[10px] font-bold tracking-wider uppercase ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>近7天</div>
                                        <div className={`text-lg font-black ${darkMode ? 'text-amber-200' : 'text-amber-700'}`}>{queryRecentWindowSummary.last7d}</div>
                                    </div>
                                    <div className={`rounded-xl border px-3 py-2 ${darkMode ? 'bg-slate-900/45 border-white/10' : 'bg-slate-50 border-slate-200'}`}>
                                        <div className={`text-[10px] font-bold tracking-wider uppercase ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>高峰時段</div>
                                        <div className={`text-[12px] font-black ${darkMode ? 'text-violet-200' : 'text-violet-700'}`}>{queryFilteredSummary.peakHourLabel}</div>
                                        <div className={`text-[10px] font-bold ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>共 {queryFilteredSummary.peakHourCount} 次</div>
                                    </div>
                                </div>

                                <div className={`rounded-xl border p-3 ${darkMode ? 'border-white/10 bg-slate-900/45' : 'border-slate-200 bg-white'}`}>
                                    <div className="flex items-center justify-between mb-2">
                                        <div className={`text-[10px] font-black tracking-widest uppercase ${darkMode ? 'text-slate-300' : 'text-slate-500'}`}>監控提醒</div>
                                        <div className={`text-[10px] font-black ${darkMode ? 'text-amber-200' : 'text-amber-700'}`}>{queryMonitorAlertRows.length} 筆</div>
                                    </div>
                                    <div className="space-y-1.5 max-h-[11.5rem] overflow-y-auto pr-1">
                                        {queryMonitorAlertRows.map((row) => (
                                            <div
                                              key={`alert-${row.id}`}
                                              onClick={() => setQueryMonitorKeyword(row.id)}
                                              className={`rounded-lg border px-2.5 py-2 cursor-pointer transition-colors ${darkMode ? 'border-white/10 bg-slate-900/55 hover:bg-slate-800' : 'border-slate-200 bg-slate-50 hover:bg-slate-100'}`}
                                              title="點擊可快速篩選此學號"
                                            >
                                                <div className="flex items-center justify-between gap-2">
                                                    <div className={`text-[11px] font-black ${darkMode ? 'text-slate-100' : 'text-slate-700'}`}>
                                                        <span className="font-mono">{row.id}</span>
                                                        <span className="ml-1.5">{row.name || '-'}</span>
                                                    </div>
                                                    <div className={`text-[10px] font-black ${darkMode ? 'text-rose-200' : 'text-rose-700'}`}>
                                                        {row.alertScore}
                                                    </div>
                                                </div>
                                                <div className="mt-1 flex flex-wrap gap-1">
                                                    {row.tags.map((tag) => (
                                                        <span key={`${row.id}-${tag}`} className={`inline-flex text-[10px] font-bold rounded-full px-2 py-0.5 ${darkMode ? 'bg-rose-400/20 text-rose-100 border border-rose-300/25' : 'bg-rose-100 text-rose-700 border border-rose-200'}`}>
                                                            {tag}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                        {!queryMonitorAlertRows.length && (
                                            <div className={`rounded-lg border px-3 py-3 text-center text-xs font-bold ${darkMode ? 'border-white/10 bg-slate-900/55 text-slate-400' : 'border-slate-200 bg-slate-50 text-slate-500'}`}>
                                                目前沒有明顯異常行為
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 lg:grid-cols-[1.25fr_0.95fr] gap-3">
                                    <div className={`rounded-xl border overflow-hidden ${darkMode ? 'border-white/10' : 'border-slate-200'}`}>
                                        <div className={`grid grid-cols-[6rem_1fr_4rem_6.5rem_4.6rem] px-3 py-2 text-[10px] font-bold tracking-wide ${darkMode ? 'bg-slate-800 text-slate-300' : 'bg-slate-50 text-slate-500'}`}>
                                            <span className="text-center">學號</span>
                                            <span className="text-center">姓名</span>
                                            <span className="text-center">次數</span>
                                            <span className="text-center">最後查詢</span>
                                            <span className="text-center">狀態</span>
                                        </div>
                                        <div className={`${darkMode ? 'bg-slate-900/50' : 'bg-white'}`}>
                                            {(queryStatsRowsFiltered.slice(0, 24)).map((row) => {
                                                const nowTs = Date.now();
                                                const latestTs = Number(row.latestTs) || 0;
                                                const daysSinceLast = latestTs ? Math.floor((nowTs - latestTs) / (24 * 60 * 60 * 1000)) : null;
                                                let statusText = '正常';
                                                let statusClass = darkMode
                                                    ? 'bg-emerald-400/20 text-emerald-100 border-emerald-300/30'
                                                    : 'bg-emerald-100 text-emerald-700 border-emerald-200';

                                                if (Number(row.count) === 0) {
                                                    statusText = '未查詢';
                                                    statusClass = darkMode
                                                        ? 'bg-rose-400/20 text-rose-100 border-rose-300/30'
                                                        : 'bg-rose-100 text-rose-700 border-rose-200';
                                                } else if (daysSinceLast !== null && daysSinceLast >= 14) {
                                                    statusText = '久未查';
                                                    statusClass = darkMode
                                                        ? 'bg-amber-400/20 text-amber-100 border-amber-300/30'
                                                        : 'bg-amber-100 text-amber-700 border-amber-200';
                                                } else if (daysSinceLast !== null && daysSinceLast >= 7) {
                                                    statusText = '待追蹤';
                                                    statusClass = darkMode
                                                        ? 'bg-orange-400/20 text-orange-100 border-orange-300/30'
                                                        : 'bg-orange-100 text-orange-700 border-orange-200';
                                                } else if (Number(row.count) >= 8) {
                                                    statusText = '高頻';
                                                    statusClass = darkMode
                                                        ? 'bg-sky-400/20 text-sky-100 border-sky-300/30'
                                                        : 'bg-sky-100 text-sky-700 border-sky-200';
                                                }

                                                return (
                                                    <div
                                                      key={row.id}
                                                      onClick={() => setQueryMonitorKeyword(row.id)}
                                                      className={`grid grid-cols-[6rem_1fr_4rem_6.5rem_4.6rem] px-3 py-2 text-xs border-t items-center cursor-pointer transition-colors ${darkMode ? 'border-white/5 text-slate-200 hover:bg-slate-800/50' : 'border-slate-100 text-slate-700 hover:bg-slate-50/70'}`}
                                                      title="點擊可快速篩選此學號"
                                                    >
                                                        <span className="font-mono text-center">{row.id}</span>
                                                        <span className="truncate text-center">{row.name || '-'}</span>
                                                        <span className="font-black text-center text-emerald-600">{row.count}</span>
                                                        <span className={`text-[10px] font-semibold text-center ${darkMode ? 'text-slate-300' : 'text-slate-500'}`}>{row.latestAtLabel}</span>
                                                        <span className={`mx-auto inline-flex rounded-full border px-2 py-0.5 text-[10px] font-black ${statusClass}`}>{statusText}</span>
                                                    </div>
                                                );
                                            })}
                                            {!queryStatsRowsFiltered.length && (
                                                <div className={`px-3 py-3 text-center text-xs ${darkMode ? 'text-slate-400' : 'text-slate-400'}`}>
                                                    目前沒有符合條件的查詢排行資料
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="space-y-3">
                                        <div className={`rounded-xl border p-3 ${darkMode ? 'border-white/10 bg-slate-900/45' : 'border-slate-200 bg-white'}`}>
                                            <div className="flex items-center justify-between mb-2">
                                                <div className={`text-[10px] font-black tracking-widest uppercase ${darkMode ? 'text-slate-300' : 'text-slate-500'}`}>本班查詢覆蓋</div>
                                                <div className={`text-sm font-black ${darkMode ? 'text-emerald-200' : 'text-emerald-700'}`}>{queryClassCoverageSummary.coverageRate}%</div>
                                            </div>
                                            <div className={`w-full h-2 rounded-full overflow-hidden ${darkMode ? 'bg-slate-800' : 'bg-slate-100'}`}>
                                                <div
                                                  className="h-full rounded-full bg-[linear-gradient(90deg,#22c55e_0%,#16a34a_50%,#15803d_100%)]"
                                                  style={{ width: `${queryClassCoverageSummary.coverageRate}%` }}
                                                />
                                            </div>
                                            <div className={`mt-2 text-[11px] font-semibold ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                                                已查詢 {queryClassCoverageSummary.queried} / 總人數 {queryClassCoverageSummary.total}，未查詢 {queryClassCoverageSummary.unqueried}
                                            </div>
                                            {queryClassUnqueriedPreview.length > 0 && (
                                                <div className="mt-2 space-y-1">
                                                    {queryClassUnqueriedPreview.map((row) => (
                                                        <div key={row.id} className={`grid grid-cols-[5.8rem_1fr] gap-2 text-[11px] rounded-lg px-2 py-1 border ${darkMode ? 'border-white/10 bg-slate-900/55 text-slate-300' : 'border-slate-200 bg-slate-50 text-slate-600'}`}>
                                                            <span className="font-mono">{row.id}</span>
                                                            <span className="truncate">{row.name || '-'}</span>
                                                        </div>
                                                    ))}
                                                    {queryClassCoverageSummary.unqueried > queryClassUnqueriedPreview.length && (
                                                        <div className={`text-[10px] font-bold ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                                                            尚有 {queryClassCoverageSummary.unqueried - queryClassUnqueriedPreview.length} 位未顯示
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                            {queryClassCoverageSummary.total === 0 && (
                                                <div className={`mt-2 text-[11px] font-semibold ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                                                    目前班級名單尚未載入，請先確認日期與班級
                                                </div>
                                            )}
                                        </div>

                                        <div className={`rounded-xl border p-3 ${darkMode ? 'border-white/10 bg-slate-900/45' : 'border-slate-200 bg-white'}`}>
                                            <div className={`text-[10px] font-black tracking-widest uppercase mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-500'}`}>兩小時查詢熱區</div>
                                            <div className="grid grid-cols-2 gap-1.5">
                                                {queryBiHourBuckets.map((bucket) => (
                                                    <div key={bucket.key} className={`rounded-lg border px-2 py-1.5 ${darkMode ? 'border-white/10 bg-slate-900/55' : 'border-slate-200 bg-slate-50'}`}>
                                                        <div className={`text-[10px] font-bold mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-500'}`}>{bucket.label}</div>
                                                        <div className={`h-1.5 rounded-full overflow-hidden ${darkMode ? 'bg-slate-800' : 'bg-slate-200'}`}>
                                                            <div
                                                              className="h-full rounded-full bg-[linear-gradient(90deg,#22c55e_0%,#0ea5e9_55%,#6366f1_100%)]"
                                                              style={{ width: `${bucket.count > 0 ? Math.max(8, Math.round(bucket.ratio * 100)) : 0}%` }}
                                                            />
                                                        </div>
                                                        <div className={`text-[10px] font-black mt-1 ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>{bucket.count}</div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        <div className={`rounded-xl border p-3 ${darkMode ? 'border-white/10 bg-slate-900/45' : 'border-slate-200 bg-white'}`}>
                                            <div className={`text-[10px] font-black tracking-widest uppercase mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-500'}`}>14日查詢趨勢</div>
                                            <div className="space-y-1.5 max-h-[12rem] overflow-y-auto pr-1">
                                                {queryDailyTrend.map((day) => (
                                                    <div key={day.dateKey} className="grid grid-cols-[3.9rem_1fr_2rem] items-center gap-2">
                                                        <span className={`text-[10px] font-bold ${darkMode ? 'text-slate-300' : 'text-slate-500'}`}>{day.label.slice(0, 5)}</span>
                                                        <div className={`h-1.5 rounded-full overflow-hidden ${darkMode ? 'bg-slate-800' : 'bg-slate-200'}`}>
                                                            <div
                                                              className="h-full rounded-full bg-[linear-gradient(90deg,#10b981_0%,#22c55e_35%,#0ea5e9_100%)]"
                                                              style={{ width: `${day.count > 0 ? Math.max(8, Math.round(day.ratio * 100)) : 0}%` }}
                                                            />
                                                        </div>
                                                        <span className={`text-[10px] font-black text-right ${darkMode ? 'text-slate-100' : 'text-slate-700'}`}>{day.count}</span>
                                                    </div>
                                                ))}
                                                {!queryDailyTrend.length && (
                                                    <div className={`text-[11px] text-center font-semibold ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                                                        目前沒有趨勢資料
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className={`rounded-xl border overflow-hidden ${darkMode ? 'border-white/10 bg-slate-900/45' : 'border-slate-200 bg-white'}`}>
                                    <div className={`px-3 py-2 text-[10px] font-bold tracking-wide uppercase ${darkMode ? 'bg-slate-800 text-slate-300' : 'bg-slate-50 text-slate-500'}`}>每日查詢名單（依時間順序）</div>
                                    <div className="max-h-[20rem] overflow-y-auto">
                                        {queryEventsByDayFiltered.map((day) => (
                                            <div key={day.dateKey} className={`border-t ${darkMode ? 'border-white/5' : 'border-slate-100'}`}>
                                                <div className={`px-3 py-2 text-[11px] font-black flex items-center justify-between ${darkMode ? 'text-slate-200 bg-slate-900/55' : 'text-slate-700 bg-slate-50/80'}`}>
                                                    <span>{day.dateLabel}</span>
                                                    <span className={`${darkMode ? 'text-emerald-300' : 'text-emerald-700'}`}>{day.items.length} 次</span>
                                                </div>
                                                <div>
                                                    {day.items.map((event, idx) => (
                                                        <div key={`${event.id}-${event.ts}-${idx}`} className={`grid grid-cols-[5.4rem_6rem_1fr] gap-2 px-3 py-1.5 text-[11px] ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                                                            <span className="font-mono">{event.timeLabel}</span>
                                                            <span className="font-mono">{event.id}</span>
                                                            <span className="truncate">{event.name || '-'}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                        {!queryEventsByDayFiltered.length && (
                                            <div className={`px-3 py-3 text-center text-xs ${darkMode ? 'text-slate-400' : 'text-slate-400'}`}>
                                                目前沒有符合條件的每日查詢資料
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
            {/* ... other modals ... */}
            {statusMsg && <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-900/90 text-white px-5 py-3 rounded-full flex items-center text-xs font-bold shadow-2xl backdrop-blur-md z-50 border border-white/10"><Check className="w-4 h-4 mr-2 text-blue-400" /> {statusMsg}</div>}
              
            {/* ... Single View ... */}
            {teacherViewMode === 'single' && currentStudentId && !loading && (
              <div className={`rounded-[2rem] shadow-2xl border overflow-hidden backdrop-blur-md ${darkMode ? 'bg-[#0f172a]/70 border-white/10 ring-1 ring-white/5' : 'bg-white border-white shadow-[0_20px_52px_rgba(15,23,42,0.12)]'}`}>
                <div className={`p-6 border-b flex justify-between items-center ${darkMode ? 'border-white/5 bg-[#0f172a]/50' : 'border-slate-200/60 bg-white'}`}>
                  <div className="flex-1 mr-4">
                      <input type="text" value={studentName} onChange={(e) => setStudentName(e.target.value)} className={`text-2xl font-bold bg-transparent border-none outline-none w-full transition-all tracking-tight ${darkMode ? 'text-white placeholder:text-slate-700' : 'text-slate-800 placeholder:text-slate-200'}`} placeholder="學生姓名"/>
                      <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border mt-1 inline-block opacity-60 ${darkMode ? 'border-slate-600 text-slate-400' : 'border-slate-200 text-slate-400'}`}>{currentStudentId}</span>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={handleDeleteStudent} className="bg-red-500/10 text-red-500 p-2.5 rounded-xl hover:bg-red-500/20 transition-colors active:scale-95"><Trash2 className="w-5 h-5"/></button>
                    <button
                      onClick={handleSaveGrades}
                      disabled={!canEditStudentGrades}
                      className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${canEditStudentGrades ? 'bg-blue-600 text-white hover:bg-blue-500 shadow-lg shadow-blue-500/30 active:scale-95' : 'bg-slate-300 text-white cursor-not-allowed'}`}
                    >
                      <Save className="w-4 h-4"/> {canEditStudentGrades ? '儲存' : '唯讀鎖定'}
                    </button>
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
                                                    disabled={!canEditStudentGrades}
                                                    onChange={(e) => handleGradeChange(date, 'class', e.target.value)}
                                                    className={`w-full text-center p-2 rounded-lg bg-transparent border border-transparent outline-none text-base font-bold transition-all ${canEditStudentGrades ? 'cursor-pointer hover:bg-black/5 dark:hover:bg-white/5' : 'cursor-not-allowed opacity-70'} ${darkMode ? 'text-slate-200 focus:bg-slate-800' : 'text-slate-700 focus:bg-white'}`}
                                                >
                                                    {CLASS_DEFS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                                                </select>
                                            </td>
                                            {['chi', 'eng', 'math'].map(sub => (
                                                <td key={sub} className="px-2 py-2 text-center">
                                                    <input id={`single-${dateIndex}-${sub}`} type="text" disabled={!canEditStudentGrades} className={`w-full text-center p-2 rounded-lg bg-transparent border border-transparent outline-none text-base font-bold transition-all ${!canEditStudentGrades ? 'cursor-not-allowed opacity-70' : ''} ${darkMode ? 'focus:bg-slate-800 focus:border-blue-500/50 text-slate-200' : 'focus:bg-white focus:border-blue-200 text-slate-700'}`} value={g[sub]} onChange={(e) => handleGradeChange(date, sub, e.target.value)} onKeyDown={canEditStudentGrades ? (e) => handleSingleKeyDown(e, dateIndex, sub) : undefined} onPaste={canEditStudentGrades ? (e) => handleSinglePaste(e, dateIndex, sub) : undefined} placeholder="-" />
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
          <div className={`${viewData ? 'max-w-5xl' : 'max-w-md'} mx-auto space-y-6 pt-10 transition-all duration-300`}> 
            {!viewData && (
            <div className={`backdrop-blur-2xl p-8 rounded-[2.5rem] shadow-2xl border text-center relative overflow-hidden ${darkMode ? 'bg-[#121c17]/88 border-emerald-200/15 shadow-black/30' : 'bg-white border-white shadow-[0_24px_55px_rgba(15,23,42,0.12)]'}`}>
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-sky-500 via-emerald-500 to-indigo-500"></div>
              <h2 className={`text-2xl font-black mb-8 tracking-tight ${darkMode ? 'text-white' : 'text-slate-800'}`}>查詢成績</h2>
              <div className={`w-full p-2 rounded-2xl border transition-all mb-6 shadow-inner ${darkMode ? 'bg-[#08120d]/70 border-emerald-200/15 focus-within:ring-2 focus-within:ring-emerald-500/20' : 'bg-slate-50 border-slate-200 focus-within:bg-white focus-within:ring-2 focus-within:ring-blue-100'}`}>
                <input type="text" placeholder="請輸入學號" className={`w-full bg-transparent border-none px-4 py-3 outline-none text-xl uppercase font-bold text-center tracking-widest placeholder:text-base placeholder:tracking-normal placeholder:font-medium ${darkMode ? 'text-white placeholder:text-slate-600' : 'text-slate-800 placeholder:text-slate-400'}`} value={searchId} onChange={(e) => setSearchId(e.target.value)} />
              </div>
              <button onClick={handleParentSearch} disabled={loading || !user} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-4 rounded-2xl font-bold text-lg shadow-sm transition-all active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100 tracking-wide">{loading ? '查詢中...' : (!user ? '連線中...' : '開始查詢')}</button>
              {searchError && <p className="mt-6 text-red-500 text-xs font-bold bg-red-500/10 inline-block px-4 py-2 rounded-full animate-pulse">{searchError}</p>}
            </div>
            )}

            {viewData && (
              <div className={`rounded-[2.5rem] shadow-2xl overflow-hidden border backdrop-blur-2xl ${darkMode ? 'bg-[#121c17]/88 border-emerald-200/15 shadow-black/30' : 'bg-white border-white shadow-[0_26px_60px_rgba(15,23,42,0.13)]'}`}>
                <div className={`p-8 pb-6 relative overflow-hidden ${darkMode ? 'bg-[#0d1712] text-white border-b border-emerald-200/10' : 'bg-gradient-to-r from-emerald-50 via-sky-50 to-white text-slate-800 border-b border-slate-100'}`}>
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
                           <button onClick={() => setViewData(null)} className={`p-2 rounded-full backdrop-blur-md transition-colors ${darkMode ? 'text-slate-400 hover:text-white bg-white/5' : 'text-slate-500 hover:text-slate-700 bg-white border border-slate-200'}`}><LogOut className="w-4 h-4"/></button>
                           
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
                  {teacherMessageForParent && (
                  <div className={`mb-6 rounded-2xl border px-4 py-3 ${darkMode ? 'bg-emerald-500/10 border-emerald-300/25 text-emerald-100' : 'bg-emerald-50/85 border-emerald-200 text-emerald-900'}`}>
                      <div className={`text-[10px] font-black uppercase tracking-widest mb-1.5 ${darkMode ? 'text-emerald-200' : 'text-emerald-700'}`}>老師的話</div>
                      <p className={`text-sm leading-relaxed font-medium whitespace-pre-line ${darkMode ? 'text-emerald-50' : 'text-slate-700'}`}>{teacherMessageForParent}</p>
                  </div>
                  )}

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
                  
                <div className={`p-6 border-t ${darkMode ? 'bg-[#101a15] border-emerald-200/10' : 'bg-white border-slate-100/80'}`}>
                    <h4 className={`font-bold mb-6 text-xs flex items-center justify-center gap-2 tracking-widest uppercase ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>詳細紀錄</h4>
                    <div className="space-y-4">
                        {parentPhaseDataDesc.map((d, rowIndex) => {
                             // 使用 weekendID（如果存在）或 date，確保日A班/日B班的週日日期也能正確計算排名
                             const dateForRank = d.weekendID || d.date;
                             const totalRank = calculateRank(dateForRank, 'total', d.total, d.class);
                             const globalPR = calculateGlobalPR(dateForRank, 'total', d.total);
                             return (
                             <div key={`${d.weekendID || d.date}-${rowIndex}`} className={`group p-5 rounded-3xl border transition-all duration-300 ${darkMode ? 'bg-white/5 border-white/5 hover:border-blue-500/20' : 'bg-white border-slate-200/70 shadow-[0_10px_28px_rgba(15,23,42,0.06)] hover:border-sky-200 hover:shadow-[0_18px_34px_rgba(14,165,233,0.12)]'}`}>
                                <div className="flex justify-between items-start mb-4">
                                    <div className="flex flex-col gap-2 items-start">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-bold text-slate-400 font-mono">{d.date}</span>
                                            {d.class && <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold opacity-60 ${darkMode ? 'bg-white/10 text-white' : 'bg-slate-100 text-slate-600'}`}>{d.class}</span>}
                                        </div>
                                        <button onClick={() => openStatsModal(dateForRank, { total: d.total, chi: d.chi, eng: d.eng, math: d.math }, d.class)} className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all hover:scale-105 active:scale-95 shadow-md ${darkMode ? 'bg-[#193227] text-emerald-100 hover:bg-[#214233] border border-emerald-200/20 shadow-black/25' : 'bg-[linear-gradient(122deg,#ecfdf5_0%,#e0f2fe_55%,#eef2ff_100%)] text-emerald-800 hover:bg-[linear-gradient(122deg,#d1fae5_0%,#dbeafe_55%,#e0e7ff_100%)] shadow-emerald-200/70 border border-emerald-200/70'}`}>
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
                                            <div key={sub} className={`rounded-2xl p-2 text-center ${darkMode ? 'bg-slate-900' : 'bg-slate-50 border border-slate-200/70'}`}>
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
            <div className="fixed inset-0 bg-black/62 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setStatsModalData(null)}>
                <div className={`rounded-[2.2rem] w-full max-w-2xl overflow-hidden flex flex-col max-h-[92vh] border ${darkMode ? 'bg-slate-800 border-white/10' : 'bg-white border-slate-200 shadow-[0_30px_70px_rgba(15,23,42,0.22)]'}`} onClick={e => e.stopPropagation()}>
                    <div className={`p-6 sm:p-7 border-b relative ${darkMode ? 'border-white/5 bg-slate-800/60' : 'border-slate-200 bg-gradient-to-r from-sky-50 via-white to-emerald-50'}`}>
                        <button onClick={() => setStatsModalData(null)} className={`absolute top-5 right-5 p-2 rounded-full transition ${darkMode ? 'bg-white/5 hover:bg-white/10 text-white' : 'bg-white hover:bg-slate-50 text-slate-500 border border-slate-200'}`}><X className="w-5 h-5"/></button>
                        <div className="pr-12">
                            <div className={`text-[10px] font-black uppercase tracking-[0.18em] mb-2 ${darkMode ? 'text-blue-400' : 'text-sky-700'}`}>Placement Insight</div>
                            <h3 className={`text-2xl font-black tracking-tight ${darkMode ? 'text-white' : 'text-slate-800'}`}>{statsModalData.date} 落點分析</h3>
                            <div className="mt-3 flex flex-wrap items-center gap-2">
                                <span className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border ${darkMode ? 'text-slate-200 border-white/20 bg-white/5' : 'text-slate-700 border-slate-300 bg-white'}`}>{statsModalData.className || 'A班'}</span>
                                <span className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border ${darkMode ? 'text-emerald-200 border-emerald-300/30 bg-emerald-500/10' : 'text-emerald-700 border-emerald-200 bg-emerald-50'}`}>{COLORS[statsActiveTab]?.label || '總分'}分布</span>
                            </div>
                        </div>
                    </div>
                    <div className="p-5 sm:p-6 overflow-y-auto">
                        <div className={`rounded-2xl border p-1 mb-4 shadow-inner ${darkMode ? 'bg-[#020617]/50 border-white/5' : 'bg-slate-100 border-slate-200'}`}>
                            <div className="grid grid-cols-4 gap-1">
                                {['總分', '國文', '英文', '數學'].map(tab => {
                                    const tabKey = tab === '總分' ? 'total' : tab === '國文' ? 'chi' : tab === '英文' ? 'eng' : 'math';
                                    const isActive = statsActiveTab === tabKey;
                                    return (
                                        <button key={tabKey} onClick={() => setStatsActiveTab(tabKey)} className={`py-2 text-xs font-black rounded-xl transition-all ${isActive ? (darkMode ? 'bg-slate-800 text-white shadow-md border border-white/5' : 'bg-white text-slate-800 shadow-sm border border-slate-200') : 'text-slate-500'}`}>
                                            {isActive && <span className={`inline-block w-1.5 h-1.5 rounded-full ${TAB_DOT_BG_CLASS[tabKey]} mr-1.5 mb-0.5`}></span>}{tab}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
                            <div className={`rounded-xl px-3 py-2.5 border ${darkMode ? 'bg-slate-900/60 border-white/10' : 'bg-white border-slate-200'}`}>
                                <div className={`text-[10px] font-black uppercase tracking-wide ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>樣本數</div>
                                <div className={`text-xl font-black ${darkMode ? 'text-white' : 'text-slate-800'}`}>{statsSummary?.sampleCount || 0}</div>
                            </div>
                            <div className={`rounded-xl px-3 py-2.5 border ${darkMode ? 'bg-slate-900/60 border-white/10' : 'bg-white border-slate-200'}`}>
                                <div className={`text-[10px] font-black uppercase tracking-wide ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>我的區間</div>
                                <div className={`text-sm font-black ${darkMode ? 'text-blue-300' : 'text-blue-700'}`}>{statsSummary?.myRange || '-'}</div>
                            </div>
                            <div className={`rounded-xl px-3 py-2.5 border ${darkMode ? 'bg-slate-900/60 border-white/10' : 'bg-white border-slate-200'}`}>
                                <div className={`text-[10px] font-black uppercase tracking-wide ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>最多人區間</div>
                                <div className={`text-sm font-black ${darkMode ? 'text-amber-300' : 'text-amber-700'}`}>{statsSummary?.peakRange || '-'}</div>
                            </div>
                            <div className={`rounded-xl px-3 py-2.5 border ${darkMode ? 'bg-slate-900/60 border-white/10' : 'bg-white border-slate-200'}`}>
                                <div className={`text-[10px] font-black uppercase tracking-wide ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>最多人數</div>
                                <div className={`text-xl font-black ${darkMode ? 'text-emerald-300' : 'text-emerald-700'}`}>{statsSummary?.peakCount || 0}</div>
                            </div>
                        </div>

                        <div className={`rounded-2xl border p-3 mb-4 ${darkMode ? 'bg-slate-900/45 border-white/10' : 'bg-white border-slate-200'}`}>
                            <div className="flex items-center justify-between px-2 mb-1">
                                <div className={`text-xs font-black tracking-wide ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>{COLORS[statsActiveTab]?.label || '總分'}分布圖</div>
                                <div className={`text-[10px] font-bold ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>高亮柱為你的所在區間</div>
                            </div>
                            <Suspense fallback={<ChartFallback heightClass="h-72" />}>
                                <DistributionChart
                                  data={statsModalData[statsActiveTab]}
                                  highlightColor={COLORS[statsActiveTab].hex}
                                  isDarkMode={darkMode}
                                />
                            </Suspense>
                        </div>

                        <div className={`rounded-2xl border p-4 ${darkMode ? 'bg-white/5 border-white/5' : 'bg-slate-50 border-slate-200'}`}>
                            <div className="flex items-center justify-between">
                                <span className={`text-sm font-black ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>我的{COLORS[statsActiveTab]?.label || '總分'}分數</span>
                                <span className={`text-2xl font-black ${darkMode ? 'text-white' : 'text-slate-800'}`}>{statsModalData.myGrades?.[statsActiveTab] ?? '-'}</span>
                            </div>
                            <div className={`mt-3 text-xs leading-relaxed ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                                你的分數落在 <span className="font-black">{statsSummary?.myRange || '-'}</span>，本次最多學生集中在 <span className="font-black">{statsSummary?.peakRange || '-'}</span>（{statsSummary?.peakCount || 0} 人）。
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        )}

        {showSecurityModal && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-[60] p-6 animate-in fade-in duration-200" onClick={closeSecurityModal}>
                <div className={`p-8 rounded-[2rem] shadow-2xl max-w-xs w-full text-center transform transition-all scale-100 border ${darkMode ? 'bg-slate-800 border-white/10' : 'bg-white border-white/50'}`} onClick={e => e.stopPropagation()}>
                    <div className={`mx-auto mb-6 p-4 rounded-full inline-block shadow-inner ${darkMode ? 'bg-blue-500/10 text-blue-400' : 'bg-blue-50 text-blue-600'}`}>
                        <ShieldCheck className="w-8 h-8" />
                    </div>
                    <h3 className={`text-lg font-bold mb-6 ${darkMode ? 'text-white' : 'text-slate-800'}`}>{pendingActionTitle}</h3>
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
                      <button
                        onClick={() => executeWithSecurity(deleteTarget ? confirmDeleteDate : confirmDeleteStudent, {
                            title: deleteTarget ? '刪除測驗日期' : '刪除學生資料'
                        })}
                        className="flex-1 px-4 py-3.5 rounded-xl bg-red-500 text-white hover:bg-red-600 font-bold text-sm shadow-lg shadow-red-900/20 transition-all active:scale-95"
                      >
                        刪除
                      </button>
                  </div>
              </div>
          </div>
        )}
      </main>
    </div>
  );
}
