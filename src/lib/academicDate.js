export const normalizeDateToken = (dateStr) => {
    if (!dateStr) return '';
    const clean = String(dateStr)
        .trim()
        .replace(/\./g, '/')
        .replace(/-/g, '/')
        .replace(/[^0-9/]/g, '')
        .replace(/\/+/g, '/');
    let mStr = '';
    let dStr = '';

    if (!clean.includes('/')) {
        if (!/^\d{3,4}$/.test(clean)) return '';
        mStr = clean.length === 3 ? clean.slice(0, 1) : clean.slice(0, 2);
        dStr = clean.slice(-2);
    } else {
        const parts = clean.split('/').filter(Boolean);
        if (parts.length !== 2) return '';
        [mStr, dStr] = parts;
    }

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

export const customDateSort = (a, b) => {
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
    } catch {
        return 0;
    }
};

export const sanitizeDateList = (rawDates) => {
    const unique = new Set();
    (Array.isArray(rawDates) ? rawDates : []).forEach((rawDate) => {
        const normalized = normalizeDateToken(rawDate);
        if (normalized) unique.add(normalized);
    });
    return Array.from(unique).sort(customDateSort);
};

export const parseDateStr = (dateStr) => {
    const normalized = normalizeDateToken(dateStr);
    if (!normalized) return null;
    try {
        const [mStr, dStr] = normalized.split('/');
        const m = parseInt(mStr, 10);
        const d = parseInt(dStr, 10);
        const y = m >= 4 ? 2025 : 2026;
        return new Date(y, m - 1, d);
    } catch {
        return null;
    }
};

export const formatDateStr = (dateObj) => {
    if (!dateObj) return '';
    return `${String(dateObj.getMonth() + 1).padStart(2, '0')}/${String(dateObj.getDate()).padStart(2, '0')}`;
};

export const isConsecutiveDate = (date1, date2) => {
    if (!date1 || !date2) return false;
    const diff = Math.abs((date1.getTime() - date2.getTime()) / (1000 * 60 * 60 * 24));
    return diff === 1;
};

export const getWeekendID = (dateStr, availableDates = null) => {
    if (!dateStr || !String(dateStr).includes('/')) return '';

    try {
        const normalizedDate = normalizeDateToken(dateStr);
        const currentDate = parseDateStr(normalizedDate);
        if (!currentDate) return '';

        if (availableDates && Array.isArray(availableDates)) {
            const sanitizedPool = sanitizeDateList(availableDates);
            const parsedPool = sanitizedPool
                .map((rawDate) => parseDateStr(rawDate))
                .filter(Boolean);

            const connectedDates = [currentDate];
            const visited = new Set([currentDate.getTime()]);
            let expanded = true;

            while (expanded) {
                expanded = false;
                for (const candidate of parsedPool) {
                    const ts = candidate.getTime();
                    if (visited.has(ts)) continue;
                    const isConnected = connectedDates.some((base) => isConsecutiveDate(base, candidate));
                    if (isConnected) {
                        visited.add(ts);
                        connectedDates.push(candidate);
                        expanded = true;
                    }
                }
            }

            if (connectedDates.length > 1) {
                let earliestDate = connectedDates[0];
                connectedDates.forEach((candidate) => {
                    if (candidate < earliestDate) earliestDate = candidate;
                });
                return formatDateStr(earliestDate);
            }

            // If an explicit date pool exists but cannot prove a linked weekend pair,
            // keep the original normalized date instead of inventing a previous Saturday.
            if (sanitizedPool.length > 0) {
                return normalizedDate;
            }
        }

        const dayOfWeek = currentDate.getDay();
        if (dayOfWeek === 0) {
            const satDate = new Date(currentDate);
            satDate.setDate(currentDate.getDate() - 1);
            return formatDateStr(satDate);
        }

        return normalizeDateToken(dateStr);
    } catch {
        return '';
    }
};

export const getSundayDate = (satDateStr) => {
    try {
        const [mStr, dStr] = satDateStr.split('/');
        const m = parseInt(mStr, 10);
        const d = parseInt(dStr, 10);
        const y = m >= 4 ? 2025 : 2026;
        const dateObj = new Date(y, m - 1, d);
        dateObj.setDate(dateObj.getDate() + 1);
        return `${String(dateObj.getMonth() + 1).padStart(2, '0')}/${String(dateObj.getDate()).padStart(2, '0')}`;
    } catch {
        return satDateStr;
    }
};

export const getWeekendDisplayLabel = (dateStr) => {
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
        return `${String(m).padStart(2, '0')}/${String(d).padStart(2, '0')}-${sunD}`;
    } catch {
        return dateStr;
    }
};

export const getAcademicSortValue = (dateStr) => {
    const normalized = normalizeDateToken(dateStr);
    if (!normalized) return Number.NaN;
    const [mStr, dStr] = normalized.split('/');
    const month = parseInt(mStr, 10);
    const day = parseInt(dStr, 10);
    if (Number.isNaN(month) || Number.isNaN(day)) return Number.NaN;
    const academicMonth = month < 4 ? month + 12 : month;
    return academicMonth * 100 + day;
};

export const PHASE_BOUNDARIES = {
    p1Start: '04/19',
    p1End: '08/02',
    p2Start: '08/09',
    p2End: '12/20',
    mockStart: '12/27',
    mockEnd: '03/15'
};

export const resolvePhaseByDate = (dateStr, allDates = null) => {
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

    if (dateValue < p2StartValue) return 'p1';
    if (dateValue < mockStartValue) return 'p2';
    if (dateValue > mockEndValue) return 'mock';
    return 'p2';
};
