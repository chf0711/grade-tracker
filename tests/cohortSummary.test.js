import test from 'node:test';
import assert from 'node:assert/strict';

import { buildCohortSummary, normalizeCohortSummary } from '../src/lib/cohortSummary.js';

test('buildCohortSummary groups scores by weekend and class with total fallback', () => {
    const summary = buildCohortSummary({
        students: [
            {
                id: 'A01',
                grades: {
                    '04/19': { chi: '80', eng: '70', math: '90', class: 'A班' }
                }
            },
            {
                id: 'B01',
                grades: {
                    '04/19': { total: '210', chi: '65', eng: '70', math: '75', class: 'B班' }
                }
            }
        ],
        getDateID: (date) => date,
        validClassIds: ['A班', 'B班', 'C班']
    });

    assert.deepEqual(summary.weekendIds, ['04/19']);
    assert.deepEqual(summary.byWeekend['04/19'].A班.total, [240]);
    assert.deepEqual(summary.byWeekend['04/19'].B班.total, [210]);
    assert.deepEqual(summary.byWeekend['04/19'].all.total, [240, 210]);
    assert.deepEqual(summary.byWeekend['04/19'].all.math, [90, 75]);
});

test('normalizeCohortSummary sanitizes score arrays and sorts descending', () => {
    const normalized = normalizeCohortSummary({
        version: 'v1',
        byWeekend: {
            '04/26': {
                all: { total: ['190', '220', 'bad'], chi: [60, 88], eng: [], math: [55] }
            }
        }
    });

    assert.equal(normalized.version, 'v1');
    assert.deepEqual(normalized.weekendIds, ['04/26']);
    assert.deepEqual(normalized.byWeekend['04/26'].all.total, [220, 190]);
    assert.deepEqual(normalized.byWeekend['04/26'].all.chi, [88, 60]);
});
