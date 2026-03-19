import React, { Suspense, useState, useEffect, useMemo, useRef, useCallback, useDeferredValue, startTransition } from 'react';
import { Search, Save, Plus, Check, BarChart3, X, Lock, LayoutDashboard, GraduationCap, Calendar, Clipboard, LogOut, AlertTriangle, UserPlus, Sparkles, Edit3, Trash2, Trophy, Target, FileSpreadsheet, ChevronRight, ArrowLeft, PieChart, Users, BarChart2, ShieldCheck, ArrowDownWideNarrow, Percent, Info } from 'lucide-react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, getDoc, getDocs, deleteDoc } from 'firebase/firestore/lite';
import {
    customDateSort,
    normalizeDateToken,
    sanitizeDateList,
    getWeekendID,
    getWeekendDisplayLabel,
    resolvePhaseByDate
} from './lib/academicDate';

// --- Global Constants ---
const DEFAULT_EXAM_STARTS = [
  "04/12", "04/19", "04/26", "05/03", "05/10", "05/17", "05/24", "06/07", "06/14",
  "06/21", "06/28", "06/29", "07/12", "07/19", "07/21", "07/26", "08/02", "08/09", 
  "08/16", "08/30", "09/06", "09/13", "09/20", "09/27", "09/29", "10/04", 
  "10/11", "10/18", "10/25", "11/01", "11/08", "11/15", "11/29", "12/06", "12/13", "12/20",
  "12/27", "01/03", "01/10", "01/17", "01/24", "01/31", "02/02", "02/07", "02/13", "02/28"
];

const LEGACY_CLASS_DEFS = Object.freeze([
    { id: 'A班', label: 'A' },
    { id: 'B班', label: 'B' },
    { id: 'C班', label: 'C' },
    { id: '日A班', label: '日A' },
    { id: '日B班', label: '日B' }
]);

const NEXT_CLASS_DEFS = Object.freeze([
    { id: 'A班', label: 'A' },
    { id: 'B班', label: 'B' },
    { id: 'C班', label: 'C' },
    { id: '東興', label: '東興' }
]);

const getClassDefsForCohort = (cohortId) => (
    String(cohortId || '').trim() === NEXT_COHORT_ID ? NEXT_CLASS_DEFS : LEGACY_CLASS_DEFS
);

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
const STUDENT_DATA_VERSION_DOC_ID = 'students_data_version_v1';
const SETTINGS_CACHE_TTL_MS = 10 * 60 * 1000;
const STUDENT_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const TEACHER_MESSAGE_CACHE_TTL_MS = 10 * 60 * 1000;
const PARENT_QUERY_CACHE_TTL_MS = 20 * 60 * 1000;
const MAX_PARENT_QUERY_CACHE_ENTRIES = 40;
const QUERY_STATS_CACHE_TTL_MS = 2 * 60 * 1000;
const QUERY_STATS_FLUSH_DELAY_MS = 2500;
const OPERATION_LOG_TTL_MS = 45 * 24 * 60 * 60 * 1000;
const SNAPSHOT_TTL_MS = 120 * 24 * 60 * 60 * 1000;
const MAX_OPERATION_LOG_ENTRIES = 220;
const MAX_LOCAL_SNAPSHOTS = 4;
const MAX_IMPORT_PREVIEW_ROWS = 12;
const MAX_QUALITY_DETAIL_ITEMS = 120;
const INITIAL_BATCH_RENDER_ROWS = 42;
const BATCH_RENDER_CHUNK_ROWS = 56;
const SCORE_KEYS = ['chi', 'eng', 'math'];
const LOCAL_CACHE_KEYS = Object.freeze({
    dates: 'grade_tracker_cache_dates_v2',
    classAverages: 'grade_tracker_cache_class_averages_v18',
    students: 'grade_tracker_cache_students_v3',
    studentsVersion: 'grade_tracker_cache_students_version_v1',
    teacherMessage: 'grade_tracker_cache_teacher_message_v1',
    queryStats: 'grade_tracker_cache_query_stats_v1',
    parentQueryResults: 'grade_tracker_cache_parent_query_results_v6',
    operationLog: 'grade_tracker_cache_operation_log_v1',
    snapshots: 'grade_tracker_cache_snapshots_v1'
});
const STUDENTS_SESSION_SYNC_KEY = 'grade_tracker_students_session_synced_v3';
const COHORT_STORAGE_MODE = Object.freeze({
    LEGACY: 'legacy',
    SCOPED: 'scoped'
});
const COHORT_DATE_MODE = Object.freeze({
    LINKED: 'linked',
    SINGLE: 'single'
});
const LEGACY_COHORT_ID = '2025-2026';
const NEXT_COHORT_ID = '2026-2027';
const COHORT_REGISTRY_DOC_ID = 'cohorts_v1';
const TEACHER_ACTIVE_COHORT_STORAGE_KEY = 'grade_tracker_teacher_active_cohort_v1';
const DEFAULT_COHORT_OPTIONS = Object.freeze([
    { id: LEGACY_COHORT_ID, label: '2025-2026', storageMode: COHORT_STORAGE_MODE.LEGACY, dateMode: COHORT_DATE_MODE.LINKED },
    { id: NEXT_COHORT_ID, label: '2026-2027', storageMode: COHORT_STORAGE_MODE.SCOPED, dateMode: COHORT_DATE_MODE.SINGLE }
]);
const BUTTON_SYSTEM = Object.freeze({
    primary: 'btn-premium btn-premium--primary btn-sheen',
    secondary: 'btn-premium btn-premium--secondary btn-sheen',
    danger: 'btn-premium btn-premium--danger btn-sheen',
    segment: 'btn-premium btn-premium--segment btn-sheen',
    segmentActive: 'btn-premium btn-premium--segment btn-premium--segment-active btn-sheen',
    icon: 'btn-premium btn-premium--secondary btn-premium--icon btn-sheen',
    iconDanger: 'btn-premium btn-premium--danger btn-premium--icon btn-sheen'
});
const CLASS_PILL_THEME = Object.freeze({
    'A班': {
        dot: 'bg-indigo-500',
        activeLight: 'text-indigo-700 border-indigo-200/95 ring-2 ring-indigo-200/70 shadow-[0_16px_30px_rgba(79,70,229,0.16)] bg-[linear-gradient(135deg,rgba(224,231,255,0.95)_0%,rgba(255,255,255,0.98)_56%,rgba(199,210,254,0.88)_100%)]',
        inactiveLight: 'text-slate-500 hover:text-indigo-700 hover:border-indigo-100/90',
        activeDark: 'text-indigo-100 border-indigo-300/25 ring-2 ring-indigo-300/20 shadow-[0_18px_36px_rgba(49,46,129,0.28)] bg-[linear-gradient(135deg,rgba(55,48,163,0.52)_0%,rgba(15,23,42,0.92)_68%,rgba(67,56,202,0.42)_100%)]',
        inactiveDark: 'text-slate-400 hover:text-indigo-100 hover:border-indigo-300/15'
    },
    'B班': {
        dot: 'bg-sky-500',
        activeLight: 'text-sky-700 border-sky-200/95 ring-2 ring-sky-200/70 shadow-[0_16px_30px_rgba(2,132,199,0.16)] bg-[linear-gradient(135deg,rgba(224,242,254,0.95)_0%,rgba(255,255,255,0.98)_56%,rgba(186,230,253,0.88)_100%)]',
        inactiveLight: 'text-slate-500 hover:text-sky-700 hover:border-sky-100/90',
        activeDark: 'text-sky-100 border-sky-300/25 ring-2 ring-sky-300/20 shadow-[0_18px_36px_rgba(12,74,110,0.28)] bg-[linear-gradient(135deg,rgba(3,105,161,0.52)_0%,rgba(15,23,42,0.92)_68%,rgba(14,116,144,0.42)_100%)]',
        inactiveDark: 'text-slate-400 hover:text-sky-100 hover:border-sky-300/15'
    },
    'C班': {
        dot: 'bg-emerald-500',
        activeLight: 'text-emerald-700 border-emerald-200/95 ring-2 ring-emerald-200/70 shadow-[0_16px_30px_rgba(5,150,105,0.16)] bg-[linear-gradient(135deg,rgba(220,252,231,0.95)_0%,rgba(255,255,255,0.98)_56%,rgba(167,243,208,0.88)_100%)]',
        inactiveLight: 'text-slate-500 hover:text-emerald-700 hover:border-emerald-100/90',
        activeDark: 'text-emerald-100 border-emerald-300/25 ring-2 ring-emerald-300/20 shadow-[0_18px_36px_rgba(6,78,59,0.28)] bg-[linear-gradient(135deg,rgba(5,150,105,0.5)_0%,rgba(15,23,42,0.92)_68%,rgba(4,120,87,0.42)_100%)]',
        inactiveDark: 'text-slate-400 hover:text-emerald-100 hover:border-emerald-300/15'
    },
    '東興': {
        dot: 'bg-amber-500',
        activeLight: 'text-amber-700 border-amber-200/95 ring-2 ring-amber-200/70 shadow-[0_16px_30px_rgba(217,119,6,0.16)] bg-[linear-gradient(135deg,rgba(254,243,199,0.95)_0%,rgba(255,255,255,0.98)_56%,rgba(253,230,138,0.86)_100%)]',
        inactiveLight: 'text-slate-500 hover:text-amber-700 hover:border-amber-100/90',
        activeDark: 'text-amber-100 border-amber-300/25 ring-2 ring-amber-300/20 shadow-[0_18px_36px_rgba(120,53,15,0.28)] bg-[linear-gradient(135deg,rgba(180,83,9,0.5)_0%,rgba(15,23,42,0.92)_68%,rgba(217,119,6,0.38)_100%)]',
        inactiveDark: 'text-slate-400 hover:text-amber-100 hover:border-amber-300/15'
    },
    '日A班': {
        dot: 'bg-violet-500',
        activeLight: 'text-violet-700 border-violet-200/95 ring-2 ring-violet-200/70 shadow-[0_16px_30px_rgba(124,58,237,0.16)] bg-[linear-gradient(135deg,rgba(237,233,254,0.95)_0%,rgba(255,255,255,0.98)_56%,rgba(221,214,254,0.88)_100%)]',
        inactiveLight: 'text-slate-500 hover:text-violet-700 hover:border-violet-100/90',
        activeDark: 'text-violet-100 border-violet-300/25 ring-2 ring-violet-300/20 shadow-[0_18px_36px_rgba(76,29,149,0.28)] bg-[linear-gradient(135deg,rgba(109,40,217,0.5)_0%,rgba(15,23,42,0.92)_68%,rgba(124,58,237,0.4)_100%)]',
        inactiveDark: 'text-slate-400 hover:text-violet-100 hover:border-violet-300/15'
    },
    '日B班': {
        dot: 'bg-rose-500',
        activeLight: 'text-rose-700 border-rose-200/95 ring-2 ring-rose-200/70 shadow-[0_16px_30px_rgba(225,29,72,0.16)] bg-[linear-gradient(135deg,rgba(255,228,230,0.95)_0%,rgba(255,255,255,0.98)_56%,rgba(254,205,211,0.88)_100%)]',
        inactiveLight: 'text-slate-500 hover:text-rose-700 hover:border-rose-100/90',
        activeDark: 'text-rose-100 border-rose-300/25 ring-2 ring-rose-300/20 shadow-[0_18px_36px_rgba(136,19,55,0.28)] bg-[linear-gradient(135deg,rgba(190,24,93,0.5)_0%,rgba(15,23,42,0.92)_68%,rgba(225,29,72,0.4)_100%)]',
        inactiveDark: 'text-slate-400 hover:text-rose-100 hover:border-rose-300/15'
    }
});
const getClassPillTheme = (classId, isDarkMode) => {
    const theme = CLASS_PILL_THEME[classId] || CLASS_PILL_THEME['A班'];
    return {
        dot: theme.dot,
        active: isDarkMode ? theme.activeDark : theme.activeLight,
        inactive: isDarkMode ? theme.inactiveDark : theme.inactiveLight
    };
};

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

const getScopedCacheKey = (baseKey, scope = 'global') => `${baseKey}::${scope || 'global'}`;

const normalizeCohortOptions = (rawCohorts) => {
    const normalized = [];
    const seen = new Set();
    const candidates = [...DEFAULT_COHORT_OPTIONS, ...(Array.isArray(rawCohorts) ? rawCohorts : [])];

    candidates.forEach((rawCohort) => {
        const id = String(rawCohort?.id || '').trim();
        if (!id || seen.has(id)) return;
        seen.add(id);
        normalized.push({
            id,
            label: String(rawCohort?.label || id).trim() || id,
            storageMode: rawCohort?.storageMode === COHORT_STORAGE_MODE.SCOPED
                ? COHORT_STORAGE_MODE.SCOPED
                : COHORT_STORAGE_MODE.LEGACY,
            dateMode: rawCohort?.dateMode === COHORT_DATE_MODE.LINKED
                ? COHORT_DATE_MODE.LINKED
                : (
                    rawCohort?.dateMode === COHORT_DATE_MODE.SINGLE
                    || rawCohort?.storageMode === COHORT_STORAGE_MODE.SCOPED
                    || id === NEXT_COHORT_ID
                )
                    ? COHORT_DATE_MODE.SINGLE
                    : COHORT_DATE_MODE.LINKED
        });
    });

    return normalized.length ? normalized : [...DEFAULT_COHORT_OPTIONS];
};

const resolveCohortDateMode = (cohortId, rawCohorts = DEFAULT_COHORT_OPTIONS) => {
    const normalizedId = String(cohortId || '').trim();
    const cohorts = normalizeCohortOptions(rawCohorts);
    const matched = cohorts.find((cohort) => cohort.id === normalizedId);
    if (matched?.dateMode === COHORT_DATE_MODE.SINGLE) return COHORT_DATE_MODE.SINGLE;
    if (matched?.dateMode === COHORT_DATE_MODE.LINKED) return COHORT_DATE_MODE.LINKED;
    return normalizedId === NEXT_COHORT_ID ? COHORT_DATE_MODE.SINGLE : COHORT_DATE_MODE.LINKED;
};

const getDefaultDatesForCohort = (cohortId, rawCohorts = DEFAULT_COHORT_OPTIONS) => (
    resolveCohortDateMode(cohortId, rawCohorts) === COHORT_DATE_MODE.SINGLE
        ? []
        : sanitizeDateList(DEFAULT_EXAM_STARTS)
);

const resolveDateIdForCohort = (dateStr, cohortId, rawDatePool = [], rawCohorts = DEFAULT_COHORT_OPTIONS) => {
    const normalized = normalizeDateToken(dateStr);
    if (!normalized) return '';
    if (resolveCohortDateMode(cohortId, rawCohorts) === COHORT_DATE_MODE.SINGLE) {
        return normalized;
    }
    const datePool = sanitizeDateList(rawDatePool);
    return getWeekendID(normalized, datePool);
};

const getDateDisplayLabelForCohort = (dateStr, cohortId, rawDatePool = [], rawCohorts = DEFAULT_COHORT_OPTIONS) => {
    const normalized = normalizeDateToken(dateStr) || String(dateStr || '');
    const dateId = resolveDateIdForCohort(dateStr, cohortId, rawDatePool, rawCohorts);
    if (!dateId) return normalized;
    if (resolveCohortDateMode(cohortId, rawCohorts) === COHORT_DATE_MODE.SINGLE) {
        return dateId;
    }

    const datePool = sanitizeDateList(rawDatePool);
    if (!datePool.length) {
        return getWeekendDisplayLabel(dateId);
    }

    const linkedCount = datePool.filter((candidate) => resolveDateIdForCohort(candidate, cohortId, datePool, rawCohorts) === dateId).length;
    return linkedCount > 1 ? getWeekendDisplayLabel(dateId) : normalized;
};

const resolvePreferredPublicCohortId = (cohorts, requestedId = '') => {
    const normalizedCohorts = normalizeCohortOptions(cohorts);
    if (normalizedCohorts.some((cohort) => cohort.id === requestedId)) {
        return requestedId;
    }
    if (normalizedCohorts.some((cohort) => cohort.id === NEXT_COHORT_ID)) {
        return NEXT_COHORT_ID;
    }
    return normalizedCohorts[normalizedCohorts.length - 1]?.id || LEGACY_COHORT_ID;
};

const hashFingerprint = (value) => {
    const text = String(value || '');
    let hash = 2166136261;
    for (let i = 0; i < text.length; i += 1) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
};

const getParentCacheEntryKey = (studentId, dataVersion) => {
    const normalizedId = String(studentId || '').toUpperCase().trim();
    const normalizedVersion = String(dataVersion || '').trim();
    if (!normalizedId || !normalizedVersion) return '';
    return `${normalizedId}::${normalizedVersion}`;
};

const buildStudentGradesSignature = (student, getDateID) => {
    if (!student || typeof student !== 'object') return '';
    const gradeTokens = Object.entries(student.grades || {})
        .map(([date, grade]) => {
            const normalizedDate = getDateID(date) || normalizeDateToken(date) || String(date || '');
            return `${normalizedDate}:${grade?.chi ?? ''},${grade?.eng ?? ''},${grade?.math ?? ''},${grade?.total ?? ''},${grade?.class ?? ''}`;
        })
        .sort()
        .join('|');
    return `${student.id || ''}:${student.lastUpdated || ''}:${gradeTokens}`;
};

const buildClassContextSignature = (students = [], getDateID) =>
    students
        .map((student) => buildStudentGradesSignature(student, getDateID))
        .sort()
        .join('|');

const buildClassAveragesSignature = (dates, classAveragesMap, getDateID) => {
    const weekendIDs = Array.from(
        new Set((Array.isArray(dates) ? dates : []).map((date) => getDateID(date)).filter(Boolean))
    );
    return weekendIDs
        .map((weekendID) => {
            const avgData = classAveragesMap?.[weekendID] || {};
            const all = avgData.all || {};
            const classTokens = Object.keys(avgData)
                .filter((id) => id !== 'all')
                .sort((a, b) => a.localeCompare(b, 'zh-Hant'))
                .map((id) => {
                    const classAvg = avgData[id] || {};
                    return `${id}:${classAvg.total || ''},${classAvg.chi || ''},${classAvg.eng || ''},${classAvg.math || ''}`;
                })
                .join(';');
            return `${weekendID}:${all.total || ''},${all.chi || ''},${all.eng || ''},${all.math || ''}|${classTokens}`;
        })
        .join('|');
};

const buildParentQueryDataVersion = ({ student, classData, dates, classAveragesMap, getDateID }) => {
    const fingerprint = [
        (Array.isArray(dates) ? dates : []).join('|'),
        buildStudentGradesSignature(student, getDateID),
        buildClassContextSignature(classData, getDateID),
        buildClassAveragesSignature(dates, classAveragesMap, getDateID)
    ].join('||');
    return hashFingerprint(fingerprint);
};

const readParentQueryCache = (studentId, dataVersion) => {
    const entryKey = getParentCacheEntryKey(studentId, dataVersion);
    if (!entryKey) return null;
    const cache = readLocalCache(LOCAL_CACHE_KEYS.parentQueryResults, PARENT_QUERY_CACHE_TTL_MS);
    if (!cache || typeof cache !== 'object') return null;
    const entry = cache[entryKey];
    if (!entry || typeof entry !== 'object') return null;
    if (!entry.result || typeof entry.result !== 'object') return null;
    return entry.result;
};

const writeParentQueryCache = (studentId, dataVersion, result) => {
    const entryKey = getParentCacheEntryKey(studentId, dataVersion);
    if (!entryKey || !result || typeof result !== 'object') return;

    const now = Date.now();
    const currentCache = readLocalCache(LOCAL_CACHE_KEYS.parentQueryResults, PARENT_QUERY_CACHE_TTL_MS);
    const safeCache = currentCache && typeof currentCache === 'object' ? currentCache : {};
    const nextCache = {
        ...safeCache,
        [entryKey]: { ts: now, result }
    };
    const sortedEntries = Object.entries(nextCache).sort(
        (a, b) => (Number(a?.[1]?.ts) || 0) - (Number(b?.[1]?.ts) || 0)
    );
    while (sortedEntries.length > MAX_PARENT_QUERY_CACHE_ENTRIES) {
        sortedEntries.shift();
    }
    writeLocalCache(LOCAL_CACHE_KEYS.parentQueryResults, Object.fromEntries(sortedEntries));
};

const findStudentById = (students, keyword) => {
    if (!Array.isArray(students) || students.length === 0) return null;
    const normalizedId = String(keyword || '').trim().toUpperCase();
    if (!normalizedId) return null;
    return students.find((student) => String(student?.id || '').toUpperCase() === normalizedId) || null;
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
const EMPTY_OBJECT = Object.freeze({});
const EMPTY_ARRAY = Object.freeze([]);
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
    if (value === '' || value === null || value === undefined) return null;
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
};

const hasDisplayableGradeHistory = (grades) =>
    Object.values(grades || {}).some((grade) => {
        if (!grade || typeof grade !== 'object') return false;
        if (toNumberOrNull(grade.total) !== null) return true;
        return SCORE_KEYS.some((key) => toNumberOrNull(grade[key]) !== null);
    });

const countFilledSubjects = (gradeObj) =>
    ['chi', 'eng', 'math'].reduce((count, key) => {
        const value = gradeObj?.[key];
        return value === '' || value === null || value === undefined ? count : count + 1;
    }, 0);

const resolveGradePriorityScore = (gradeObj) => {
    const total = toNumberOrNull(gradeObj?.total);
    const filledSubjects = countFilledSubjects(gradeObj);
    return (total !== null ? 100 : 0) + (filledSubjects * 10);
};

const shouldReplaceGradeEntry = (currentEntry, nextEntry) => {
    if (!currentEntry) return true;
    const currentScore = resolveGradePriorityScore(currentEntry.grade);
    const nextScore = resolveGradePriorityScore(nextEntry.grade);
    if (nextScore !== currentScore) return nextScore > currentScore;
    return customDateSort(currentEntry.sourceDate, nextEntry.sourceDate) < 0;
};

const buildWeekendGradeEntryMap = (grades, getDateID) => {
    const weekendEntryMap = {};
    Object.entries(grades || {}).forEach(([sourceDate, grade]) => {
        const weekendID = getDateID(sourceDate);
        if (!weekendID) return;
        const nextEntry = { sourceDate, grade };
        if (shouldReplaceGradeEntry(weekendEntryMap[weekendID], nextEntry)) {
            weekendEntryMap[weekendID] = nextEntry;
        }
    });
    return weekendEntryMap;
};

const deriveDatePoolFromStudents = (students = []) => sanitizeDateList(
    students.flatMap((student) => (
        Object.entries(student?.grades || {})
            .filter(([, grade]) => {
                if (!grade) return false;
                return (
                    (grade.chi !== '' && grade.chi !== undefined && grade.chi !== null) ||
                    (grade.eng !== '' && grade.eng !== undefined && grade.eng !== null) ||
                    (grade.math !== '' && grade.math !== undefined && grade.math !== null) ||
                    (grade.total !== '' && grade.total !== undefined && grade.total !== null)
                );
            })
            .map(([date]) => date)
    ))
);

const mergeDatePools = (...dateLists) => sanitizeDateList(dateLists.flatMap((list) => Array.isArray(list) ? list : []));

const normalizeAverageGrade = (gradeObj) => {
    const normalized = {
        chi: gradeObj?.chi ?? '',
        eng: gradeObj?.eng ?? '',
        math: gradeObj?.math ?? '',
        total: gradeObj?.total ?? ''
    };
    if (
        normalized.total === ''
        && (normalized.chi !== '' || normalized.eng !== '' || normalized.math !== '')
    ) {
        normalized.total = calculateTotal(normalized.chi, normalized.eng, normalized.math);
    }
    return normalized;
};

const normalizeStudentGrade = (gradeObj) => {
    const pickFirstFilled = (keys, fallback = '') => {
        for (const key of keys) {
            const value = gradeObj?.[key];
            if (value === undefined || value === null) continue;
            if (typeof value === 'string' && value.trim() === '') continue;
            return value;
        }
        return fallback;
    };
    const normalized = {
        chi: pickFirstFilled(['chi', '國文', '國', 'chinese', 'Chinese']),
        eng: pickFirstFilled(['eng', '英文', '英', 'english', 'English']),
        math: pickFirstFilled(['math', '數學', '數', 'mathematics', 'Mathematics']),
        total: pickFirstFilled(['total', '總分', 'sum', 'Sum', 'scoreTotal', 'totalScore']),
        class: String(pickFirstFilled(['class', '班級', 'className', '類別'], 'A班') || 'A班').trim() || 'A班'
    };
    if (
        normalized.total === ''
        && (
            normalized.chi !== ''
            || normalized.eng !== ''
            || normalized.math !== ''
        )
    ) {
        normalized.total = calculateTotal(normalized.chi, normalized.eng, normalized.math);
    }
    return normalized;
};

const normalizeClassAveragesByWeekend = (rawAverages, getDateID) => {
    if (!rawAverages || typeof rawAverages !== 'object') return {};
    const normalized = {};
    const orderedDateKeys = Object.keys(rawAverages).sort(customDateSort);

    orderedDateKeys.forEach((dateKey) => {
        const weekendID = getDateID(dateKey) || normalizeDateToken(dateKey);
        if (!weekendID) return;
        const classMap = rawAverages?.[dateKey];
        if (!classMap || typeof classMap !== 'object') return;
        if (!normalized[weekendID]) normalized[weekendID] = {};

        Object.entries(classMap).forEach(([classId, gradeObj]) => {
            if (!gradeObj || typeof gradeObj !== 'object') return;
            normalized[weekendID][classId] = normalizeAverageGrade(gradeObj);
        });
    });

    return normalized;
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
    const normalizedMax = Number.isFinite(maxScore) ? maxScore : 100;
    const step = normalizedMax >= 260 ? 20 : 10;
    const bucketCount = Math.max(1, Math.ceil(normalizedMax / step));
    const buckets = [];

    for (let index = bucketCount - 1; index >= 0; index -= 1) {
        const min = index * step;
        const upperBound = Math.min(normalizedMax, (index + 1) * step);
        const label = index === bucketCount - 1
            ? `${min}-${normalizedMax}`
            : `${min}-${Math.max(min, upperBound - 1)}`;
        buckets.push({ min, max: upperBound, label });
    }

    return { buckets, step, maxScore: normalizedMax, bucketCount };
};

const resolveDistributionBucketIndex = (value, template) => {
    if (!Number.isFinite(value) || !template?.bucketCount || !template?.step) return -1;
    const boundedValue = clamp(value, 0, template.maxScore);
    const idxFromBottom = Math.min(
        template.bucketCount - 1,
        Math.floor(boundedValue / template.step)
    );
    return (template.bucketCount - 1) - idxFromBottom;
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

const resolveMedianScore = (scoresDesc) => {
    if (!Array.isArray(scoresDesc) || scoresDesc.length === 0) return null;
    const middle = Math.floor(scoresDesc.length / 2);
    if (scoresDesc.length % 2 === 1) {
        return Number.isFinite(scoresDesc[middle]) ? scoresDesc[middle] : null;
    }
    const left = scoresDesc[middle - 1];
    const right = scoresDesc[middle];
    if (!Number.isFinite(left) || !Number.isFinite(right)) return null;
    return (left + right) / 2;
};

const normalizeQueryEvent = (rawEvent) => {
    const id = String(rawEvent?.id || '').toUpperCase().trim();
    const at = String(rawEvent?.at || '');
    if (!id || !at) return null;
    const ts = new Date(at).getTime();
    if (Number.isNaN(ts)) return null;
    return { id, at, ts };
};

const toLocalDateKey = (tsLike) => {
    const dateObj = tsLike instanceof Date ? tsLike : new Date(tsLike);
    if (Number.isNaN(dateObj.getTime())) return '';
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
};

const formatMonitorDateLabel = (tsLike) => {
    const dateObj = tsLike instanceof Date ? tsLike : new Date(tsLike);
    if (Number.isNaN(dateObj.getTime())) return '--';
    return dateObj.toLocaleDateString('zh-TW', { month: '2-digit', day: '2-digit', weekday: 'short' });
};

const formatMonitorTimeLabel = (tsLike, withSeconds = true) => {
    const dateObj = tsLike instanceof Date ? tsLike : new Date(tsLike);
    if (Number.isNaN(dateObj.getTime())) return '--';
    return dateObj.toLocaleTimeString('zh-TW', {
        hour: '2-digit',
        minute: '2-digit',
        second: withSeconds ? '2-digit' : undefined,
        hour12: false
    });
};

const formatMonitorDateTimeLabel = (tsLike, withSeconds = false) => {
    const dateObj = tsLike instanceof Date ? tsLike : new Date(tsLike);
    if (Number.isNaN(dateObj.getTime())) return '--';
    return dateObj.toLocaleString('zh-TW', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: withSeconds ? '2-digit' : undefined,
        hour12: false
    });
};

const formatMonitorRelativeLabel = (tsLike) => {
    const dateObj = tsLike instanceof Date ? tsLike : new Date(tsLike);
    const ts = dateObj.getTime();
    if (Number.isNaN(ts)) return '--';
    const diffMs = Math.max(Date.now() - ts, 0);
    const sec = Math.floor(diffMs / 1000);
    if (sec < 45) return '剛剛';
    if (sec < 3600) return `${Math.floor(sec / 60)} 分前`;
    if (sec < 86400) return `${Math.floor(sec / 3600)} 小時前`;
    return `${Math.floor(sec / 86400)} 天前`;
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

const sanitizeOperationLogs = (rawLogs) => {
    if (!Array.isArray(rawLogs)) return [];
    return rawLogs
        .map((item) => {
            const ts = Number(item?.ts);
            if (!Number.isFinite(ts) || ts <= 0) return null;
            const id = String(item?.id || `${ts}`).trim();
            const title = String(item?.title || '').trim();
            if (!title) return null;
            return {
                id,
                ts,
                title,
                detail: String(item?.detail || '').trim(),
                kind: String(item?.kind || 'info').trim() || 'info',
                level: String(item?.level || 'info').trim() || 'info'
            };
        })
        .filter(Boolean)
        .sort((a, b) => b.ts - a.ts)
        .slice(0, MAX_OPERATION_LOG_ENTRIES);
};

const sanitizeSnapshotList = (rawSnapshots) => {
    if (!Array.isArray(rawSnapshots)) return [];
    return rawSnapshots
        .map((item) => {
            const id = String(item?.id || '').trim();
            const ts = Number(item?.ts);
            const label = String(item?.label || '').trim();
            const payload = item?.payload;
            if (!id || !label || !Number.isFinite(ts) || !payload || typeof payload !== 'object') return null;
            return {
                id,
                ts,
                label,
                payload
            };
        })
        .filter(Boolean)
        .sort((a, b) => b.ts - a.ts)
        .slice(0, MAX_LOCAL_SNAPSHOTS);
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
         const normalizedDate = normalizeDateToken(date);
         const weekendID = (
             normalizedDate
             && (
                 myGrades[normalizedDate]
                 || scoresByDate[normalizedDate]
                 || mathScoresByDate[normalizedDate]
                 || probabilityProfiles?.[normalizedDate]
             )
         )
             ? normalizedDate
             : getWeekendID(date, availableDates);
         if (!weekendID) return;
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
    const normalizedDates = Array.from(
        new Set((Array.isArray(availableDates) ? availableDates : []).map((date) => getDateID(date)).filter(Boolean))
    ).sort(customDateSort);
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

    normalizedDates.forEach((weekendID) => {
        ensureWeekendBucket(weekendID);
    });

    students.forEach((student) => {
        if (!student?.grades) return;
        const weekendEntries = buildWeekendGradeEntryMap(student.grades, getDateID);
        Object.entries(weekendEntries).forEach(([weekendID, entry]) => {
            ensureWeekendBucket(weekendID);
            const grade = entry.grade;

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
const CHART_CHUNK_RELOAD_GUARD_KEY = 'grade_tracker_chart_chunk_reload_once';

const isChunkImportError = (error) => {
    const message = String(error?.message || error || '').toLowerCase();
    return (
        message.includes('failed to fetch dynamically imported module')
        || message.includes('chunkloaderror')
        || message.includes('loading chunk')
        || message.includes('importing a module script failed')
    );
};

const safePreloadImport = async (loader) => {
    try {
        const mod = await loader();
        if (typeof window !== 'undefined') {
            sessionStorage.removeItem(CHART_CHUNK_RELOAD_GUARD_KEY);
        }
        return mod;
    } catch (error) {
        if (isChunkImportError(error)) {
            console.warn('Chart chunk preload skipped:', error);
            return null;
        }
        console.error('Chart preload error:', error);
        return null;
    }
};

const ChartModuleErrorFallback = () => (
    <div className="h-60 rounded-2xl border border-white/85 bg-white/80 px-4 py-3 text-xs font-bold text-slate-500 shadow-[0_14px_32px_rgba(15,23,42,0.08)] flex items-center justify-center">
        圖表載入中，請稍後再試
    </div>
);

const lazyWithChunkRecovery = (loader, label) => React.lazy(async () => {
    try {
        const mod = await loader();
        if (typeof window !== 'undefined') {
            sessionStorage.removeItem(CHART_CHUNK_RELOAD_GUARD_KEY);
        }
        return mod;
    } catch (error) {
        if (typeof window !== 'undefined' && isChunkImportError(error)) {
            const alreadyRetried = sessionStorage.getItem(CHART_CHUNK_RELOAD_GUARD_KEY) === '1';
            if (!alreadyRetried) {
                sessionStorage.setItem(CHART_CHUNK_RELOAD_GUARD_KEY, '1');
                window.location.reload();
                return new Promise(() => {});
            }
        }
        console.error(`${label} lazy load error:`, error);
        return { default: ChartModuleErrorFallback };
    }
});

const SingleSubjectChart = lazyWithChunkRecovery(() => import('./components/charts/SingleSubjectChart'), 'SingleSubjectChart');
const DistributionChart = lazyWithChunkRecovery(() => import('./components/charts/DistributionChart'), 'DistributionChart');
const ParentAbilityRadar = lazyWithChunkRecovery(() => import('./components/charts/ParentAbilityRadar'), 'ParentAbilityRadar');

const ChartFallback = ({ heightClass = 'h-60' }) => (
    <div className={`${heightClass} rounded-2xl border border-white/85 brand-skeleton flex flex-col justify-end px-4 py-3 text-xs font-bold text-slate-500`}>
        <div className="brand-skeleton__shine" />
        <div className="grid grid-cols-7 gap-1.5 h-20 items-end relative z-[1]">
            {[32, 64, 44, 78, 53, 70, 38].map((h, idx) => (
                <div key={`skeleton-col-${idx}`} className="rounded-md bg-emerald-200/75" style={{ height: `${h}%` }} />
            ))}
        </div>
        <div className="mt-2 text-[11px] tracking-wide relative z-[1]">載入圖表中...</div>
    </div>
);

const BatchRow = React.memo(({ student, sIndex, dateGrades, prValue, probValue, darkMode, canEdit, classDefs, handleBatchGradeChange, handleKeyDown, handlePaste }) => {
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
                    {classDefs.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
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
                <div className="prob-chip-smooth text-[11px] leading-none font-black inline-block px-1.5 py-1 rounded-full min-w-[52px] text-center" style={probVisual ? probVisual.badgeStyle : undefined}>
                    {probValue !== '-' ? `${probValue}%` : ''}
                </div>
            </td>
        </tr>
    );
}, (prevProps, nextProps) => {
    if (prevProps.sIndex !== nextProps.sIndex) return false;
    if (prevProps.darkMode !== nextProps.darkMode) return false;
    if (prevProps.canEdit !== nextProps.canEdit) return false;
    if (prevProps.prValue !== nextProps.prValue) return false;
    if (prevProps.probValue !== nextProps.probValue) return false;
    if (prevProps.handleBatchGradeChange !== nextProps.handleBatchGradeChange) return false;
    if (prevProps.handleKeyDown !== nextProps.handleKeyDown) return false;
    if (prevProps.handlePaste !== nextProps.handlePaste) return false;
    if (prevProps.classDefs !== nextProps.classDefs) return false;
    if (prevProps.student.id !== nextProps.student.id || prevProps.student.name !== nextProps.student.name) return false;

    const prevGrade = prevProps.dateGrades || EMPTY_GRADE;
    const nextGrade = nextProps.dateGrades || EMPTY_GRADE;
    return (
        prevGrade.class === nextGrade.class
        && prevGrade.chi === nextGrade.chi
        && prevGrade.eng === nextGrade.eng
        && prevGrade.math === nextGrade.math
        && prevGrade.total === nextGrade.total
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
                return true;
            }
            setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 });
            return false;
        };

        const shouldContinue = calculateTimeLeft();
        if (!shouldContinue) return undefined;

        const timer = setInterval(() => {
            const keepRunning = calculateTimeLeft();
            if (!keepRunning) clearInterval(timer);
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    const isComplete = timeLeft.days === 0 && timeLeft.hours === 0 && timeLeft.minutes === 0 && timeLeft.seconds === 0;

    if (isComplete) {
        return (
            <div className={`countdown-complete-enter relative mt-4 mx-auto w-fit overflow-hidden px-4 sm:px-5 py-2.5 sm:py-3 rounded-[1.75rem] border backdrop-blur-xl ${isDarkMode ? 'bg-emerald-500/12 border-emerald-200/24 text-slate-100 shadow-[0_14px_34px_rgba(2,6,23,0.28)]' : 'bg-white/84 border-white/95 text-slate-700 shadow-[0_14px_32px_rgba(148,163,184,0.18)]'}`}>
                <div className={`countdown-complete-halo absolute inset-0 pointer-events-none ${isDarkMode ? 'bg-[radial-gradient(circle_at_18%_50%,rgba(52,211,153,0.3),transparent_46%),radial-gradient(circle_at_82%_45%,rgba(34,211,238,0.16),transparent_42%)]' : 'bg-[radial-gradient(circle_at_18%_50%,rgba(16,185,129,0.18),transparent_46%),radial-gradient(circle_at_82%_45%,rgba(14,165,233,0.14),transparent_42%)]'}`} />
                <div className={`countdown-complete-halo countdown-complete-halo--delay absolute inset-0 pointer-events-none ${isDarkMode ? 'bg-[radial-gradient(circle_at_50%_50%,rgba(167,243,208,0.18),transparent_58%)]' : 'bg-[radial-gradient(circle_at_50%_50%,rgba(236,253,245,0.75),transparent_60%)]'}`} />
                <div className={`absolute inset-x-4 sm:inset-x-5 top-0 h-px ${isDarkMode ? 'bg-gradient-to-r from-transparent via-emerald-100/55 to-transparent' : 'bg-gradient-to-r from-transparent via-white to-transparent'}`} />
                <div className={`absolute left-4 sm:left-5 right-4 sm:right-5 bottom-0 h-7 pointer-events-none ${isDarkMode ? 'bg-[radial-gradient(circle_at_50%_110%,rgba(45,212,191,0.18),transparent_62%)]' : 'bg-[radial-gradient(circle_at_50%_110%,rgba(186,230,253,0.28),transparent_62%)]'}`} />
                <div className="relative z-10 flex items-center justify-center gap-2.5 sm:gap-3 text-center min-h-[1.25rem]">
                    <div className={`relative w-7 h-7 sm:w-7.5 sm:h-7.5 rounded-full flex items-center justify-center shrink-0 ${isDarkMode ? 'bg-white/[0.08] text-emerald-100 ring-1 ring-white/10' : 'bg-white/92 text-emerald-700 ring-1 ring-slate-200/70 shadow-[0_8px_16px_rgba(226,232,240,0.44)]'}`}>
                        <div className={`absolute inset-[3px] rounded-full ${isDarkMode ? 'bg-emerald-400/10' : 'bg-emerald-50/90'}`} />
                        <Sparkles className="relative z-[1] w-[0.72rem] h-[0.72rem]" />
                    </div>
                    <div className={`text-[10px] sm:text-[11px] font-black uppercase tracking-[0.2em] leading-none ${isDarkMode ? 'text-emerald-100/88' : 'text-[#2f8c7f]'}`}>Countdown Complete</div>
                </div>
            </div>
        );
    }

    return (
        <div className={`flex items-center gap-3 mt-4 px-5 py-2 rounded-full border backdrop-blur-md transition-all duration-500 shadow-sm ${isDarkMode ? 'bg-emerald-500/10 border-emerald-200/20 text-slate-100 shadow-black/20' : 'bg-white/74 border-white text-slate-700 shadow-slate-200/50'}`}>
            <Target className={`w-4 h-4 ${isDarkMode ? 'text-cyan-300' : 'text-sky-600'}`} />
            <div className="flex items-baseline gap-1.5 font-mono text-sm tabular-nums">
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
  const [cohortOptions, setCohortOptions] = useState(DEFAULT_COHORT_OPTIONS);
  const [activeTeacherCohortId, setActiveTeacherCohortId] = useState(() => {
      if (typeof window === 'undefined') return NEXT_COHORT_ID;
      const stored = String(localStorage.getItem(TEACHER_ACTIVE_COHORT_STORAGE_KEY) || '').trim();
      return stored || NEXT_COHORT_ID;
  });
  const [activePublicCohortId, setActivePublicCohortId] = useState(NEXT_COHORT_ID);
  const [datesCohortId, setDatesCohortId] = useState('');
  const [classAveragesCohortId, setClassAveragesCohortId] = useState('');
  const [teacherStudentsCohortId, setTeacherStudentsCohortId] = useState('');
  const [publicStudentsCohortId, setPublicStudentsCohortId] = useState('');
  const [, setQueryStatsCohortId] = useState('');
  const [, setTeacherMessageCohortId] = useState('');
  const [cohortRegistryLoading, setCohortRegistryLoading] = useState(false);
  const [publicCohortSaving, setPublicCohortSaving] = useState(false);
    
  const [studentName, setStudentName] = useState('');
  const [currentStudentId, setCurrentStudentId] = useState(null);
  const [grades, setGrades] = useState({});
  const [classAverages, setClassAverages] = useState({}); 
  const [availableDates, setAvailableDates] = useState(() => getDefaultDatesForCohort(activeTeacherCohortId));
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
  const [batchDraftGradesByStudentId, setBatchDraftGradesByStudentId] = useState({});
  const [visibleBatchRowCount, setVisibleBatchRowCount] = useState(INITIAL_BATCH_RENDER_ROWS);
  const [allStudentsData, setAllStudentsData] = useState([]); 
  const [cachedClassData, setCachedClassData] = useState([]); 
  const [sortByPR, setSortByPR] = useState(false);
  const [sortByProb, setSortByProb] = useState(false);
  const [isOperationLogExpanded, setIsOperationLogExpanded] = useState(false);
  const [queryStatsById, setQueryStatsById] = useState({});
  const [queryEvents, setQueryEvents] = useState([]);
  const [queryStatsLastResetAt, setQueryStatsLastResetAt] = useState('');
  const [queryStatsLoading, setQueryStatsLoading] = useState(false);
  const [queryPanelStage, setQueryPanelStage] = useState('idle');
  const [queryMonitorKeyword, setQueryMonitorKeyword] = useState('');
  const [queryMonitorDateFilter, setQueryMonitorDateFilter] = useState('all');
  const [queryMonitorSort, setQueryMonitorSort] = useState('count_desc');
  const [operationLogs, setOperationLogs] = useState([]);
  const [localSnapshots, setLocalSnapshots] = useState([]);
  const [importPreview, setImportPreview] = useState(null);
  const [showImportFormatGuide, setShowImportFormatGuide] = useState(false);
  const [isApplyingImport, setIsApplyingImport] = useState(false);
  const [parentQueryPerf, setParentQueryPerf] = useState({
      cacheHit: 0,
      cacheMiss: 0,
      avgMs: 0,
      p95Ms: 0,
      latestMs: 0
  });
  const [teacherGlobalMessage, setTeacherGlobalMessage] = useState('');
  const [teacherGlobalMessageDraft, setTeacherGlobalMessageDraft] = useState('');
  const [teacherStudentMessages, setTeacherStudentMessages] = useState({});
  const [teacherStudentMessageDrafts, setTeacherStudentMessageDrafts] = useState({});
  const [teacherMessageLoading, setTeacherMessageLoading] = useState(false);
  const [teacherMessageSaving, setTeacherMessageSaving] = useState(false);
  const [teacherStudentMessageSavingId, setTeacherStudentMessageSavingId] = useState('');
  const batchDirtyStudentIdsRef = useRef(new Set());
  const queryPendingCountsRef = useRef({});
  const queryPendingEventsRef = useRef([]);
  const queryPendingCohortIdRef = useRef(LEGACY_COHORT_ID);
  const queryFlushTimerRef = useRef(null);
  const queryFlushInFlightRef = useRef(false);
  const shouldSnapTeacherEntryRef = useRef(false);
  const datesLoadPromiseRef = useRef(null);
  const classAveragesLoadPromiseRef = useRef(null);
  const studentsLoadPromiseRef = useRef(null);
  const cohortRegistryLoadPromiseRef = useRef(null);
  const pendingImportPayloadRef = useRef(null);
  const importFileInputRef = useRef(null);
  const legacyImportUnlockUntilRef = useRef(0);
  const teacherCohortPreseedRef = useRef('');
  const autoPruneNoticeKeyRef = useRef('');
  const currentBatchGradeInfoRef = useRef({});
  const batchRowsForDisplayRef = useRef([]);
  const batchAutoClassScopeRef = useRef('');
  const parentQueryPerfRef = useRef({
      cacheHit: 0,
      cacheMiss: 0,
      durations: []
  });
  const deferredBatchInsightTab = useDeferredValue(batchInsightTab);
  const deferredQueryMonitorKeyword = useDeferredValue(queryMonitorKeyword);
  const deferredQueryMonitorDateFilter = useDeferredValue(queryMonitorDateFilter);
  const deferredQueryMonitorSort = useDeferredValue(queryMonitorSort);
  const deferredQueryStatsById = useDeferredValue(queryStatsById);
  const deferredQueryEvents = useDeferredValue(queryEvents);
    
  const [loading, setLoading] = useState(false);
  const [searchId, setSearchId] = useState('');
  const [viewData, setViewData] = useState(null);
  const [parentSearchShell, setParentSearchShell] = useState(null);
  const [parentViewContext, setParentViewContext] = useState({
      cohortId: '',
      dates: [],
      classData: [],
      classAverages: {},
      teacherMessage: { globalMessage: '', byStudent: {} }
  });
  const [searchError, setSearchError] = useState('');
  const [activeTab, setActiveTab] = useState('total');
  
  const [activePhase, setActivePhase] = useState('mock');

  const [statsModalData, setStatsModalData] = useState(null);
  const [statsActiveTab, setStatsActiveTab] = useState('total');
  const [isHeaderScrolled, setIsHeaderScrolled] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  // --- OPTIMIZATION: State for probabilities to debounce updates ---
  const [admissionProbabilities, setAdmissionProbabilities] = useState({});

  const [_xlsxLoaded, setXlsxLoaded] = useState(false);
  const xlsxLoadingPromiseRef = useRef(null);
  const darkMode = false;
  const isLimitedTeacherRole = teacherAuthRole === TEACHER_ROLE.LIMITED;
  const canEditStudentGrades = !isLimitedTeacherRole;
  const canImportExcel = canEditStudentGrades || isLimitedTeacherRole;
  const canDeleteDates = !isLimitedTeacherRole;
  const cohortOptionsById = useMemo(
      () => Object.fromEntries(cohortOptions.map((cohort) => [cohort.id, cohort])),
      [cohortOptions]
  );
  const activePublicCohort = cohortOptionsById[activePublicCohortId] || DEFAULT_COHORT_OPTIONS[0];
  const activeDataCohortId = mode === 'parent' ? activePublicCohortId : activeTeacherCohortId;
  const activeDateContextCohortId = datesCohortId || activeDataCohortId || activeTeacherCohortId || NEXT_COHORT_ID;
  const activeParentViewCohortId = viewData?.cohortId || parentViewContext.cohortId || activePublicCohortId;
  const getCohortLabel = useCallback(
      (cohortId) => cohortOptionsById[cohortId]?.label || String(cohortId || ''),
      [cohortOptionsById]
  );
  const isLegacyCohort = useCallback(
      (cohortId) => (cohortOptionsById[cohortId]?.storageMode || COHORT_STORAGE_MODE.LEGACY) === COHORT_STORAGE_MODE.LEGACY,
      [cohortOptionsById]
  );
  const activeTeacherClassDefs = useMemo(
      () => getClassDefsForCohort(activeTeacherCohortId),
      [activeTeacherCohortId]
  );
  const activeTeacherClassIdSet = useMemo(
      () => new Set(activeTeacherClassDefs.map(({ id }) => id)),
      [activeTeacherClassDefs]
  );
  const defaultTeacherClassId = activeTeacherClassDefs[0]?.id || 'A班';
  const importFormatGuide = useMemo(() => {
      const classExamples = activeTeacherClassDefs.map((item) => item.id).join(' / ');
      const classAliasHint = activeTeacherCohortId === NEXT_COHORT_ID
          ? '可填 A、B、C、東興；也接受 東、DONG、EAST'
          : '可填 A班、B班、C班、日A班、日B班；也接受 日、SUN';
      return {
          sampleHeaders: ['學號', '姓名', '日期', '班級', '國文', '英文', '數學'],
          sampleRows: [
              ['261001', '王小明', '09/14', activeTeacherClassDefs[0]?.id || 'A班', '82', '76', '91']
          ],
          headerHints: [
              '系統會在前 10 列找標題列，能辨識：學號 / ID / StudentID、姓名 / Name、日期 / 測驗日、班級 / 類別、國 / 英 / 數',
              '如果完全找不到標題，會改用固定欄序 A-F：學號、姓名、日期、國文、英文、數學'
          ],
          rules: [
              `目前這屆班級可用：${classExamples}`,
              classAliasHint,
              '日期可寫 2/28、02/28、2026/2/28、0228',
              '不合理日期例如 2/51 會直接略過',
              '同一個檔案最多只能有 5 個不同測驗日期，超過會取消匯入',
              '若沒有班級欄，系統會優先沿用該學生同考次既有班級，否則用目前班級'
          ]
      };
  }, [activeTeacherClassDefs, activeTeacherCohortId]);
  const resolveScopedDateId = useCallback((dateStr, cohortId, datePool = []) => (
      resolveDateIdForCohort(dateStr, cohortId, datePool, cohortOptions)
  ), [cohortOptions]);
  const getScopedDateLabel = useCallback((dateStr, cohortId, datePool = []) => (
      getDateDisplayLabelForCohort(dateStr, cohortId, datePool, cohortOptions)
  ), [cohortOptions]);
  const parentSearchCohortOrder = useMemo(() => {
      const ordered = [];
      if (cohortOptionsById[NEXT_COHORT_ID]) ordered.push(NEXT_COHORT_ID);
      cohortOptions.forEach((cohort) => {
          if (!ordered.includes(cohort.id)) ordered.push(cohort.id);
      });
      return ordered.length ? ordered : [NEXT_COHORT_ID, LEGACY_COHORT_ID];
  }, [cohortOptions, cohortOptionsById]);
  const getCohortCacheKey = useCallback(
      (baseKey, cohortId) => getScopedCacheKey(baseKey, cohortId || 'global'),
      []
  );
  const getStudentSessionKey = useCallback(
      (cohortId) => getScopedCacheKey(STUDENTS_SESSION_SYNC_KEY, cohortId || 'global'),
      []
  );
  const getCohortRegistryDocRef = useCallback(
      () => (db ? doc(db, 'artifacts', appId, 'public', 'data', 'settings', COHORT_REGISTRY_DOC_ID) : null),
      []
  );
  const getCohortSettingsDocRef = useCallback((cohortId, docId) => {
      if (!db || !docId) return null;
      if (isLegacyCohort(cohortId)) {
          return doc(db, 'artifacts', appId, 'public', 'data', 'settings', docId);
      }
      return doc(db, 'artifacts', appId, 'public', 'data', 'cohorts', cohortId, 'settings', docId);
  }, [isLegacyCohort]);
  const getCohortStudentsCollectionRef = useCallback((cohortId) => {
      if (!db) return null;
      if (isLegacyCohort(cohortId)) {
          return collection(db, 'artifacts', appId, 'public', 'data', 'students');
      }
      return collection(db, 'artifacts', appId, 'public', 'data', 'cohorts', cohortId, 'students');
  }, [isLegacyCohort]);
  const getCohortStudentDocRef = useCallback((cohortId, studentId) => {
      if (!db || !studentId) return null;
      if (isLegacyCohort(cohortId)) {
          return doc(db, 'artifacts', appId, 'public', 'data', 'students', `student_${studentId}`);
      }
      return doc(db, 'artifacts', appId, 'public', 'data', 'cohorts', cohortId, 'students', `student_${studentId}`);
  }, [isLegacyCohort]);
  const loadStudentsVersion = useCallback(async (cohortId, options = {}) => {
      const force = Boolean(options?.force);
      const normalizedId = String(cohortId || LEGACY_COHORT_ID);
      const cacheKey = getCohortCacheKey(LOCAL_CACHE_KEYS.studentsVersion, normalizedId);
      if (!force) {
          const cachedVersion = readLocalCache(cacheKey, SETTINGS_CACHE_TTL_MS);
          if (typeof cachedVersion === 'string' && cachedVersion.trim()) {
              return cachedVersion;
          }
      }
      if (!db) return '';
      try {
          const docSnap = await getDoc(getCohortSettingsDocRef(normalizedId, STUDENT_DATA_VERSION_DOC_ID));
          const version = String(docSnap.data()?.version || '').trim();
          if (version) {
              writeLocalCache(cacheKey, version);
          }
          return version;
      } catch (error) {
          console.error('Load students version error:', error);
          return '';
      }
  }, [getCohortCacheKey, getCohortSettingsDocRef]);
  const bumpStudentsVersion = useCallback(async (cohortId) => {
      const normalizedId = String(cohortId || LEGACY_COHORT_ID);
      const nextVersion = new Date().toISOString();
      writeLocalCache(getCohortCacheKey(LOCAL_CACHE_KEYS.studentsVersion, normalizedId), nextVersion);
      if (!db) return nextVersion;
      try {
          await setDoc(
              getCohortSettingsDocRef(normalizedId, STUDENT_DATA_VERSION_DOC_ID),
              { version: nextVersion, updatedAt: nextVersion },
              { merge: true }
          );
      } catch (error) {
          console.error('Bump students version error:', error);
      }
      return nextVersion;
  }, [getCohortCacheKey, getCohortSettingsDocRef]);

  const appendOperationLog = useCallback((entry) => {
      const title = String(entry?.title || '').trim();
      if (!title) return;
      const nowTs = Date.now();
      setOperationLogs((prev) => {
          const next = sanitizeOperationLogs([
              {
                  id: `${nowTs}-${Math.random().toString(36).slice(2, 8)}`,
                  ts: nowTs,
                  title,
                  detail: String(entry?.detail || '').trim(),
                  kind: String(entry?.kind || 'info').trim() || 'info',
                  level: String(entry?.level || 'info').trim() || 'info'
              },
              ...(Array.isArray(prev) ? prev : [])
          ]);
          writeLocalCache(LOCAL_CACHE_KEYS.operationLog, next);
          return next;
      });
  }, []);

  const updateParentQueryPerf = useCallback((durationMs, fromCache) => {
      const metric = parentQueryPerfRef.current || { cacheHit: 0, cacheMiss: 0, durations: [] };
      if (fromCache) metric.cacheHit += 1;
      else metric.cacheMiss += 1;
      if (Number.isFinite(durationMs) && durationMs >= 0) {
          metric.durations = [...(metric.durations || []), durationMs].slice(-60);
      }
      const sorted = [...(metric.durations || [])].sort((a, b) => a - b);
      const avgMs = sorted.length
          ? Math.round(sorted.reduce((sum, value) => sum + value, 0) / sorted.length)
          : 0;
      const p95Index = sorted.length > 0 ? Math.max(0, Math.floor(sorted.length * 0.95) - 1) : 0;
      const p95Ms = sorted.length ? Math.round(sorted[p95Index]) : 0;
      const latestMs = sorted.length ? Math.round(sorted[sorted.length - 1]) : 0;
      parentQueryPerfRef.current = metric;
      setParentQueryPerf({
          cacheHit: metric.cacheHit,
          cacheMiss: metric.cacheMiss,
          avgMs,
          p95Ms,
          latestMs
      });
  }, []);

  const loadCohortRegistry = useCallback(async (options = {}) => {
      const force = Boolean(options && options.force);
      if (!force && cohortRegistryLoadPromiseRef.current) return cohortRegistryLoadPromiseRef.current;

      const runner = async () => {
          const fallbackCohorts = normalizeCohortOptions(DEFAULT_COHORT_OPTIONS);
          const fallbackPublicCohortId = resolvePreferredPublicCohortId(fallbackCohorts);
          if (!db) {
              setCohortOptions(fallbackCohorts);
              setActivePublicCohortId(fallbackPublicCohortId);
              return { cohorts: fallbackCohorts, publicCohortId: fallbackPublicCohortId };
          }

          setCohortRegistryLoading(true);
          try {
              const registryRef = getCohortRegistryDocRef();
              const docSnap = await getDoc(registryRef);
              const raw = docSnap.exists() ? docSnap.data() : {};
              const cohorts = normalizeCohortOptions(raw?.cohorts);
              const publicCohortId = resolvePreferredPublicCohortId(cohorts, raw?.publicCohortId);
              const fingerprint = JSON.stringify({ cohorts, publicCohortId });
              const persistedFingerprint = JSON.stringify({
                  cohorts: normalizeCohortOptions(raw?.cohorts),
                  publicCohortId: raw?.publicCohortId || ''
              });

              setCohortOptions(cohorts);
              setActivePublicCohortId(publicCohortId);
              setActiveTeacherCohortId((prev) => (
                  cohorts.some((cohort) => cohort.id === prev)
                      ? prev
                      : (cohorts.find((cohort) => cohort.id === NEXT_COHORT_ID)?.id || cohorts[cohorts.length - 1]?.id || LEGACY_COHORT_ID)
              ));

              if (!docSnap.exists() || fingerprint !== persistedFingerprint) {
                  await setDoc(registryRef, {
                      cohorts,
                      publicCohortId,
                      updatedAt: new Date().toISOString()
                  }, { merge: true });
              }

              return { cohorts, publicCohortId };
          } catch (error) {
              console.error('Load cohort registry error:', error);
              setCohortOptions(fallbackCohorts);
              setActivePublicCohortId(fallbackPublicCohortId);
              return { cohorts: fallbackCohorts, publicCohortId: fallbackPublicCohortId };
          } finally {
              setCohortRegistryLoading(false);
          }
      };

      const promise = runner().finally(() => {
          if (cohortRegistryLoadPromiseRef.current === promise) {
              cohortRegistryLoadPromiseRef.current = null;
          }
      });
      cohortRegistryLoadPromiseRef.current = promise;
      return promise;
  }, [getCohortRegistryDocRef]);

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
  const parentAvailableDates = useMemo(
      () => (viewData ? sanitizeDateList(parentViewContext.dates) : []),
      [parentViewContext.dates, viewData]
  );
  const parentSortedAvailableDatesAsc = useMemo(
      () => [...parentAvailableDates].sort(customDateSort),
      [parentAvailableDates]
  );
  const parentClassData = useMemo(
      () => (viewData ? (Array.isArray(parentViewContext.classData) ? parentViewContext.classData : []) : []),
      [parentViewContext.classData, viewData]
  );
  const parentTeacherMessageContext = useMemo(
      () => (viewData && parentViewContext.teacherMessage && typeof parentViewContext.teacherMessage === 'object'
          ? parentViewContext.teacherMessage
          : { globalMessage: '', byStudent: {} }),
      [parentViewContext.teacherMessage, viewData]
  );
  const sortedAvailableDatesDesc = useMemo(
      () => [...sortedAvailableDatesAsc].slice().reverse(),
      [sortedAvailableDatesAsc]
  );

  const testDateIdLookup = useMemo(() => {
      const lookup = new Map();
      sanitizeDateList(availableDates).forEach((date) => {
          lookup.set(date, resolveScopedDateId(date, activeDateContextCohortId, availableDates));
      });
      return lookup;
  }, [activeDateContextCohortId, availableDates, resolveScopedDateId]);

  // 依屆別決定是沿用連續兩天同考次，還是單日成績。
  const getTestDateID = useCallback((dateStr) => {
      const normalized = normalizeDateToken(dateStr);
      if (normalized && testDateIdLookup.has(normalized)) {
          return testDateIdLookup.get(normalized) || normalized;
      }
      return resolveScopedDateId(dateStr, activeDateContextCohortId, availableDates);
  }, [activeDateContextCohortId, availableDates, resolveScopedDateId, testDateIdLookup]);
  const parentGetTestDateID = useCallback((dateStr) => {
      if (!viewData) return '';
      return resolveScopedDateId(dateStr, activeParentViewCohortId, parentAvailableDates);
  }, [activeParentViewCohortId, parentAvailableDates, resolveScopedDateId, viewData]);

  const weekendLabelByDate = useMemo(() => {
      const labels = {};
      sortedAvailableDatesDesc.forEach((date) => {
          labels[date] = getScopedDateLabel(date, activeDateContextCohortId, availableDates);
      });
      return labels;
  }, [activeDateContextCohortId, availableDates, getScopedDateLabel, sortedAvailableDatesDesc]);

  // 單人檢視改為以「考次(weekendID)」去重，避免同一週末出現兩列（例如 03/08 與 03/09）
  const singleViewDateEntries = useMemo(() => {
      const weekendEntryMap = buildWeekendGradeEntryMap(grades, getTestDateID);

      const seen = new Set();
      const entries = [];
      sortedAvailableDatesDesc.forEach((date) => {
          const weekendID = getTestDateID(date);
          if (!weekendID || seen.has(weekendID)) return;
          seen.add(weekendID);
          const gradeKey = weekendEntryMap?.[weekendID]?.sourceDate || date;
          entries.push({
              date,
              weekendID,
              gradeKey,
              label: weekendLabelByDate[date] || getScopedDateLabel(date, activeDateContextCohortId, availableDates)
          });
      });
      return entries;
  }, [activeDateContextCohortId, availableDates, grades, getScopedDateLabel, getTestDateID, sortedAvailableDatesDesc, weekendLabelByDate]);

  const singleViewDateKeys = useMemo(
      () => singleViewDateEntries.map((entry) => entry.gradeKey),
      [singleViewDateEntries]
  );

  const selectedBatchWeekendID = useMemo(
      () => (batchDate ? getTestDateID(batchDate) : ''),
      [batchDate, getTestDateID]
  );
  const shouldBuildBatchAnalytics =
      mode === 'teacher' && teacherViewMode === 'batch' && Boolean(batchDate);
  const shouldBuildTeacherDerivedMaps = mode === 'teacher';
  const shouldBuildTeacherLocalAverages =
      mode === 'teacher' && teacherStudentsCohortId === activeTeacherCohortId;

  const teacherDateCards = useMemo(() => {
      const cards = [];
      const seenWeekendIds = new Set();
      sortedAvailableDatesDesc.forEach((date) => {
          const weekendID = getTestDateID(date);
          if (!weekendID || seenWeekendIds.has(weekendID)) return;
          seenWeekendIds.add(weekendID);
          const phaseId = resolvePhaseByDate(date, sortedAvailableDatesAsc);
          const phaseLabel = phaseId === 'p1' ? '第一階段' : phaseId === 'mock' ? '模考班' : '第二階段';
          cards.push({
              date,
              weekendID,
              label: weekendLabelByDate[date] || getScopedDateLabel(date, activeDateContextCohortId, availableDates),
              phaseId,
              phaseLabel,
              isLatest: cards.length === 0,
              isSelected: teacherViewMode === 'batch' && Boolean(selectedBatchWeekendID) && weekendID === selectedBatchWeekendID
          });
      });
      return cards;
  }, [activeDateContextCohortId, availableDates, getScopedDateLabel, getTestDateID, selectedBatchWeekendID, sortedAvailableDatesAsc, sortedAvailableDatesDesc, teacherViewMode, weekendLabelByDate]);

  const latestAvailableDate = useMemo(() => {
      if (!sortedAvailableDatesAsc.length) return '';
      const latestRawDate = sortedAvailableDatesAsc[sortedAvailableDatesAsc.length - 1];
      return getTestDateID(latestRawDate) || latestRawDate;
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

  // Defer heavy derived calculations to keep typing/edit interactions smooth.
  const deferredStudentsForDerived = useDeferredValue(allStudentsData);
  const deferredDatesForDerived = useDeferredValue(availableDates);
  const deferredParentClassData = useDeferredValue(parentClassData);

  // 將每位學生的日期成績先依週末 ID 正規化，避免在多個流程中重複掃描 grades 物件
  const deferredStudentGradeMapsByStudentId = useMemo(() => {
      if (!shouldBuildTeacherDerivedMaps) return EMPTY_OBJECT;
      const gradeMaps = {};
      deferredStudentsForDerived.forEach((student) => {
          const weekendGrades = {};
          const weekendEntries = buildWeekendGradeEntryMap(student.grades, getTestDateID);
          Object.entries(weekendEntries).forEach(([weekendID, entry]) => {
              weekendGrades[weekendID] = entry.grade;
          });
          gradeMaps[student.id] = weekendGrades;
      });
      return gradeMaps;
  }, [deferredStudentsForDerived, getTestDateID, shouldBuildTeacherDerivedMaps]);

  const allStudentWeekendEntriesByStudentId = useMemo(() => {
      if (!shouldBuildTeacherDerivedMaps) return EMPTY_OBJECT;
      const entryMaps = {};
      allStudentsData.forEach((student) => {
          entryMaps[student.id] = buildWeekendGradeEntryMap(student.grades, getTestDateID);
      });
      return entryMaps;
  }, [allStudentsData, getTestDateID, shouldBuildTeacherDerivedMaps]);

  const allStudentWeekendGradesByStudentId = useMemo(() => {
      if (!shouldBuildTeacherDerivedMaps) return EMPTY_OBJECT;
      const gradeMaps = {};
      Object.entries(allStudentWeekendEntriesByStudentId).forEach(([studentId, entryMap]) => {
          const weekendGrades = {};
          Object.entries(entryMap || {}).forEach(([weekendID, entry]) => {
              weekendGrades[weekendID] = entry.grade;
          });
          gradeMaps[studentId] = weekendGrades;
      });
      return gradeMaps;
  }, [allStudentWeekendEntriesByStudentId, shouldBuildTeacherDerivedMaps]);

  const batchStudentsById = useMemo(() => {
      if (!shouldBuildBatchAnalytics) return EMPTY_OBJECT;
      return Object.fromEntries(allStudentsData.map((student) => [student.id, student]));
  }, [allStudentsData, shouldBuildBatchAnalytics]);

  const probabilityContextStudents = useMemo(() => (
      deferredStudentsForDerived.length === allStudentsData.length
          ? deferredStudentsForDerived
          : allStudentsData
  ), [allStudentsData, deferredStudentsForDerived]);

  const avgSettingsDateKeysDesc = useMemo(
      () => [...orderedWeekendIds].slice().reverse(),
      [orderedWeekendIds]
  );

  const currentBatchGradeInfoByStudentId = useMemo(() => {
      if (!shouldBuildBatchAnalytics) return {};
      const batchDateID = getTestDateID(batchDate);
      if (!batchDateID) return {};

      const nextInfo = {};
      allStudentsData.forEach((student) => {
          const currentGrades = student.grades || {};
          const weekendEntries = allStudentWeekendEntriesByStudentId[student.id] || {};
          const currentEntry = weekendEntries[batchDateID];
          const sourceDate = currentEntry?.sourceDate || batchDateID || batchDate;
          const persistedGrade = currentEntry?.grade || currentGrades[sourceDate] || {
              chi: '',
              eng: '',
              math: '',
              total: '',
              class: teacherClassFilter || defaultTeacherClassId
          };
          const draftEntry = batchDraftGradesByStudentId[student.id];
          const mergedGrade =
              draftEntry?.sourceDate === sourceDate
                  ? { ...persistedGrade, ...draftEntry.grade }
                  : persistedGrade;

          nextInfo[student.id] = {
              sourceDate,
              grade: mergedGrade
          };
      });

      return nextInfo;
  }, [allStudentWeekendEntriesByStudentId, allStudentsData, batchDate, batchDraftGradesByStudentId, defaultTeacherClassId, getTestDateID, shouldBuildBatchAnalytics, teacherClassFilter]);
  currentBatchGradeInfoRef.current = currentBatchGradeInfoByStudentId;

  const batchProbCandidateIds = useMemo(() => {
      if (!shouldBuildBatchAnalytics) return [];
      const weekendID = getTestDateID(batchDate);
      if (!weekendID) return [];
      return allStudentsData
          .filter((student) => {
              const dateGrades = currentBatchGradeInfoByStudentId[student.id]?.grade;
              if (!dateGrades) return false;
              if ((dateGrades.class || 'A班') !== teacherClassFilter) return false;
              return hasAnySubjectScore(dateGrades);
          })
          .map((student) => student.id);
  }, [allStudentsData, batchDate, currentBatchGradeInfoByStudentId, getTestDateID, shouldBuildBatchAnalytics, teacherClassFilter]);

  const batchProbStudentGradeMapsByStudentId = useMemo(() => {
      if (!shouldBuildBatchAnalytics || batchProbCandidateIds.length === 0) return {};
      const targetIds = new Set(batchProbCandidateIds);
      const gradeMaps = {};

      allStudentsData.forEach((student) => {
          if (!targetIds.has(student.id)) return;
          const weekendGrades = { ...(allStudentWeekendGradesByStudentId[student.id] || {}) };
          const currentBatchInfo = currentBatchGradeInfoByStudentId[student.id];
          if (currentBatchInfo && selectedBatchWeekendID) {
              weekendGrades[selectedBatchWeekendID] = currentBatchInfo.grade;
          }
          gradeMaps[student.id] = weekendGrades;
      });

      return gradeMaps;
  }, [allStudentWeekendGradesByStudentId, allStudentsData, batchProbCandidateIds, currentBatchGradeInfoByStudentId, selectedBatchWeekendID, shouldBuildBatchAnalytics]);

  const teacherProbabilityContext = useMemo(() => {
      if (!shouldBuildBatchAnalytics || orderedWeekendIds.length === 0 || probabilityContextStudents.length === 0) {
          return null;
      }
      return buildProbabilityContext(probabilityContextStudents, orderedWeekendIds, (dateId) => dateId);
  }, [orderedWeekendIds, probabilityContextStudents, shouldBuildBatchAnalytics]);

  const weekendScoreCountById = useMemo(() => {
      if (!shouldBuildTeacherDerivedMaps) return EMPTY_OBJECT;
      const counts = {};
      Object.values(allStudentWeekendEntriesByStudentId).forEach((weekendEntries) => {
          Object.entries(weekendEntries || {}).forEach(([weekendID, entry]) => {
              if (!hasAnySubjectScore(entry.grade)) return;
              counts[weekendID] = (counts[weekendID] || 0) + 1;
          });
      });
      return counts;
  }, [allStudentWeekendEntriesByStudentId, shouldBuildTeacherDerivedMaps]);

  const latestPopulatedWeekendID = useMemo(() => {
      for (let idx = orderedWeekendIds.length - 1; idx >= 0; idx -= 1) {
          const weekendID = orderedWeekendIds[idx];
          if ((weekendScoreCountById[weekendID] || 0) > 0) return weekendID;
      }
      return latestAvailableDate;
  }, [latestAvailableDate, orderedWeekendIds, weekendScoreCountById]);

  const selectedTeacherDateMeta = useMemo(() => {
      const targetId = selectedBatchWeekendID || latestPopulatedWeekendID || latestAvailableDate;
      if (!targetId) return null;
      return teacherDateCards.find((item) => item.weekendID === targetId) || teacherDateCards[0] || null;
  }, [latestAvailableDate, latestPopulatedWeekendID, selectedBatchWeekendID, teacherDateCards]);

  useEffect(() => {
      const storedAuth = localStorage.getItem('teacher_auth');
      const storedRole = localStorage.getItem('teacher_role');
      if (storedAuth === 'true') {
          setIsAuthenticated(true);
          setTeacherAuthRole(storedRole === TEACHER_ROLE.LIMITED ? TEACHER_ROLE.LIMITED : TEACHER_ROLE.FULL);
      }
  }, []);

  useEffect(() => {
      if (typeof window === 'undefined') return;
      localStorage.setItem(TEACHER_ACTIVE_COHORT_STORAGE_KEY, activeTeacherCohortId);
  }, [activeTeacherCohortId, cohortOptions]);

  useEffect(() => {
      if (!activeTeacherClassIdSet.has(teacherClassFilter)) {
          setTeacherClassFilter(defaultTeacherClassId);
      }
      if (!activeTeacherClassIdSet.has(avgSettingsClassFilter)) {
          setAvgSettingsClassFilter(defaultTeacherClassId);
      }
  }, [activeTeacherClassIdSet, avgSettingsClassFilter, defaultTeacherClassId, teacherClassFilter]);

  useEffect(() => {
      const cachedOperationLogs = sanitizeOperationLogs(
          readLocalCache(LOCAL_CACHE_KEYS.operationLog, OPERATION_LOG_TTL_MS) || []
      );
      const cachedSnapshots = sanitizeSnapshotList(
          readLocalCache(LOCAL_CACHE_KEYS.snapshots, SNAPSHOT_TTL_MS) || []
      );
      setOperationLogs(cachedOperationLogs);
      setLocalSnapshots(cachedSnapshots);
  }, []);

  // --- OPTIMIZATION: Debounced + chunked probability calculation to keep UI responsive ---
  useEffect(() => {
      const shouldCompute = mode === 'teacher' && teacherViewMode === 'batch';
      if (!shouldCompute) return;
      if (!orderedWeekendIds.length || batchProbCandidateIds.length === 0) {
          setAdmissionProbabilities({});
          return;
      }
      if (!teacherProbabilityContext) return;

      let rafId = null;
      let cancelled = false;
      const debounceMs = batchProbCandidateIds.length > 120 ? 90 : batchProbCandidateIds.length > 60 ? 40 : 0;
      const timer = setTimeout(() => {
          if (cancelled) return;

          const {
              scoresByDate,
              mathScoresByDate,
              probabilityProfiles,
              totalPRLookupByDate,
              mathPRLookupByDate,
              normalizedDates
          } = teacherProbabilityContext;

          const studentGradeMaps = batchProbStudentGradeMapsByStudentId;
          const students = batchProbCandidateIds
              .map((studentId) => batchStudentsById[studentId])
              .filter(Boolean);
          const probs = {};
          let index = 0;
          const chunkSize = students.length > 120 ? 26 : students.length > 60 ? 38 : 56;

          const processChunk = () => {
              if (cancelled) return;
              const end = Math.min(index + chunkSize, students.length);
              while (index < end) {
                  const student = students[index];
                  probs[student.id] = calculateProbLogic(
                      student,
                      scoresByDate,
                      mathScoresByDate,
                      studentGradeMaps,
                      normalizedDates,
                      probabilityProfiles,
                      totalPRLookupByDate,
                      mathPRLookupByDate
                  );
                  index += 1;
              }

              if (index < students.length) {
                  rafId = requestAnimationFrame(processChunk);
                  return;
              }

              rafId = requestAnimationFrame(() => {
                  if (cancelled) return;
                  startTransition(() => {
                      setAdmissionProbabilities(probs);
                  });
              });
          };

          processChunk();
      }, debounceMs);

      return () => {
          cancelled = true;
          clearTimeout(timer);
          if (rafId) cancelAnimationFrame(rafId);
      };
  }, [batchProbCandidateIds, batchProbStudentGradeMapsByStudentId, batchStudentsById, mode, orderedWeekendIds, teacherProbabilityContext, teacherViewMode]);

  useEffect(() => {
      if (mode !== 'parent' || !viewData?.chartData?.length) return;
      const latest = viewData.chartData[viewData.chartData.length - 1];
      const nextPhase = resolvePhaseByDate(latest.weekendID || latest.date, parentSortedAvailableDatesAsc);
      setActivePhase(nextPhase);
  }, [viewData, mode, parentSortedAvailableDatesAsc]);

  useEffect(() => {
      if (mode === 'parent') {
          setViewData(null);
          setParentViewContext({
              cohortId: '',
              dates: [],
              classData: [],
              classAverages: {},
              teacherMessage: { globalMessage: '', byStudent: {} }
          });
          setSearchError('');
      }
  }, [mode]);

  useEffect(() => {
      if (teacherViewMode !== 'batch' && batchInsightTab !== 'grades') {
          setBatchInsightTab('grades');
      }
  }, [teacherViewMode, batchInsightTab]);

  useEffect(() => {
      if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
      const media = window.matchMedia('(prefers-reduced-motion: reduce)');
      const updateMotionPreference = () => setPrefersReducedMotion(media.matches);
      updateMotionPreference();
      media.addEventListener?.('change', updateMotionPreference);
      return () => media.removeEventListener?.('change', updateMotionPreference);
  }, []);

  useEffect(() => {
      if (typeof window === 'undefined') return undefined;
      let rafId = null;
      const syncScroll = () => {
          const next = window.scrollY > 8;
          setIsHeaderScrolled((prev) => (prev === next ? prev : next));
          rafId = null;
      };
      const onScroll = () => {
          if (rafId !== null) return;
          rafId = window.requestAnimationFrame(syncScroll);
      };
      syncScroll();
      window.addEventListener('scroll', onScroll, { passive: true });
      return () => {
          if (rafId !== null) window.cancelAnimationFrame(rafId);
          window.removeEventListener('scroll', onScroll);
      };
  }, []);

  // 預先載入圖表 chunk，降低第一次打開分析視圖的等待感
  useEffect(() => {
      if (typeof window === 'undefined') return undefined;

      const preloadCharts = () => {
          void Promise.allSettled([
              safePreloadImport(() => import('./components/charts/SingleSubjectChart')),
              safePreloadImport(() => import('./components/charts/DistributionChart')),
              safePreloadImport(() => import('./components/charts/ParentAbilityRadar'))
          ]);
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
          if (u) { loadCohortRegistry(); }
        });
        return () => unsubscribe();
    } else {
        setAuthReady(true);
    }
  }, [loadCohortRegistry]);

  useEffect(() => {
      if (!orderedWeekendIds.length) return;
      const latestWeekendID = latestPopulatedWeekendID || orderedWeekendIds[orderedWeekendIds.length - 1];
      const currentWeekendID = batchDate ? getTestDateID(batchDate) : '';
      if (!currentWeekendID || !orderedWeekendIds.includes(currentWeekendID)) {
          setBatchDate(latestWeekendID);
      }
  }, [orderedWeekendIds, batchDate, getTestDateID, latestPopulatedWeekendID]);

  useEffect(() => {
      if (mode !== 'teacher') return;
      shouldSnapTeacherEntryRef.current = true;
  }, [mode]);

  useEffect(() => {
      if (mode !== 'teacher' || !shouldSnapTeacherEntryRef.current || !orderedWeekendIds.length) return;
      const latestWeekendID = latestPopulatedWeekendID || orderedWeekendIds[orderedWeekendIds.length - 1];
      setTeacherViewMode('batch');
      setBatchDate(latestWeekendID);
      shouldSnapTeacherEntryRef.current = false;
  }, [latestPopulatedWeekendID, mode, orderedWeekendIds]);

  useEffect(() => {
      if (mode !== 'teacher' || loading || isBatchDirty) return;
      if (datesCohortId !== activeTeacherCohortId || teacherStudentsCohortId !== activeTeacherCohortId) return;
      if (!availableDates.length || !allStudentsData.length) return;

      const hasScoreValue = (value) => {
          if (value === '' || value === null || value === undefined) return false;
          if (typeof value === 'string') return value.trim() !== '';
          return true;
      };

      const usedWeekendIds = new Set();
      Object.values(deferredStudentGradeMapsByStudentId).forEach((weekendGrades) => {
          Object.entries(weekendGrades || {}).forEach(([weekendID, grade]) => {
              const hasAnyScore = ['chi', 'eng', 'math', 'total'].some((key) => hasScoreValue(grade[key]));
              if (hasAnyScore) usedWeekendIds.add(weekendID);
          });
      });

      if (!usedWeekendIds.size) return;

      const prunedDates = availableDates.filter((date) => usedWeekendIds.has(getTestDateID(date)));
      const nextDates = sanitizeDateList(prunedDates);
      if (!nextDates.length || nextDates.length === availableDates.length) return;

      setAvailableDates(nextDates);
      setDatesCohortId(activeTeacherCohortId);
      writeLocalCache(getCohortCacheKey(LOCAL_CACHE_KEYS.dates, activeTeacherCohortId), nextDates);
      if (db && user) {
          setDoc(getCohortSettingsDocRef(activeTeacherCohortId, 'dates'), { list: nextDates }, { merge: true })
              .catch((err) => console.error('Auto prune empty dates error:', err));
      }
      const removedCount = availableDates.length - nextDates.length;
      const pruneNoticeKey = `${activeTeacherCohortId}::${availableDates.join('|')}=>${nextDates.join('|')}`;
      if (autoPruneNoticeKeyRef.current === pruneNoticeKey) return;
      autoPruneNoticeKeyRef.current = pruneNoticeKey;
      setStatusMsg(`已自動刪除 ${removedCount} 個無學生資料日期`);
      const timer = setTimeout(() => setStatusMsg(''), 2200);
      return () => clearTimeout(timer);
  }, [activeTeacherCohortId, allStudentsData.length, availableDates, datesCohortId, deferredStudentGradeMapsByStudentId, getCohortCacheKey, getCohortSettingsDocRef, getTestDateID, isBatchDirty, loading, mode, teacherStudentsCohortId, user]);

  const hasPendingBatchChanges = mode === 'teacher' && teacherViewMode === 'batch' && isBatchDirty;

  const resetBatchDraftState = useCallback(() => {
      batchDirtyStudentIdsRef.current = new Set();
      setBatchDraftGradesByStudentId({});
      setIsBatchDirty(false);
  }, []);

  const applyBatchDateChange = useCallback((nextBatchDate) => {
      if (!nextBatchDate) return;
      if (hasPendingBatchChanges && !window.confirm('批量成績尚未儲存，確定要切換考次嗎？')) return;
      if (hasPendingBatchChanges) resetBatchDraftState();
      startTransition(() => {
          setBatchDate(nextBatchDate);
      });
  }, [hasPendingBatchChanges, resetBatchDraftState]);

  const confirmDiscardBatchChanges = useCallback(() => {
      if (!hasPendingBatchChanges) return true;
      return window.confirm('批量成績尚未儲存，確定要離開目前頁面嗎？');
  }, [hasPendingBatchChanges]);

  const runWithBatchDiscardGuard = useCallback((action) => {
      if (!confirmDiscardBatchChanges()) return;
      if (hasPendingBatchChanges) resetBatchDraftState();
      action();
  }, [confirmDiscardBatchChanges, hasPendingBatchChanges, resetBatchDraftState]);

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

  const loadDates = useCallback(async (options = {}) => {
      const force = Boolean(options && options.force);
      const cohortId = String(options?.cohortId || activeDataCohortId || LEGACY_COHORT_ID);
      if (
          !force
          && datesLoadPromiseRef.current?.cohortId === cohortId
          && datesLoadPromiseRef.current?.promise
      ) {
          return datesLoadPromiseRef.current.promise;
      }

      const runner = async () => {
          const fallbackDates = getDefaultDatesForCohort(cohortId, cohortOptions);
          const cacheKey = getCohortCacheKey(LOCAL_CACHE_KEYS.dates, cohortId);
          const cachedDates = sanitizeDateList(readLocalCache(cacheKey) || []);
          if (cachedDates.length && !force) {
              if (cohortId === activeDataCohortId && cachedDates.join('|') !== availableDates.join('|')) {
                  setAvailableDates(cachedDates);
                  setDatesCohortId(cohortId);
              }
              return cachedDates;
          }
          if (!db) {
              const cleanedLocalDates = cohortId === datesCohortId ? sanitizeDateList(availableDates) : [];
              const nextDates = cleanedLocalDates.length ? cleanedLocalDates : fallbackDates;
              if (cohortId === activeDataCohortId && nextDates.join('|') !== availableDates.join('|')) {
                  setAvailableDates(nextDates);
                  setDatesCohortId(cohortId);
              }
              writeLocalCache(cacheKey, nextDates);
              return nextDates;
          }
          try {
              const docRef = getCohortSettingsDocRef(cohortId, 'dates');
              const docSnap = await getDoc(docRef);
              const hasStoredList = docSnap.exists() && Array.isArray(docSnap.data().list);
              const rawList = hasStoredList ? docSnap.data().list : [];
              const cleanedDates = sanitizeDateList(rawList);
              const nextDates = cleanedDates.length ? cleanedDates : fallbackDates;

              if (cohortId === activeDataCohortId && nextDates.join('|') !== availableDates.join('|')) {
                  setAvailableDates(nextDates);
                  setDatesCohortId(cohortId);
              }
              writeLocalCache(cacheKey, nextDates);

              const rawFingerprint = (Array.isArray(rawList) ? rawList : []).map((date) => String(date || '')).join('|');
              const cleanedFingerprint = nextDates.join('|');
              if (hasStoredList && cleanedFingerprint !== rawFingerprint) {
                  await setDoc(docRef, { list: nextDates }, { merge: true });
              }
              return nextDates;
          } catch (e) {
              console.error('Error loading dates:', e);
              const cleanedFallback = cohortId === datesCohortId ? sanitizeDateList(availableDates) : [];
              const nextDates = cleanedFallback.length ? cleanedFallback : fallbackDates;
              if (cohortId === activeDataCohortId && nextDates.join('|') !== availableDates.join('|')) {
                  setAvailableDates(nextDates);
                  setDatesCohortId(cohortId);
              }
              writeLocalCache(cacheKey, nextDates);
              return nextDates;
          }
      };

      const promise = runner().finally(() => {
          if (
              datesLoadPromiseRef.current?.cohortId === cohortId
              && datesLoadPromiseRef.current?.promise === promise
          ) {
              datesLoadPromiseRef.current = null;
          }
      });
      datesLoadPromiseRef.current = { cohortId, promise };
      return promise;
  }, [activeDataCohortId, availableDates, cohortOptions, datesCohortId, getCohortCacheKey, getCohortSettingsDocRef]);

  const shouldResetQueryStats = useCallback((lastResetAt) => {
      if (!lastResetAt) return true;
      const ts = new Date(lastResetAt).getTime();
      if (Number.isNaN(ts)) return true;
      return Date.now() - ts >= QUERY_COUNT_RESET_INTERVAL_MS;
  }, []);

  const applyPendingQueryStats = useCallback((baseCounts, baseEvents, lastResetAt) => {
      const mergedCounts = (baseCounts && typeof baseCounts === 'object') ? { ...baseCounts } : {};
      Object.entries(queryPendingCountsRef.current || {}).forEach(([id, delta]) => {
          const nextDelta = Number(delta) || 0;
          if (!nextDelta) return;
          mergedCounts[id] = (Number(mergedCounts[id]) || 0) + nextDelta;
      });

      const pendingEvents = Array.isArray(queryPendingEventsRef.current) ? queryPendingEventsRef.current : [];
      const mergedEvents = sanitizeQueryEvents(
          [...(Array.isArray(baseEvents) ? baseEvents : []), ...pendingEvents],
          lastResetAt
      );

      return { counts: mergedCounts, events: mergedEvents };
  }, []);

  const flushPendingQueryStats = useCallback(async (options = {}) => {
      const force = Boolean(options && options.force);
      const cohortId = String(options?.cohortId || queryPendingCohortIdRef.current || activeTeacherCohortId || LEGACY_COHORT_ID);
      if (!db) return;
      if (queryFlushInFlightRef.current && !force) return;

      const hasPendingBeforeFlush =
          Object.keys(queryPendingCountsRef.current || {}).length > 0
          || (queryPendingEventsRef.current || []).length > 0;
      if (!hasPendingBeforeFlush) return;

      const pendingCounts = { ...(queryPendingCountsRef.current || {}) };
      const pendingEvents = [...(queryPendingEventsRef.current || [])];
      queryPendingCountsRef.current = {};
      queryPendingEventsRef.current = [];
      queryFlushInFlightRef.current = true;

      try {
          const nowIso = new Date().toISOString();
          const queryStatsDocRef = getCohortSettingsDocRef(cohortId, 'query_stats_v1');
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

          Object.entries(pendingCounts).forEach(([id, delta]) => {
              const nextDelta = Number(delta) || 0;
              if (!nextDelta) return;
              counts[id] = (Number(counts[id]) || 0) + nextDelta;
          });
          events = sanitizeQueryEvents([...events, ...pendingEvents], lastResetAt);

          await setDoc(queryStatsDocRef, { counts, events, lastResetAt, updatedAt: nowIso }, { merge: true });

          const merged = applyPendingQueryStats(counts, events, lastResetAt);
          if (cohortId === activeTeacherCohortId) {
              setQueryStatsById(merged.counts);
              setQueryEvents(merged.events);
              setQueryStatsLastResetAt(lastResetAt);
              setQueryStatsCohortId(cohortId);
          }
          writeLocalCache(getCohortCacheKey(LOCAL_CACHE_KEYS.queryStats, cohortId), { counts: merged.counts, events: merged.events, lastResetAt });
      } catch (e) {
          Object.entries(pendingCounts).forEach(([id, delta]) => {
              const nextDelta = Number(delta) || 0;
              if (!nextDelta) return;
              queryPendingCountsRef.current[id] = (Number(queryPendingCountsRef.current[id]) || 0) + nextDelta;
          });
          queryPendingEventsRef.current = [...pendingEvents, ...(queryPendingEventsRef.current || [])].slice(-MAX_QUERY_EVENTS);
          console.error('Flush query stats error:', e);
      } finally {
          queryFlushInFlightRef.current = false;
          const hasPendingAfterFlush =
              Object.keys(queryPendingCountsRef.current || {}).length > 0
              || (queryPendingEventsRef.current || []).length > 0;
          if (hasPendingAfterFlush && !queryFlushTimerRef.current) {
              queryFlushTimerRef.current = setTimeout(() => {
                  queryFlushTimerRef.current = null;
                  void flushPendingQueryStats({ cohortId });
              }, QUERY_STATS_FLUSH_DELAY_MS);
          }
      }
  }, [activeTeacherCohortId, applyPendingQueryStats, getCohortCacheKey, getCohortSettingsDocRef, shouldResetQueryStats]);

  const scheduleQueryStatsFlush = useCallback(() => {
      if (!db || queryFlushTimerRef.current) return;
      queryFlushTimerRef.current = setTimeout(() => {
          queryFlushTimerRef.current = null;
          void flushPendingQueryStats({ cohortId: queryPendingCohortIdRef.current || activeTeacherCohortId });
      }, QUERY_STATS_FLUSH_DELAY_MS);
  }, [activeTeacherCohortId, flushPendingQueryStats]);

  const loadQueryStats = useCallback(async (options = {}) => {
      const force = Boolean(options && options.force);
      const cohortId = String(options?.cohortId || activeTeacherCohortId || LEGACY_COHORT_ID);
      if (!db) {
          setQueryStatsById({});
          setQueryEvents([]);
          setQueryStatsLastResetAt('');
          setQueryStatsCohortId(cohortId);
          return;
      }

      if (!force) {
          const cachedStats = readLocalCache(getCohortCacheKey(LOCAL_CACHE_KEYS.queryStats, cohortId), QUERY_STATS_CACHE_TTL_MS);
          const cachedLastResetAt = String(cachedStats?.lastResetAt || '');
          if (cachedStats && cachedLastResetAt && !shouldResetQueryStats(cachedLastResetAt)) {
              const cachedCounts = (cachedStats.counts && typeof cachedStats.counts === 'object') ? cachedStats.counts : {};
              const cachedEvents = sanitizeQueryEvents(cachedStats.events, cachedLastResetAt);
              const merged = applyPendingQueryStats(cachedCounts, cachedEvents, cachedLastResetAt);
              if (cohortId === activeTeacherCohortId) {
                  setQueryStatsById(merged.counts);
                  setQueryEvents(merged.events);
                  setQueryStatsLastResetAt(cachedLastResetAt);
                  setQueryStatsCohortId(cohortId);
              }
              return;
          }
      }

      setQueryStatsLoading(true);
      try {
          const nowIso = new Date().toISOString();
          const queryStatsDocRef = getCohortSettingsDocRef(cohortId, 'query_stats_v1');
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

          const merged = applyPendingQueryStats(counts, events, lastResetAt);
          if (cohortId === activeTeacherCohortId) {
              setQueryStatsById(merged.counts);
              setQueryEvents(merged.events);
              setQueryStatsLastResetAt(lastResetAt);
              setQueryStatsCohortId(cohortId);
          }
          writeLocalCache(getCohortCacheKey(LOCAL_CACHE_KEYS.queryStats, cohortId), { counts: merged.counts, events: merged.events, lastResetAt });
      } catch (e) {
          console.error('Load query stats error:', e);
      } finally {
          setQueryStatsLoading(false);
      }
  }, [activeTeacherCohortId, shouldResetQueryStats, applyPendingQueryStats, getCohortCacheKey, getCohortSettingsDocRef]);

  const loadTeacherMessage = useCallback(async (options = {}) => {
      const force = Boolean(options && options.force);
      const hydrateState = options?.hydrateState !== false;
      const cohortId = String(options?.cohortId || activeDataCohortId || LEGACY_COHORT_ID);
      const hydrateMessageState = (raw) => {
          if (!hydrateState) return;
          const nextGlobalMessage = String(raw?.globalMessage ?? raw?.message ?? '').trim();
          const nextByStudentMessages = normalizeTeacherStudentMessages(raw?.byStudent);
          setTeacherGlobalMessage(nextGlobalMessage);
          setTeacherGlobalMessageDraft(nextGlobalMessage);
          setTeacherStudentMessages(nextByStudentMessages);
          setTeacherStudentMessageDrafts(nextByStudentMessages);
          setTeacherMessageCohortId(cohortId);
      };

      if (!force) {
          const cachedMessage = readLocalCache(getCohortCacheKey(LOCAL_CACHE_KEYS.teacherMessage, cohortId), TEACHER_MESSAGE_CACHE_TTL_MS);
          if (cachedMessage && typeof cachedMessage === 'object') {
              hydrateMessageState(cachedMessage);
              return {
                  globalMessage: String(cachedMessage?.globalMessage ?? cachedMessage?.message ?? '').trim(),
                  byStudent: normalizeTeacherStudentMessages(cachedMessage?.byStudent)
              };
          }
      }

      if (!db) {
          if (hydrateState) {
              setTeacherGlobalMessage('');
              setTeacherGlobalMessageDraft('');
              setTeacherStudentMessages({});
              setTeacherStudentMessageDrafts({});
              setTeacherMessageCohortId(cohortId);
          }
          return { globalMessage: '', byStudent: {} };
      }

      if (hydrateState) setTeacherMessageLoading(true);
      try {
          const messageDocRef = getCohortSettingsDocRef(cohortId, TEACHER_MESSAGE_DOC_ID);
          const docSnap = await getDoc(messageDocRef);
          const raw = docSnap.exists() ? docSnap.data() : {};
          const payload = {
              globalMessage: String(raw?.globalMessage ?? raw?.message ?? '').trim(),
              byStudent: normalizeTeacherStudentMessages(raw?.byStudent)
          };
          hydrateMessageState(payload);
          writeLocalCache(getCohortCacheKey(LOCAL_CACHE_KEYS.teacherMessage, cohortId), payload);
          return payload;
      } catch (e) {
          console.error('Load teacher message error:', e);
          return { globalMessage: '', byStudent: {} };
      } finally {
          if (hydrateState) setTeacherMessageLoading(false);
      }
  }, [activeDataCohortId, getCohortCacheKey, getCohortSettingsDocRef]);

  const incrementQueryCount = useCallback((studentId, cohortIdOverride = '') => {
      const normalizedId = String(studentId || '').toUpperCase().trim();
      if (!normalizedId) return;
      const targetCohortId = String(cohortIdOverride || activePublicCohortId || LEGACY_COHORT_ID);
      if (
          queryPendingCohortIdRef.current
          && queryPendingCohortIdRef.current !== targetCohortId
          && (Object.keys(queryPendingCountsRef.current).length > 0 || queryPendingEventsRef.current.length > 0)
      ) {
          void flushPendingQueryStats({ force: true, cohortId: queryPendingCohortIdRef.current });
          queryPendingCountsRef.current = {};
          queryPendingEventsRef.current = [];
      }
      queryPendingCohortIdRef.current = targetCohortId;
      const nowTs = Date.now();
      const nowIso = new Date(nowTs).toISOString();

      setQueryStatsById((prev) => ({ ...prev, [normalizedId]: (prev[normalizedId] || 0) + 1 }));
      setQueryEvents((prev) => {
          const next = [...prev, { id: normalizedId, at: nowIso, ts: nowTs }];
          return sanitizeQueryEvents(next, queryStatsLastResetAt);
      });

      if (!db) return;
      queryPendingCountsRef.current[normalizedId] = (Number(queryPendingCountsRef.current[normalizedId]) || 0) + 1;
      queryPendingEventsRef.current = [...(queryPendingEventsRef.current || []), { id: normalizedId, at: nowIso, ts: nowTs }].slice(-MAX_QUERY_EVENTS);
      scheduleQueryStatsFlush();
  }, [activePublicCohortId, flushPendingQueryStats, queryStatsLastResetAt, scheduleQueryStatsFlush]);

  const handleResetQueryStats = useCallback(async () => {
      const nowIso = new Date().toISOString();
      setQueryStatsLoading(true);
      try {
          queryPendingCountsRef.current = {};
          queryPendingEventsRef.current = [];
          queryPendingCohortIdRef.current = activeTeacherCohortId;
          if (queryFlushTimerRef.current) {
              clearTimeout(queryFlushTimerRef.current);
              queryFlushTimerRef.current = null;
          }
          if (db) {
              const queryStatsDocRef = getCohortSettingsDocRef(activeTeacherCohortId, 'query_stats_v1');
              await setDoc(queryStatsDocRef, { counts: {}, events: [], lastResetAt: nowIso, updatedAt: nowIso }, { merge: true });
          }

          setQueryStatsById({});
          setQueryEvents([]);
          setQueryStatsLastResetAt(nowIso);
          setQueryStatsCohortId(activeTeacherCohortId);
          writeLocalCache(getCohortCacheKey(LOCAL_CACHE_KEYS.queryStats, activeTeacherCohortId), { counts: {}, events: [], lastResetAt: nowIso });
          setStatusMsg('查詢次數已重置');
          appendOperationLog({
              kind: 'query',
              title: '手動重置查詢監控',
              detail: formatMonitorDateTimeLabel(nowIso, false),
              level: 'warn'
          });
          setTimeout(() => setStatusMsg(''), 2000);
      } catch (e) {
          console.error('Reset query stats error:', e);
          setStatusMsg('重置失敗');
          setTimeout(() => setStatusMsg(''), 2000);
      } finally {
          setQueryStatsLoading(false);
      }
  }, [activeTeacherCohortId, appendOperationLog, getCohortCacheKey, getCohortSettingsDocRef]);

  const normalizeGrades = useCallback((grades, options = {}) => {
      const scopedDatePool = sanitizeDateList(options.datePool || availableDates);
      const targetCohortId = String(options?.cohortId || datesCohortId || activeDataCohortId || activeTeacherCohortId || LEGACY_COHORT_ID);
      const resolveDateId = typeof options.getDateID === 'function'
          ? options.getDateID
          : (dateStr) => resolveScopedDateId(dateStr, targetCohortId, scopedDatePool);
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
              normalizedG = normalizeStudentGrade({ math: g[0] || 0, eng: g[1] || 0, chi: g[2] || 0, total: (g[0] || 0) + (g[1] || 0) + (g[2] || 0), class: 'A班' });
              changed = true;
          } else if (g && typeof g === 'object') {
              normalizedG = normalizeStudentGrade(g);
              if (
                  normalizedG.total !== (g?.total ?? '')
                  || normalizedG.class !== (g?.class ?? 'A班')
              ) {
                  changed = true;
              }
          } else {
              normalizedG = normalizeStudentGrade({});
              changed = true;
          }
          if (date !== normalizedDate) changed = true;
          if (normalized[normalizedDate]) changed = true;
          normalized[normalizedDate] = normalizedG;
      });

      const weekendEntries = buildWeekendGradeEntryMap(normalized, resolveDateId);
      const deduped = {};
      Object.entries(weekendEntries).forEach(([weekendID, entry]) => {
          deduped[weekendID] = { ...entry.grade };
          if (entry.sourceDate !== weekendID) changed = true;
      });
      if (Object.keys(deduped).length !== Object.keys(normalized).length) changed = true;

      if (withMeta) {
          return { normalized: deduped, removedInvalidDates, changed };
      }
      return deduped;
  }, [activeDataCohortId, activeTeacherCohortId, availableDates, datesCohortId, resolveScopedDateId]);

  const loadAllStudents = useCallback(async (options = {}) => {
      const { forceRemote = false, silent = false } = options;
      const cohortId = String(options?.cohortId || activeTeacherCohortId || LEGACY_COHORT_ID);
      const fallbackDates = getDefaultDatesForCohort(cohortId, cohortOptions);
      const datePool = sanitizeDateList(options?.datePool || (cohortId === datesCohortId ? availableDates : fallbackDates));
      const getDateIDForCohort = (dateStr) => resolveScopedDateId(dateStr, cohortId, datePool);
      if (
          !forceRemote
          && studentsLoadPromiseRef.current?.cohortId === cohortId
          && studentsLoadPromiseRef.current?.promise
      ) {
          return studentsLoadPromiseRef.current.promise;
      }

      const runner = async () => {
      if (!silent) setLoading(true);
      let loadingReleased = false;
      const releaseLoading = () => {
          if (loadingReleased) return;
          loadingReleased = true;
          if (!silent) setLoading(false);
      };
      const syncDatesFromStudents = (students) => {
          const derivedDates = deriveDatePoolFromStudents(students);
          if (!derivedDates.length) return;
          const nextDates = mergeDatePools(datePool, derivedDates);
          writeLocalCache(getCohortCacheKey(LOCAL_CACHE_KEYS.dates, cohortId), nextDates);
          if (cohortId !== activeDataCohortId) return;
          if (nextDates.join('|') === sanitizeDateList(availableDates).join('|')) return;
          startTransition(() => {
              setAvailableDates(nextDates);
              setDatesCohortId(cohortId);
          });
      };
      try {
          const cacheKey = getCohortCacheKey(LOCAL_CACHE_KEYS.students, cohortId);
          const versionCacheKey = getCohortCacheKey(LOCAL_CACHE_KEYS.studentsVersion, cohortId);
          const sessionKey = getStudentSessionKey(cohortId);
          const cachedStudents = readLocalCache(cacheKey, STUDENT_CACHE_TTL_MS);
          const hasCachedStudents = Array.isArray(cachedStudents) && cachedStudents.length > 0;
          let remoteVersion = '';
          const hasSessionSynced =
              typeof window !== 'undefined'
              && sessionStorage.getItem(sessionKey) === '1';
          if (!forceRemote && hasCachedStudents) {
              syncDatesFromStudents(cachedStudents);
              startTransition(() => {
                  setAllStudentsData(cachedStudents);
                  setTeacherStudentsCohortId(cohortId);
                  if (cohortId === activePublicCohortId) {
                      setCachedClassData(cachedStudents);
                      setPublicStudentsCohortId(cohortId);
                  }
              });
              resetBatchDraftState();
              releaseLoading();
              if (!db) {
                  return cachedStudents;
              }
              if (hasSessionSynced) {
                  return cachedStudents;
              }
              remoteVersion = await loadStudentsVersion(cohortId);
              const cachedVersion = String(readLocalCache(versionCacheKey, SETTINGS_CACHE_TTL_MS) || '').trim();
              if (remoteVersion && cachedVersion && remoteVersion === cachedVersion) {
                  if (typeof window !== 'undefined') {
                      sessionStorage.setItem(sessionKey, '1');
                  }
                  return cachedStudents;
              }
          }

          let studentsMap = {};
          RAW_STUDENT_RECORDS.forEach(s => {
              studentsMap[s.id] = {
                  ...s,
                  grades: normalizeGrades(s.grades, { datePool, getDateID: getDateIDForCohort })
              };
          });
          let cleanedInvalidDateCount = 0;
          const cleanupPayloads = [];
          if (db) {
              const studentsCollectionRef = getCohortStudentsCollectionRef(cohortId);
              const querySnapshot = await getDocs(studentsCollectionRef);
              querySnapshot.forEach((studentDoc) => {
                  const data = studentDoc.data();
                  const normalizedResult = normalizeGrades(data.grades, { withMeta: true, datePool, getDateID: getDateIDForCohort });
                  const sanitizedData = { ...data, grades: normalizedResult.normalized };

                  if (normalizedResult.changed && data.id) {
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
          syncDatesFromStudents(sortedStudents);
          startTransition(() => {
              setAllStudentsData(sortedStudents);
              setTeacherStudentsCohortId(cohortId);
              if (cohortId === activePublicCohortId) {
                  setCachedClassData(sortedStudents);
                  setPublicStudentsCohortId(cohortId);
              }
          });
          writeLocalCache(cacheKey, sortedStudents);
          if (!remoteVersion) {
              remoteVersion = await bumpStudentsVersion(cohortId);
          }
          if (remoteVersion) {
              writeLocalCache(versionCacheKey, remoteVersion);
          }
          if (typeof window !== 'undefined') {
              sessionStorage.setItem(sessionKey, '1');
          }
          resetBatchDraftState();
          releaseLoading();

          if (db && cleanupPayloads.length > 0) {
              void Promise.all(
                  cleanupPayloads.map((item) =>
                      setDoc(getCohortStudentDocRef(cohortId, item.id), item.payload)
                  )
              ).then(() => {
                  setStatusMsg(
                      cleanedInvalidDateCount > 0
                          ? `已自動刪除 ${cleanedInvalidDateCount} 筆不合理日期資料`
                          : `已自動整理 ${cleanupPayloads.length} 筆重複考次資料`
                  );
                  setTimeout(() => setStatusMsg(''), 2400);
              }).catch((err) => {
                  console.error('Cleanup invalid student dates error:', err);
              });
          }
          return sortedStudents;
      } catch (e) { console.error("Load error:", e); }
      finally {
          releaseLoading();
      }
      return [];
      };

      const promise = runner().finally(() => {
          if (
              studentsLoadPromiseRef.current?.cohortId === cohortId
              && studentsLoadPromiseRef.current?.promise === promise
          ) {
              studentsLoadPromiseRef.current = null;
          }
      });
      studentsLoadPromiseRef.current = { cohortId, promise };
      return promise;
  }, [
      activeDataCohortId,
      activePublicCohortId,
      activeTeacherCohortId,
      availableDates,
      cohortOptions,
      datesCohortId,
      getCohortCacheKey,
      getCohortStudentDocRef,
      getCohortStudentsCollectionRef,
      getStudentSessionKey,
      bumpStudentsVersion,
      loadStudentsVersion,
      normalizeGrades,
      resetBatchDraftState,
      resolveScopedDateId
  ]);

  const loadParentSearchStudents = useCallback(async (cohortId, options = {}) => {
      const normalizedId = String(cohortId || LEGACY_COHORT_ID);
      const fallbackDates = getDefaultDatesForCohort(normalizedId, cohortOptions);
      const datePool = sanitizeDateList(options?.datePool || fallbackDates);
      const getDateIDForCohort = (dateStr) => resolveScopedDateId(dateStr, normalizedId, datePool);
      const cacheKey = getCohortCacheKey(LOCAL_CACHE_KEYS.students, normalizedId);
      const versionCacheKey = getCohortCacheKey(LOCAL_CACHE_KEYS.studentsVersion, normalizedId);
      const cachedStudents = readLocalCache(cacheKey, STUDENT_CACHE_TTL_MS);
      const hasCachedStudents = Array.isArray(cachedStudents) && cachedStudents.length > 0;

      if (hasCachedStudents) {
          const remoteVersion = await loadStudentsVersion(normalizedId);
          const cachedVersion = String(readLocalCache(versionCacheKey, SETTINGS_CACHE_TTL_MS) || '').trim();
          if (remoteVersion && cachedVersion && remoteVersion === cachedVersion) {
              return cachedStudents;
          }
      }

      if (!db) {
          return hasCachedStudents ? cachedStudents : [];
      }

      const studentsMap = {};
      let cleanedInvalidDateCount = 0;
      const cleanupPayloads = [];
      const querySnapshot = await getDocs(getCohortStudentsCollectionRef(normalizedId));

      querySnapshot.forEach((studentDoc) => {
          const data = studentDoc.data();
          const normalizedResult = normalizeGrades(data.grades, { withMeta: true, datePool, getDateID: getDateIDForCohort });
          const sanitizedData = { ...data, grades: normalizedResult.normalized };

          if (normalizedResult.changed && data.id) {
              cleanedInvalidDateCount += normalizedResult.removedInvalidDates;
              cleanupPayloads.push({
                  id: data.id,
                  payload: { ...sanitizedData, lastUpdated: new Date().toISOString() }
              });
          }

          studentsMap[data.id] = sanitizedData;
      });

      const sortedStudents = Object.values(studentsMap).sort((a, b) => a.id.localeCompare(b.id));
      writeLocalCache(cacheKey, sortedStudents);
      const derivedDates = deriveDatePoolFromStudents(sortedStudents);
      if (derivedDates.length > 0) {
          writeLocalCache(getCohortCacheKey(LOCAL_CACHE_KEYS.dates, normalizedId), mergeDatePools(datePool, derivedDates));
      }
      let remoteVersion = await loadStudentsVersion(normalizedId, { force: true });
      if (!remoteVersion) {
          remoteVersion = await bumpStudentsVersion(normalizedId);
      }
      if (remoteVersion) {
          writeLocalCache(versionCacheKey, remoteVersion);
      }

      if (cleanupPayloads.length > 0) {
          void Promise.all(
              cleanupPayloads.map((item) =>
                  setDoc(getCohortStudentDocRef(normalizedId, item.id), item.payload)
              )
          ).then(() => {
              setStatusMsg(
                  cleanedInvalidDateCount > 0
                      ? `已自動刪除 ${cleanedInvalidDateCount} 筆不合理日期資料`
                      : `已自動整理 ${cleanupPayloads.length} 筆重複考次資料`
              );
              setTimeout(() => setStatusMsg(''), 2400);
          }).catch((err) => {
              console.error('Parent search cleanup invalid student dates error:', err);
          });
      }

      return sortedStudents;
  }, [
      bumpStudentsVersion,
      cohortOptions,
      getCohortCacheKey,
      getCohortStudentDocRef,
      getCohortStudentsCollectionRef,
      loadStudentsVersion,
      normalizeGrades,
      resolveScopedDateId
  ]);

  const getTeacherCohortCachedBundle = useCallback((cohortId) => {
      const normalizedId = String(cohortId || LEGACY_COHORT_ID);
      const cachedDates = sanitizeDateList(
          readLocalCache(getCohortCacheKey(LOCAL_CACHE_KEYS.dates, normalizedId)) || []
      );
      const cachedStudents = readLocalCache(
          getCohortCacheKey(LOCAL_CACHE_KEYS.students, normalizedId),
          STUDENT_CACHE_TTL_MS
      );
      const cachedClassAverages = readLocalCache(
          getCohortCacheKey(LOCAL_CACHE_KEYS.classAverages, normalizedId)
      );
      const cachedMessage = readLocalCache(
          getCohortCacheKey(LOCAL_CACHE_KEYS.teacherMessage, normalizedId),
          TEACHER_MESSAGE_CACHE_TTL_MS
      );
      const cachedStats = readLocalCache(
          getCohortCacheKey(LOCAL_CACHE_KEYS.queryStats, normalizedId),
          QUERY_STATS_CACHE_TTL_MS
      );
      const cachedLastResetAt = String(cachedStats?.lastResetAt || '');
      const cachedStatsAreFresh = cachedLastResetAt && !shouldResetQueryStats(cachedLastResetAt);
      const derivedDates = Array.isArray(cachedStudents) && cachedStudents.length > 0
          ? deriveDatePoolFromStudents(cachedStudents)
          : [];
      const nextDates = mergeDatePools(cachedDates, derivedDates);
      const hasDisplayData = Boolean(
          nextDates.length
          || (Array.isArray(cachedStudents) && cachedStudents.length > 0)
          || (cachedClassAverages && typeof cachedClassAverages === 'object' && Object.keys(cachedClassAverages).length)
      );

      return {
          normalizedId,
          nextDates,
          cachedStudents,
          cachedClassAverages,
          cachedMessage,
          cachedStats,
          cachedLastResetAt,
          cachedStatsAreFresh,
          hasDisplayData
      };
  }, [getCohortCacheKey, shouldResetQueryStats]);

  const applyTeacherCohortCachedState = useCallback((cohortInput) => {
      const bundle = typeof cohortInput === 'string' ? getTeacherCohortCachedBundle(cohortInput) : cohortInput;
      if (!bundle?.hasDisplayData) return false;
      const {
          normalizedId,
          nextDates,
          cachedStudents,
          cachedClassAverages,
          cachedMessage,
          cachedStats,
          cachedLastResetAt,
          cachedStatsAreFresh
      } = bundle;

      if (Array.isArray(cachedStudents) && cachedStudents.length > 0) {
          setAllStudentsData(cachedStudents);
          setTeacherStudentsCohortId(normalizedId);
      }

      if (cachedStatsAreFresh) {
          setQueryStatsById((cachedStats.counts && typeof cachedStats.counts === 'object') ? cachedStats.counts : {});
          setQueryEvents(sanitizeQueryEvents(cachedStats.events, cachedLastResetAt));
          setQueryStatsLastResetAt(cachedLastResetAt);
          setQueryStatsCohortId(normalizedId);
      } else {
          setQueryStatsById({});
          setQueryEvents([]);
          setQueryStatsLastResetAt('');
          setQueryStatsCohortId('');
      }

      if (cachedMessage && typeof cachedMessage === 'object') {
          const nextGlobalMessage = String(cachedMessage?.globalMessage ?? cachedMessage?.message ?? '').trim();
          const nextByStudentMessages = normalizeTeacherStudentMessages(cachedMessage?.byStudent);
          setTeacherGlobalMessage(nextGlobalMessage);
          setTeacherGlobalMessageDraft(nextGlobalMessage);
          setTeacherStudentMessages(nextByStudentMessages);
          setTeacherStudentMessageDrafts(nextByStudentMessages);
          setTeacherMessageCohortId(normalizedId);
      } else {
          setTeacherGlobalMessage('');
          setTeacherGlobalMessageDraft('');
          setTeacherStudentMessages({});
          setTeacherStudentMessageDrafts({});
          setTeacherMessageCohortId('');
      }

      setCurrentStudentId(null);
      setStudentName('');
      setGrades({});
      setBatchDate((prev) => nextDates[nextDates.length - 1] || prev || '');
      setAvailableDates(nextDates.length ? nextDates : getDefaultDatesForCohort(normalizedId, cohortOptions));
      setDatesCohortId(nextDates.length ? normalizedId : '');

      if (cachedClassAverages && typeof cachedClassAverages === 'object') {
          setClassAverages(cachedClassAverages);
          setClassAveragesCohortId(normalizedId);
      } else {
          setClassAverages({});
          setClassAveragesCohortId('');
      }

      resetBatchDraftState();
      return true;
  }, [cohortOptions, getTeacherCohortCachedBundle, resetBatchDraftState]);

  useEffect(() => {
      if (typeof document === 'undefined') return;
      const handleVisibilityChange = () => {
          if (document.visibilityState !== 'hidden') return;
          if (queryFlushTimerRef.current) {
              clearTimeout(queryFlushTimerRef.current);
              queryFlushTimerRef.current = null;
          }
          void flushPendingQueryStats({ force: true, cohortId: activeTeacherCohortId });
      };
      document.addEventListener('visibilitychange', handleVisibilityChange);
      return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [activeTeacherCohortId, flushPendingQueryStats]);

  useEffect(() => {
      return () => {
          if (queryFlushTimerRef.current) {
              clearTimeout(queryFlushTimerRef.current);
              queryFlushTimerRef.current = null;
          }
      };
  }, []);

  useEffect(() => {
      if (mode !== 'teacher') return;
      setTeacherViewMode('batch');
  }, [mode]);

  useEffect(() => {
      queryPendingCountsRef.current = {};
      queryPendingEventsRef.current = [];
      queryPendingCohortIdRef.current = activeTeacherCohortId || LEGACY_COHORT_ID;
      queryFlushInFlightRef.current = false;
      if (queryFlushTimerRef.current) {
          clearTimeout(queryFlushTimerRef.current);
          queryFlushTimerRef.current = null;
      }
      if (teacherCohortPreseedRef.current === activeTeacherCohortId) {
          teacherCohortPreseedRef.current = '';
          return;
      }
      applyTeacherCohortCachedState(activeTeacherCohortId);
  }, [activeTeacherCohortId, applyTeacherCohortCachedState]);

  useEffect(() => {
      const cachedStudents = readLocalCache(
          getCohortCacheKey(LOCAL_CACHE_KEYS.students, activePublicCohortId),
          STUDENT_CACHE_TTL_MS
      );
      const cachedDates = sanitizeDateList(
          readLocalCache(getCohortCacheKey(LOCAL_CACHE_KEYS.dates, activePublicCohortId)) || []
      );
      const cachedClassAverages = readLocalCache(
          getCohortCacheKey(LOCAL_CACHE_KEYS.classAverages, activePublicCohortId)
      );
      const cachedMessage = readLocalCache(
          getCohortCacheKey(LOCAL_CACHE_KEYS.teacherMessage, activePublicCohortId),
          TEACHER_MESSAGE_CACHE_TTL_MS
      );
      const hasCachedStudents = Array.isArray(cachedStudents) && cachedStudents.length > 0;
      const hasCachedDates = cachedDates.length > 0;
      const hasCachedClassAverages = cachedClassAverages && typeof cachedClassAverages === 'object';
      const hasCachedMessage = cachedMessage && typeof cachedMessage === 'object';

      if (hasCachedStudents) {
          setCachedClassData(cachedStudents);
          setPublicStudentsCohortId(activePublicCohortId);
      }
      setSearchError('');
      if (mode === 'parent') {
          if (hasCachedDates) {
              setAvailableDates(cachedDates);
              setDatesCohortId(activePublicCohortId);
          }
          if (hasCachedClassAverages) {
              setClassAverages(cachedClassAverages);
              setClassAveragesCohortId(activePublicCohortId);
          }
          if (hasCachedMessage) {
              const nextGlobalMessage = String(cachedMessage?.globalMessage ?? cachedMessage?.message ?? '').trim();
              const nextByStudentMessages = normalizeTeacherStudentMessages(cachedMessage?.byStudent);
              setTeacherGlobalMessage(nextGlobalMessage);
              setTeacherGlobalMessageDraft(nextGlobalMessage);
              setTeacherStudentMessages(nextByStudentMessages);
              setTeacherStudentMessageDrafts(nextByStudentMessages);
              setTeacherMessageCohortId(activePublicCohortId);
          }
      }
  }, [activePublicCohortId, cohortOptions, getCohortCacheKey, mode]);

  useEffect(() => {
      if (typeof window === 'undefined') return;
      const teacherStudentsCacheKey = getCohortCacheKey(LOCAL_CACHE_KEYS.students, activeTeacherCohortId);
      const publicStudentsCacheKey = getCohortCacheKey(LOCAL_CACHE_KEYS.students, activePublicCohortId);
      const activeQueryStatsCacheKey = getCohortCacheKey(LOCAL_CACHE_KEYS.queryStats, activeTeacherCohortId);
      const handleStorage = (event) => {
          if (!event.key) return;

          if (event.key === teacherStudentsCacheKey && mode === 'teacher') {
              const cachedStudents = readLocalCache(teacherStudentsCacheKey, STUDENT_CACHE_TTL_MS);
              if (!Array.isArray(cachedStudents) || cachedStudents.length === 0) return;
              if (mode === 'teacher' && teacherViewMode === 'batch' && !isBatchDirty) {
                  setBatchDraftGradesByStudentId({});
                  setAllStudentsData(cachedStudents);
                  setTeacherStudentsCohortId(activeTeacherCohortId);
              }
              return;
          }

          if (event.key === publicStudentsCacheKey && mode === 'parent') {
              const cachedStudents = readLocalCache(publicStudentsCacheKey, STUDENT_CACHE_TTL_MS);
              if (!Array.isArray(cachedStudents) || cachedStudents.length === 0) return;
              setCachedClassData(cachedStudents);
              setPublicStudentsCohortId(activePublicCohortId);
              return;
          }

          if (event.key === activeQueryStatsCacheKey && mode === 'teacher' && !queryStatsLoading) {
              const cachedStats = readLocalCache(activeQueryStatsCacheKey, QUERY_STATS_CACHE_TTL_MS);
              if (!cachedStats || typeof cachedStats !== 'object') return;
              const lastResetAt = String(cachedStats.lastResetAt || '');
              if (!lastResetAt) return;
              const merged = applyPendingQueryStats(
                  (cachedStats.counts && typeof cachedStats.counts === 'object') ? cachedStats.counts : {},
                  sanitizeQueryEvents(cachedStats.events, lastResetAt),
                  lastResetAt
              );
              setQueryStatsById(merged.counts);
              setQueryEvents(merged.events);
              setQueryStatsLastResetAt(lastResetAt);
              setQueryStatsCohortId(activeTeacherCohortId);
          }
      };

      window.addEventListener('storage', handleStorage);
      return () => window.removeEventListener('storage', handleStorage);
  }, [activePublicCohortId, activeTeacherCohortId, applyPendingQueryStats, getCohortCacheKey, isBatchDirty, mode, queryStatsLoading, teacherViewMode]);

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

  const requestExcelImport = useCallback(() => {
      if (!canImportExcel) {
          notifyPermissionDenied('目前權限無法匯入 Excel');
          return;
      }
      const openPicker = () => {
          legacyImportUnlockUntilRef.current = Date.now() + 30 * 1000;
          importFileInputRef.current?.click();
      };
      if (isLegacyCohort(activeTeacherCohortId)) {
          executeWithSecurity(openPicker, { title: '上一屆匯入需安全驗證' });
          return;
      }
      openPicker();
  }, [activeTeacherCohortId, canImportExcel, executeWithSecurity, isLegacyCohort, notifyPermissionDenied]);

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
      setDatesCohortId(activeTeacherCohortId);
      writeLocalCache(getCohortCacheKey(LOCAL_CACHE_KEYS.dates, activeTeacherCohortId), newList);
      setNewDateInput('');
      if (db) await setDoc(getCohortSettingsDocRef(activeTeacherCohortId, 'dates'), { list: newList }, { merge: true });
      appendOperationLog({
          kind: 'date',
          title: '新增考次',
          detail: normalizedInput
      });
      setStatusMsg(`已新增: ${normalizedInput}`); setTimeout(() => setStatusMsg(''), 2000);
  };

  const localComputedAverages = useMemo(() => {
      if (!shouldBuildTeacherLocalAverages) return EMPTY_OBJECT;
      const avgs = {};
      const validClassSet = activeTeacherClassIdSet;

      const createBuckets = () => {
          const buckets = { all: { t:0, c:0, e:0, m:0, count:0 } };
          activeTeacherClassDefs.forEach(c => {
              buckets[c.id] = { t:0, c:0, e:0, m:0, count:0 };
          });
          return buckets;
      };

      const groupsByWeekendID = {};

      deferredDatesForDerived.forEach(date => {
          const weekendID = getTestDateID(date);
          if (!weekendID) return;
          if (!groupsByWeekendID[weekendID]) {
              groupsByWeekendID[weekendID] = createBuckets();
          }
      });

      deferredStudentsForDerived.forEach((student) => {
          const weekendGrades = deferredStudentGradeMapsByStudentId[student.id] || EMPTY_OBJECT;
          Object.entries(weekendGrades).forEach(([weekendID, grade]) => {
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

      Object.keys(groupsByWeekendID).forEach((weekendID) => {
          const groups = groupsByWeekendID[weekendID] || createBuckets();
          avgs[weekendID] = {};

          Object.keys(groups).forEach(key => {
              const g = groups[key];
              if (g.count > 0) {
                  avgs[weekendID][key] = {
                      total: (g.t / g.count).toFixed(1),
                      chi: (g.c / g.count).toFixed(1),
                      eng: (g.e / g.count).toFixed(1),
                      math: (g.m / g.count).toFixed(1)
                  };
              }
          });
      });
      return avgs;
  }, [activeTeacherClassDefs, activeTeacherClassIdSet, deferredDatesForDerived, deferredStudentGradeMapsByStudentId, deferredStudentsForDerived, getTestDateID, shouldBuildTeacherLocalAverages]);

  const loadClassAverages = useCallback(async (options = {}) => {
      const force = Boolean(options && options.force);
      const cohortId = String(options?.cohortId || activeDataCohortId || LEGACY_COHORT_ID);
      const fallbackDates = getDefaultDatesForCohort(cohortId, cohortOptions);
      const datePool = sanitizeDateList(options?.datePool || (cohortId === datesCohortId ? availableDates : fallbackDates));
      const getDateIDForCohort = (dateStr) => resolveScopedDateId(dateStr, cohortId, datePool);
      if (
          !force
          && classAveragesLoadPromiseRef.current?.cohortId === cohortId
          && classAveragesLoadPromiseRef.current?.promise
      ) {
          return classAveragesLoadPromiseRef.current.promise;
      }

      const runner = async () => {
          const cacheKey = getCohortCacheKey(LOCAL_CACHE_KEYS.classAverages, cohortId);
          const computedAveragesForCohort =
              cohortId === activeTeacherCohortId && teacherStudentsCohortId === cohortId
                  ? localComputedAverages
                  : {};
          const cachedAverages = readLocalCache(cacheKey);
          if (cachedAverages && typeof cachedAverages === 'object' && !force) {
              const normalizedCache = normalizeClassAveragesByWeekend(cachedAverages, getDateIDForCohort);
              const mergedAverages = { ...computedAveragesForCohort, ...normalizedCache };
              if (cohortId === activeDataCohortId) {
                  setClassAverages(mergedAverages);
                  setClassAveragesCohortId(cohortId);
              }
              writeLocalCache(cacheKey, mergedAverages);
              return mergedAverages;
          }
          if (!db) {
              if (cohortId === activeDataCohortId) {
                  setClassAverages(computedAveragesForCohort);
                  setClassAveragesCohortId(cohortId);
              }
              writeLocalCache(cacheKey, computedAveragesForCohort);
              return computedAveragesForCohort;
          }
          try {
              const docSnap = await getDoc(getCohortSettingsDocRef(cohortId, 'class_averages_v18'));
              let dbAverages = {};
              if (docSnap.exists()) dbAverages = normalizeClassAveragesByWeekend(docSnap.data().averages || {}, getDateIDForCohort);
              const mergedAverages = { ...computedAveragesForCohort, ...dbAverages };
              if (cohortId === activeDataCohortId) {
                  setClassAverages(mergedAverages);
                  setClassAveragesCohortId(cohortId);
              }
              writeLocalCache(cacheKey, mergedAverages);
              return mergedAverages;
          } catch (e) {
              console.error('Load class averages error:', e);
              if (cohortId === activeDataCohortId) {
                  setClassAverages(computedAveragesForCohort);
                  setClassAveragesCohortId(cohortId);
              }
              writeLocalCache(cacheKey, computedAveragesForCohort);
              return computedAveragesForCohort;
          }
      };

      const promise = runner().finally(() => {
          if (
              classAveragesLoadPromiseRef.current?.cohortId === cohortId
              && classAveragesLoadPromiseRef.current?.promise === promise
          ) {
              classAveragesLoadPromiseRef.current = null;
          }
      });
      classAveragesLoadPromiseRef.current = { cohortId, promise };
      return promise;
  }, [activeDataCohortId, activeTeacherCohortId, availableDates, cohortOptions, datesCohortId, getCohortCacheKey, getCohortSettingsDocRef, localComputedAverages, resolveScopedDateId, teacherStudentsCohortId]);

  const teacherHydrationFnsRef = useRef({
      loadDates,
      loadClassAverages,
      loadAllStudents,
      loadTeacherMessage,
      loadQueryStats
  });
  const publicHydrationFnsRef = useRef({
      loadDates,
      loadClassAverages,
      loadTeacherMessage
  });

  useEffect(() => {
      teacherHydrationFnsRef.current = {
          loadDates,
          loadClassAverages,
          loadAllStudents,
          loadTeacherMessage,
          loadQueryStats
      };
      publicHydrationFnsRef.current = {
          loadDates,
          loadClassAverages,
          loadTeacherMessage
      };
  }, [loadAllStudents, loadClassAverages, loadDates, loadQueryStats, loadTeacherMessage]);

  useEffect(() => {
      if (!user || mode !== 'teacher' || !isAuthenticated) return;
      let cancelled = false;
      let idleHandle = null;
      const scheduleSecondaryHydration = (task) => {
          if (typeof window === 'undefined') return null;
          if (typeof window.requestIdleCallback === 'function') {
              return window.requestIdleCallback(task, { timeout: 1200 });
          }
          return window.setTimeout(task, 180);
      };
      const cancelSecondaryHydration = () => {
          if (idleHandle === null || typeof window === 'undefined') return;
          if (typeof window.cancelIdleCallback === 'function') {
              window.cancelIdleCallback(idleHandle);
          } else {
              window.clearTimeout(idleHandle);
          }
          idleHandle = null;
      };
      const hydrateTeacherCohort = async () => {
          const {
              loadDates: hydrateDates,
              loadClassAverages: hydrateClassAverages,
              loadAllStudents: hydrateStudents,
              loadTeacherMessage: hydrateMessage,
              loadQueryStats: hydrateStats
          } = teacherHydrationFnsRef.current;
          const cohortDates = await hydrateDates({ cohortId: activeTeacherCohortId });
          if (cancelled) return;
          await Promise.all([
              hydrateClassAverages({ cohortId: activeTeacherCohortId, datePool: cohortDates }),
              hydrateStudents({ cohortId: activeTeacherCohortId, datePool: cohortDates, silent: true })
          ]);
          if (cancelled) return;
          idleHandle = scheduleSecondaryHydration(() => {
              if (cancelled) return;
              void hydrateMessage({ cohortId: activeTeacherCohortId });
              void hydrateStats({ cohortId: activeTeacherCohortId });
          });
      };
      void hydrateTeacherCohort();
      return () => {
          cancelled = true;
          cancelSecondaryHydration();
      };
  }, [activeTeacherCohortId, isAuthenticated, mode, user]);

  useEffect(() => {
      if (!user || mode !== 'parent') return;
      let cancelled = false;
      const hydratePublicCohort = async () => {
          const {
              loadDates: hydrateDates,
              loadClassAverages: hydrateClassAverages,
              loadTeacherMessage: hydrateMessage
          } = publicHydrationFnsRef.current;
          const cohortDates = await hydrateDates({ cohortId: activePublicCohortId });
          if (cancelled) return;
          await Promise.all([
              hydrateClassAverages({ cohortId: activePublicCohortId, datePool: cohortDates }),
              hydrateMessage({ cohortId: activePublicCohortId })
          ]);
      };
      void hydratePublicCohort();
      return () => {
          cancelled = true;
      };
  }, [activePublicCohortId, mode, user]);

  useEffect(() => {
      if (deferredStudentsForDerived.length === 0) return undefined;
      if (classAveragesCohortId !== activeTeacherCohortId) return undefined;
      const timer = window.setTimeout(() => {
          startTransition(() => {
              setClassAverages(prev => {
                  const next = normalizeClassAveragesByWeekend({ ...prev, ...localComputedAverages }, getTestDateID);
                  writeLocalCache(getCohortCacheKey(LOCAL_CACHE_KEYS.classAverages, classAveragesCohortId), next);
                  return next;
              });
          });
      }, 220);
      return () => window.clearTimeout(timer);
  }, [activeTeacherCohortId, classAveragesCohortId, deferredStudentsForDerived.length, getCohortCacheKey, getTestDateID, localComputedAverages]);

  const handleManualAverageChange = (date, classId, subject, value) => {
      const weekendID = getTestDateID(date) || date;
      setClassAverages(prev => {
          const dateData = prev[weekendID] || {};
          const classData = dateData[classId] || { chi: '', eng: '', math: '', total: '' };
          const updatedClassData = { ...classData, [subject]: value };
          
          if (subject !== 'total') {
              updatedClassData.total = calculateTotal(
                  subject === 'chi' ? value : updatedClassData.chi,
                  subject === 'eng' ? value : updatedClassData.eng,
                  subject === 'math' ? value : updatedClassData.math
              );
          }
          return { ...prev, [weekendID]: { ...dateData, [classId]: updatedClassData } };
      });
      setIsClassAveragesDirty(true);
  };

  const persistClassAverages = useCallback(async (nextAverages, options = {}) => {
      const { closeModal = false, showToast = false, toastMessage = '設定已儲存' } = options;
      const cohortId = String(options?.cohortId || activeTeacherCohortId || LEGACY_COHORT_ID);
      const normalizedAverages = normalizeClassAveragesByWeekend(nextAverages, getTestDateID);
      writeLocalCache(getCohortCacheKey(LOCAL_CACHE_KEYS.classAverages, cohortId), normalizedAverages);
      if (!db) {
          if (closeModal) setShowAvgModal(false);
          return true;
      }
      try {
          await setDoc(getCohortSettingsDocRef(cohortId, 'class_averages_v18'), { averages: normalizedAverages });
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
  }, [activeTeacherCohortId, getCohortCacheKey, getCohortSettingsDocRef, getTestDateID]);

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

  const persistTeacherMessages = useCallback(async (nextGlobalMessage, nextByStudentMessages, options = {}) => {
      const cohortId = String(options?.cohortId || activeTeacherCohortId || LEGACY_COHORT_ID);
      const normalizedGlobal = String(nextGlobalMessage || '').trim();
      const normalizedByStudent = normalizeTeacherStudentMessages(nextByStudentMessages);
      const payload = {
          globalMessage: normalizedGlobal,
          byStudent: normalizedByStudent
      };
      writeLocalCache(getCohortCacheKey(LOCAL_CACHE_KEYS.teacherMessage, cohortId), payload);
      if (db) {
          const messageDocRef = getCohortSettingsDocRef(cohortId, TEACHER_MESSAGE_DOC_ID);
          await setDoc(messageDocRef, {
              globalMessage: normalizedGlobal,
              message: normalizedGlobal,
              byStudent: normalizedByStudent,
              updatedAt: new Date().toISOString(),
              updatedBy: user?.uid || ''
          });
      }
      return { normalizedGlobal, normalizedByStudent };
  }, [activeTeacherCohortId, getCohortCacheKey, getCohortSettingsDocRef, user]);

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
      if (hasPendingBatchChanges && !window.confirm('批量成績尚未儲存，刪除考次會直接移除目前未儲存內容，確定繼續嗎？')) {
          return;
      }
      if (hasPendingBatchChanges) {
          resetBatchDraftState();
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
      const targetWeekendID = getTestDateID(deleteTarget);
      if (!targetWeekendID) {
          setStatusMsg('刪除失敗：找不到目標考次');
          setTimeout(() => setStatusMsg(''), 2200);
          setDeleteTarget(null);
          return;
      }
      const newList = availableDates.filter((d) => getTestDateID(d) !== targetWeekendID);
      const nextStudents = [];
      const changedStudents = [];

      allStudentsData.forEach((student) => {
          let changed = false;
          const nextGrades = {};
          Object.entries(student?.grades || {}).forEach(([sourceDate, grade]) => {
              if (getTestDateID(sourceDate) === targetWeekendID) {
                  changed = true;
                  return;
              }
              nextGrades[sourceDate] = grade;
          });
          const nextStudent = changed ? { ...student, grades: nextGrades } : student;
          nextStudents.push(nextStudent);
          if (changed) changedStudents.push(nextStudent);
      });

      const nextClassAverages = Object.fromEntries(
          Object.entries(classAverages || {}).filter(([dateKey]) => String(dateKey) !== String(targetWeekendID))
      );
      const currentWeekendID = batchDate ? getTestDateID(batchDate) : '';
      const nextBatchDate = currentWeekendID === targetWeekendID
          ? (newList[newList.length - 1] || '')
          : batchDate;

      setStatusMsg('刪除考次中...');
      try {
          const nowIso = new Date().toISOString();
          if (db) {
              const writes = [
                  setDoc(getCohortSettingsDocRef(activeTeacherCohortId, 'dates'), { list: newList }, { merge: true }),
                  setDoc(getCohortSettingsDocRef(activeTeacherCohortId, 'class_averages_v18'), { averages: nextClassAverages, updatedAt: nowIso })
              ];
              changedStudents.forEach((student) => {
                  writes.push(
                      setDoc(
                          getCohortStudentDocRef(activeTeacherCohortId, student.id),
                          { id: student.id, name: student.name, grades: student.grades, lastUpdated: nowIso }
                      )
                  );
              });
              await Promise.all(writes);
          }

          if (changedStudents.length > 0) {
              await bumpStudentsVersion(activeTeacherCohortId);
          }

          setAvailableDates(newList);
          setDatesCohortId(activeTeacherCohortId);
          setAllStudentsData(nextStudents);
          setTeacherStudentsCohortId(activeTeacherCohortId);
          setClassAverages(nextClassAverages);
          setClassAveragesCohortId(activeTeacherCohortId);
          setBatchDate(nextBatchDate);
          if (activeTeacherCohortId === activePublicCohortId) {
              setCachedClassData(nextStudents);
              setPublicStudentsCohortId(activeTeacherCohortId);
          }
          setGrades((prev) => {
              const next = {};
              Object.entries(prev || {}).forEach(([sourceDate, grade]) => {
                  if (getTestDateID(sourceDate) === targetWeekendID) return;
                  next[sourceDate] = grade;
              });
              return next;
          });
          resetBatchDraftState();

          writeLocalCache(getCohortCacheKey(LOCAL_CACHE_KEYS.dates, activeTeacherCohortId), newList);
          writeLocalCache(getCohortCacheKey(LOCAL_CACHE_KEYS.students, activeTeacherCohortId), nextStudents);
          writeLocalCache(getCohortCacheKey(LOCAL_CACHE_KEYS.classAverages, activeTeacherCohortId), nextClassAverages);

          appendOperationLog({
              kind: 'danger',
              level: 'warn',
              title: '刪除考次',
              detail: `${targetWeekendID} / ${changedStudents.length} 位學生`
          });
          setStatusMsg(`已刪除考次: ${targetWeekendID}`);
          setTimeout(() => setStatusMsg(''), 2200);
          setDeleteTarget(null);
      } catch (error) {
          console.error('Delete date error:', error);
          setStatusMsg('刪除考次失敗');
          setTimeout(() => setStatusMsg(''), 2200);
      }
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
      } else { setLoginError(true); }
  };

  const handleLogout = () => {
      runWithBatchDiscardGuard(() => {
          setIsAuthenticated(false);
          setTeacherAuthRole(TEACHER_ROLE.FULL);
          localStorage.removeItem('teacher_auth');
          localStorage.removeItem('teacher_role');
          if (typeof window !== 'undefined') {
              sessionStorage.removeItem(getStudentSessionKey(activeTeacherCohortId));
          }
          setMode('landing');
      });
  };

  const handleSwitchTeacherCohort = useCallback((nextCohortId) => {
      const normalizedId = String(nextCohortId || '').trim();
      if (!normalizedId || normalizedId === activeTeacherCohortId) return;
      runWithBatchDiscardGuard(() => {
          const cachedBundle = getTeacherCohortCachedBundle(normalizedId);
          teacherCohortPreseedRef.current = cachedBundle.hasDisplayData ? normalizedId : '';
          startTransition(() => {
              setTeacherViewMode('batch');
              setBatchInsightTab('grades');
              if (cachedBundle.hasDisplayData) {
                  applyTeacherCohortCachedState(cachedBundle);
              }
              setActiveTeacherCohortId(normalizedId);
          });
      });
  }, [activeTeacherCohortId, applyTeacherCohortCachedState, getTeacherCohortCachedBundle, runWithBatchDiscardGuard]);

  const handleSetPublicCohort = useCallback(async (nextCohortId) => {
      const normalizedId = String(nextCohortId || '').trim();
      if (!normalizedId || normalizedId === activePublicCohortId) return;
      setPublicCohortSaving(true);
      try {
          if (db) {
              await setDoc(getCohortRegistryDocRef(), {
                  publicCohortId: normalizedId,
                  updatedAt: new Date().toISOString()
              }, { merge: true });
          }
          setActivePublicCohortId(normalizedId);
          setStatusMsg(`家長端已切換至 ${getCohortLabel(normalizedId)}`);
          setTimeout(() => setStatusMsg(''), 2200);
      } catch (error) {
          console.error('Set public cohort error:', error);
          setStatusMsg('切換家長端屆別失敗');
          setTimeout(() => setStatusMsg(''), 2200);
      } finally {
          setPublicCohortSaving(false);
      }
  }, [activePublicCohortId, getCohortLabel, getCohortRegistryDocRef]);

  useEffect(() => {
      if (mode !== 'parent' || !user) return;
      if (publicStudentsCohortId === activePublicCohortId && cachedClassData.length > 0) return;
      const cacheKey = getCohortCacheKey(LOCAL_CACHE_KEYS.students, activePublicCohortId);
      const cachedStudents = readLocalCache(cacheKey, STUDENT_CACHE_TTL_MS);
      if (!Array.isArray(cachedStudents) || cachedStudents.length === 0) return;
      setCachedClassData(cachedStudents);
      setPublicStudentsCohortId(activePublicCohortId);
  }, [activePublicCohortId, cachedClassData.length, getCohortCacheKey, mode, publicStudentsCohortId, user]);

  const persistLocalSnapshots = useCallback((nextSnapshots) => {
      const sanitized = sanitizeSnapshotList(nextSnapshots);
      setLocalSnapshots(sanitized);
      writeLocalCache(LOCAL_CACHE_KEYS.snapshots, sanitized);
      return sanitized;
  }, []);

  const handleCreateLocalSnapshot = useCallback(() => {
      if (mode !== 'teacher') return;
      const studentsPayload = allStudentsData.map((student) => ({
          id: student.id,
          name: student.name || '',
          grades: normalizeGrades(student.grades || {})
      }));
      const nowTs = Date.now();
      const snapshot = {
          id: `snapshot-${nowTs}`,
          ts: nowTs,
          label: `${formatMonitorDateTimeLabel(nowTs, false)} 快照`,
          payload: {
              dates: sanitizeDateList(availableDates),
              classAverages,
              students: studentsPayload,
              teacherGlobalMessage,
              teacherStudentMessages
          }
      };
      const nextSnapshots = [snapshot, ...localSnapshots].slice(0, MAX_LOCAL_SNAPSHOTS);
      persistLocalSnapshots(nextSnapshots);
      appendOperationLog({
          kind: 'snapshot',
          title: '建立本機快照',
          detail: `共 ${studentsPayload.length} 位學生，日期 ${snapshot.payload.dates.length} 筆`
      });
      setStatusMsg('已建立本機快照');
      setTimeout(() => setStatusMsg(''), 2000);
  }, [
      mode,
      allStudentsData,
      normalizeGrades,
      availableDates,
      classAverages,
      teacherGlobalMessage,
      teacherStudentMessages,
      localSnapshots,
      persistLocalSnapshots,
      appendOperationLog
  ]);

  const handleDeleteLocalSnapshot = useCallback((snapshotId) => {
      const normalizedId = String(snapshotId || '').trim();
      if (!normalizedId) return;
      const nextSnapshots = localSnapshots.filter((item) => item.id !== normalizedId);
      persistLocalSnapshots(nextSnapshots);
      appendOperationLog({
          kind: 'snapshot',
          title: '刪除本機快照',
          detail: normalizedId
      });
      setStatusMsg('已刪除快照');
      setTimeout(() => setStatusMsg(''), 1800);
  }, [localSnapshots, persistLocalSnapshots, appendOperationLog]);

  const handleRestoreLocalSnapshot = useCallback(async (snapshotId) => {
      if (!canEditStudentGrades) {
          notifyPermissionDenied('2491212 權限無法還原快照');
          return;
      }
      if (hasPendingBatchChanges && !window.confirm('目前有未儲存的批量修改，還原快照會覆蓋這些內容，確定繼續嗎？')) {
          return;
      }
      const target = localSnapshots.find((item) => item.id === snapshotId);
      if (!target) {
          setStatusMsg('找不到指定快照');
          setTimeout(() => setStatusMsg(''), 2000);
          return;
      }
      const payload = target.payload || {};
      const restoredDates = sanitizeDateList(payload.dates || []);
      const restoredStudents = Array.isArray(payload.students)
          ? payload.students
              .map((student) => ({
                  id: String(student?.id || '').toUpperCase().trim(),
                  name: String(student?.name || '').trim(),
                  grades: normalizeGrades(student?.grades || {})
              }))
              .filter((student) => student.id)
              .sort((a, b) => a.id.localeCompare(b.id))
          : [];
      const restoredAverages = normalizeClassAveragesByWeekend(payload.classAverages || {}, getTestDateID);
      const restoredGlobalMessage = String(payload.teacherGlobalMessage || '').trim();
      const restoredStudentMessages = normalizeTeacherStudentMessages(payload.teacherStudentMessages);
      const nextBatchDate = restoredDates.length
          ? (restoredDates[restoredDates.length - 1] || '')
          : '';
      const restoredStudentIdSet = new Set(restoredStudents.map((student) => String(student.id)));
      const deletedStudentIds = allStudentsData
          .map((student) => String(student?.id || '').trim())
          .filter((id) => id && !restoredStudentIdSet.has(id));

      setAvailableDates(restoredDates);
      setDatesCohortId(activeTeacherCohortId);
      writeLocalCache(getCohortCacheKey(LOCAL_CACHE_KEYS.dates, activeTeacherCohortId), restoredDates);

      setAllStudentsData(restoredStudents);
      setTeacherStudentsCohortId(activeTeacherCohortId);
      if (activeTeacherCohortId === activePublicCohortId) {
          setCachedClassData(restoredStudents);
          setPublicStudentsCohortId(activeTeacherCohortId);
      }
      writeLocalCache(getCohortCacheKey(LOCAL_CACHE_KEYS.students, activeTeacherCohortId), restoredStudents);
      resetBatchDraftState();

      setClassAverages(restoredAverages);
      setClassAveragesCohortId(activeTeacherCohortId);
      writeLocalCache(getCohortCacheKey(LOCAL_CACHE_KEYS.classAverages, activeTeacherCohortId), restoredAverages);

      setBatchDate(nextBatchDate);
      setTeacherGlobalMessage(restoredGlobalMessage);
      setTeacherGlobalMessageDraft(restoredGlobalMessage);
      setTeacherStudentMessages(restoredStudentMessages);
      setTeacherStudentMessageDrafts(restoredStudentMessages);
      setTeacherMessageCohortId(activeTeacherCohortId);

      if (db && user) {
          try {
              const nowIso = new Date().toISOString();
              await Promise.all([
                  ...restoredStudents.map((student) =>
                      setDoc(
                          getCohortStudentDocRef(activeTeacherCohortId, student.id),
                          {
                              id: student.id,
                              name: student.name || '',
                              grades: student.grades || {},
                              lastUpdated: nowIso
                          }
                      )
                  ),
                  ...deletedStudentIds.map((studentId) =>
                      deleteDoc(getCohortStudentDocRef(activeTeacherCohortId, studentId))
                  )
              ]);
              await setDoc(getCohortSettingsDocRef(activeTeacherCohortId, 'dates'), { list: restoredDates }, { merge: true });
              await setDoc(getCohortSettingsDocRef(activeTeacherCohortId, 'class_averages_v18'), { averages: restoredAverages });
              await setDoc(
                  getCohortSettingsDocRef(activeTeacherCohortId, TEACHER_MESSAGE_DOC_ID),
                  {
                      globalMessage: restoredGlobalMessage,
                      message: restoredGlobalMessage,
                      byStudent: restoredStudentMessages,
                      updatedAt: nowIso,
                      updatedBy: user?.uid || ''
                  }
              );
              await bumpStudentsVersion(activeTeacherCohortId);
          } catch (error) {
              console.error('Restore snapshot remote sync error:', error);
              setStatusMsg('已還原快照，但遠端同步失敗');
              setTimeout(() => setStatusMsg(''), 2400);
              return;
          }
      }

      appendOperationLog({
          kind: 'snapshot',
          title: '還原本機快照',
          detail: `${target.label}（${restoredStudents.length} 位學生）`
      });
      setStatusMsg('已還原快照');
      setTimeout(() => setStatusMsg(''), 2200);
  }, [activePublicCohortId, activeTeacherCohortId, allStudentsData, appendOperationLog, bumpStudentsVersion, canEditStudentGrades, getCohortCacheKey, getCohortSettingsDocRef, getCohortStudentDocRef, getTestDateID, hasPendingBatchChanges, localSnapshots, normalizeGrades, notifyPermissionDenied, resetBatchDraftState, user]);

  const loadStudentForTeacher = async (id, options = {}) => {
    if (!user) return;
    const cohortId = String(options?.cohortId || activeTeacherCohortId || LEGACY_COHORT_ID);
    const fallbackDates = getDefaultDatesForCohort(cohortId, cohortOptions);
    const effectiveDates = sanitizeDateList(options?.datePool || (cohortId === datesCohortId ? availableDates : fallbackDates));
    const getDateIDForCohort = (dateStr) => resolveScopedDateId(dateStr, cohortId, effectiveDates);
    setLoading(true);
    try {
      let data = null;
      if (db) {
          const docSnap = await getDoc(getCohortStudentDocRef(cohortId, id));
          if (docSnap.exists()) data = docSnap.data();
      }
      if (data) {
        setCurrentStudentId(data.id); setStudentName(data.name);
        const normalizedResult = normalizeGrades(data.grades, { withMeta: true, datePool: effectiveDates, getDateID: getDateIDForCohort });
        let loadedGrades = { ...normalizedResult.normalized };
        if (normalizedResult.changed && db) {
            setDoc(
                getCohortStudentDocRef(cohortId, data.id),
                { ...data, grades: normalizedResult.normalized, lastUpdated: new Date().toISOString() }
            ).catch((err) => console.error('Cleanup invalid student date error:', err));
        }
        effectiveDates.forEach(d => { 
             const weekendID = getDateIDForCohort(d);
             const existingGradeKey = Object.keys(loadedGrades).find(k => getDateIDForCohort(k) === weekendID);
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
        const gradesObj = {}; effectiveDates.forEach(d => gradesObj[d] = { chi: '', eng: '', math: '', total: '', class: 'A班' });
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

      const currentBatchInfo = currentBatchGradeInfoRef.current[studentId];
      const targetDate = currentBatchInfo?.sourceDate || selectedBatchWeekendID || batchDate;
      const currentDateGrades = currentBatchInfo?.grade || { chi: '', eng: '', math: '', total: '', class: teacherClassFilter || defaultTeacherClassId };
      let updatedDateGrades;
      if (subject === 'class') {
          updatedDateGrades = { ...currentDateGrades, class: value };
      } else {
          updatedDateGrades = { ...currentDateGrades, [subject]: value };
          updatedDateGrades.total = calculateTotal(
              subject === 'chi' ? value : updatedDateGrades.chi,
              subject === 'eng' ? value : updatedDateGrades.eng,
              subject === 'math' ? value : updatedDateGrades.math
          );
      }

      setBatchDraftGradesByStudentId((prev) => ({
          ...prev,
          [studentId]: {
              sourceDate: targetDate,
              grade: updatedDateGrades
          }
      }));
      batchDirtyStudentIdsRef.current.add(String(studentId));
      setIsBatchDirty(true);
  }, [batchDate, canEditStudentGrades, defaultTeacherClassId, notifyPermissionDenied, selectedBatchWeekendID, teacherClassFilter]); 

  const applyPreparedImportPayload = useCallback(async (payload) => {
      if (!payload || typeof payload !== 'object') return;
      const sortedDates = sanitizeDateList(payload.sortedDates || []);
      const touchedStudentIds = Array.isArray(payload.touchedStudentIds) ? payload.touchedStudentIds : [];
      const importCount = Number(payload.importCount) || 0;
      const skippedInvalidDateCount = Number(payload.skippedInvalidDateCount) || 0;
      const lastImportedDate = String(payload.lastImportedDate || '');
      const studentsMap = payload.studentsMap && typeof payload.studentsMap === 'object' ? payload.studentsMap : {};

      if (importCount <= 0) {
          setStatusMsg(skippedInvalidDateCount > 0 ? `匯入失敗：已略過 ${skippedInvalidDateCount} 筆日期錯誤資料` : '匯入失敗: 格式錯誤');
          setTimeout(() => setStatusMsg(''), 2200);
          return;
      }

      if (sortedDates.length) {
          setAvailableDates(sortedDates);
          setDatesCohortId(activeTeacherCohortId);
          writeLocalCache(getCohortCacheKey(LOCAL_CACHE_KEYS.dates, activeTeacherCohortId), sortedDates);
          if (db) {
              await setDoc(getCohortSettingsDocRef(activeTeacherCohortId, 'dates'), { list: sortedDates }, { merge: true });
          }
      }

      if (lastImportedDate) {
          setBatchDate(lastImportedDate);
      } else if (sortedDates.length > 0 && !batchDate) {
          const fallbackLatestWeekendID = getTestDateID(sortedDates[sortedDates.length - 1]) || sortedDates[sortedDates.length - 1];
          setBatchDate(fallbackLatestWeekendID);
      }

      const sortedStudents = Object.values(studentsMap).sort((a, b) => String(a.id || '').localeCompare(String(b.id || '')));
      const touchedIdSet = new Set(touchedStudentIds.map((id) => String(id)));
      const touchedStudents = sortedStudents.filter((student) => touchedIdSet.has(String(student.id || '')));

      if (db && touchedStudents.length > 0) {
          const nowIso = new Date().toISOString();
          await Promise.all(
              touchedStudents.map((student) =>
                  setDoc(
                      getCohortStudentDocRef(activeTeacherCohortId, student.id),
                      {
                          id: student.id,
                          name: student.name || '',
                          grades: student.grades || {},
                          lastUpdated: nowIso
                      }
                  )
              )
          );
          await bumpStudentsVersion(activeTeacherCohortId);
      }

      setAllStudentsData(sortedStudents);
      setTeacherStudentsCohortId(activeTeacherCohortId);
      if (activeTeacherCohortId === activePublicCohortId) {
          setCachedClassData(sortedStudents);
          setPublicStudentsCohortId(activeTeacherCohortId);
      }
      writeLocalCache(getCohortCacheKey(LOCAL_CACHE_KEYS.students, activeTeacherCohortId), sortedStudents);
      resetBatchDraftState();

      const invalidDateSuffix = skippedInvalidDateCount > 0 ? `，略過 ${skippedInvalidDateCount} 筆日期錯誤` : '';
      appendOperationLog({
          kind: 'import',
          title: '匯入 Excel 完成',
          detail: `${importCount} 筆，${touchedStudentIds.length} 位學生`
      });
      setStatusMsg(`已匯入並儲存 ${importCount} 筆資料${invalidDateSuffix} (最新日期: ${lastImportedDate})`);
      setTimeout(() => setStatusMsg(''), 2200);
  }, [activePublicCohortId, activeTeacherCohortId, appendOperationLog, batchDate, bumpStudentsVersion, getCohortCacheKey, getCohortSettingsDocRef, getCohortStudentDocRef, getTestDateID, resetBatchDraftState]);

  const handleConfirmImportPreview = useCallback(async () => {
      const payload = pendingImportPayloadRef.current;
      if (!payload || isApplyingImport) return;
      setIsApplyingImport(true);
      try {
          await applyPreparedImportPayload(payload);
          pendingImportPayloadRef.current = null;
          setImportPreview(null);
      } catch (error) {
          console.error('Apply import payload error:', error);
          appendOperationLog({
              kind: 'import',
              level: 'warn',
              title: '匯入 Excel 套用失敗',
              detail: String(error?.message || 'unknown-error')
          });
          setStatusMsg('匯入套用失敗');
          setTimeout(() => setStatusMsg(''), 2200);
      } finally {
          setIsApplyingImport(false);
      }
  }, [applyPreparedImportPayload, appendOperationLog, isApplyingImport]);

  const handleCancelImportPreview = useCallback(() => {
      pendingImportPayloadRef.current = null;
      setImportPreview(null);
      setStatusMsg('已取消匯入');
      setTimeout(() => setStatusMsg(''), 1500);
  }, []);

  const handleExcelUpload = async (e) => {
    if (!canImportExcel) {
        notifyPermissionDenied('目前權限無法匯入 Excel');
        return;
    }
    if (isLegacyCohort(activeTeacherCohortId) && Date.now() > legacyImportUnlockUntilRef.current) {
        setStatusMsg('上一屆匯入已鎖定，請先輸入安全碼');
        setTimeout(() => setStatusMsg(''), 2200);
        if (e?.target) e.target.value = '';
        return;
    }
    legacyImportUnlockUntilRef.current = 0;
    const file = e.target.files[0];
    if (!file) return;
    if (!window.XLSX) {
        setStatusMsg('Excel 模組載入中，請稍後');
        try {
            await ensureXlsxReady();
        } catch (error) {
            console.error('XLSX load error:', error);
            appendOperationLog({
                kind: 'import',
                level: 'warn',
                title: 'Excel 模組載入失敗',
                detail: String(error?.message || '')
            });
            setStatusMsg('Excel 模組載入失敗');
            setTimeout(() => setStatusMsg(''), 2000);
            return;
        }
    }

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const arrayBuffer = evt.target.result;
        const wb = window.XLSX.read(arrayBuffer, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = window.XLSX.utils.sheet_to_json(ws, { header: 1 });

        let headerRowIndex = -1;
        const colMap = { id: -1, name: -1, date: -1, chi: -1, eng: -1, math: -1, class: -1 };

        for (let i = 0; i < Math.min(data.length, 10); i++) {
            const row = data[i];
            const rowStr = row.map((c) => (c !== undefined && c !== null) ? String(c).trim() : '');

            if (rowStr.some((c) => c.includes('學號') || c.toUpperCase().includes('ID') || c.includes('姓名') || c.toUpperCase().includes('NAME'))) {
                headerRowIndex = i;
                rowStr.forEach((cell, idx) => {
                    const text = cell.replace(/\s+/g, '');
                    const lowerText = text.toLowerCase();
                    if (text.includes('學號') || lowerText === 'id' || lowerText.includes('studentid')) colMap.id = idx;
                    else if (text.includes('姓名') || lowerText.includes('name')) colMap.name = idx;
                    else if (text.includes('日期') || text.includes('測驗日')) colMap.date = idx;
                    else if (text.includes('班') || text.includes('類別')) colMap.class = idx;
                    else if (text.includes('國') && (text.includes('總') || text.includes('實得') || text.includes('Score') || text.includes('Total'))) colMap.chi = idx;
                    else if (text.includes('英') && (text.includes('總') || text.includes('實得') || text.includes('Score') || text.includes('Total'))) colMap.eng = idx;
                    else if (text.includes('數') && (text.includes('總') || text.includes('實得') || text.includes('Score') || text.includes('Total'))) colMap.math = idx;
                });
                if (colMap.chi === -1) rowStr.forEach((cell, idx) => { if (cell.includes('國') && colMap.chi === -1) colMap.chi = idx; });
                if (colMap.eng === -1) rowStr.forEach((cell, idx) => { if (cell.includes('英') && colMap.eng === -1) colMap.eng = idx; });
                if (colMap.math === -1) rowStr.forEach((cell, idx) => { if (cell.includes('數') && colMap.math === -1) colMap.math = idx; });
                break;
            }
        }

        if (headerRowIndex === -1 || colMap.id === -1) {
             headerRowIndex = 0;
             colMap.id = 0; colMap.name = 1; colMap.date = 2; colMap.chi = 3; colMap.eng = 4; colMap.math = 5;
        }

        const validClassSet = activeTeacherClassIdSet;
        const parseImportedClass = (rawValue) => {
            const rawClass = String(rawValue || '').trim().toUpperCase();
            if (!rawClass) return '';
            if (validClassSet.has(rawClass)) return rawClass;
            if (activeTeacherCohortId === NEXT_COHORT_ID && (rawClass.includes('東') || rawClass.includes('DONG') || rawClass.includes('EAST'))) return '東興';
            if (activeTeacherCohortId !== NEXT_COHORT_ID && (rawClass.includes('日') || rawClass.includes('SUN'))) return rawClass.includes('B') ? '日B班' : '日A班';
            if (rawClass.includes('C')) return 'C班';
            if (rawClass.includes('B')) return 'B班';
            if (rawClass.includes('A')) return 'A班';
            return '';
        };

        const newStudentsMap = allStudentsData.reduce((acc, student) => {
            acc[student.id] = { ...student, grades: { ...(student.grades || {}) } };
            return acc;
        }, {});
        const newDates = new Set(availableDates);
        const touchedStudentIds = new Set();
        const importedWeekendIds = new Set();
        const previewRows = [];
        let importCount = 0;
        let lastImportedDate = '';
        let skippedInvalidDateCount = 0;
        let tooManyDateAbort = false;

        for (let i = headerRowIndex + 1; i < data.length; i++) {
          const row = data[i];
          if (!row || row[colMap.id] === undefined) continue;

          const rawId = String(row[colMap.id] || '').toUpperCase().trim();
          if (!rawId || rawId.length > 15 || !/\d/.test(rawId)) continue;

          const rawName = colMap.name !== -1 && row[colMap.name] ? String(row[colMap.name]).trim() : '';

          let dateStr = '';
          if (colMap.date !== -1 && row[colMap.date]) {
              const rawDate = row[colMap.date];
              let dString = String(rawDate).trim().replace(/\./g, '/').replace(/-/g, '/');
              const parts = dString.split('/');
              if (parts.length >= 2) {
                  const m = parseInt(parts[parts.length - 2], 10);
                  const d = parseInt(parts[parts.length - 1], 10);
                  if (!isNaN(m) && !isNaN(d)) dateStr = `${String(m).padStart(2, '0')}/${String(d).padStart(2, '0')}`;
              } else if (dString.length === 3 || dString.length === 4) {
                  const m = dString.length === 3 ? dString.slice(0, 1) : dString.slice(0, 2);
                  const d = dString.slice(-2);
                  dateStr = `${String(m).padStart(2, '0')}/${String(d).padStart(2, '0')}`;
              } else {
                  dateStr = dString;
              }
          }

          const normalizedImportDate = normalizeDateToken(dateStr);
          if (!normalizedImportDate) {
              skippedInvalidDateCount += 1;
              continue;
          }

          const getVal = (idx) => {
              if (idx === -1 || row[idx] === undefined || row[idx] === null) return '';
              const val = String(row[idx]).trim();
              if (val === '') return '';
              const num = parseFloat(val);
              return isNaN(num) ? val : Math.round(num * 10) / 10;
          };

          const chi = getVal(colMap.chi);
          const eng = getVal(colMap.eng);
          const math = getVal(colMap.math);
          const importedClassName = parseImportedClass(colMap.class !== -1 ? row[colMap.class] : '');

          const weekendDatePool = [...availableDates, ...Array.from(newDates)];
          const weekendID = resolveScopedDateId(normalizedImportDate, activeTeacherCohortId, weekendDatePool);
          if (!weekendID) {
              skippedInvalidDateCount += 1;
              continue;
          }
          importedWeekendIds.add(weekendID);
          if (importedWeekendIds.size > 5) {
              tooManyDateAbort = true;
              break;
          }
          if (!newDates.has(weekendID)) newDates.add(weekendID);
          lastImportedDate = weekendID;

          let student = newStudentsMap[rawId];
          if (!student) {
              student = { id: rawId, name: rawName || '未命名', grades: {} };
              newStudentsMap[rawId] = student;
          } else if (rawName) {
              student.name = rawName;
          }

          const resolveFallbackClass = () => {
              const exactClass = student?.grades?.[normalizedImportDate]?.class;
              if (exactClass && validClassSet.has(exactClass)) return exactClass;
              const sameWeekendClass = Object.entries(student?.grades || {}).find(([date, grade]) => {
                  if (!grade?.class || !validClassSet.has(grade.class)) return false;
                  const normalizedDate = normalizeDateToken(date);
                  if (!normalizedDate) return false;
                  return resolveScopedDateId(normalizedDate, activeTeacherCohortId, weekendDatePool) === weekendID;
              })?.[1]?.class;
              if (sameWeekendClass) return sameWeekendClass;
              if (teacherClassFilter && validClassSet.has(teacherClassFilter)) return teacherClassFilter;
              return defaultTeacherClassId;
          };
          const className = importedClassName || resolveFallbackClass();
          const total = calculateTotal(chi, eng, math);

          student.grades[normalizedImportDate] = { chi, eng, math, total, class: className };
          touchedStudentIds.add(rawId);
          if (previewRows.length < MAX_IMPORT_PREVIEW_ROWS) {
              previewRows.push({
                  id: rawId,
                  name: rawName || student.name || '',
                  date: weekendID,
                  className,
                  chi,
                  eng,
                  math,
                  total
              });
          }
          importCount += 1;
        }

        if (tooManyDateAbort) {
            appendOperationLog({
                kind: 'import',
                level: 'warn',
                title: '匯入被阻擋（日期過多）',
                detail: file.name
            });
            setStatusMsg('匯入失敗：同一檔案包含超過 5 個不同測驗日期，已取消匯入');
            setTimeout(() => setStatusMsg(''), 2600);
            return;
        }

        if (importCount === 0) {
            appendOperationLog({
                kind: 'import',
                level: 'warn',
                title: '匯入失敗（無有效資料）',
                detail: file.name
            });
            setStatusMsg(skippedInvalidDateCount > 0 ? `匯入失敗：已略過 ${skippedInvalidDateCount} 筆日期錯誤資料` : '匯入失敗: 格式錯誤');
            setTimeout(() => setStatusMsg(''), 2200);
            return;
        }

        const sortedDates = Array.from(newDates).sort(customDateSort);
        pendingImportPayloadRef.current = {
            studentsMap: newStudentsMap,
            sortedDates,
            touchedStudentIds: Array.from(touchedStudentIds),
            importedDates: Array.from(importedWeekendIds).sort(customDateSort),
            importCount,
            skippedInvalidDateCount,
            lastImportedDate
        };
        setImportPreview({
            fileName: file.name,
            importCount,
            touchedStudentCount: touchedStudentIds.size,
            skippedInvalidDateCount,
            importedDateCount: importedWeekendIds.size,
            importedDates: Array.from(importedWeekendIds).sort(customDateSort),
            previewRows
        });
        appendOperationLog({
            kind: 'import',
            title: '匯入預檢完成',
            detail: `${file.name} / ${importCount} 筆`
        });
      } catch (error) {
          console.error(error);
          appendOperationLog({
              kind: 'import',
              level: 'warn',
              title: '匯入預檢失敗',
              detail: file.name
          });
          setStatusMsg('匯入失敗: 格式錯誤');
          setTimeout(() => setStatusMsg(''), 2200);
      } finally {
          if (e?.target) e.target.value = '';
      }
    };
    reader.readAsArrayBuffer(file);
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

  const handleKeyDown = useCallback((e, studentIndex, subject) => handleGridKeyDown(e, studentIndex, subject, 'batch', batchRowsForDisplayRef.current.length), [handleGridKeyDown]);
  const handleSingleKeyDown = useCallback(
      (e, dateIndex, subject) => handleGridKeyDown(e, dateIndex, subject, 'single', singleViewDateEntries.length),
      [singleViewDateEntries.length, handleGridKeyDown]
  );
  const handleAvgKeyDown = useCallback(
      (e, dateIndex, subject) => handleGridKeyDown(e, dateIndex, subject, 'avg', avgSettingsDateKeysDesc.length),
      [avgSettingsDateKeysDesc.length, handleGridKeyDown]
  );

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

      const nextDrafts = {};
      const changedIds = new Set();
      rows.forEach((row, rIndex) => {
          const studentIndex = startStudentIndex + rIndex;
          if (studentIndex >= batchRowsForDisplayRef.current.length) return;
          const targetRow = batchRowsForDisplayRef.current[studentIndex];
          if (!targetRow?.student?.id) return;

          const cols = row.split('\t');
          const currentBatchInfo = currentBatchGradeInfoRef.current[targetRow.student.id];
          const targetDate = currentBatchInfo?.sourceDate || selectedBatchWeekendID || batchDate;
          const currentDateGrades = { ...(currentBatchInfo?.grade || targetRow.dateGrades || { chi: '', eng: '', math: '', total: '', class: teacherClassFilter || defaultTeacherClassId }) };
          let rowUpdated = false;

          cols.forEach((val, cIndex) => {
              const subjectIndex = startSubjectIndex + cIndex;
              if (subjectIndex >= 3) return;
              const subject = subjects[subjectIndex];
              currentDateGrades[subject] = val.trim();
              rowUpdated = true;
          });

          if (!rowUpdated) return;
          currentDateGrades.total = calculateTotal(currentDateGrades.chi, currentDateGrades.eng, currentDateGrades.math);
          nextDrafts[targetRow.student.id] = {
              sourceDate: targetDate,
              grade: currentDateGrades
          };
          changedIds.add(targetRow.student.id);
      });

      if (!changedIds.size) return;

      setBatchDraftGradesByStudentId((prev) => ({ ...prev, ...nextDrafts }));
      changedIds.forEach((id) => batchDirtyStudentIdsRef.current.add(String(id)));
      setStatusMsg(`已貼上 ${changedIds.size} 筆資料`);
      setTimeout(() => setStatusMsg(''), 2000);
      setIsBatchDirty(true);
  }, [batchDate, canEditStudentGrades, defaultTeacherClassId, notifyPermissionDenied, selectedBatchWeekendID, teacherClassFilter]);

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
      const reversedDates = singleViewDateKeys;

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
      const reversedDates = avgSettingsDateKeysDesc;

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

  const handleDeleteStudent = () => {
    if (!canEditStudentGrades) {
        notifyPermissionDenied('2491212 權限無法刪除學生資料');
        return;
    }
    if (currentStudentId) setStudentToDelete({ id: currentStudentId, name: studentName });
  };
  const confirmDeleteStudent = async () => {
    if (!canEditStudentGrades) {
        notifyPermissionDenied('2491212 權限無法刪除學生資料');
        setStudentToDelete(null);
        return;
    }
    if (!studentToDelete) return;
    try {
        if (db) await deleteDoc(getCohortStudentDocRef(activeTeacherCohortId, studentToDelete.id));
        await bumpStudentsVersion(activeTeacherCohortId);
        const nextStudents = allStudentsData.filter((s) => s.id !== studentToDelete.id);
        setAllStudentsData(nextStudents);
        setTeacherStudentsCohortId(activeTeacherCohortId);
        if (activeTeacherCohortId === activePublicCohortId) {
            setCachedClassData(nextStudents);
            setPublicStudentsCohortId(activeTeacherCohortId);
        }
        writeLocalCache(getCohortCacheKey(LOCAL_CACHE_KEYS.students, activeTeacherCohortId), nextStudents);
        setCurrentStudentId(null); setStudentName(''); setGrades({});
        appendOperationLog({
            kind: 'danger',
            level: 'warn',
            title: '刪除學生資料',
            detail: `${studentToDelete.id} ${studentToDelete.name || ''}`.trim()
        });
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
      if (db) await setDoc(getCohortStudentDocRef(activeTeacherCohortId, currentStudentId), { id: currentStudentId, name: studentName, grades: grades, lastUpdated: new Date().toISOString() });
      await bumpStudentsVersion(activeTeacherCohortId);
      const savedStudent = { id: currentStudentId, name: studentName, grades };
      const exists = allStudentsData.find((s) => s.id === currentStudentId);
      const nextStudents = exists
          ? allStudentsData.map((s) => (s.id === currentStudentId ? { ...s, name: studentName, grades } : s))
          : [...allStudentsData, savedStudent].sort((a, b) => a.id.localeCompare(b.id));
      setAllStudentsData(nextStudents);
      setTeacherStudentsCohortId(activeTeacherCohortId);
      if (activeTeacherCohortId === activePublicCohortId) {
          setCachedClassData(nextStudents);
          setPublicStudentsCohortId(activeTeacherCohortId);
      }
      writeLocalCache(getCohortCacheKey(LOCAL_CACHE_KEYS.students, activeTeacherCohortId), nextStudents);
      appendOperationLog({
          kind: 'save',
          title: '儲存個人檔案',
          detail: `${currentStudentId} ${studentName}`.trim()
      });
      setStatusMsg('儲存成功'); setTimeout(() => setStatusMsg(''), 2000);
    } catch (e) {
      console.error('Save grades error:', e);
      appendOperationLog({
          kind: 'save',
          level: 'warn',
          title: '儲存個人檔案失敗',
          detail: String(currentStudentId || '')
      });
      setStatusMsg('儲存失敗');
    }
  };

  const handleSaveBatchGrades = async () => {
      if (!canEditStudentGrades) {
          notifyPermissionDenied('2491212 權限無法修改學生成績');
          return;
      }
      const dirtyIdSet = new Set(Array.from(batchDirtyStudentIdsRef.current));
      const nextStudents = allStudentsData.map((student) => {
          const draft = batchDraftGradesByStudentId[student.id];
          if (!draft) return student;
          return {
              ...student,
              grades: {
                  ...(student.grades || {}),
                  [draft.sourceDate]: draft.grade
              }
          };
      });
      const dirtyStudents = nextStudents.filter((student) => dirtyIdSet.has(String(student.id)));
      if (dirtyStudents.length === 0) {
          resetBatchDraftState();
          setStatusMsg('沒有變更需要儲存');
          setTimeout(() => setStatusMsg(''), 1800);
          return;
      }
      setStatusMsg("批次儲存中...");
      try {
          const nowIso = new Date().toISOString();
          if (db) {
              const batchPromises = dirtyStudents.map((student) =>
                  setDoc(
                      getCohortStudentDocRef(activeTeacherCohortId, student.id),
                      { id: student.id, name: student.name, grades: student.grades, lastUpdated: nowIso }
                  )
              );
              await Promise.all(batchPromises);
          }
          await bumpStudentsVersion(activeTeacherCohortId);
          setAllStudentsData(nextStudents);
          setTeacherStudentsCohortId(activeTeacherCohortId);
          if (activeTeacherCohortId === activePublicCohortId) {
              setCachedClassData(nextStudents);
              setPublicStudentsCohortId(activeTeacherCohortId);
          }
          writeLocalCache(getCohortCacheKey(LOCAL_CACHE_KEYS.students, activeTeacherCohortId), nextStudents);
          resetBatchDraftState();
          appendOperationLog({
              kind: 'save',
              title: '批次儲存完成',
              detail: `${dirtyStudents.length} 位學生`
          });
          setStatusMsg(`已儲存 ${dirtyStudents.length} 位學生`);
          setTimeout(() => setStatusMsg(''), 2000);
      } catch (e) {
          console.error('Save batch grades error:', e);
          appendOperationLog({
              kind: 'save',
              level: 'warn',
              title: '批次儲存失敗',
              detail: String(dirtyStudents.length)
          });
          setStatusMsg("儲存失敗");
      }
  };

  const parentSearchScoreContext = useMemo(() => {
      if (!deferredParentClassData.length || !parentSortedAvailableDatesAsc.length) return null;
      return buildProbabilityContext(deferredParentClassData, parentSortedAvailableDatesAsc, parentGetTestDateID);
  }, [deferredParentClassData, parentGetTestDateID, parentSortedAvailableDatesAsc]);

  const cachedParentDateSignature = useMemo(
      () => sortedAvailableDatesAsc.join('|'),
      [sortedAvailableDatesAsc]
  );

  const cachedParentClassSignature = useMemo(
      () => buildClassContextSignature(cachedClassData, getTestDateID),
      [cachedClassData, getTestDateID]
  );

  const cachedParentClassAverageSignature = useMemo(
      () => buildClassAveragesSignature(sortedAvailableDatesAsc, classAverages, getTestDateID),
      [sortedAvailableDatesAsc, classAverages, getTestDateID]
  );

  const cachedParentVersionBase = useMemo(
      () => hashFingerprint([cachedParentDateSignature, cachedParentClassSignature, cachedParentClassAverageSignature].join('||')),
      [cachedParentDateSignature, cachedParentClassSignature, cachedParentClassAverageSignature]
  );

  const cachedParentStudentSignatureById = useMemo(() => {
      const signatureById = {};
      cachedClassData.forEach((student) => {
          const normalizedId = String(student?.id || '').toUpperCase().trim();
          if (!normalizedId) return;
          signatureById[normalizedId] = buildStudentGradesSignature(student, getTestDateID);
      });
      return signatureById;
  }, [cachedClassData, getTestDateID]);

  const getCachedStudentsForParentSearch = useCallback((cohortId) => {
      const normalizedId = String(cohortId || LEGACY_COHORT_ID);
      if (publicStudentsCohortId === normalizedId && cachedClassData.length > 0) {
          return cachedClassData;
      }
      if (teacherStudentsCohortId === normalizedId && allStudentsData.length > 0) {
          return allStudentsData;
      }
      const localCachedStudents = readLocalCache(
          getCohortCacheKey(LOCAL_CACHE_KEYS.students, normalizedId),
          STUDENT_CACHE_TTL_MS
      );
      return Array.isArray(localCachedStudents) && localCachedStudents.length > 0
          ? localCachedStudents
          : [];
  }, [allStudentsData, cachedClassData, getCohortCacheKey, publicStudentsCohortId, teacherStudentsCohortId]);

  const handleParentSearch = async () => {
    if (!searchId.trim()) return;
    if (!user) {
      setSearchError('系統連線中，請稍候再查詢');
      setParentSearchShell(null);
      return;
    }
    const searchStartTs = performance.now();
    setSearchError('');
    setViewData(null);
    setParentViewContext({
        cohortId: '',
        dates: [],
        classData: [],
        classAverages: {},
        teacherMessage: { globalMessage: '', byStudent: {} }
    });
    setLoading(true);
    try {
      const rawSearchKeyword = searchId.trim();
      const normalizedSearchId = rawSearchKeyword.toUpperCase();
      const likelyStudentId = /^[A-Z0-9_-]{3,24}$/.test(normalizedSearchId);
      if (!likelyStudentId) {
          setSearchError('請輸入正確學號');
          setParentSearchShell(null);
          updateParentQueryPerf(performance.now() - searchStartTs, false);
          return;
      }
      setParentSearchShell({ id: normalizedSearchId });
      let resolvedSearch = null;

      for (const cohortId of parentSearchCohortOrder) {
          const quickClassData = getCachedStudentsForParentSearch(cohortId);
          if (quickClassData.length > 0) {
              const matchedStudent = findStudentById(quickClassData, normalizedSearchId);
              if (matchedStudent) {
                  const cachedDatePool = sanitizeDateList(
                      readLocalCache(getCohortCacheKey(LOCAL_CACHE_KEYS.dates, cohortId)) || getDefaultDatesForCohort(cohortId, cohortOptions)
                  );
                  const getCachedDateID = (dateStr) => resolveScopedDateId(dateStr, cohortId, cachedDatePool);
                  const normalizedQuickStudent = {
                      ...matchedStudent,
                      grades: normalizeGrades(matchedStudent.grades, {
                          cohortId,
                          datePool: cachedDatePool,
                          getDateID: getCachedDateID
                      })
                  };

                  if (!hasDisplayableGradeHistory(normalizedQuickStudent.grades)) {
                      continue;
                  }

                  resolvedSearch = {
                      cohortId,
                      data: normalizedQuickStudent,
                      fullClassData: []
                  };
                  break;
              }
          }

          if (db && likelyStudentId) {
              const cachedDatePool = sanitizeDateList(
                  readLocalCache(getCohortCacheKey(LOCAL_CACHE_KEYS.dates, cohortId)) || getDefaultDatesForCohort(cohortId, cohortOptions)
              );
              const getCachedDateID = (dateStr) => resolveScopedDateId(dateStr, cohortId, cachedDatePool);
              const docRef = getCohortStudentDocRef(cohortId, normalizedSearchId);
              const docSnap = await getDoc(docRef);
              if (docSnap.exists()) {
                  const rawData = docSnap.data();
                  const normalizedResult = normalizeGrades(rawData.grades, {
                      withMeta: true,
                      cohortId,
                      datePool: cachedDatePool,
                      getDateID: getCachedDateID
                  });
                  const normalizedStudent = { ...rawData, grades: normalizedResult.normalized };
                  if (normalizedResult.changed && rawData.id) {
                      void setDoc(
                          getCohortStudentDocRef(cohortId, rawData.id),
                          { ...rawData, grades: normalizedResult.normalized, lastUpdated: new Date().toISOString() }
                      ).catch((err) => console.error('Parent search cleanup invalid date error:', err));
                  }
                  resolvedSearch = {
                      cohortId,
                      data: normalizedStudent,
                      fullClassData: []
                  };
                  break;
              }
              continue;
          }
      }

      if (!resolvedSearch) {
          setSearchError('查無此學號');
          setParentSearchShell(null);
          updateParentQueryPerf(performance.now() - searchStartTs, false);
          return;
      }

      const {
          cohortId: foundCohortId,
          data: matchedStudent,
          fullClassData
      } = resolvedSearch;

      const loadedDates = datesCohortId === foundCohortId && sortedAvailableDatesAsc.length > 0
          ? sortedAvailableDatesAsc
          : await loadDates({ cohortId: foundCohortId });
      const getSearchDateID = (dateStr, datePool = loadedDates) => resolveScopedDateId(dateStr, foundCohortId, datePool);
      const [contextData, teacherMessagePayload] = await Promise.all([
          fullClassData.length > 0
              ? Promise.resolve(fullClassData)
              : loadParentSearchStudents(foundCohortId, { datePool: loadedDates }),
          loadTeacherMessage({ cohortId: foundCohortId, hydrateState: false })
      ]);
      const derivedSearchDates = deriveDatePoolFromStudents(contextData);
      const sortedDates = mergeDatePools(loadedDates, derivedSearchDates);
      const effectiveDatePool = sortedDates.length ? sortedDates : loadedDates;
      const effectiveClassAverages = await loadClassAverages({ cohortId: foundCohortId, datePool: effectiveDatePool });
      writeLocalCache(getCohortCacheKey(LOCAL_CACHE_KEYS.dates, foundCohortId), effectiveDatePool);
      const data = contextData.find((student) => String(student?.id || '').toUpperCase() === String(matchedStudent?.id || '').toUpperCase()) || matchedStudent;
      const weekendOrder = new Map();
      effectiveDatePool.forEach((date, index) => {
          const weekendID = getSearchDateID(date, effectiveDatePool);
          if (weekendID && !weekendOrder.has(weekendID)) {
              weekendOrder.set(weekendID, index);
          }
      });
      if (foundCohortId === activePublicCohortId) {
          setAvailableDates(effectiveDatePool);
          setDatesCohortId(foundCohortId);
          setClassAverages(effectiveClassAverages);
          setClassAveragesCohortId(foundCohortId);
          setCachedClassData(contextData);
          setPublicStudentsCohortId(foundCohortId);
      }
      const nextParentViewContext = {
          cohortId: foundCohortId,
          dates: effectiveDatePool,
          classData: contextData,
          classAverages: effectiveClassAverages,
          teacherMessage: teacherMessagePayload && typeof teacherMessagePayload === 'object'
              ? {
                  globalMessage: String(teacherMessagePayload.globalMessage || '').trim(),
                  byStudent: normalizeTeacherStudentMessages(teacherMessagePayload.byStudent)
              }
              : { globalMessage: '', byStudent: {} }
      };
      setParentViewContext(nextParentViewContext);

      const cacheStudentId = String(data.id || '').toUpperCase();
      const cacheStudentKey = `${foundCohortId}::${cacheStudentId}`;
      const hasPublicCachedStudents = publicStudentsCohortId === foundCohortId && cachedClassData.length > 0;
      const shouldReuseCachedVersionBase =
          foundCohortId === activePublicCohortId
          && hasPublicCachedStudents
          && contextData === cachedClassData
          && datesCohortId === activePublicCohortId
          && classAveragesCohortId === activePublicCohortId
          && effectiveDatePool === sortedAvailableDatesAsc;
      const parentQueryDataVersion = shouldReuseCachedVersionBase
          ? hashFingerprint(`${cachedParentVersionBase}||${cachedParentStudentSignatureById[cacheStudentId] || buildStudentGradesSignature(data, (dateStr) => getSearchDateID(dateStr, effectiveDatePool))}`)
          : buildParentQueryDataVersion({
              student: data,
              classData: contextData,
              dates: effectiveDatePool,
              classAveragesMap: effectiveClassAverages,
              getDateID: (dateStr) => getSearchDateID(dateStr, effectiveDatePool)
          });
      const cachedView = readParentQueryCache(cacheStudentKey, parentQueryDataVersion);
      if (cachedView) {
          setParentViewContext(nextParentViewContext);
          if (Array.isArray(cachedView.chartData) && cachedView.chartData.length > 0) {
              const latestCached = cachedView.chartData[cachedView.chartData.length - 1];
              setActivePhase(resolvePhaseByDate(latestCached.weekendID || latestCached.date, effectiveDatePool));
          }
          setViewData(cachedView);
          incrementQueryCount(data.id, foundCohortId);
          updateParentQueryPerf(performance.now() - searchStartTs, true);
          return;
      }

      const allChartData = [];

      if (data.grades) {
          const weekendGradeEntries = buildWeekendGradeEntryMap(data.grades, (dateStr) => getSearchDateID(dateStr, effectiveDatePool));
          if (Object.keys(weekendGradeEntries).length === 0) {
              Object.entries(data.grades || {}).forEach(([sourceDate, grade]) => {
                  const normalizedSourceDate = normalizeDateToken(sourceDate);
                  if (!normalizedSourceDate) return;
                  const weekendID = getSearchDateID(normalizedSourceDate, effectiveDatePool) || normalizedSourceDate;
                  if (!weekendID) return;
                  if (!weekendGradeEntries[weekendID]) {
                      weekendGradeEntries[weekendID] = {
                          sourceDate: normalizedSourceDate,
                          grade: normalizeStudentGrade(grade)
                      };
                  }
              });
          }
          Object.keys(weekendGradeEntries)
              .sort(customDateSort)
              .forEach((weekendID) => {
                  if (!weekendOrder.has(weekendID)) {
                      weekendOrder.set(weekendID, weekendOrder.size);
                  }
              });
          Object.entries(weekendGradeEntries).forEach(([weekendID, entry]) => {
              const weekData = normalizeStudentGrade(entry.grade);
              const t =
                  toNumberOrNull(weekData.total)
                  ?? toNumberOrNull(calculateTotal(weekData.chi, weekData.eng, weekData.math));
              const hasAnyScore =
                  t !== null
                  || SCORE_KEYS.some((key) => toNumberOrNull(weekData[key]) !== null);
              if (!hasAnyScore) return;

              const weekClass = weekData.class || 'A班';
              const avgData = (effectiveClassAverages[weekendID] && effectiveClassAverages[weekendID][weekClass])
                  ? effectiveClassAverages[weekendID][weekClass]
                  : {};
              const avgAllData = (effectiveClassAverages[weekendID] && effectiveClassAverages[weekendID].all)
                  ? effectiveClassAverages[weekendID].all
                  : {};
              const resolveAverageValue = (primaryValue, fallbackValue) => {
                  const primaryNumber = toNumberOrNull(primaryValue);
                  if (primaryNumber !== null) return primaryNumber;
                  return toNumberOrNull(fallbackValue);
              };

              const displayDate = normalizeDateToken(entry.sourceDate) || weekendID;

              allChartData.push({
                  date: displayDate,
                  weekendID,
                  total: t ?? 0,
                  chi: toNumberOrNull(weekData.chi) ?? 0,
                  eng: toNumberOrNull(weekData.eng) ?? 0,
                  math: toNumberOrNull(weekData.math) ?? 0,
                  avgTotal: resolveAverageValue(avgData.total, avgAllData.total),
                  avgChi: resolveAverageValue(avgData.chi, avgAllData.chi),
                  avgEng: resolveAverageValue(avgData.eng, avgAllData.eng),
                  avgMath: resolveAverageValue(avgData.math, avgAllData.math),
                  avgAllTotal: toNumberOrNull(avgAllData.total),
                  avgAllChi: toNumberOrNull(avgAllData.chi),
                  avgAllEng: toNumberOrNull(avgAllData.eng),
                  avgAllMath: toNumberOrNull(avgAllData.math),
                  class: weekClass
              });
          });
      }

      allChartData.sort((a, b) => {
          const indexA = weekendOrder.has(a.weekendID) ? weekendOrder.get(a.weekendID) : Number.POSITIVE_INFINITY;
          const indexB = weekendOrder.has(b.weekendID) ? weekendOrder.get(b.weekendID) : Number.POSITIVE_INFINITY;
          if (indexA === indexB) return 0;
          return indexA - indexB;
      });

      const avg = allChartData.length > 0 ? (allChartData.reduce((sum, item) => sum + item.total, 0) / allChartData.length).toFixed(1) : 0;
      let studentProb = '-';

      if (contextData.length > 0) {
          const shouldReuseParentContext =
              foundCohortId === activePublicCohortId
              && sortedAvailableDatesAsc.length > 0
              && effectiveDatePool === sortedAvailableDatesAsc
              && publicStudentsCohortId === activePublicCohortId
              && datesCohortId === activePublicCohortId;
          const scoreContext = shouldReuseParentContext && parentSearchScoreContext
              ? parentSearchScoreContext
              : buildProbabilityContext(contextData, effectiveDatePool, (dateStr) => getSearchDateID(dateStr, effectiveDatePool));

          const studentGradeMap = { [data.id]: {} };
          const weekendEntries = buildWeekendGradeEntryMap(data.grades, (dateStr) => getSearchDateID(dateStr, effectiveDatePool));
          Object.entries(weekendEntries).forEach(([weekendID, entry]) => {
              studentGradeMap[data.id][weekendID] = entry.grade;
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

      if (allChartData.length > 0) {
          const latestChartData = allChartData[allChartData.length - 1];
          setActivePhase(resolvePhaseByDate(latestChartData.weekendID || latestChartData.date, effectiveDatePool));
      }
      const nextViewData = { ...data, chartData: allChartData, average: avg, prob: studentProb, cohortId: foundCohortId };
      setViewData(nextViewData);
      writeParentQueryCache(cacheStudentKey, parentQueryDataVersion, nextViewData);
      incrementQueryCount(data.id, foundCohortId);
      updateParentQueryPerf(performance.now() - searchStartTs, false);
    } catch (e) {
      console.error('Parent search error:', e);
      setSearchError('系統忙碌');
      setParentSearchShell(null);
      updateParentQueryPerf(performance.now() - searchStartTs, false);
    } finally {
      setParentSearchShell(null);
      setLoading(false);
    }
  };

  const shouldBuildParentAnalytics = mode === 'parent' && Boolean(viewData?.chartData);

  const parentPhaseData = useMemo(() => {
      if (!shouldBuildParentAnalytics) return [];
      return viewData.chartData.filter((d) => {
          const dateKey = d.weekendID || parentGetTestDateID(d.date);
          return resolvePhaseByDate(dateKey, parentSortedAvailableDatesAsc) === activePhase;
      });
  }, [shouldBuildParentAnalytics, viewData, activePhase, parentGetTestDateID, parentSortedAvailableDatesAsc]);
  const deferredParentPhaseData = useDeferredValue(parentPhaseData);

  const allSubjectScoresByWeekend = useMemo(() => {
      const buckets = {};
      if (!shouldBuildParentAnalytics || !deferredParentClassData.length) return buckets;

      deferredParentClassData.forEach((student) => {
          const weekendEntries = buildWeekendGradeEntryMap(student.grades, parentGetTestDateID);
          Object.entries(weekendEntries).forEach(([weekendID, entry]) => {
              const grade = entry.grade;
              if (!weekendID) return;
              if (!buckets[weekendID]) {
                  buckets[weekendID] = { chi: [], eng: [], math: [] };
              }

              ['chi', 'eng', 'math'].forEach((subject) => {
                  const score = toNumberOrNull(grade?.[subject]);
                  if (score !== null) buckets[weekendID][subject].push(score);
              });
          });
      });

      Object.values(buckets).forEach((bySubject) => {
          ['chi', 'eng', 'math'].forEach((subject) => {
              bySubject[subject].sort((a, b) => b - a);
          });
      });

      return buckets;
  }, [deferredParentClassData, parentGetTestDateID, shouldBuildParentAnalytics]);

  const parentRadarData = useMemo(() => {
      if (!deferredParentPhaseData.length) return [];
      const fallbackAvgKeyBySubject = {
          chi: 'avgAllChi',
          eng: 'avgAllEng',
          math: 'avgAllMath'
      };

      const summarize = (label, scoreKey) => {
          const selfValues = deferredParentPhaseData
              .map((item) => parseFloat(item[scoreKey]))
              .filter((v) => !isNaN(v));
          const benchmarkValues = deferredParentPhaseData
              .map((item) => {
                  const weekendID = item.weekendID || parentGetTestDateID(item.date);
                  const scoreList = allSubjectScoresByWeekend[weekendID]?.[scoreKey] || [];
                  const medianScore = resolveMedianScore(scoreList);
                  if (medianScore !== null) return medianScore;
                  const fallbackAvg = toNumberOrNull(item[fallbackAvgKeyBySubject[scoreKey]]);
                  return fallbackAvg;
              })
              .filter((v) => v !== null);

          const selfMean = selfValues.length ? selfValues.reduce((sum, v) => sum + v, 0) / selfValues.length : 0;
          const benchmarkMean = benchmarkValues.length ? benchmarkValues.reduce((sum, v) => sum + v, 0) / benchmarkValues.length : 0;

          return {
              subject: label,
              student: Number(selfMean.toFixed(1)),
              classAvg: Number(benchmarkMean.toFixed(1))
          };
      };

      return [
          summarize('國文', 'chi'),
          summarize('英文', 'eng'),
          summarize('數學', 'math')
      ];
  }, [deferredParentPhaseData, allSubjectScoresByWeekend, parentGetTestDateID]);
  const deferredParentRadarData = useDeferredValue(parentRadarData);

  const parentRadarMax = useMemo(() => {
      const values = deferredParentRadarData
          .flatMap((item) => [item.student, item.classAvg])
          .filter((v) => !isNaN(v));

      if (!values.length) return 100;

      const maxValue = Math.max(...values, 80);
      return Math.min(120, Math.ceil(maxValue / 10) * 10);
  }, [deferredParentRadarData]);

  const activePhaseLabel = useMemo(() => {
      const phase = PHASES.find((item) => item.id === activePhase);
      return phase ? phase.name : '';
  }, [activePhase]);

  const parentPhaseDataDesc = useMemo(
      () => [...deferredParentPhaseData].reverse(),
      [deferredParentPhaseData]
  );

  // 預先為每個週末 / 班級 / 科目建立排序好的成績索引，避免在畫面 render 時重複掃描全班資料
  const scoreIndexByWeekendAndClass = useMemo(() => {
      const index = {};

      if (!shouldBuildParentAnalytics || !deferredParentClassData.length) return index;

      deferredParentClassData.forEach(student => {
          const weekendEntries = buildWeekendGradeEntryMap(student.grades, parentGetTestDateID);
          Object.entries(weekendEntries).forEach(([weekendId, entry]) => {
              const g = entry.grade;
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
  }, [deferredParentClassData, parentGetTestDateID, shouldBuildParentAnalytics]);

  const distributionProfileByWeekendClass = useMemo(() => {
      const profile = {};
      if (!shouldBuildParentAnalytics) return profile;

      Object.entries(scoreIndexByWeekendAndClass).forEach(([weekendID, byClass]) => {
          profile[weekendID] = {};

          Object.entries(byClass).forEach(([classKey, bySubject]) => {
              profile[weekendID][classKey] = {};

              ['total', 'chi', 'eng', 'math'].forEach((subject) => {
                  const maxScore = getMaxScore(weekendID, subject, parentAvailableDates);
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
  }, [parentAvailableDates, shouldBuildParentAnalytics, scoreIndexByWeekendAndClass]);

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
      if (!parentClassData.length || !myScore) return '-';
      const myVal = parseFloat(myScore);
      if (isNaN(myVal)) return '-';
      
      const targetClass = myClass || 'A班';
      const currentWeekendID = parentGetTestDateID(date);

      const rankLookup = rankLookupByWeekendClassSubject[currentWeekendID]?.[targetClass]?.[subject];
      if (!rankLookup) return '-';

      const rank = rankLookup[myVal];
      return rank !== undefined ? rank : '-';
  };

  // 計算「本部全部學生」的 PR（需樣本數達門檻）
  const calculateGlobalPR = (date, subject, myScore) => {
      if (!parentClassData.length || !myScore) return '-';
      const myVal = parseFloat(myScore);
      if (isNaN(myVal)) return '-';

      const currentWeekendID = parentGetTestDateID(date);
      const lookup = globalPRLookupByWeekendSubject[currentWeekendID]?.[subject];
      if (!lookup) return null;

      const pr = lookup.get(myVal);
      return pr !== undefined ? pr : '-';
  };

  // 計算某次測驗的成績分布，用於家長端的「落點分析」長條圖
  const calculateDistribution = (date, subject, myScore, allDates, myClass) => {
      if (!parentClassData.length) return [];
      const myVal = parseFloat(myScore);
      const currentWeekendID = parentGetTestDateID(date);
      const targetClass = myClass || 'A班';
      const precomputed = distributionProfileByWeekendClass[currentWeekendID]?.[targetClass]?.[subject];

      const fallbackTemplate = buildDistributionTemplate(getMaxScore(date, subject, allDates));
      const template = precomputed?.template || fallbackTemplate;
      const counts = precomputed?.counts || new Array(template.buckets.length).fill(0);
      const myBucketIdx = resolveDistributionBucketIndex(myVal, template);

      return template.buckets.map((bucket, idx) => ({
          range: bucket.label,
          count: counts[idx] || 0,
          min: bucket.min,
          max: bucket.max,
          isMyRange: idx === myBucketIdx
      }));
  };

  const relevantWeekendIdsForPR = useMemo(() => {
      if (!shouldBuildBatchAnalytics) return [];
      const selectedWeekendID = getTestDateID(batchDate);
      if (!selectedWeekendID) return [];
      const ids = [selectedWeekendID];
      const selectedIndex = orderedWeekendIds.indexOf(selectedWeekendID);
      if (selectedIndex > 0) ids.push(orderedWeekendIds[selectedIndex - 1]);
      return ids;
  }, [shouldBuildBatchAnalytics, batchDate, getTestDateID, orderedWeekendIds]);

  const batchRelevantGradeMapsByStudentId = useMemo(() => {
      if (!shouldBuildBatchAnalytics || relevantWeekendIdsForPR.length === 0) return {};
      const targetWeekendIds = new Set(relevantWeekendIdsForPR);
      const gradeMaps = {};

      allStudentsData.forEach((student) => {
          const weekendGrades = {};
          Object.entries(allStudentWeekendGradesByStudentId[student.id] || {}).forEach(([weekendID, grade]) => {
              if (!targetWeekendIds.has(weekendID)) return;
              weekendGrades[weekendID] = grade;
          });
          const currentBatchInfo = currentBatchGradeInfoByStudentId[student.id];
          if (currentBatchInfo && selectedBatchWeekendID && targetWeekendIds.has(selectedBatchWeekendID)) {
              weekendGrades[selectedBatchWeekendID] = currentBatchInfo.grade;
          }
          if (Object.keys(weekendGrades).length > 0) {
              gradeMaps[student.id] = weekendGrades;
          }
      });

      return gradeMaps;
  }, [allStudentWeekendGradesByStudentId, allStudentsData, currentBatchGradeInfoByStudentId, relevantWeekendIdsForPR, selectedBatchWeekendID, shouldBuildBatchAnalytics]);

  const globalPRByStudentAndWeekend = useMemo(() => {
      if (!shouldBuildBatchAnalytics || relevantWeekendIdsForPR.length === 0) return {};
      const targetWeekendSet = new Set(relevantWeekendIdsForPR);
      const totalsByWeekend = {};
      Object.entries(batchRelevantGradeMapsByStudentId).forEach(([studentId, weekendGrades]) => {
          targetWeekendSet.forEach((weekendID) => {
              const grade = weekendGrades?.[weekendID];
              if (!grade) return;
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
  }, [batchRelevantGradeMapsByStudentId, shouldBuildBatchAnalytics, relevantWeekendIdsForPR]);

  const batchRowsForDisplay = useMemo(() => {
      if (!shouldBuildBatchAnalytics) return [];

      const weekendID = getTestDateID(batchDate);
      const rows = [];

      allStudentsData.forEach(student => {
          const dateGrades = batchRelevantGradeMapsByStudentId[student.id]?.[weekendID];
          if (!dateGrades) return;

          const currentClass = dateGrades.class || 'A班';
          if (currentClass !== teacherClassFilter) return;
          if (!hasAnySubjectScore(dateGrades)) return;

          rows.push({ student, dateGrades });
      });

      const computedRows = rows.map((row) => {
          const prValue = globalPRByStudentAndWeekend[row.student.id]?.[weekendID] ?? '-';
          const probValue = admissionProbabilities[row.student.id] ?? '-';
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
      shouldBuildBatchAnalytics,
      allStudentsData,
      batchDate,
      teacherClassFilter,
      getTestDateID,
      sortByPR,
      sortByProb,
      admissionProbabilities,
      batchRelevantGradeMapsByStudentId,
      globalPRByStudentAndWeekend
  ]);
  batchRowsForDisplayRef.current = batchRowsForDisplay;

  const batchClassCounts = useMemo(() => {
      if (!shouldBuildBatchAnalytics) return {};
      const counts = {};
      allStudentsData.forEach((student) => {
          const grade = currentBatchGradeInfoByStudentId[student.id]?.grade;
          if (!grade || !hasAnySubjectScore(grade)) return;
          const classId = grade.class || defaultTeacherClassId;
          counts[classId] = (counts[classId] || 0) + 1;
      });
      return counts;
  }, [allStudentsData, currentBatchGradeInfoByStudentId, defaultTeacherClassId, shouldBuildBatchAnalytics]);

  const fallbackBatchClassId = useMemo(() => {
      let target = defaultTeacherClassId;
      let maxCount = batchClassCounts[target] || 0;
      activeTeacherClassDefs.forEach(({ id }) => {
          const count = batchClassCounts[id] || 0;
          if (count > maxCount) {
              target = id;
              maxCount = count;
          }
      });
      return maxCount > 0 ? target : '';
  }, [activeTeacherClassDefs, batchClassCounts, defaultTeacherClassId]);

  useEffect(() => {
      if (!shouldBuildBatchAnalytics || isBatchDirty) return;
      if (batchRowsForDisplay.length > 0) return;
      if (!fallbackBatchClassId || fallbackBatchClassId === teacherClassFilter) return;
      const autoScopeKey = `${activeTeacherCohortId || ''}::${selectedBatchWeekendID || batchDate || ''}`;
      if (batchAutoClassScopeRef.current === autoScopeKey) return;
      batchAutoClassScopeRef.current = autoScopeKey;
      setTeacherClassFilter(fallbackBatchClassId);
  }, [activeTeacherCohortId, batchDate, batchRowsForDisplay.length, fallbackBatchClassId, isBatchDirty, selectedBatchWeekendID, shouldBuildBatchAnalytics, teacherClassFilter]);

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

  const handleDownloadImportTemplate = useCallback(async () => {
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

      const workbook = window.XLSX.utils.book_new();
      const applyCenteredCellLayout = (sheet) => {
          if (!sheet?.['!ref']) return;
          const range = window.XLSX.utils.decode_range(sheet['!ref']);
          for (let row = range.s.r; row <= range.e.r; row += 1) {
              for (let col = range.s.c; col <= range.e.c; col += 1) {
                  const cellAddress = window.XLSX.utils.encode_cell({ r: row, c: col });
                  const cell = sheet[cellAddress];
                  if (!cell) continue;
                  cell.s = {
                      ...(cell.s || {}),
                      alignment: {
                          ...(cell.s?.alignment || {}),
                          horizontal: 'center',
                          vertical: 'center'
                      }
                  };
              }
          }
      };
      const templateRows = [
          importFormatGuide.sampleHeaders,
          ...importFormatGuide.sampleRows
      ];
      const templateSheet = window.XLSX.utils.aoa_to_sheet(templateRows);
      templateSheet['!cols'] = [
          { wch: 12 },
          { wch: 14 },
          { wch: 12 },
          { wch: 10 },
          { wch: 8 },
          { wch: 8 },
          { wch: 8 }
      ];
      applyCenteredCellLayout(templateSheet);
      window.XLSX.utils.book_append_sheet(workbook, templateSheet, '成績匯入範本');

      const guideRows = [
          ['項目', '說明'],
          ['建議欄位', importFormatGuide.sampleHeaders.join(' / ')],
          ...importFormatGuide.headerHints.map((text, index) => [`欄位辨識 ${index + 1}`, text]),
          ...importFormatGuide.rules.map((text, index) => [`注意事項 ${index + 1}`, text])
      ];
      const guideSheet = window.XLSX.utils.aoa_to_sheet(guideRows);
      guideSheet['!cols'] = [
          { wch: 16 },
          { wch: 72 }
      ];
      applyCenteredCellLayout(guideSheet);
      window.XLSX.utils.book_append_sheet(workbook, guideSheet, '匯入說明');

      window.XLSX.writeFile(workbook, '成績匯入模板.xlsx');
      setStatusMsg('已下載匯入範本');
      setTimeout(() => setStatusMsg(''), 1800);
  }, [ensureXlsxReady, importFormatGuide]);

  useEffect(() => {
      if (teacherViewMode !== 'batch' || batchInsightTab !== 'grades') return;
      const totalRows = batchRowsForDisplay.length;
      if (totalRows <= INITIAL_BATCH_RENDER_ROWS) {
          setVisibleBatchRowCount(totalRows);
          return;
      }

      let rafId = null;
      let cancelled = false;
      setVisibleBatchRowCount(INITIAL_BATCH_RENDER_ROWS);

      const appendChunk = () => {
          if (cancelled) return;
          setVisibleBatchRowCount((prev) => {
              const next = Math.min(prev + BATCH_RENDER_CHUNK_ROWS, totalRows);
              if (next < totalRows) {
                  rafId = requestAnimationFrame(appendChunk);
              }
              return next;
          });
      };

      rafId = requestAnimationFrame(appendChunk);
      return () => {
          cancelled = true;
          if (rafId) cancelAnimationFrame(rafId);
      };
  }, [batchRowsForDisplay.length, batchInsightTab, teacherClassFilter, teacherViewMode, selectedBatchWeekendID, sortByPR, sortByProb]);

  const renderedBatchRows = useMemo(
      () => batchRowsForDisplay.slice(0, visibleBatchRowCount),
      [batchRowsForDisplay, visibleBatchRowCount]
  );

  const deferredBatchRowsForDisplay = useDeferredValue(batchRowsForDisplay);

  const batchRiskAlerts = useMemo(() => {
      if (!shouldBuildBatchAnalytics || !deferredBatchRowsForDisplay.length) return [];

      const selectedWeekendID = getTestDateID(batchDate);
      const selectedIndex = orderedWeekendIds.indexOf(selectedWeekendID);
      const alerts = deferredBatchRowsForDisplay.map((row) => {
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
      shouldBuildBatchAnalytics,
      batchDate,
      deferredBatchRowsForDisplay,
      getTestDateID,
      orderedWeekendIds,
      globalPRByStudentAndWeekend,
      teacherClassFilter,
      queryStatsById
  ]);

  const shouldBuildHeatmapRows =
      shouldBuildBatchAnalytics && batchInsightTab === 'heatmap';

  const batchHeatmapRows = useMemo(() => {
      if (!shouldBuildHeatmapRows || !deferredBatchRowsForDisplay.length) return [];

      const fallbackMaxByMetric = {
          chi: getMaxScore(batchDate, 'chi', sortedAvailableDatesAsc),
          eng: getMaxScore(batchDate, 'eng', sortedAvailableDatesAsc),
          math: getMaxScore(batchDate, 'math', sortedAvailableDatesAsc),
          total: 300,
          pr: 99,
          prob: 99
      };

      const metricKeys = ['chi', 'eng', 'math', 'total', 'pr', 'prob'];
      const rawRows = deferredBatchRowsForDisplay.map((row) => ({
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
      shouldBuildHeatmapRows,
      batchDate,
      deferredBatchRowsForDisplay,
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

  const isQueryTabRequested =
      mode === 'teacher' && teacherViewMode === 'batch' && batchInsightTab === 'query';

  useEffect(() => {
      if (!isQueryTabRequested) {
          setQueryPanelStage('idle');
          return undefined;
      }

      setQueryPanelStage('shell');
      let cancelled = false;
      let rafId = null;

      rafId = requestAnimationFrame(() => {
          if (cancelled) return;
          setQueryPanelStage('core');
      });

      return () => {
          cancelled = true;
          if (rafId) cancelAnimationFrame(rafId);
      };
  }, [isQueryTabRequested]);

  const shouldBuildQueryInsights =
      mode === 'teacher'
      && teacherViewMode === 'batch'
      && deferredBatchInsightTab === 'query'
      && queryPanelStage === 'core';
  const isQueryInsightsPending =
      isQueryTabRequested
      && (deferredBatchInsightTab !== 'query' || queryPanelStage !== 'core');

  const studentNameById = useMemo(() => {
      if (!shouldBuildQueryInsights) return {};
      const map = {};
      allStudentsData.forEach((student) => {
          const studentId = String(student?.id || '').toUpperCase().trim();
          if (!studentId) return;
          map[studentId] = student.name || '';
      });
      return map;
  }, [allStudentsData, shouldBuildQueryInsights]);

  const queryEventTimeline = useMemo(() => {
      if (!shouldBuildQueryInsights) return [];
      return deferredQueryEvents
          .map((event) => {
              const ts = Number.isFinite(event?.ts) ? event.ts : new Date(event?.at).getTime();
              if (Number.isNaN(ts)) return null;
              const dateObj = new Date(ts);
              return {
                  id: event.id,
                  name: studentNameById[event.id] || '',
                  ts,
                  dateKey: toLocalDateKey(dateObj),
                  dateLabel: formatMonitorDateLabel(dateObj),
                  timeLabel: formatMonitorTimeLabel(dateObj, true),
                  timeLabelShort: formatMonitorTimeLabel(dateObj, false),
                  relativeLabel: formatMonitorRelativeLabel(dateObj)
              };
          })
          .filter(Boolean)
          .sort((a, b) => b.ts - a.ts);
  }, [deferredQueryEvents, studentNameById, shouldBuildQueryInsights]);

  const queryEventsByDay = useMemo(() => {
      if (!shouldBuildQueryInsights) return [];
      const grouped = {};
      queryEventTimeline.forEach((event) => {
          if (!grouped[event.dateKey]) {
              grouped[event.dateKey] = { dateKey: event.dateKey, dateLabel: event.dateLabel, items: [] };
          }
          grouped[event.dateKey].items.push(event);
      });
      return Object.values(grouped)
          .sort((a, b) => b.dateKey.localeCompare(a.dateKey));
  }, [queryEventTimeline, shouldBuildQueryInsights]);

  const queryStatsRows = useMemo(() => {
      if (!shouldBuildQueryInsights) return [];
      const latestTsById = {};
      queryEventTimeline.forEach((event) => {
          if (!latestTsById[event.id] || event.ts > latestTsById[event.id]) {
              latestTsById[event.id] = event.ts;
          }
      });

      return Object.entries(deferredQueryStatsById)
          .map(([id, count]) => {
              const latestTs = latestTsById[id] || 0;
              const latestAtLabel = latestTs
                  ? formatMonitorDateTimeLabel(latestTs, false)
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
  }, [deferredQueryStatsById, studentNameById, queryEventTimeline, shouldBuildQueryInsights]);

  const queryStatsRowsFiltered = useMemo(() => {
      if (!shouldBuildQueryInsights) return [];
      const keyword = deferredQueryMonitorKeyword.trim();
      const hasKeyword = keyword.length > 0;
      const upperKeyword = keyword.toUpperCase();
      const lowerKeyword = keyword.toLowerCase();

      const rows = queryStatsRows.filter((row) => {
          if (!hasKeyword) return true;
          const idText = String(row.id || '').toUpperCase();
          const nameText = String(row.name || '').toLowerCase();
          return idText.includes(upperKeyword) || nameText.includes(lowerKeyword);
      });

      if (deferredQueryMonitorSort === 'latest_desc') {
          rows.sort((a, b) => {
              if (b.latestTs !== a.latestTs) return b.latestTs - a.latestTs;
              return b.count - a.count;
          });
          return rows;
      }

      if (deferredQueryMonitorSort === 'id_asc') {
          rows.sort((a, b) => String(a.id || '').localeCompare(String(b.id || '')));
          return rows;
      }

      rows.sort((a, b) => {
          if (b.count !== a.count) return b.count - a.count;
          return b.latestTs - a.latestTs;
      });
      return rows;
  }, [queryStatsRows, deferredQueryMonitorKeyword, deferredQueryMonitorSort, shouldBuildQueryInsights]);

  const queryEventsByDayFiltered = useMemo(() => {
      if (!shouldBuildQueryInsights) return [];
      const keyword = deferredQueryMonitorKeyword.trim();
      const hasKeyword = keyword.length > 0;
      const upperKeyword = keyword.toUpperCase();
      const lowerKeyword = keyword.toLowerCase();

      return queryEventsByDay
          .filter((day) => deferredQueryMonitorDateFilter === 'all' || day.dateKey === deferredQueryMonitorDateFilter)
          .map((day) => {
              let items = day.items;
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
  }, [queryEventsByDay, deferredQueryMonitorDateFilter, deferredQueryMonitorKeyword, shouldBuildQueryInsights]);

  const queryFilteredEventList = useMemo(
      () => (shouldBuildQueryInsights ? queryEventsByDayFiltered.flatMap((day) => day.items) : []),
      [queryEventsByDayFiltered, shouldBuildQueryInsights]
  );

  const queryFilteredSummary = useMemo(() => {
      if (!shouldBuildQueryInsights) {
          return {
              totalQueries: 0,
              rankedStudentCount: 0,
              filteredEventCount: 0,
              latestDayCount: 0
          };
      }

      return {
          totalQueries: queryEventTimeline.length,
          rankedStudentCount: queryStatsRowsFiltered.length,
          filteredEventCount: queryFilteredEventList.length,
          latestDayCount: queryEventsByDayFiltered[0]?.items.length || 0
      };
  }, [queryEventTimeline, queryFilteredEventList.length, queryStatsRowsFiltered.length, queryEventsByDayFiltered, shouldBuildQueryInsights]);

  useEffect(() => {
      if (!shouldBuildQueryInsights) return;
      if (deferredQueryMonitorDateFilter === 'all') return;
      const exists = queryEventsByDay.some((day) => day.dateKey === deferredQueryMonitorDateFilter);
      if (!exists) setQueryMonitorDateFilter('all');
  }, [deferredQueryMonitorDateFilter, queryEventsByDay, shouldBuildQueryInsights]);

  const queryStatsLastResetText = useMemo(() => {
      if (!queryStatsLastResetAt) return '尚未初始化';
      const date = new Date(queryStatsLastResetAt);
      if (Number.isNaN(date.getTime())) return '尚未初始化';
      return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }, [queryStatsLastResetAt]);

  const operationLogPreview = useMemo(
      () => operationLogs.slice(0, 36),
      [operationLogs]
  );

  const openStatsModal = (date, grades, className) => {
      setStatsModalData({
          date,
          className: className || 'A班',
          total: calculateDistribution(date, 'total', grades.total, parentAvailableDates, className),
          chi: calculateDistribution(date, 'chi', grades.chi, parentAvailableDates, className),
          eng: calculateDistribution(date, 'eng', grades.eng, parentAvailableDates, className),
          math: calculateDistribution(date, 'math', grades.math, parentAvailableDates, className),
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
          const personalMessage = String(parentTeacherMessageContext.byStudent?.[studentId] || '').trim();
          if (personalMessage) return personalMessage;
          return String(parentTeacherMessageContext.globalMessage || '').trim();
      },
      [parentTeacherMessageContext, viewData]
  );

  const statsSummary = useMemo(() => {
      if (!statsModalData) return null;
      const distribution = statsModalData[statsActiveTab] || [];
      const sampleCount = distribution.reduce((sum, bucket) => sum + (bucket.count || 0), 0);
      const myBucketIndex = distribution.findIndex((bucket) => bucket.isMyRange);
      const myBucket = myBucketIndex >= 0 ? distribution[myBucketIndex] : null;
      const myRange = myBucket?.range || '-';
      const myBucketCount = myBucket?.count || 0;
      const peakBucket = distribution.reduce((top, bucket) => {
          if (!top || (bucket.count || 0) > (top.count || 0)) return bucket;
          return top;
      }, null);

      const myScore = toNumberOrNull(statsModalData.myGrades?.[statsActiveTab]);
      const weekendID = parentGetTestDateID(statsModalData.date);
      const className = statsModalData.className || 'A班';
      const classScores = scoreIndexByWeekendAndClass[weekendID]?.[className]?.[statsActiveTab] || [];

      let higherCount = 0;
      let equalCount = 0;
      let lowerCount = 0;
      let classRank = null;
      let classTopPercent = null;
      let classPercentile = null;

      if (myScore !== null && classScores.length) {
          classScores.forEach((score) => {
              if (score > myScore) higherCount += 1;
              else if (score < myScore) lowerCount += 1;
              else equalCount += 1;
          });

          classRank = higherCount + 1;
          classTopPercent = Math.max(1, Math.round((classRank / classScores.length) * 100));
          classPercentile = Number((((lowerCount + (equalCount * 0.5)) / classScores.length) * 100).toFixed(1));
      }

      const myRangeRatio = sampleCount > 0
          ? Number(((myBucketCount / sampleCount) * 100).toFixed(1))
          : null;
      const standingLabel = classPercentile === null
          ? '資料不足'
          : classPercentile >= 70
              ? '高於班上多數同學'
              : classPercentile >= 50
                  ? '位於班級中段偏上'
                  : classPercentile >= 35
                      ? '位於班級中段'
                      : '目前低於班級中段';

      return {
          sampleCount,
          myRange,
          myBucketCount,
          myRangeRatio,
          peakRange: peakBucket?.range || '-',
          peakCount: peakBucket?.count || 0,
          myScore,
          classRank,
          classSize: classScores.length,
          classTopPercent,
          classPercentile,
          standingLabel,
          higherCount,
          equalCount,
          lowerCount
      };
  }, [statsModalData, statsActiveTab, parentGetTestDateID, scoreIndexByWeekendAndClass]);

  const isLandingMode = mode === 'landing';
  const isConnectionReady = Boolean(user);
  const sharedBackgroundOpacity = isLandingMode
      ? 1
      : mode === 'teacher'
          ? 0.68
          : mode === 'parent'
              ? 0.74
              : 0.72;
  const shouldElevateHeader = isHeaderScrolled || !isLandingMode;
  const sharedBackgroundStyle = useMemo(() => ({
      opacity: sharedBackgroundOpacity,
      backgroundImage: 'repeating-linear-gradient(0deg, rgba(148,163,184,0.1) 0px, rgba(148,163,184,0.1) 1px, transparent 1px, transparent 24px), repeating-linear-gradient(90deg, rgba(148,163,184,0.08) 0px, rgba(148,163,184,0.08) 1px, transparent 1px, transparent 24px), radial-gradient(circle at 12% 15%, rgba(99,102,241,0.22) 0%, transparent 40%), radial-gradient(circle at 86% 12%, rgba(14,165,233,0.22) 0%, transparent 40%), radial-gradient(circle at 80% 84%, rgba(236,72,153,0.16) 0%, transparent 36%), linear-gradient(138deg, #f8fafc 0%, #f3f7ff 46%, #eefcf5 100%)'
  }), [sharedBackgroundOpacity]);

  if (!db) return <div className="flex items-center justify-center h-screen bg-slate-50 text-slate-400 text-sm font-mono tracking-widest uppercase">Initializing...</div>;

  return (
    <div className={`${isLandingMode ? 'h-[100dvh] min-h-[100svh] overflow-hidden' : 'min-h-screen pb-[calc(8rem+env(safe-area-inset-bottom))] overflow-x-hidden'} font-sans antialiased transition-colors duration-500 ease-in-out relative ${darkMode ? 'bg-[#111714] text-slate-200' : 'bg-transparent text-slate-800'}`}>
      <div
        aria-hidden="true"
        className="fixed inset-0 pointer-events-none z-0 transition-opacity duration-500"
        style={sharedBackgroundStyle}
      />
      <div aria-hidden="true" className={`ambient-layer transition-opacity duration-700 ${isLandingMode ? 'opacity-95' : 'opacity-75'}`}>
        <div className="ambient-dot ambient-dot--a" />
        <div className="ambient-dot ambient-dot--b" />
        <div className="ambient-dot ambient-dot--c" />
      </div>

      {!isConnectionReady && (
        <div className="fixed top-[calc(5rem+env(safe-area-inset-top))] left-1/2 -translate-x-1/2 z-40 rounded-full px-3 py-1.5 text-[10px] font-black tracking-wide border border-white/90 bg-white/95 text-slate-600 shadow-lg">
          {authReady ? '連線同步中，資料功能即將可用' : '正在建立連線...'}
        </div>
      )}

      {/* Header */}
      <header className={`header-glass fixed top-0 w-full backdrop-blur-xl z-30 border-b transition-all duration-300 ${shouldElevateHeader ? 'header-glass--scrolled' : ''} ${darkMode ? 'header-glass--dark bg-[#0b1512]/84 border-emerald-200/15 shadow-lg shadow-black/35' : 'bg-[linear-gradient(108deg,rgba(255,255,255,0.78)_0%,rgba(244,252,248,0.84)_52%,rgba(241,247,255,0.8)_100%)] border-white/75 shadow-[0_14px_36px_rgba(15,23,42,0.12)]'}`}>
        <div className="max-w-5xl mx-auto px-3 sm:px-6 h-[calc(4rem+env(safe-area-inset-top))] pt-[env(safe-area-inset-top)] flex justify-between items-center relative z-10">
          <div
            className="flex min-w-0 flex-1 h-full items-center gap-2 sm:gap-3 cursor-pointer group -translate-y-[2px]"
            onClick={() => runWithBatchDiscardGuard(() => setMode('landing'))}
          >
            <div className={`p-2 rounded-[1.15rem] transition-transform group-hover:scale-105 duration-300 ${darkMode ? 'bg-emerald-500/10 text-emerald-200 ring-1 ring-emerald-300/35' : 'bg-[linear-gradient(145deg,rgba(255,255,255,0.96)_0%,rgba(236,253,245,0.92)_56%,rgba(239,246,255,0.9)_100%)] text-[#0f766e] ring-1 ring-white/95 shadow-[0_10px_24px_rgba(148,163,184,0.16)]'}`}><GraduationCap className="h-5 w-5" /></div>
            <div className="min-w-0 flex flex-col justify-center gap-[0.14rem] sm:gap-[0.18rem]">
                <h1 className={`truncate text-[clamp(0.92rem,4.4vw,1.18rem)] sm:text-2xl font-black tracking-[0.1em] sm:tracking-[0.16em] font-serif uppercase leading-[0.92] bg-clip-text text-transparent ${darkMode ? 'bg-gradient-to-r from-emerald-50 via-emerald-200 to-lime-200' : 'bg-[linear-gradient(112deg,#0f172a_0%,#14532d_26%,#0f766e_58%,#0f4c81_100%)] drop-shadow-[0_1px_0_rgba(255,255,255,0.6)]'}`}>
                  HSINRU
                </h1>
                <p className={`truncate block text-[8px] sm:text-[9px] font-black tracking-[0.2em] sm:tracking-[0.28em] uppercase leading-none ${darkMode ? 'text-slate-300/85' : 'text-[#64748b]'}`}>Grade Tracker</p>
            </div>
          </div>
          <div className={`premium-control-rail ml-2 flex shrink-0 items-center gap-1 sm:gap-1.5 rounded-full border px-1.5 sm:px-2 py-1 backdrop-blur-md ${darkMode ? 'border-white/15 bg-slate-900/35' : 'border-white/80 bg-white/72 shadow-[0_8px_24px_rgba(15,23,42,0.08)] ring-1 ring-white/45'}`}>
                <button
                  onClick={() => runWithBatchDiscardGuard(() => {
                    if (isAuthenticated) {
                      if (!user) return;
                      setMode('teacher');
                    } else {
                      setMode('teacher_login');
                    }
                  })}
                  className={`${mode.includes('teacher') ? BUTTON_SYSTEM.segmentActive : BUTTON_SYSTEM.segment} shrink-0 px-2.5 sm:px-4 py-1.5 rounded-full text-[10px] sm:text-xs font-bold transition-all duration-300 ${mode.includes('teacher') ? (darkMode ? 'bg-[#1c2722] text-emerald-300 shadow-lg shadow-black/35 ring-1 ring-emerald-200/20' : 'bg-white/96 text-emerald-700 shadow-md shadow-slate-300/35 ring-1 ring-white/95 border border-white/80') : (darkMode ? 'text-slate-200 hover:text-white bg-slate-900/45 border border-emerald-200/20 hover:bg-slate-900/70' : 'text-slate-600 hover:text-slate-800 bg-white/70 border border-white/80 hover:bg-white/95')}`}
                >
                  {isAuthenticated ? '後台' : '老師'}
                </button>
                <button
                  onClick={() => runWithBatchDiscardGuard(() => {
                    setViewData(null);
                    setSearchError('');
                    setMode('parent');
                  })}
                  className={`${mode === 'parent' ? BUTTON_SYSTEM.segmentActive : BUTTON_SYSTEM.segment} shrink-0 px-2.5 sm:px-4 py-1.5 rounded-full text-[10px] sm:text-xs font-bold transition-all duration-300 ${mode === 'parent' ? (darkMode ? 'bg-[#1c2722] text-emerald-300 shadow-lg shadow-black/35 ring-1 ring-emerald-200/20' : 'bg-white/96 text-emerald-700 shadow-md shadow-slate-300/35 ring-1 ring-white/95 border border-white/80') : (darkMode ? 'text-slate-200 hover:text-white bg-slate-900/45 border border-emerald-200/20 hover:bg-slate-900/70' : 'text-slate-600 hover:text-slate-800 bg-white/70 border border-white/80 hover:bg-white/95')}`}
                >
                  家長
                </button>
            {isAuthenticated && (
                <button onClick={handleLogout} className={`${BUTTON_SYSTEM.iconDanger} ml-0.5 p-1.5 sm:p-2 text-red-400 hover:text-red-500 hover:bg-red-500/10 rounded-full transition-colors`} title="登出"><LogOut className="w-4 h-4 sm:w-5 sm:h-5"/></button>
            )}
          </div>
        </div>
      </header>

      <main className={`${isLandingMode ? 'pt-[calc(4rem+env(safe-area-inset-top))]' : 'pt-[calc(6.2rem+env(safe-area-inset-top))]'} px-4 max-w-5xl mx-auto relative`}>
        {mode === 'landing' && (
          <div className="h-[calc(100dvh-4rem-env(safe-area-inset-top))] min-h-[calc(100svh-4rem-env(safe-area-inset-top))] flex items-center justify-center">
            <div className="w-full max-w-4xl h-full">
              <div className="relative z-10 h-full flex flex-col items-center justify-center px-[clamp(0.9rem,3.6vw,1.55rem)] py-[clamp(0.8rem,2.8vh,1.45rem)] -translate-y-[clamp(1.45rem,4.5vh,2.9rem)] sm:-translate-y-[clamp(1.8rem,5vh,3.35rem)]">
                <div className={`hero-reveal px-4 py-1.5 rounded-full mb-[clamp(0.55rem,1.9vh,1.25rem)] border text-[10px] tracking-[0.22em] font-black uppercase shadow-[0_8px_24px_rgba(15,23,42,0.08)] ${darkMode ? 'border-emerald-200/30 bg-[#071a16]/82 text-emerald-100 shadow-black/25' : 'border-white/95 bg-white/92 text-slate-600'}`} style={{ '--stagger-index': 0 }}>
                    HSINRU CENTRAL
                </div>
                <h2 className={`hero-reveal w-full px-[clamp(0.2rem,1vw,0.7rem)] whitespace-nowrap text-[clamp(1.2rem,5.35vw,2.9rem)] sm:text-[clamp(1.8rem,4.4vw,2.9rem)] font-black font-serif tracking-[-0.016em] sm:tracking-tight mb-[clamp(0.35rem,1.2vh,0.9rem)] text-center leading-[1.18] bg-clip-text text-transparent ${darkMode ? 'bg-[linear-gradient(104deg,#a7f3d0_0%,#34d399_26%,#22d3ee_58%,#60a5fa_100%)] drop-shadow-[0_2px_10px_rgba(16,185,129,0.24)]' : 'bg-[linear-gradient(104deg,#047857_0%,#0f766e_24%,#0891b2_56%,#1d4ed8_100%)] drop-shadow-[0_1px_0_rgba(255,255,255,0.45)]'}`} style={{ '--stagger-index': 1 }}>Make Progress Visible</h2>
                <p className={`hero-reveal text-[clamp(10px,2.35vw,11px)] font-bold tracking-[0.2em] mb-[clamp(0.7rem,2.4vh,1.6rem)] uppercase ${darkMode ? 'text-slate-300' : 'text-slate-600'}`} style={{ '--stagger-index': 2 }}>2025-2026 Learning Journey</p>
                <div className="hero-reveal" style={{ '--stagger-index': 3 }}>
                  <ExamCountdown isDarkMode={darkMode} />
                </div>
                  
                <div className="hero-reveal w-full max-w-xl grid grid-cols-1 md:grid-cols-2 gap-3 mt-[clamp(0.9rem,2.7vh,1.6rem)]" style={{ '--stagger-index': 4 }}>
                   <button
                      onClick={() => runWithBatchDiscardGuard(() => {
                        if (isAuthenticated) {
                          if (!user) return;
                          setMode('teacher');
                        } else {
                          setMode('teacher_login');
                        }
                      })}
                      className={`btn-sheen group w-full p-5 rounded-[1.45rem] border flex items-center gap-4 transition-all duration-200 backdrop-blur-xl ${darkMode ? 'bg-[#081c18]/82 border-emerald-200/22 shadow-[0_14px_32px_rgba(2,6,23,0.45)] hover:bg-[#0c2620]/90 hover:border-emerald-300/40 hover:-translate-y-0.5' : 'bg-white/94 border-white/95 shadow-[0_14px_32px_rgba(15,23,42,0.09)] hover:bg-white hover:border-sky-200/90 hover:-translate-y-0.5'}`}
                    >
                      <div className={`w-11 h-11 rounded-2xl flex items-center justify-center transition-colors ${darkMode ? 'bg-gradient-to-br from-emerald-500/24 to-cyan-400/18 text-emerald-100' : 'bg-gradient-to-br from-indigo-100 to-sky-100 text-indigo-700'}`}><LayoutDashboard className="w-5 h-5" /></div>
                      <div className="text-left flex-1"><h3 className={`text-base font-black ${darkMode ? 'text-slate-100' : 'text-slate-800'}`}>老師通道</h3><p className={`text-[11px] mt-0.5 ${darkMode ? 'text-slate-300' : 'text-slate-500'}`}>管理成績與設定</p></div>
                      <ChevronRight className={`w-4.5 h-4.5 opacity-50 group-hover:opacity-100 group-hover:translate-x-1 transition-all ${darkMode ? 'text-slate-300' : 'text-slate-400'}`}/>
                   </button>
                   <button
                      onClick={() => runWithBatchDiscardGuard(() => {
                        setViewData(null);
                        setSearchError('');
                        setMode('parent');
                      })}
                      className={`btn-sheen group w-full p-5 rounded-[1.45rem] border flex items-center gap-4 transition-all duration-200 backdrop-blur-xl ${darkMode ? 'bg-[#081c18]/82 border-emerald-200/22 shadow-[0_14px_32px_rgba(2,6,23,0.45)] hover:bg-[#0c2620]/90 hover:border-cyan-300/45 hover:-translate-y-0.5' : 'bg-white/94 border-white/95 shadow-[0_14px_32px_rgba(15,23,42,0.09)] hover:bg-white hover:border-emerald-200/90 hover:-translate-y-0.5'}`}
                    >
                      <div className={`w-11 h-11 rounded-2xl flex items-center justify-center transition-colors ${darkMode ? 'bg-gradient-to-br from-cyan-500/24 to-emerald-400/20 text-cyan-100' : 'bg-gradient-to-br from-sky-100 to-emerald-100 text-sky-700'}`}><BarChart3 className="w-5 h-5" /></div>
                      <div className="text-left flex-1"><h3 className={`text-base font-black ${darkMode ? 'text-slate-100' : 'text-slate-800'}`}>家長查詢</h3><p className={`text-[11px] mt-0.5 ${darkMode ? 'text-slate-300' : 'text-slate-500'}`}>輸入學號查看分析</p></div>
                      <ChevronRight className={`w-4.5 h-4.5 opacity-50 group-hover:opacity-100 group-hover:translate-x-1 transition-all ${darkMode ? 'text-slate-300' : 'text-slate-400'}`}/>
                   </button>
                </div>

                <p className={`hero-reveal mt-[clamp(0.9rem,3vh,1.8rem)] text-[11px] font-serif font-semibold tracking-[0.14em] ${darkMode ? 'text-slate-300/90' : 'text-slate-500/90'}`} style={{ '--stagger-index': 5 }}>
                  Created by CH Fan
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
                    <button onClick={handleLoginSubmit} className={`${BUTTON_SYSTEM.primary} w-full bg-blue-600 hover:bg-blue-500 text-white py-3.5 rounded-2xl font-bold shadow-lg shadow-blue-500/30 active:scale-[0.98] transition-all`}>登入</button>
                </div>
            </div>
        )}

        {mode === 'teacher' && (
          <div className="space-y-7 -mt-2 sm:-mt-3">
            <div className={`panel-fade-in p-6 rounded-[2rem] border backdrop-blur-2xl relative overflow-hidden ${darkMode ? 'bg-[#0f172a]/70 border-white/10 shadow-xl shadow-black/20 ring-1 ring-white/5' : 'bg-white border-white shadow-[0_24px_52px_rgba(15,23,42,0.1)]'}`}>
                <div className={`absolute inset-x-0 top-0 h-1 ${darkMode ? 'bg-emerald-300/35' : 'bg-gradient-to-r from-sky-500 via-emerald-500 to-indigo-500'}`} />
                {isLimitedTeacherRole && (
                    <div className={`mb-4 mt-1 inline-flex items-center gap-2 text-[10px] font-black tracking-widest uppercase px-3 py-1.5 rounded-full border ${darkMode ? 'bg-amber-500/10 border-amber-300/25 text-amber-200' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>
                        2491212 權限：唯讀成績
                    </div>
                )}
                <div className={`mb-5 rounded-[1.7rem] border px-3.5 py-3.5 sm:px-4 sm:py-4 backdrop-blur-xl ${darkMode ? 'bg-[#020617]/35 border-white/10' : 'bg-white/82 border-white/85 ring-1 ring-white/55 shadow-[0_12px_30px_rgba(15,23,42,0.08)]'}`}>
                    <div className="flex flex-col gap-3 xl:grid xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.45fr)] xl:items-center">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-black tracking-[0.18em] uppercase ${darkMode ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-500'}`}>
                                <GraduationCap className="w-3.5 h-3.5 text-emerald-500" />
                                Cohort
                            </span>
                            <div className={`premium-control-rail inline-flex rounded-2xl p-1 border ${darkMode ? 'bg-slate-900/60 border-white/10' : 'bg-slate-100/90 border-slate-200/80 shadow-inner'}`}>
                                {cohortOptions.map((cohort) => {
                                    const isTeacherSelected = cohort.id === activeTeacherCohortId;
                                    return (
                                        <button
                                            key={cohort.id}
                                            type="button"
                                            onClick={() => handleSwitchTeacherCohort(cohort.id)}
                                            className={`${isTeacherSelected ? BUTTON_SYSTEM.segmentActive : BUTTON_SYSTEM.segment} rounded-[0.95rem] px-3 py-1.5 text-[11px] font-black transition-all ${isTeacherSelected ? (darkMode ? 'bg-slate-800 text-emerald-100 shadow-md' : 'bg-white text-emerald-700 shadow-sm') : (darkMode ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-700')}`}
                                        >
                                            {cohort.label}
                                        </button>
                                    );
                                })}
                            </div>
                            <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold ${darkMode ? 'bg-sky-500/12 text-sky-200' : 'bg-sky-50 text-sky-700'}`}>
                                家長預設 {activePublicCohort?.label || getCohortLabel(activePublicCohortId)}
                            </span>
                            {activeTeacherCohortId !== activePublicCohortId && (
                                <button
                                  type="button"
                                  onClick={() => handleSetPublicCohort(activeTeacherCohortId)}
                                  disabled={publicCohortSaving || cohortRegistryLoading}
                                  className={`${BUTTON_SYSTEM.secondary} rounded-full px-2.5 py-1 text-[10px] font-bold transition-colors ${darkMode ? 'bg-slate-800 text-slate-100 border border-white/10 hover:bg-slate-700' : 'bg-slate-800 text-white hover:bg-slate-700 shadow-sm'} disabled:opacity-50 disabled:cursor-not-allowed`}
                                >
                                  {publicCohortSaving ? '切換中...' : '同步為家長預設'}
                                </button>
                            )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 xl:justify-end">
                            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-black tracking-[0.18em] uppercase ${darkMode ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-500'}`}>
                                <Calendar className="w-3.5 h-3.5 text-blue-500" />
                                Exam
                            </span>
                            <select
                                className={`min-w-[132px] rounded-xl px-3 py-2 text-[11px] font-bold outline-none transition-colors border shadow-sm ${darkMode ? 'bg-[#020617]/55 border-white/10 text-slate-200' : 'bg-white border-slate-200 text-slate-700'}`}
                                value={selectedBatchWeekendID || latestPopulatedWeekendID || latestAvailableDate || ''}
                                disabled={!teacherDateCards.length}
                                onChange={(e) => {
                                    const nextValue = e.target.value;
                                    applyBatchDateChange(nextValue);
                                }}
                            >
                                {!teacherDateCards.length && <option value="">尚無考次</option>}
                                {teacherDateCards.map((item) => (
                                    <option key={item.weekendID} value={item.weekendID}>
                                        {item.label}
                                    </option>
                                ))}
                            </select>
                            {selectedTeacherDateMeta && (
                                <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold ${selectedTeacherDateMeta.phaseId === 'p1' ? (darkMode ? 'bg-cyan-500/12 text-cyan-200' : 'bg-cyan-50 text-cyan-700') : selectedTeacherDateMeta.phaseId === 'mock' ? (darkMode ? 'bg-violet-500/12 text-violet-200' : 'bg-violet-50 text-violet-700') : (darkMode ? 'bg-emerald-500/12 text-emerald-200' : 'bg-emerald-50 text-emerald-700')}`}>
                                    {selectedTeacherDateMeta.phaseLabel}
                                </span>
                            )}
                            <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold ${darkMode ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-600'}`}>
                                {orderedWeekendIds.length} 考次
                            </span>
                            {teacherViewMode === 'batch' && (latestPopulatedWeekendID || latestAvailableDate) && selectedBatchWeekendID !== (latestPopulatedWeekendID || latestAvailableDate) && (
                                <button
                                    type="button"
                                    onClick={() => applyBatchDateChange(latestPopulatedWeekendID || latestAvailableDate)}
                                    className={`${BUTTON_SYSTEM.secondary} rounded-full px-2.5 py-1 text-[10px] font-bold transition-colors border ${darkMode ? 'bg-slate-800 text-slate-200 border-white/10 hover:bg-slate-700' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 shadow-sm'}`}
                                >
                                    最新
                                </button>
                            )}
                            <div className={`inline-flex items-center gap-1.5 rounded-2xl px-2 py-1.5 border ${darkMode ? 'bg-slate-900/60 border-white/10' : 'bg-white/92 border-slate-200/80 shadow-sm'}`}>
                                <input type="text" placeholder="MM/DD" className={`w-16 bg-transparent text-center text-[11px] font-black outline-none tracking-widest ${darkMode ? 'text-slate-200 placeholder:text-slate-500' : 'text-slate-700 placeholder:text-slate-400'}`} value={newDateInput} onChange={e=>setNewDateInput(e.target.value)} />
                                <button onClick={addDate} className={`${BUTTON_SYSTEM.icon} inline-flex items-center justify-center w-7 h-7 rounded-xl transition-colors ${darkMode ? 'bg-slate-800 text-white hover:bg-slate-700' : 'bg-slate-800 text-white hover:bg-slate-700'}`}>
                                    <Plus className="w-3.5 h-3.5"/>
                                </button>
                            </div>
                            {selectedTeacherDateMeta && (canDeleteDates ? (
                                <button onClick={() => handleDeleteDate(selectedTeacherDateMeta.weekendID)} className={`${BUTTON_SYSTEM.danger} inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold transition-colors ${darkMode ? 'text-rose-300 hover:text-rose-200 bg-rose-500/10' : 'text-rose-600 hover:text-rose-700 bg-rose-50'}`} title="危險操作：刪除目前所選考次">
                                    <X className="w-3 h-3"/> 刪除所選
                                </button>
                            ) : (
                                <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold ${darkMode ? 'text-slate-400 bg-slate-700/70' : 'text-slate-500 bg-slate-100'}`} title="2491212 權限不可刪除日期">
                                    <Lock className="w-3 h-3"/> 刪除鎖定
                                </span>
                            ))}
                        </div>
                    </div>
                </div>

                <div className={`premium-control-rail flex p-1 rounded-xl mb-6 shadow-inner border ${darkMode ? 'bg-[#020617]/50 border-white/5' : 'bg-slate-100/90 border-slate-200/70'}`}>
                     <button
                       onClick={() => {
                         startTransition(() => {
                           setTeacherViewMode('batch');
                         });
                       }}
                       className={`${teacherViewMode==='batch' ? BUTTON_SYSTEM.segmentActive : BUTTON_SYSTEM.segment} flex-1 py-2 text-xs font-bold rounded-lg transition-all ${teacherViewMode==='batch' ? (darkMode ? 'bg-slate-800 text-blue-400 shadow-md border border-white/5 ring-1 ring-white/5' : 'bg-white text-blue-700 shadow-sm') : 'text-slate-500'}`}
                     >
                       批量檢視
                     </button>
                     <button
                       onClick={() => {
                         if (teacherViewMode === 'single') return;
                         if (!confirmDiscardBatchChanges()) return;
                         setTeacherViewMode('single');
                       }}
                       className={`${teacherViewMode==='single' ? BUTTON_SYSTEM.segmentActive : BUTTON_SYSTEM.segment} flex-1 py-2 text-xs font-bold rounded-lg transition-all ${teacherViewMode==='single' ? (darkMode ? 'bg-slate-800 text-slate-200 shadow-md border border-white/5 ring-1 ring-white/5' : 'bg-white text-slate-700 shadow-sm') : 'text-slate-500'}`}
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
                              className={`btn-sheen px-4 rounded-xl text-xs font-bold whitespace-nowrap transition-colors shadow-sm border ${darkMode ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-white/5' : 'bg-white hover:bg-slate-50 text-slate-600 border-slate-200'}`}
                            >
                              載入
                            </button>
                        </div>
                        <div className="premium-action-rail flex gap-2 overflow-x-auto no-scrollbar pb-1">
                            <button onClick={() => setShowAddStudentModal(true)} className={`${BUTTON_SYSTEM.primary} bg-blue-600 hover:bg-blue-500 text-white px-4 py-3 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-blue-600/20 active:scale-[0.98] transition-all whitespace-nowrap`}><UserPlus className="w-4 h-4"/> 新增學生</button>
                            {canImportExcel ? (
                                <>
                                    <button type="button" onClick={requestExcelImport} className={`${BUTTON_SYSTEM.primary} cursor-pointer bg-blue-600 hover:bg-blue-500 text-white px-4 py-3 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-blue-600/20 active:scale-[0.98] transition-all whitespace-nowrap`}>
                                        <FileSpreadsheet className="w-4 h-4" /> {isLegacyCohort(activeTeacherCohortId) ? '匯入 Excel（需驗證）' : '匯入 Excel'}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={handleDownloadImportTemplate}
                                      className={`${BUTTON_SYSTEM.secondary} px-3 py-2.5 rounded-lg text-[11px] font-bold flex items-center gap-1.5 whitespace-nowrap transition-colors border ${darkMode ? 'text-slate-200 bg-slate-900/55 border-white/10 hover:bg-slate-800' : 'text-slate-600 bg-white border-slate-200 hover:bg-slate-50 shadow-sm'}`}
                                    >
                                        <ArrowDownWideNarrow className="w-3.5 h-3.5" /> 下載範本.xlsx
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setShowImportFormatGuide(true)}
                                      className={`${BUTTON_SYSTEM.secondary} px-3 py-2.5 rounded-lg text-[11px] font-bold flex items-center gap-1.5 whitespace-nowrap transition-colors border ${darkMode ? 'text-slate-200 bg-slate-900/55 border-white/10 hover:bg-slate-800' : 'text-slate-600 bg-white border-slate-200 hover:bg-slate-50 shadow-sm'}`}
                                    >
                                        <Info className="w-3.5 h-3.5" /> 匯入格式
                                    </button>
                                    <input ref={importFileInputRef} type="file" accept=".xlsx, .xls" className="hidden" onChange={handleExcelUpload} />
                                </>
                            ) : (
                                <button type="button" disabled className={`${BUTTON_SYSTEM.primary} bg-slate-300 text-white px-4 py-3 rounded-xl text-xs font-bold flex items-center gap-1.5 whitespace-nowrap cursor-not-allowed`}>
                                    <FileSpreadsheet className="w-4 h-4" /> 匯入 Excel（唯讀）
                                </button>
                            )}
                            <button onClick={() => setShowAvgModal(true)} className={`${BUTTON_SYSTEM.secondary} px-4 py-3 rounded-xl text-xs font-bold flex items-center gap-1.5 whitespace-nowrap transition-colors border ${darkMode ? 'text-indigo-300 bg-indigo-500/10 border-indigo-500/20 hover:bg-indigo-500/20' : 'text-indigo-700 bg-white border-indigo-100 hover:bg-indigo-50 shadow-sm'}`}><Edit3 className="w-4 h-4"/> 平均設定</button>
                        </div>
                    </div>
                )}

                {teacherViewMode === 'batch' && (
                    <div className="pt-2 space-y-4">
                        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                            <div className="flex items-center gap-2 flex-wrap">
                                {selectedTeacherDateMeta && (
                                    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold ${darkMode ? 'bg-slate-800 text-slate-200' : 'bg-white text-slate-700 border border-slate-200 shadow-sm'}`}>
                                        {selectedTeacherDateMeta.label}
                                    </span>
                                )}
                                {selectedTeacherDateMeta && (
                                    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold ${selectedTeacherDateMeta.phaseId === 'p1' ? (darkMode ? 'bg-cyan-500/12 text-cyan-200' : 'bg-cyan-50 text-cyan-700') : selectedTeacherDateMeta.phaseId === 'mock' ? (darkMode ? 'bg-violet-500/12 text-violet-200' : 'bg-violet-50 text-violet-700') : (darkMode ? 'bg-emerald-500/12 text-emerald-200' : 'bg-emerald-50 text-emerald-700')}`}>
                                        {selectedTeacherDateMeta.phaseLabel}
                                    </span>
                                )}
                                <span className={`text-[11px] font-bold px-2 py-1 rounded-full ${darkMode ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-600'}`}>
                                    共 {batchRowsForDisplay.length} 筆
                                </span>
                                <span className={`text-[11px] font-bold px-2 py-1 rounded-full ${Object.keys(admissionProbabilities).length ? (darkMode ? 'bg-emerald-500/12 text-emerald-200' : 'bg-emerald-50 text-emerald-700') : (darkMode ? 'bg-slate-800 text-slate-400' : 'bg-slate-100 text-slate-500')}`}>
                                    {Object.keys(admissionProbabilities).length ? `機率就緒 ${Object.keys(admissionProbabilities).length}` : '機率計算中'}
                                </span>
                            </div>
                            <div className="flex gap-2 flex-wrap items-center">
                                <button onClick={() => { setSortByPR((prev) => !prev); setSortByProb(false); }} className={`${sortByPR ? BUTTON_SYSTEM.segmentActive : BUTTON_SYSTEM.secondary} px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 transition-all shadow-sm ${sortByPR ? 'bg-indigo-600 text-white shadow-indigo-500/30' : (darkMode ? 'bg-slate-800 text-slate-400 border border-white/5' : 'bg-white text-slate-600 border border-slate-200')}`}>
                                    <ArrowDownWideNarrow className="w-3.5 h-3.5" /> PR排序
                                </button>
                                <button onClick={() => { setSortByProb((prev) => !prev); setSortByPR(false); }} className={`${sortByProb ? BUTTON_SYSTEM.segmentActive : BUTTON_SYSTEM.secondary} px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 transition-all shadow-sm ${sortByProb ? (darkMode ? 'bg-emerald-700 text-white shadow-emerald-900/45 ring-1 ring-emerald-200/30' : 'bg-emerald-600 text-white shadow-emerald-600/25') : (darkMode ? 'bg-slate-800 text-slate-400 border border-white/5' : 'bg-white text-slate-600 border border-slate-200')}`}>
                                    <Percent className="w-3.5 h-3.5" /> 機率排序
                                </button>
                                <button onClick={handleExportBatchExcel} className={`${BUTTON_SYSTEM.secondary} px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm transition-all flex items-center gap-1 border ${darkMode ? 'bg-slate-800 text-slate-300 border-white/10 hover:bg-slate-700' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
                                    <FileSpreadsheet className="w-3.5 h-3.5" /> 下載 Excel
                                </button>
                                <button
                                  onClick={handleSaveBatchGrades}
                                  disabled={!canEditStudentGrades}
                                  className={`${BUTTON_SYSTEM.primary} text-white px-4 py-1.5 rounded-lg text-xs font-bold shadow-md transition-all active:scale-[0.98] flex items-center gap-1 ${
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

                        <div className={`premium-control-rail flex p-1 rounded-xl border overflow-x-auto justify-center shadow-inner ${darkMode ? 'bg-[#020617]/50 border-white/5' : 'bg-slate-50 border-slate-100'}`}>
                            {activeTeacherClassDefs.map(c => {
                                const isActive = teacherClassFilter === c.id;
                                const classTheme = getClassPillTheme(c.id, darkMode);
                                return (
                                    <button
                                      key={c.id}
                                      onClick={() => {
                                          startTransition(() => {
                                              setTeacherClassFilter(c.id);
                                          });
                                      }}
                                      className={`${isActive ? BUTTON_SYSTEM.segmentActive : BUTTON_SYSTEM.segment} flex-1 whitespace-nowrap px-3 py-2 text-xs font-bold rounded-lg transition-all ${isActive ? classTheme.active : classTheme.inactive}`}
                                    >
                                      <span className="inline-flex items-center justify-center gap-1.5">
                                        <span className={`h-1.5 w-1.5 rounded-full ${classTheme.dot} ${isActive ? 'opacity-100' : 'opacity-72'}`} />
                                        <span>{c.label}</span>
                                      </span>
                                    </button>
                                );
                            })}
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

                        <div className={`premium-control-rail flex p-1 rounded-xl border overflow-x-auto shadow-inner ${darkMode ? 'bg-[#020617]/50 border-white/5' : 'bg-slate-50 border-slate-100'}`}>
                            {BATCH_INSIGHT_TABS.map((tab) => (
                                <button
                                  key={tab.id}
                                  onClick={() => {
                                      startTransition(() => {
                                          setBatchInsightTab(tab.id);
                                      });
                                  }}
                                  className={`${batchInsightTab === tab.id ? BUTTON_SYSTEM.segmentActive : BUTTON_SYSTEM.segment} flex-1 whitespace-nowrap px-3 py-2 text-xs font-bold rounded-lg transition-all ${batchInsightTab === tab.id ? (darkMode ? 'bg-slate-800 text-emerald-100 shadow-md border border-white/5 ring-1 ring-white/5' : 'bg-white text-slate-700 shadow-sm border border-slate-200/50') : 'text-slate-500 hover:text-slate-400'}`}
                                >
                                  {tab.label}
                                </button>
                            ))}
                        </div>

                        <div key={`batch-tab-${batchInsightTab}-${selectedBatchWeekendID || 'none'}-${teacherClassFilter}`} className={prefersReducedMotion ? '' : 'tab-panel-enter'}>
                        {batchInsightTab === 'grades' && (
                            <div
                                key={`batch-grades-${selectedBatchWeekendID || 'none'}-${teacherClassFilter}-${sortByPR ? 'pr' : 'none'}-${sortByProb ? 'prob' : 'none'}`}
                                className={`overflow-x-auto rounded-xl border shadow-inner ${prefersReducedMotion ? '' : 'list-fade-in'} ${darkMode ? 'border-white/5 bg-[#020617]/30' : 'border-slate-200 bg-white'}`}
                                style={{ contentVisibility: 'auto', containIntrinsicSize: '540px' }}
                            >
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
                                        {renderedBatchRows.map((row, sIndex) => (
                                            <BatchRow
                                                key={row.student.id}
                                                student={row.student}
                                                sIndex={sIndex}
                                                dateGrades={row.dateGrades}
                                                prValue={row.prValue}
                                                probValue={row.probValue}
                                                darkMode={darkMode} 
                                                canEdit={canEditStudentGrades}
                                                classDefs={activeTeacherClassDefs}
                                                handleBatchGradeChange={handleBatchGradeChange} 
                                                handleKeyDown={handleKeyDown} 
                                                handlePaste={handlePaste} 
                                            />
                                        ))}
                                        {batchRowsForDisplay.length > renderedBatchRows.length && (
                                            <tr>
                                                <td colSpan={10} className={`px-4 py-3 text-center text-[11px] font-bold ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                                                    正在載入更多列 {renderedBatchRows.length} / {batchRowsForDisplay.length}
                                                </td>
                                            </tr>
                                        )}
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
                                          className={`${BUTTON_SYSTEM.primary} px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors`}
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
                                                      className={`${BUTTON_SYSTEM.primary} px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-white bg-sky-600 hover:bg-sky-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors`}
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
                            <div className={`rounded-2xl border p-3 sm:p-3.5 space-y-2.5 ${darkMode ? 'bg-slate-900/40 border-white/10' : 'bg-white border-slate-200'}`}>
                                {isQueryInsightsPending ? (
                                    <div className="space-y-2.5">
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <div className="flex items-center gap-2">
                                                <Info className={`w-4 h-4 ${darkMode ? 'text-slate-300' : 'text-slate-500'}`} />
                                                <h4 className={`text-xs font-black tracking-widest uppercase ${darkMode ? 'text-slate-200' : 'text-slate-600'}`}>查詢監控中心</h4>
                                            </div>
                                            <div className={`text-[10px] font-bold ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                                                正在整理監控資料...
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
                                            {Array.from({ length: 3 }).map((_, index) => (
                                                <div
                                                  key={`query-shell-${index}`}
                                                  className={`rounded-xl border px-3 py-3 animate-pulse ${darkMode ? 'border-white/10 bg-slate-900/45' : 'border-slate-200 bg-slate-50'}`}
                                                >
                                                    <div className={`h-2.5 w-16 rounded-full ${darkMode ? 'bg-slate-700' : 'bg-slate-200'}`} />
                                                    <div className={`mt-2 h-5 w-12 rounded-full ${darkMode ? 'bg-slate-800' : 'bg-slate-200'}`} />
                                                    <div className={`mt-2 h-2.5 w-24 rounded-full ${darkMode ? 'bg-slate-800' : 'bg-slate-100'}`} />
                                                </div>
                                            ))}
                                        </div>
                                        <div className={`rounded-xl border px-3 py-8 text-center text-xs font-bold ${darkMode ? 'border-white/10 bg-slate-900/45 text-slate-400' : 'border-slate-200 bg-slate-50 text-slate-500'}`}>
                                            分頁已切換，統計正在背景整理，不會卡住其他操作。
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                <div className="flex flex-wrap items-center justify-between gap-1.5">
                                    <div className="flex items-center gap-2">
                                        <Info className={`w-4 h-4 ${darkMode ? 'text-slate-300' : 'text-slate-500'}`} />
                                        <h4 className={`text-xs font-black tracking-widest uppercase ${darkMode ? 'text-slate-200' : 'text-slate-600'}`}>查詢監控中心</h4>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                          onClick={() => loadQueryStats({ force: true })}
                                          disabled={queryStatsLoading}
                                          className={`${BUTTON_SYSTEM.secondary} px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-colors ${
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
                                          className={`${BUTTON_SYSTEM.danger} px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-colors ${
                                            queryStatsLoading
                                              ? 'bg-slate-300 text-white cursor-not-allowed'
                                              : 'bg-red-500 text-white hover:bg-red-400'
                                          }`}
                                        >
                                          手動重置
                                        </button>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_10.5rem_auto] gap-1.5">
                                    <div className={`flex items-center gap-2 rounded-xl border px-2.5 py-1.5 ${darkMode ? 'border-white/10 bg-slate-900/50' : 'border-slate-200 bg-white'}`}>
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
                                      className={`rounded-xl border px-2.5 py-1.5 text-xs font-bold outline-none ${darkMode ? 'border-white/10 bg-slate-900/50 text-slate-200' : 'border-slate-200 bg-white text-slate-700'}`}
                                    >
                                        <option value="all">全部日期</option>
                                        {queryEventsByDay.map((day) => (
                                            <option key={day.dateKey} value={day.dateKey}>{`${day.dateLabel}（${day.items.length}）`}</option>
                                        ))}
                                    </select>
                                    <button
                                      onClick={() => {
                                          setQueryMonitorKeyword('');
                                          setQueryMonitorDateFilter('all');
                                      }}
                                      className={`${BUTTON_SYSTEM.secondary} rounded-xl border px-3 py-1.5 text-[10px] font-bold transition-colors ${darkMode ? 'border-white/10 bg-slate-900/50 text-slate-200 hover:bg-slate-800' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
                                    >
                                      清除條件
                                    </button>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-[11.4rem_1fr] gap-1.5">
                                    <select
                                      value={queryMonitorSort}
                                      onChange={(e) => setQueryMonitorSort(e.target.value)}
                                      className={`rounded-xl border px-2.5 py-1.5 text-xs font-bold outline-none ${darkMode ? 'border-white/10 bg-slate-900/50 text-slate-200' : 'border-slate-200 bg-white text-slate-700'}`}
                                    >
                                        <option value="count_desc">依查詢次數</option>
                                        <option value="latest_desc">依最近查詢</option>
                                        <option value="id_asc">依學號排序</option>
                                    </select>
                                    <div className={`flex flex-wrap items-center justify-between gap-1.5 rounded-xl border px-2.5 py-1.5 text-[10px] font-semibold ${darkMode ? 'border-white/10 bg-slate-900/45 text-slate-300' : 'border-slate-200 bg-slate-50 text-slate-500'}`}>
                                        <span>上次重置：{queryStatsLastResetText}</span>
                                        <span>排行 {queryStatsRowsFiltered.length} 人 / 事件 {queryFilteredSummary.filteredEventCount} 筆</span>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 lg:grid-cols-4 gap-1.5">
                                    <div className={`rounded-xl border px-2.5 py-2 ${darkMode ? 'bg-slate-900/45 border-white/10' : 'bg-slate-50 border-slate-200'}`}>
                                        <div className={`text-[9px] font-bold tracking-wider uppercase ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>總查詢數</div>
                                        <div className={`text-base font-black ${darkMode ? 'text-emerald-200' : 'text-emerald-700'}`}>{queryFilteredSummary.totalQueries}</div>
                                        <div className={`text-[9px] font-semibold ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>累積</div>
                                    </div>
                                    <div className={`rounded-xl border px-2.5 py-2 ${darkMode ? 'bg-slate-900/45 border-white/10' : 'bg-slate-50 border-slate-200'}`}>
                                        <div className={`text-[9px] font-bold tracking-wider uppercase ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>排行學生數</div>
                                        <div className={`text-base font-black ${darkMode ? 'text-sky-200' : 'text-sky-700'}`}>{queryFilteredSummary.rankedStudentCount}</div>
                                    </div>
                                    <div className={`rounded-xl border px-2.5 py-2 ${darkMode ? 'bg-slate-900/45 border-white/10' : 'bg-slate-50 border-slate-200'}`}>
                                        <div className={`text-[9px] font-bold tracking-wider uppercase ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>目前篩選事件</div>
                                        <div className={`text-base font-black ${darkMode ? 'text-cyan-200' : 'text-cyan-700'}`}>{queryFilteredSummary.filteredEventCount}</div>
                                    </div>
                                    <div className={`rounded-xl border px-2.5 py-2 ${darkMode ? 'bg-slate-900/45 border-white/10' : 'bg-slate-50 border-slate-200'}`}>
                                        <div className={`text-[9px] font-bold tracking-wider uppercase ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>最新一天查詢</div>
                                        <div className={`text-base font-black ${darkMode ? 'text-indigo-200' : 'text-indigo-700'}`}>{queryFilteredSummary.latestDayCount}</div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 xl:grid-cols-[1.02fr_0.98fr] gap-2">
                                    <div className={`rounded-xl border overflow-hidden ${darkMode ? 'border-white/10 bg-slate-900/45' : 'border-slate-200 bg-white'}`} style={{ contentVisibility: 'auto', containIntrinsicSize: '420px' }}>
                                        <div className={`grid grid-cols-[5.6rem_1fr_3.6rem_6rem_4.2rem] px-2.5 py-1.5 text-[10px] font-bold tracking-wide ${darkMode ? 'bg-slate-800 text-slate-300' : 'bg-slate-50 text-slate-500'}`}>
                                            <span className="text-center">學號</span>
                                            <span className="text-center">姓名</span>
                                            <span className="text-center">次數</span>
                                            <span className="text-center">最後查詢</span>
                                            <span className="text-center">狀態</span>
                                        </div>
                                        <div className={`${darkMode ? 'bg-slate-900/50' : 'bg-white'}`}>
                                            {(queryStatsRowsFiltered.slice(0, 30)).map((row) => {
                                                const nowTs = Date.now();
                                                const latestTs = Number(row.latestTs) || 0;
                                                const daysSinceLast = latestTs ? Math.floor((nowTs - latestTs) / (24 * 60 * 60 * 1000)) : null;
                                                let statusText = '正常';
                                                let statusClass = darkMode
                                                    ? 'bg-emerald-400/20 text-emerald-100 border-emerald-300/30'
                                                    : 'bg-emerald-100 text-emerald-700 border-emerald-200';

                                                if (daysSinceLast !== null && daysSinceLast >= 14) {
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
                                                      className={`grid grid-cols-[5.6rem_1fr_3.6rem_6rem_4.2rem] px-2.5 py-1.5 text-[11px] border-t items-center cursor-pointer transition-colors ${darkMode ? 'border-white/5 text-slate-200 hover:bg-slate-800/50' : 'border-slate-100 text-slate-700 hover:bg-slate-50/70'}`}
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

                                    <div className={`rounded-xl border overflow-hidden ${darkMode ? 'border-white/10 bg-slate-900/45' : 'border-slate-200 bg-white'}`} style={{ contentVisibility: 'auto', containIntrinsicSize: '420px' }}>
                                        <div className={`px-2.5 py-1.5 text-[10px] font-bold tracking-wide uppercase ${darkMode ? 'bg-slate-800 text-slate-300' : 'bg-slate-50 text-slate-500'}`}>每日查詢名單（由新到舊）</div>
                                        <div className="max-h-[24rem] overflow-y-auto">
                                            {queryEventsByDayFiltered.map((day) => (
                                                <div key={day.dateKey} className={`border-t ${darkMode ? 'border-white/5' : 'border-slate-100'}`}>
                                                    <div className={`px-2.5 py-1.5 text-[10px] font-black flex items-center justify-between ${darkMode ? 'text-slate-200 bg-slate-900/55' : 'text-slate-700 bg-slate-50/80'}`}>
                                                        <span>{day.dateLabel}</span>
                                                        <span className={`${darkMode ? 'text-emerald-300' : 'text-emerald-700'}`}>{day.items.length} 次</span>
                                                    </div>
                                                    <div>
                                                        {day.items.map((event, idx) => (
                                                            <div key={`${event.id}-${event.ts}-${idx}`} className={`grid grid-cols-[4.9rem_5.7rem_1fr_3.8rem] gap-1.5 px-2.5 py-1 text-[10px] ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                                                                <span className="font-mono">{event.timeLabel}</span>
                                                                <span className="font-mono">{event.id}</span>
                                                                <span className="truncate">{event.name || '-'}</span>
                                                                <span className={`text-right text-[10px] font-bold ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>{event.relativeLabel}</span>
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

                                <div className={`rounded-lg border px-2.5 py-1.5 ${darkMode ? 'border-white/10 bg-slate-900/55 text-slate-300' : 'border-slate-200 bg-slate-50 text-slate-600'} text-[10px] font-semibold`}>
                                    家長查詢效能：快取命中 <span className="font-black text-emerald-600">{parentQueryPerf.cacheHit}</span> / 未命中 <span className="font-black text-sky-600">{parentQueryPerf.cacheMiss}</span>，平均 <span className="font-black">{parentQueryPerf.avgMs}ms</span>，P95 <span className="font-black">{parentQueryPerf.p95Ms}ms</span>，最近一次 <span className="font-black">{parentQueryPerf.latestMs}ms</span>。
                                </div>

                                    <div className={`rounded-xl border p-2.5 space-y-2 ${darkMode ? 'border-white/10 bg-slate-900/45' : 'border-slate-200 bg-white'}`}>
                                        <div className="flex items-center justify-between gap-2">
                                            <div className={`text-[10px] font-black tracking-widest uppercase ${darkMode ? 'text-slate-300' : 'text-slate-500'}`}>系統操作歷程</div>
                                            <button
                                              onClick={handleCreateLocalSnapshot}
                                              className={`${BUTTON_SYSTEM.secondary} px-2.5 py-1 rounded-lg text-[10px] font-bold transition-colors ${darkMode ? 'bg-slate-800 text-slate-200 hover:bg-slate-700' : 'bg-slate-800 text-white hover:bg-slate-700'}`}
                                            >
                                              建立快照
                                            </button>
                                        </div>

                                        <div className={`rounded-lg border p-2 ${darkMode ? 'border-white/10 bg-slate-900/55' : 'border-slate-200 bg-slate-50'}`}>
                                            <div className={`text-[10px] font-black tracking-widest uppercase mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-500'}`}>本機快照</div>
                                            <div className="space-y-1 max-h-24 overflow-y-auto pr-1">
                                                {localSnapshots.map((snapshot) => (
                                                    <div key={snapshot.id} className={`rounded-lg border px-2 py-1 ${darkMode ? 'border-white/10 bg-slate-900/55' : 'border-slate-200 bg-white'}`}>
                                                        <div className="flex items-center justify-between gap-2">
                                                            <div className={`text-[10px] font-bold truncate ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>{snapshot.label}</div>
                                                            <div className="flex items-center gap-1">
                                                                <button
                                                                  onClick={() => executeWithSecurity(() => handleRestoreLocalSnapshot(snapshot.id), { title: '還原本機快照' })}
                                                                  className={`${BUTTON_SYSTEM.primary} text-[10px] font-black px-2 py-0.5 rounded bg-emerald-600 text-white hover:bg-emerald-500 transition-colors`}
                                                                >
                                                                  還原
                                                                </button>
                                                                <button
                                                                  onClick={() => executeWithSecurity(() => handleDeleteLocalSnapshot(snapshot.id), { title: '刪除本機快照' })}
                                                                  className={`${BUTTON_SYSTEM.danger} text-[10px] font-black px-2 py-0.5 rounded bg-rose-500 text-white hover:bg-rose-400 transition-colors`}
                                                                >
                                                                  刪除
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                                {!localSnapshots.length && (
                                                    <div className={`text-[11px] font-semibold text-center py-2 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                                                        尚未建立快照
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        <div className={`rounded-lg border p-2 ${darkMode ? 'border-white/10 bg-slate-900/55' : 'border-slate-200 bg-slate-50'}`}>
                                            <div className="flex items-center justify-between gap-2 mb-1.5">
                                                <div className={`text-[10px] font-black tracking-widest uppercase ${darkMode ? 'text-slate-300' : 'text-slate-500'}`}>最近操作</div>
                                                <button
                                                  type="button"
                                                  onClick={() => setIsOperationLogExpanded((prev) => !prev)}
                                                  className={`text-[10px] font-black px-2 py-0.5 rounded-md transition-colors ${darkMode ? 'bg-slate-800 text-slate-200 hover:bg-slate-700' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'}`}
                                                >
                                                  {isOperationLogExpanded ? '收起' : '展開'}
                                                </button>
                                            </div>
                                            {isOperationLogExpanded ? (
                                                <div className="space-y-1 max-h-44 overflow-y-auto pr-1">
                                                    {operationLogPreview.map((log) => (
                                                        <div key={log.id} className={`rounded-lg border px-2 py-1 ${darkMode ? 'border-white/10 bg-slate-900/55' : 'border-slate-200 bg-white'}`}>
                                                            <div className="flex items-center justify-between gap-2">
                                                                <span className={`text-[10px] font-black ${darkMode ? 'text-slate-100' : 'text-slate-700'}`}>{log.title}</span>
                                                                <span className={`text-[10px] font-mono ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>{formatMonitorTimeLabel(log.ts, false)}</span>
                                                            </div>
                                                            {log.detail && (
                                                                <div className={`text-[10px] mt-1 ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>{log.detail}</div>
                                                            )}
                                                        </div>
                                                    ))}
                                                    {!operationLogPreview.length && (
                                                        <div className={`text-[11px] font-semibold text-center py-2 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                                                            目前沒有操作紀錄
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                <div className={`text-[10px] font-semibold px-1 py-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                                                    已收合，點擊「展開」查看 {operationLogPreview.length} 筆操作紀錄
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    </>
                                )}
                            </div>
                        )}
                        </div>
                    </div>
                )}
            </div>
            {/* ... other modals ... */}
            {statusMsg && (
              <div className="fixed bottom-[calc(env(safe-area-inset-bottom)+1.25rem)] left-1/2 -translate-x-1/2 z-50">
                <div className="status-toast-enter bg-slate-900/90 text-white px-5 py-3 rounded-full flex items-center text-xs font-bold shadow-2xl backdrop-blur-md border border-white/10">
                  <Check className="w-4 h-4 mr-2 text-blue-400" /> {statusMsg}
                </div>
              </div>
            )}
              
            {/* ... Single View ... */}
            {teacherViewMode === 'single' && currentStudentId && !loading && (
              <div className={`panel-fade-in rounded-[2rem] shadow-2xl border overflow-hidden backdrop-blur-md ${darkMode ? 'bg-[#0f172a]/70 border-white/10 ring-1 ring-white/5' : 'bg-white border-white shadow-[0_20px_52px_rgba(15,23,42,0.12)]'}`}>
                <div className={`p-6 border-b flex justify-between items-center ${darkMode ? 'border-white/5 bg-[#0f172a]/50' : 'border-slate-200/60 bg-white'}`}>
                  <div className="flex-1 mr-4">
                      <input type="text" value={studentName} onChange={(e) => setStudentName(e.target.value)} className={`text-2xl font-bold bg-transparent border-none outline-none w-full transition-all tracking-tight ${darkMode ? 'text-white placeholder:text-slate-700' : 'text-slate-800 placeholder:text-slate-200'}`} placeholder="學生姓名"/>
                      <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border mt-1 inline-block opacity-60 ${darkMode ? 'border-slate-600 text-slate-400' : 'border-slate-200 text-slate-400'}`}>{currentStudentId}</span>
                  </div>
                  <div className="flex gap-2">
                    {canEditStudentGrades ? (
                      <button onClick={handleDeleteStudent} className={`${BUTTON_SYSTEM.iconDanger} bg-red-500/10 text-red-500 p-2.5 rounded-xl hover:bg-red-500/20 transition-colors active:scale-95`}><Trash2 className="w-5 h-5"/></button>
                    ) : (
                      <button type="button" disabled className={`${BUTTON_SYSTEM.icon} bg-slate-200 text-slate-400 p-2.5 rounded-xl cursor-not-allowed`} title="2491212 權限不可刪除學生">
                        <Trash2 className="w-5 h-5"/>
                      </button>
                    )}
                    <button
                      onClick={handleSaveGrades}
                      disabled={!canEditStudentGrades}
                      className={`btn-sheen px-5 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${canEditStudentGrades ? 'bg-blue-600 text-white hover:bg-blue-500 shadow-lg shadow-blue-500/30 active:scale-95' : 'bg-slate-300 text-white cursor-not-allowed'}`}
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
                                <th className="px-2 py-3 text-center text-slate-500 font-bold">班級</th>
                                <th className="px-2 py-3 text-center text-rose-500 font-bold">國文</th>
                                <th className="px-2 py-3 text-center text-amber-500 font-bold">英文</th>
                                <th className="px-2 py-3 text-center text-cyan-500 font-bold">數學</th>
                                <th className="px-2 py-3 text-center font-bold text-blue-500">總分</th>
                            </tr>
                        </thead>
                        <tbody className={`divide-y ${darkMode ? 'divide-white/5' : 'divide-slate-100'}`}>
                            {singleViewDateEntries.map((entry, dateIndex) => {
                                const g = grades[entry.gradeKey] || { chi: '', eng: '', math: '', total: '', class: 'A班' };
                                return (
                                    <tr key={entry.weekendID} className={`${darkMode ? 'hover:bg-white/5' : 'hover:bg-slate-50/80'} transition-colors`}>
                                            <td className="px-4 py-3 font-mono text-xs font-bold opacity-60">{entry.label}</td>
                                            <td className="px-2 py-2 text-center">
                                                <select 
                                                    value={g.class || 'A班'} 
                                                    disabled={!canEditStudentGrades}
                                                    onChange={(e) => handleGradeChange(entry.gradeKey, 'class', e.target.value)}
                                                    className={`w-full text-center p-2 rounded-lg bg-transparent border border-transparent outline-none text-base font-bold transition-all ${canEditStudentGrades ? 'cursor-pointer hover:bg-black/5 dark:hover:bg-white/5' : 'cursor-not-allowed opacity-70'} ${darkMode ? 'text-slate-200 focus:bg-slate-800' : 'text-slate-700 focus:bg-white'}`}
                                                >
                                                    {activeTeacherClassDefs.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                                                </select>
                                            </td>
                                            {['chi', 'eng', 'math'].map(sub => (
                                                <td key={sub} className="px-2 py-2 text-center">
                                                    <input id={`single-${dateIndex}-${sub}`} type="text" disabled={!canEditStudentGrades} className={`w-full text-center p-2 rounded-lg bg-transparent border border-transparent outline-none text-base font-bold transition-all ${!canEditStudentGrades ? 'cursor-not-allowed opacity-70' : ''} ${darkMode ? 'focus:bg-slate-800 focus:border-blue-500/50 text-slate-200' : 'focus:bg-white focus:border-blue-200 text-slate-700'}`} value={g[sub]} onChange={(e) => handleGradeChange(entry.gradeKey, sub, e.target.value)} onKeyDown={canEditStudentGrades ? (e) => handleSingleKeyDown(e, dateIndex, sub) : undefined} onPaste={canEditStudentGrades ? (e) => handleSinglePaste(e, dateIndex, sub) : undefined} placeholder="-" />
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
          <div className="max-w-5xl pt-1 sm:pt-2 mx-auto space-y-6 transition-all duration-300"> 
            {!viewData && !parentSearchShell && (
            <div className="max-w-md mx-auto pt-6">
              <div className={`panel-fade-in backdrop-blur-[26px] p-8 rounded-[2.5rem] shadow-2xl border text-center relative overflow-hidden ${darkMode ? 'bg-[#121c17]/88 border-emerald-200/15 shadow-black/30' : 'bg-white/78 border-white/85 ring-1 ring-white/55 shadow-[0_24px_55px_rgba(15,23,42,0.12)]'}`}>
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-sky-500 via-emerald-500 to-indigo-500"></div>
                <h2 className={`text-2xl font-black mb-8 tracking-tight ${darkMode ? 'text-white' : 'text-slate-800'}`}>查詢成績</h2>
                <div className={`w-full p-2 rounded-2xl border transition-all mb-6 shadow-inner ${darkMode ? 'bg-[#08120d]/70 border-emerald-200/15 focus-within:ring-2 focus-within:ring-emerald-500/20' : 'bg-white/75 border-white/85 focus-within:bg-white focus-within:ring-2 focus-within:ring-blue-100'}`}>
                  <input type="text" placeholder="請輸入學號" className={`w-full bg-transparent border-none px-4 py-3 outline-none text-xl font-bold text-center tracking-widest placeholder:text-base placeholder:tracking-normal placeholder:font-medium ${darkMode ? 'text-white placeholder:text-slate-600' : 'text-slate-800 placeholder:text-slate-400'}`} value={searchId} onChange={(e) => setSearchId(e.target.value)} />
                </div>
                <button onClick={handleParentSearch} disabled={loading || !user} className={`${BUTTON_SYSTEM.primary} w-full bg-emerald-600 hover:bg-emerald-500 text-white py-4 rounded-2xl font-bold text-lg shadow-sm transition-all active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100 tracking-wide`}>{loading ? '查詢中...' : (!user ? '連線中...' : '開始查詢')}</button>
                {searchError && <p className="mt-6 text-red-500 text-xs font-bold bg-red-500/10 inline-block px-4 py-2 rounded-full animate-pulse">{searchError}</p>}
              </div>
            </div>
            )}

            {!viewData && parentSearchShell && (
              <div className={`panel-fade-in rounded-[2.5rem] shadow-2xl overflow-hidden border backdrop-blur-[28px] animate-pulse ${darkMode ? 'bg-[#121c17]/88 border-emerald-200/15 shadow-black/30' : 'bg-white/74 border-white/85 ring-1 ring-white/55 shadow-[0_26px_60px_rgba(15,23,42,0.13)]'}`}>
                <div className={`p-8 pb-6 relative overflow-hidden ${darkMode ? 'bg-[#0d1712] border-b border-emerald-200/10' : 'bg-[linear-gradient(112deg,rgba(236,253,245,0.93)_0%,rgba(224,242,254,0.9)_54%,rgba(255,255,255,0.92)_100%)] border-b border-white/70'}`}>
                  <div className={`absolute top-0 right-0 w-64 h-64 rounded-full -mr-20 -mt-20 blur-3xl ${darkMode ? 'bg-emerald-500 opacity-20' : 'bg-emerald-300 opacity-25'}`}></div>
                  <div className="relative z-10 mb-6 pr-[9.5rem] sm:pr-[12.5rem]">
                    <div className={`h-5 w-28 rounded-full ${darkMode ? 'bg-white/10' : 'bg-emerald-100/80'}`} />
                    <div className={`mt-4 h-10 w-44 rounded-2xl ${darkMode ? 'bg-white/10' : 'bg-slate-200/85'}`} />
                    <div className={`mt-3 h-4 w-28 rounded-full ${darkMode ? 'bg-white/10' : 'bg-slate-200/85'}`} />
                  </div>
                  <div className="absolute top-0 right-0 z-20 flex flex-col items-end gap-3.5 sm:gap-4">
                    <div className={`h-9 w-9 rounded-full ${darkMode ? 'bg-white/10' : 'bg-white border border-slate-200'}`} />
                    <div className="w-[9rem] sm:w-[11rem] text-right">
                      <div className={`ml-auto h-3 w-16 rounded-full ${darkMode ? 'bg-white/10' : 'bg-emerald-100/90'}`} />
                      <div className={`mt-3 ml-auto h-12 w-24 rounded-2xl ${darkMode ? 'bg-white/10' : 'bg-slate-200/85'}`} />
                      <div className={`mt-2 ml-auto h-3 w-28 rounded-full ${darkMode ? 'bg-white/10' : 'bg-slate-200/85'}`} />
                    </div>
                  </div>
                </div>
                <div className="p-6 space-y-6">
                  <div className={`h-16 rounded-2xl ${darkMode ? 'bg-white/5' : 'bg-slate-100/90'}`} />
                  <div className={`premium-control-rail flex p-1 rounded-xl ${darkMode ? 'bg-[#08120d]/70' : 'bg-slate-100'}`}>
                    {Array.from({ length: 3 }).map((_, idx) => (
                      <div key={`parent-shell-phase-${idx}`} className={`flex-1 h-9 rounded-lg ${darkMode ? 'bg-white/10' : 'bg-white/90 border border-slate-100'}`} />
                    ))}
                  </div>
                  <div className={`premium-control-rail flex p-1 rounded-2xl ${darkMode ? 'bg-[#08120d]/70' : 'bg-slate-100'}`}>
                    {Array.from({ length: 4 }).map((_, idx) => (
                      <div key={`parent-shell-tab-${idx}`} className={`flex-1 h-10 rounded-xl ${darkMode ? 'bg-white/10' : 'bg-white/90 border border-slate-100'}`} />
                    ))}
                  </div>
                  <div className={`h-72 rounded-3xl border ${darkMode ? 'bg-white/5 border-white/10' : 'bg-slate-50 border-slate-200'}`} />
                  <div className="space-y-4">
                    {Array.from({ length: 2 }).map((_, idx) => (
                      <div key={`parent-shell-detail-${idx}`} className={`rounded-3xl border p-5 ${darkMode ? 'bg-white/5 border-white/10' : 'bg-white border-slate-200/90'}`}>
                        <div className={`h-4 w-24 rounded-full ${darkMode ? 'bg-white/10' : 'bg-slate-200/85'}`} />
                        <div className={`mt-4 h-10 w-full rounded-2xl ${darkMode ? 'bg-white/10' : 'bg-slate-100/90'}`} />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {viewData && (
              <div className={`panel-fade-in rounded-[2.5rem] shadow-2xl overflow-hidden border backdrop-blur-[28px] ${darkMode ? 'bg-[#121c17]/88 border-emerald-200/15 shadow-black/30' : 'bg-white/74 border-white/85 ring-1 ring-white/55 shadow-[0_26px_60px_rgba(15,23,42,0.13)]'}`}>
                <div className={`p-8 pb-6 relative overflow-hidden ${darkMode ? 'bg-[#0d1712] text-white border-b border-emerald-200/10' : 'bg-[linear-gradient(112deg,rgba(236,253,245,0.93)_0%,rgba(224,242,254,0.9)_54%,rgba(255,255,255,0.92)_100%)] text-slate-800 border-b border-white/70'}`}>
                   <div className={`absolute top-0 right-0 w-64 h-64 rounded-full -mr-20 -mt-20 blur-3xl ${darkMode ? 'bg-emerald-500 opacity-20' : 'bg-emerald-300 opacity-25'}`}></div>
                   
                   <div className="relative z-10 mb-6">
                       <div className="absolute top-0 right-0 z-20 flex flex-col items-end gap-3.5 sm:gap-4">
                           <button onClick={() => setViewData(null)} className={`${BUTTON_SYSTEM.icon} p-2 rounded-full backdrop-blur-md transition-colors ${darkMode ? 'text-slate-400 hover:text-white bg-white/5' : 'text-slate-500 hover:text-slate-700 bg-white border border-slate-200'}`}><LogOut className="w-4 h-4"/></button>

                           {viewData.prob && viewData.prob !== '-' && (
                               <div className="w-[9rem] sm:w-[11rem] text-right">
                                   <div className={`text-[9px] font-bold uppercase tracking-[0.28em] ${darkMode ? 'text-emerald-300/85' : 'text-emerald-700/85'}`}>錄取機率</div>
                                   <div className="mt-1 flex items-end justify-end gap-1 leading-none">
                                       <span className="text-[2.45rem] sm:text-[3rem] font-black tracking-tight tabular-nums" style={parentProbVisual ? parentProbVisual.textStyle : undefined}>{viewData.prob}</span>
                                       <span className="text-lg sm:text-xl font-black mb-[0.28rem]" style={parentProbVisual ? parentProbVisual.textStyle : undefined}>%</span>
                                   </div>
                                   <p className={`mt-1 text-[9px] leading-relaxed font-medium ${darkMode ? 'text-slate-300/80' : 'text-slate-500'}`}>系統綜合歷史成績運算，僅供參考</p>
                               </div>
                           )}
                       </div>

                       <div className={viewData.prob && viewData.prob !== '-' ? 'pr-[9.5rem] sm:pr-[12.5rem]' : 'pr-12'}>
                           <div className={`text-[9px] font-bold uppercase tracking-widest border inline-block px-2 py-1 rounded ${darkMode ? 'text-emerald-300 border-emerald-300/25' : 'text-emerald-700 border-emerald-200'}`}>Student Profile</div>
                           <div className="mt-2">
                               <h3 className={`text-2xl sm:text-3xl font-bold tracking-tighter break-words ${darkMode ? 'text-white' : 'text-slate-800'}`}>{viewData.name}</h3>
                               <p className="font-mono text-xs mt-1 font-bold text-slate-500">{viewData.id}</p>
                           </div>
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

                  <div className={`premium-control-rail flex p-1 mb-6 rounded-xl border overflow-x-auto justify-center shadow-inner ${darkMode ? 'bg-[#08120d]/70 border-emerald-200/10' : 'bg-slate-50 border-slate-100'}`}>
                      {PHASES.map(phase => (
                          <button key={phase.id} onClick={() => {
                              startTransition(() => {
                                  setActivePhase(phase.id);
                              });
                          }} className={`${activePhase === phase.id ? BUTTON_SYSTEM.segmentActive : BUTTON_SYSTEM.segment} flex-1 whitespace-nowrap px-3 py-2 text-xs font-bold rounded-lg transition-all ${activePhase === phase.id ? (darkMode ? 'bg-[#1f2a24] text-emerald-100 shadow-md border border-emerald-200/20 ring-1 ring-emerald-200/10' : 'bg-white text-slate-800 shadow-sm border border-slate-100') : 'text-slate-500 hover:text-slate-400'}`}>{phase.name}</button>
                      ))}
                  </div>

                  <div className={`premium-control-rail flex p-1 rounded-2xl mb-8 justify-center shadow-inner ${darkMode ? 'bg-[#08120d]/70' : 'bg-slate-100'}`}>
                      {['總分', '國文', '英文', '數學'].map(tab => {
                          const tabKey = tab === '總分' ? 'total' : tab === '國文' ? 'chi' : tab === '英文' ? 'eng' : 'math';
                          const isActive = activeTab === tabKey;
                          return (
                              <button key={tabKey} onClick={() => {
                                  startTransition(() => {
                                      setActiveTab(tabKey);
                                  });
                              }} className={`${isActive ? BUTTON_SYSTEM.segmentActive : BUTTON_SYSTEM.segment} flex-1 py-2.5 text-xs font-bold rounded-xl transition-all duration-300 ${isActive ? (darkMode ? 'bg-[#1f2a24] text-emerald-100 shadow-md border border-emerald-200/15 ring-1 ring-emerald-200/10' : 'bg-white text-slate-800 shadow-sm border border-slate-100') : 'text-slate-400'}`}>
                                {isActive && <span className={`inline-block w-1.5 h-1.5 rounded-full ${TAB_DOT_BG_CLASS[tabKey]} mr-1.5 mb-0.5`}></span>}{tab}
                              </button>
                          )
                      })}
                  </div>

                  <div key={`parent-tab-${activePhase}-${activeTab}`} className={prefersReducedMotion ? '' : 'tab-panel-enter'}>
                    {deferredParentPhaseData.length > 0 ? (
                      <Suspense fallback={<ChartFallback heightClass="h-72" />}>
                        {activeTab === 'total' && <SingleSubjectChart data={deferredParentPhaseData} subjectKey="total" avgKey="avgTotal" lineColor={COLORS.total.hex} title="總分" domain={[0, 300]} isDarkMode={darkMode} />}
                        {activeTab === 'chi' && <SingleSubjectChart data={deferredParentPhaseData} subjectKey="chi" avgKey="avgChi" lineColor={COLORS.chi.hex} title="國文" domain={[0, 100]} isDarkMode={darkMode} />}
                        {activeTab === 'eng' && <SingleSubjectChart data={deferredParentPhaseData} subjectKey="eng" avgKey="avgEng" lineColor={COLORS.eng.hex} title="英文" domain={activePhase === 'mock' ? [0, 80] : [0, 100]} isDarkMode={darkMode} />}
                        {activeTab === 'math' && <SingleSubjectChart data={deferredParentPhaseData} subjectKey="math" avgKey="avgMath" lineColor={COLORS.math.hex} title="數學" domain={activePhase === 'mock' ? [0, 120] : [0, 100]} isDarkMode={darkMode} />}
                        <ParentAbilityRadar data={deferredParentRadarData} maxValue={parentRadarMax} isDarkMode={darkMode} recordCount={deferredParentPhaseData.length} phaseName={activePhaseLabel} />
                      </Suspense>
                    ) : (
                      <div className={`rounded-2xl border px-4 py-8 text-center text-xs font-bold ${darkMode ? 'bg-white/5 border-white/10 text-slate-300' : 'bg-slate-50 border-slate-200 text-slate-500'}`}>
                        目前「{activePhaseLabel || '此階段'}」暫無資料，請切換其他階段查看
                      </div>
                    )}
                  </div>
                </div>
                  
                <div className={`p-6 border-t backdrop-blur-md ${darkMode ? 'bg-[#101a15] border-emerald-200/10' : 'bg-white/74 border-white/75 ring-1 ring-white/45'}`}>
                    <h4 className={`font-bold mb-6 text-xs flex items-center justify-center gap-2 tracking-widest uppercase ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>詳細紀錄</h4>
                    <div className="space-y-4">
                        {parentPhaseDataDesc.map((d, rowIndex) => {
                             // 使用 weekendID（如果存在）或 date，確保日A班/日B班的週日日期也能正確計算排名
                             const dateForRank = d.weekendID || d.date;
                             const totalRank = calculateRank(dateForRank, 'total', d.total, d.class);
                             const globalPR = calculateGlobalPR(dateForRank, 'total', d.total);
                             return (
                             <div key={`${d.weekendID || d.date}-${rowIndex}`} className={`group p-5 rounded-3xl border transition-all duration-300 ${darkMode ? 'bg-white/5 border-white/5 hover:border-blue-500/20' : 'bg-white/84 border-white/85 ring-1 ring-white/45 shadow-[0_10px_28px_rgba(15,23,42,0.06)] backdrop-blur-md hover:border-sky-200/90 hover:shadow-[0_18px_34px_rgba(14,165,233,0.12)]'}`}>
                                <div className="flex justify-between items-start mb-4">
                                    <div className="flex flex-col gap-2 items-start">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-bold text-slate-400 font-mono">{d.date}</span>
                                            {d.class && <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold opacity-60 ${darkMode ? 'bg-white/10 text-white' : 'bg-slate-100 text-slate-600'}`}>{d.class}</span>}
                                        </div>
                                        <button onClick={() => openStatsModal(dateForRank, { total: d.total, chi: d.chi, eng: d.eng, math: d.math }, d.class)} className={`${BUTTON_SYSTEM.secondary} px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all hover:scale-[1.02] active:scale-95 shadow-sm backdrop-blur-md ${darkMode ? 'bg-slate-800/85 text-emerald-100 hover:bg-slate-700/88 border border-emerald-200/20 shadow-black/25' : 'bg-white/88 text-slate-700 hover:bg-white border border-white/90 ring-1 ring-white/60 shadow-[0_8px_20px_rgba(15,23,42,0.08)]'}`}>
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
                                            <div key={sub} className={`rounded-2xl p-2 text-center ${darkMode ? 'bg-slate-900' : 'bg-white/78 border border-white/80 ring-1 ring-white/45'}`}>
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
          <div className="modal-backdrop-animate fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 px-4 py-[calc(env(safe-area-inset-top)+1rem)] pb-[calc(env(safe-area-inset-bottom)+1rem)]" onClick={() => setShowAddStudentModal(false)}>
              <div className={`modal-panel-animate rounded-[2.2rem] p-7 w-full max-w-sm ${darkMode ? 'bg-slate-800 border border-white/10' : 'bg-white shadow-2xl'}`} onClick={e => e.stopPropagation()}>
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
                      <button onClick={() => setShowAddStudentModal(false)} className={`${BUTTON_SYSTEM.secondary} px-4 py-2 rounded-lg text-sm font-bold ${darkMode ? 'text-slate-300 hover:bg-slate-700' : 'text-slate-500 hover:bg-slate-100'}`}>取消</button>
                      <button onClick={handleAddNewStudent} className={`${BUTTON_SYSTEM.primary} px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold`}>確認</button>
                  </div>
              </div>
          </div>
        )}

        {showAvgModal && (
          <div className="modal-backdrop-animate fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 px-4 py-[calc(env(safe-area-inset-top)+1rem)] pb-[calc(env(safe-area-inset-bottom)+1rem)]" onClick={() => setShowAvgModal(false)}>
              <div className={`modal-panel-animate rounded-[2.5rem] w-full max-w-2xl max-h-[85vh] flex flex-col ${darkMode ? 'bg-slate-800 border border-white/10' : 'bg-white shadow-2xl'}`} onClick={e => e.stopPropagation()}>
                  <div className={`p-6 border-b flex justify-between items-center ${darkMode ? 'border-white/5' : 'border-slate-100'}`}>
                      <h3 className={`text-xl font-bold flex items-center gap-3 ${darkMode ? 'text-white' : 'text-slate-800'}`}><Edit3 className="w-5 h-5 text-indigo-500"/> 設定班級平均</h3>
                      <button onClick={() => setShowAvgModal(false)} className={`${BUTTON_SYSTEM.icon} p-2 rounded-full transition ${darkMode ? 'bg-white/5 hover:bg-white/10 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-500'}`}><X className="w-5 h-5"/></button>
                  </div>
                  <div className={`px-6 pt-6 pb-2`}>
                      <div className={`premium-control-rail flex p-1 rounded-xl border overflow-x-auto justify-center shadow-inner ${darkMode ? 'bg-[#020617]/50 border-white/5' : 'bg-slate-50 border-slate-100'}`}>
                          {activeTeacherClassDefs.map(c => {
                              const isActive = avgSettingsClassFilter === c.id;
                              const classTheme = getClassPillTheme(c.id, darkMode);
                              return (
                                  <button
                                    key={c.id}
                                    onClick={() => setAvgSettingsClassFilter(c.id)}
                                    className={`${isActive ? BUTTON_SYSTEM.segmentActive : BUTTON_SYSTEM.segment} flex-1 whitespace-nowrap px-3 py-2 text-xs font-bold rounded-lg transition-all ${isActive ? classTheme.active : classTheme.inactive}`}
                                  >
                                    <span className="inline-flex items-center justify-center gap-1.5">
                                      <span className={`h-1.5 w-1.5 rounded-full ${classTheme.dot} ${isActive ? 'opacity-100' : 'opacity-72'}`} />
                                      <span>{c.label}</span>
                                    </span>
                                  </button>
                              );
                          })}
                      </div>
                  </div>
                  <div className={`px-6 pb-6 overflow-y-auto flex-1 ${darkMode ? 'bg-[#020617]/30' : 'bg-slate-50/50'}`}>
                      <div className="mb-4 text-xs font-bold text-amber-500 bg-amber-500/10 p-3 rounded-xl border border-amber-500/20 flex items-center gap-2">
                        <Sparkles className="w-4 h-4" />
                        系統已自動計算 <span className="font-black text-amber-600 dark:text-amber-400 mx-1">{activeTeacherClassDefs.find(c=>c.id===avgSettingsClassFilter)?.label}</span> 班平均。若需調整，請直接修改。
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
                              {avgSettingsDateKeysDesc.map((date, dateIndex) => {
                                  const dateData = classAverages[date] || {};
                                  const avg = dateData[avgSettingsClassFilter] || { chi: '', eng: '', math: '', total: '' };
                                  return (
                                      <tr key={date} className={darkMode ? 'bg-transparent' : 'bg-white'}>
                                          <td className="px-4 py-3 font-mono font-bold text-slate-500">{weekendLabelByDate[date] || getScopedDateLabel(date, activeDateContextCohortId, availableDates)}</td>
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
                      <button onClick={() => setShowAvgModal(false)} className={`${BUTTON_SYSTEM.secondary} px-6 py-3 rounded-xl font-bold transition text-sm ${darkMode ? 'text-slate-400 hover:bg-white/5' : 'text-slate-500 hover:bg-slate-100'}`}>取消</button>
                      <button onClick={saveManualClassAverages} className={`${BUTTON_SYSTEM.primary} px-6 py-3 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-500 shadow-lg shadow-indigo-900/20 transition active:scale-95 text-sm`}>儲存設定</button>
                  </div>
              </div>
          </div>
        )}

        {statsModalData && (
            <div className="modal-backdrop-animate fixed inset-0 bg-black/62 backdrop-blur-sm flex items-start sm:items-center justify-center z-[70] px-4 pb-4 pt-[calc(5rem+env(safe-area-inset-top))] sm:p-4" onClick={() => setStatsModalData(null)}>
                <div className={`modal-panel-animate rounded-[2.2rem] w-full max-w-2xl overflow-hidden flex flex-col max-h-[calc(100svh-6rem-env(safe-area-inset-top))] sm:max-h-[92vh] border ${darkMode ? 'bg-slate-800 border-white/10' : 'bg-white/95 border-slate-200/95 shadow-[0_30px_70px_rgba(15,23,42,0.22)]'}`} onClick={e => e.stopPropagation()}>
                    <div className={`p-6 sm:p-7 border-b relative ${darkMode ? 'border-white/5 bg-slate-800/75' : 'border-slate-200/95 bg-[linear-gradient(112deg,rgba(224,242,254,0.96)_0%,rgba(255,255,255,0.98)_46%,rgba(236,253,245,0.96)_100%)]'}`}>
                        <button onClick={() => setStatsModalData(null)} className={`${BUTTON_SYSTEM.icon} absolute top-5 right-5 p-2 rounded-full transition ${darkMode ? 'bg-white/5 hover:bg-white/10 text-white' : 'bg-white hover:bg-slate-50 text-slate-500 border border-slate-200'}`}><X className="w-5 h-5"/></button>
                        <div className="pr-12">
                            <div className={`text-[10px] font-black uppercase tracking-[0.18em] mb-2 ${darkMode ? 'text-blue-400' : 'text-sky-700'}`}>落點分析報告</div>
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
                                        <button key={tabKey} onClick={() => setStatsActiveTab(tabKey)} className={`${isActive ? BUTTON_SYSTEM.segmentActive : BUTTON_SYSTEM.segment} py-2 text-xs font-black rounded-xl transition-all ${isActive ? (darkMode ? 'bg-slate-800 text-white shadow-md border border-white/5' : 'bg-white text-slate-800 shadow-sm border border-slate-200') : 'text-slate-500'}`}>
                                            {isActive && <span className={`inline-block w-1.5 h-1.5 rounded-full ${TAB_DOT_BG_CLASS[tabKey]} mr-1.5 mb-0.5`}></span>}{tab}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mb-4">
                            <div className={`rounded-xl px-3 py-2.5 border ${darkMode ? 'bg-slate-900/60 border-white/10' : 'bg-white border-slate-200/90'}`}>
                                <div className={`text-[10px] font-black uppercase tracking-wide ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>應試人數</div>
                                <div className={`text-xl font-black ${darkMode ? 'text-white' : 'text-slate-800'}`}>{statsSummary?.sampleCount || 0}</div>
                            </div>
                            <div className={`rounded-xl px-3 py-2.5 border ${darkMode ? 'bg-slate-900/60 border-white/10' : 'bg-white border-slate-200/90'}`}>
                                <div className={`text-[10px] font-black uppercase tracking-wide ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>班內位置</div>
                                <div className={`text-sm font-black ${darkMode ? 'text-blue-300' : 'text-blue-700'}`}>
                                    {statsSummary?.classRank !== null && statsSummary?.classRank !== undefined && statsSummary?.classSize
                                        ? `#${statsSummary.classRank} / ${statsSummary.classSize}`
                                        : '--'}
                                </div>
                                <div className={`text-[10px] font-bold mt-1 ${darkMode ? 'text-cyan-200' : 'text-cyan-700'}`}>
                                    {statsSummary?.classTopPercent ? `約前 ${statsSummary.classTopPercent}%` : '班級排名資料不足'}
                                </div>
                            </div>
                            <div className={`rounded-xl px-3 py-2.5 border ${darkMode ? 'bg-slate-900/60 border-white/10' : 'bg-white border-slate-200/90'}`}>
                                <div className={`text-[10px] font-black uppercase tracking-wide ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>我的區間</div>
                                <div className={`text-sm font-black ${darkMode ? 'text-blue-300' : 'text-blue-700'}`}>{statsSummary?.myRange || '-'}</div>
                                <div className={`text-[10px] font-bold mt-1 ${darkMode ? 'text-slate-300' : 'text-slate-500'}`}>
                                    {statsSummary?.myBucketCount ? `${statsSummary.myBucketCount} 人（${statsSummary.myRangeRatio || 0}%）` : '同區間人數不足'}
                                </div>
                            </div>
                            <div className={`rounded-xl px-3 py-2.5 border ${darkMode ? 'bg-slate-900/60 border-white/10' : 'bg-white border-slate-200/90'}`}>
                                <div className={`text-[10px] font-black uppercase tracking-wide ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>最多人區間</div>
                                <div className={`text-sm font-black ${darkMode ? 'text-amber-300' : 'text-amber-700'}`}>{statsSummary?.peakRange || '-'}</div>
                                <div className={`text-[10px] font-bold mt-1 ${darkMode ? 'text-amber-200' : 'text-amber-700'}`}>{statsSummary?.peakCount || 0} 人</div>
                            </div>
                        </div>

                        <div className={`rounded-2xl border p-3 mb-4 ${darkMode ? 'bg-slate-900/45 border-white/10' : 'bg-white border-slate-200/90'}`}>
                            <div className="flex items-center justify-between px-2 mb-1">
                                <div className={`text-xs font-black tracking-wide ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>{COLORS[statsActiveTab]?.label || '總分'}分布圖</div>
                                <div className={`text-[10px] font-bold ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>高亮柱為你目前所在區間</div>
                            </div>
                            <Suspense fallback={<ChartFallback heightClass="h-72" />}>
                                <DistributionChart
                                  data={statsModalData[statsActiveTab]}
                                  highlightColor={COLORS[statsActiveTab].hex}
                                  isDarkMode={darkMode}
                                />
                            </Suspense>
                        </div>

                        <div className={`rounded-2xl border p-4 ${darkMode ? 'bg-white/5 border-white/5' : 'bg-white border-slate-200/90'}`}>
                            <div className="flex items-center justify-between gap-3">
                                <span className={`text-sm font-black ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>我的{COLORS[statsActiveTab]?.label || '總分'}分數</span>
                                <span className={`text-2xl font-black ${darkMode ? 'text-white' : 'text-slate-800'}`}>{statsModalData.myGrades?.[statsActiveTab] ?? '-'}</span>
                            </div>
                            <div className={`mt-3 rounded-xl px-3 py-2 border ${darkMode ? 'border-white/10 bg-slate-900/60 text-slate-300' : 'border-slate-200 bg-white/90 text-slate-600'}`}>
                                <div className="flex items-center gap-1.5 mb-1">
                                    <Info className="w-3.5 h-3.5 text-sky-500" />
                                    <span className="text-[11px] font-black tracking-wide">家長解讀</span>
                                </div>
                                <div className="text-xs leading-relaxed font-semibold">
                                    {statsSummary?.standingLabel || '資料不足'}
                                    ，目前落在 <span className="font-black">{statsSummary?.myRange || '-'}</span> 區間；
                                    本次最多同學集中在 <span className="font-black">{statsSummary?.peakRange || '-'}</span>（{statsSummary?.peakCount || 0} 人）。
                                </div>
                            </div>
                            <div className={`mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                                <div className={`rounded-lg px-2.5 py-2 border ${darkMode ? 'border-white/10 bg-slate-900/55' : 'border-slate-200 bg-slate-50'}`}>高於你：<span className="font-black">{statsSummary?.higherCount ?? 0}</span> 人</div>
                                <div className={`rounded-lg px-2.5 py-2 border ${darkMode ? 'border-white/10 bg-slate-900/55' : 'border-slate-200 bg-slate-50'}`}>同分：<span className="font-black">{statsSummary?.equalCount ?? 0}</span> 人</div>
                                <div className={`rounded-lg px-2.5 py-2 border ${darkMode ? 'border-white/10 bg-slate-900/55' : 'border-slate-200 bg-slate-50'}`}>低於你：<span className="font-black">{statsSummary?.lowerCount ?? 0}</span> 人</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        )}

        {showSecurityModal && (
            <div className="modal-backdrop-animate fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-[60] px-6 py-[calc(env(safe-area-inset-top)+1.5rem)] pb-[calc(env(safe-area-inset-bottom)+1.5rem)]" onClick={closeSecurityModal}>
                <div className={`modal-panel-animate p-8 rounded-[2rem] shadow-2xl max-w-xs w-full text-center transform transition-all scale-100 border ${darkMode ? 'bg-slate-800 border-white/10' : 'bg-white border-white/50'}`} onClick={e => e.stopPropagation()}>
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

        {showImportFormatGuide && (
            <div className="modal-backdrop-animate fixed inset-0 bg-black/58 backdrop-blur-sm flex items-center justify-center z-[64] px-4 py-[calc(env(safe-area-inset-top)+1.2rem)] pb-[calc(env(safe-area-inset-bottom)+1.2rem)]" onClick={() => setShowImportFormatGuide(false)}>
                <div className={`modal-panel-animate w-full max-w-2xl rounded-[1.8rem] border overflow-hidden ${darkMode ? 'bg-slate-800 border-white/10' : 'bg-white border-slate-200 shadow-[0_26px_64px_rgba(15,23,42,0.2)]'}`} onClick={(event) => event.stopPropagation()}>
                    <div className={`px-5 py-4 border-b ${darkMode ? 'border-white/10 bg-slate-900/55' : 'border-slate-200 bg-slate-50'}`}>
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <h3 className={`text-base font-black tracking-tight ${darkMode ? 'text-slate-100' : 'text-slate-800'}`}>匯入格式說明</h3>
                                <p className={`text-[11px] mt-1 font-semibold ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>匯入前先對照這份格式，能減少預檢失敗與錯誤日期被略過。</p>
                            </div>
                            <button onClick={() => setShowImportFormatGuide(false)} className={`${BUTTON_SYSTEM.icon} p-1.5 rounded-full transition ${darkMode ? 'hover:bg-slate-700 text-slate-300' : 'hover:bg-white text-slate-500 border border-slate-200'}`}>
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    </div>

                    <div className="px-5 py-4 space-y-3">
                        <div className={`rounded-lg border px-3 py-2.5 ${darkMode ? 'border-white/10 bg-slate-900/45 text-slate-300' : 'border-slate-200 bg-slate-50 text-slate-600'}`}>
                            <div className={`text-[10px] font-black tracking-widest uppercase mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-500'}`}>建議欄位順序</div>
                            <div className="flex flex-wrap gap-1.5">
                                {importFormatGuide.sampleHeaders.map((header) => (
                                    <span key={header} className={`inline-flex rounded-full px-2 py-1 text-[10px] font-black ${darkMode ? 'bg-slate-800 text-slate-100 border border-white/10' : 'bg-white text-slate-700 border border-slate-200'}`}>
                                        {header}
                                    </span>
                                ))}
                            </div>
                        </div>

                        <div className={`rounded-lg border overflow-hidden ${darkMode ? 'border-white/10 bg-slate-900/50' : 'border-slate-200 bg-white'}`}>
                            <div className={`grid grid-cols-[5.2rem_1fr_5rem_4.4rem_3.3rem_3.3rem_3.3rem] px-3 py-2 text-[10px] font-bold tracking-wide ${darkMode ? 'bg-slate-800 text-slate-300' : 'bg-slate-50 text-slate-500'}`}>
                                <span className="text-center">學號</span>
                                <span className="text-center">姓名</span>
                                <span className="text-center">日期</span>
                                <span className="text-center">班級</span>
                                <span className="text-center">國</span>
                                <span className="text-center">英</span>
                                <span className="text-center">數</span>
                            </div>
                            <div>
                                {importFormatGuide.sampleRows.map((row, idx) => (
                                    <div key={`import-guide-row-${idx}`} className={`grid grid-cols-[5.2rem_1fr_5rem_4.4rem_3.3rem_3.3rem_3.3rem] px-3 py-1.5 text-[11px] border-t ${darkMode ? 'border-white/10 text-slate-200' : 'border-slate-100 text-slate-700'}`}>
                                        {row.map((cell, cellIdx) => (
                                            <span key={`import-guide-cell-${idx}-${cellIdx}`} className={`${cellIdx === 1 ? 'truncate text-center' : 'text-center'} ${cellIdx === 0 || cellIdx === 2 ? 'font-mono' : ''}`}>
                                                {cell}
                                            </span>
                                        ))}
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            <div className={`rounded-lg border p-3 ${darkMode ? 'border-white/10 bg-slate-900/45' : 'border-slate-200 bg-slate-50'}`}>
                                <div className={`text-[10px] font-black tracking-widest uppercase mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-500'}`}>欄位辨識規則</div>
                                <div className="space-y-1.5">
                                    {importFormatGuide.headerHints.map((hint) => (
                                        <div key={hint} className={`text-[11px] leading-relaxed font-semibold ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>{hint}</div>
                                    ))}
                                </div>
                            </div>
                            <div className={`rounded-lg border p-3 ${darkMode ? 'border-white/10 bg-slate-900/45' : 'border-slate-200 bg-slate-50'}`}>
                                <div className={`text-[10px] font-black tracking-widest uppercase mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-500'}`}>匯入注意事項</div>
                                <div className="space-y-1.5">
                                    {importFormatGuide.rules.map((rule) => (
                                        <div key={rule} className={`text-[11px] leading-relaxed font-semibold ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>{rule}</div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className={`px-5 py-4 border-t flex justify-end ${darkMode ? 'border-white/10 bg-slate-900/50' : 'border-slate-200 bg-white'}`}>
                        <button
                          onClick={() => setShowImportFormatGuide(false)}
                          className={`${BUTTON_SYSTEM.secondary} px-4 py-2 rounded-lg text-xs font-bold ${darkMode ? 'bg-slate-800 text-slate-200 hover:bg-slate-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                        >
                          關閉
                        </button>
                    </div>
                </div>
            </div>
        )}

        {importPreview && (
            <div className="modal-backdrop-animate fixed inset-0 bg-black/58 backdrop-blur-sm flex items-center justify-center z-[65] px-4 py-[calc(env(safe-area-inset-top)+1.2rem)] pb-[calc(env(safe-area-inset-bottom)+1.2rem)]" onClick={handleCancelImportPreview}>
                <div className={`modal-panel-animate w-full max-w-2xl rounded-[1.8rem] border overflow-hidden ${darkMode ? 'bg-slate-800 border-white/10' : 'bg-white border-slate-200 shadow-[0_26px_64px_rgba(15,23,42,0.2)]'}`} onClick={(event) => event.stopPropagation()}>
                    <div className={`px-5 py-4 border-b ${darkMode ? 'border-white/10 bg-slate-900/55' : 'border-slate-200 bg-slate-50'}`}>
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <h3 className={`text-base font-black tracking-tight ${darkMode ? 'text-slate-100' : 'text-slate-800'}`}>匯入預檢確認</h3>
                                <p className={`text-[11px] mt-1 font-semibold ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>{importPreview.fileName}</p>
                            </div>
                            <button onClick={handleCancelImportPreview} className={`${BUTTON_SYSTEM.icon} p-1.5 rounded-full transition ${darkMode ? 'hover:bg-slate-700 text-slate-300' : 'hover:bg-white text-slate-500 border border-slate-200'}`}>
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    </div>

                    <div className="px-5 py-4 space-y-3">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            <div className={`rounded-lg border px-2.5 py-2 ${darkMode ? 'border-white/10 bg-slate-900/45' : 'border-slate-200 bg-slate-50'}`}>
                                <div className={`text-[10px] font-bold ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>有效筆數</div>
                                <div className={`text-sm font-black ${darkMode ? 'text-emerald-200' : 'text-emerald-700'}`}>{importPreview.importCount}</div>
                            </div>
                            <div className={`rounded-lg border px-2.5 py-2 ${darkMode ? 'border-white/10 bg-slate-900/45' : 'border-slate-200 bg-slate-50'}`}>
                                <div className={`text-[10px] font-bold ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>學生數</div>
                                <div className={`text-sm font-black ${darkMode ? 'text-sky-200' : 'text-sky-700'}`}>{importPreview.touchedStudentCount}</div>
                            </div>
                            <div className={`rounded-lg border px-2.5 py-2 ${darkMode ? 'border-white/10 bg-slate-900/45' : 'border-slate-200 bg-slate-50'}`}>
                                <div className={`text-[10px] font-bold ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>測驗日期</div>
                                <div className={`text-sm font-black ${darkMode ? 'text-indigo-200' : 'text-indigo-700'}`}>{importPreview.importedDateCount}</div>
                            </div>
                            <div className={`rounded-lg border px-2.5 py-2 ${darkMode ? 'border-white/10 bg-slate-900/45' : 'border-slate-200 bg-slate-50'}`}>
                                <div className={`text-[10px] font-bold ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>略過錯誤日期</div>
                                <div className={`text-sm font-black ${importPreview.skippedInvalidDateCount > 0 ? 'text-amber-500' : (darkMode ? 'text-slate-100' : 'text-slate-700')}`}>{importPreview.skippedInvalidDateCount}</div>
                            </div>
                        </div>

                        <div className={`rounded-lg border px-3 py-2 text-[11px] font-semibold ${darkMode ? 'border-white/10 bg-slate-900/45 text-slate-300' : 'border-slate-200 bg-slate-50 text-slate-600'}`}>
                            日期：{importPreview.importedDates.length ? importPreview.importedDates.join('、') : '無'}
                        </div>

                        <div className={`rounded-lg border overflow-hidden ${darkMode ? 'border-white/10 bg-slate-900/50' : 'border-slate-200 bg-white'}`}>
                            <div className={`grid grid-cols-[5.5rem_1fr_4rem_3.2rem_3.2rem_3.2rem_3.6rem] px-3 py-2 text-[10px] font-bold tracking-wide ${darkMode ? 'bg-slate-800 text-slate-300' : 'bg-slate-50 text-slate-500'}`}>
                                <span className="text-center">學號</span>
                                <span className="text-center">姓名</span>
                                <span className="text-center">日期</span>
                                <span className="text-center">國</span>
                                <span className="text-center">英</span>
                                <span className="text-center">數</span>
                                <span className="text-center">總分</span>
                            </div>
                            <div className="max-h-56 overflow-y-auto">
                                {importPreview.previewRows.map((row, idx) => (
                                    <div key={`${row.id}-${idx}`} className={`grid grid-cols-[5.5rem_1fr_4rem_3.2rem_3.2rem_3.2rem_3.6rem] px-3 py-1.5 text-[11px] border-t ${darkMode ? 'border-white/10 text-slate-200' : 'border-slate-100 text-slate-700'}`}>
                                        <span className="font-mono text-center">{row.id}</span>
                                        <span className="truncate text-center">{row.name || '-'}</span>
                                        <span className="text-center font-mono">{row.date}</span>
                                        <span className="text-center">{row.chi || '-'}</span>
                                        <span className="text-center">{row.eng || '-'}</span>
                                        <span className="text-center">{row.math || '-'}</span>
                                        <span className="text-center font-black">{row.total || '-'}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className={`px-5 py-4 border-t flex justify-end gap-2 ${darkMode ? 'border-white/10 bg-slate-900/50' : 'border-slate-200 bg-white'}`}>
                        <button
                          onClick={handleCancelImportPreview}
                          disabled={isApplyingImport}
                          className={`${BUTTON_SYSTEM.secondary} px-4 py-2 rounded-lg text-xs font-bold ${darkMode ? 'bg-slate-800 text-slate-200 hover:bg-slate-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                        >
                          取消
                        </button>
                        <button
                          onClick={handleConfirmImportPreview}
                          disabled={isApplyingImport}
                          className={`${BUTTON_SYSTEM.primary} px-4 py-2 rounded-lg text-xs font-bold text-white ${isApplyingImport ? 'bg-slate-400 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-500'}`}
                        >
                          {isApplyingImport ? '套用中...' : '確認匯入'}
                        </button>
                    </div>
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
                      <button onClick={() => { setDeleteTarget(null); setStudentToDelete(null); }} className={`${BUTTON_SYSTEM.secondary} flex-1 px-4 py-3.5 rounded-xl font-bold text-sm transition-colors ${darkMode ? 'bg-slate-800 text-slate-300 hover:bg-slate-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>取消</button>
                      <button
                        onClick={() => executeWithSecurity(deleteTarget ? confirmDeleteDate : confirmDeleteStudent, {
                            title: deleteTarget ? '刪除測驗日期' : '刪除學生資料'
                        })}
                        className={`${BUTTON_SYSTEM.danger} flex-1 px-4 py-3.5 rounded-xl bg-red-500 text-white hover:bg-red-600 font-bold text-sm shadow-lg shadow-red-900/20 transition-all active:scale-95`}
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
