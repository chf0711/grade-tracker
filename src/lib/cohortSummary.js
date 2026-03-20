import { customDateSort } from './academicDate.js';

export const SUMMARY_SUBJECT_KEYS = Object.freeze(['total', 'chi', 'eng', 'math']);

const toNumberOrNull = (value) => {
    if (value === '' || value === null || value === undefined) return null;
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
};

const resolveTotalValue = (grade) => {
    const direct = toNumberOrNull(grade?.total);
    if (direct !== null) return direct;
    const chi = toNumberOrNull(grade?.chi);
    const eng = toNumberOrNull(grade?.eng);
    const math = toNumberOrNull(grade?.math);
    if (chi === null && eng === null && math === null) return null;
    return (chi || 0) + (eng || 0) + (math || 0);
};

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

const createEmptySubjectBucket = () => ({
    total: [],
    chi: [],
    eng: [],
    math: []
});

const normalizeClassId = (rawClassId, validClassIds) => {
    const normalized = String(rawClassId || '').trim();
    if (normalized && validClassIds.has(normalized)) return normalized;
    if (validClassIds.has('A班')) return 'A班';
    return Array.from(validClassIds)[0] || 'A班';
};

const ensureWeekendBucket = (summaryIndex, weekendID, classId) => {
    if (!summaryIndex[weekendID]) {
        summaryIndex[weekendID] = { all: createEmptySubjectBucket() };
    }
    if (!summaryIndex[weekendID][classId]) {
        summaryIndex[weekendID][classId] = createEmptySubjectBucket();
    }
    return summaryIndex[weekendID];
};

const pushScore = (bucket, subject, value) => {
    if (!Number.isFinite(value)) return;
    bucket[subject].push(value);
};

const normalizeBucket = (bucket = {}) => {
    const normalized = createEmptySubjectBucket();
    SUMMARY_SUBJECT_KEYS.forEach((subject) => {
        normalized[subject] = (Array.isArray(bucket?.[subject]) ? bucket[subject] : [])
            .map((value) => Number(value))
            .filter((value) => Number.isFinite(value))
            .sort((a, b) => b - a);
    });
    return normalized;
};

export const normalizeCohortSummary = (rawSummary) => {
    const byWeekend = {};
    const rawByWeekend = rawSummary?.byWeekend && typeof rawSummary.byWeekend === 'object'
        ? rawSummary.byWeekend
        : {};

    Object.entries(rawByWeekend).forEach(([weekendID, rawClassMap]) => {
        if (!weekendID || !rawClassMap || typeof rawClassMap !== 'object') return;
        byWeekend[weekendID] = {};
        Object.entries(rawClassMap).forEach(([classId, rawBucket]) => {
            byWeekend[weekendID][classId] = normalizeBucket(rawBucket);
        });
        if (!byWeekend[weekendID].all) {
            byWeekend[weekendID].all = createEmptySubjectBucket();
        }
    });

    const weekendIds = Object.keys(byWeekend).sort(customDateSort);
    return {
        version: String(rawSummary?.version || '').trim(),
        updatedAt: String(rawSummary?.updatedAt || '').trim(),
        weekendIds,
        byWeekend
    };
};

export const buildCohortSummary = ({ students = [], getDateID, validClassIds = [] }) => {
    const validClassIdSet = new Set(validClassIds);
    const byWeekend = {};

    students.forEach((student) => {
        const weekendEntries = buildWeekendGradeEntryMap(student?.grades, getDateID);
        Object.entries(weekendEntries).forEach(([weekendID, entry]) => {
            if (!weekendID || !entry?.grade) return;
            const classId = normalizeClassId(entry.grade.class, validClassIdSet);
            const weekendBucket = ensureWeekendBucket(byWeekend, weekendID, classId);

            const totalValue = resolveTotalValue(entry.grade);
            pushScore(weekendBucket[classId], 'total', totalValue);
            pushScore(weekendBucket.all, 'total', totalValue);

            ['chi', 'eng', 'math'].forEach((subject) => {
                const value = toNumberOrNull(entry.grade?.[subject]);
                pushScore(weekendBucket[classId], subject, value);
                pushScore(weekendBucket.all, subject, value);
            });
        });
    });

    Object.values(byWeekend).forEach((classMap) => {
        Object.values(classMap).forEach((bucket) => {
            SUMMARY_SUBJECT_KEYS.forEach((subject) => {
                bucket[subject].sort((a, b) => b - a);
            });
        });
    });

    const weekendIds = Object.keys(byWeekend).sort(customDateSort);
    return {
        version: '',
        updatedAt: '',
        weekendIds,
        byWeekend
    };
};

export const encodeSummaryWeekendDocId = (weekendID) => `weekend_${String(weekendID || '').replace(/[^0-9A-Za-z_-]+/g, '_')}`;
