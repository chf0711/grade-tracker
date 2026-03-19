import test from 'node:test';
import assert from 'node:assert/strict';
import {
    normalizeDateToken,
    sanitizeDateList,
    getWeekendID,
    resolvePhaseByDate,
    getWeekendDisplayLabel
} from '../src/lib/academicDate.js';

test('normalizeDateToken validates and normalizes dates', () => {
    assert.equal(normalizeDateToken('2/9'), '02/09');
    assert.equal(normalizeDateToken(' 02-28 '), '02/28');
    assert.equal(normalizeDateToken('228'), '02/28');
    assert.equal(normalizeDateToken('0411'), '04/11');
    assert.equal(normalizeDateToken('2025/4/19'), '04/19');
    assert.equal(normalizeDateToken('20250419'), '04/19');
    assert.equal(normalizeDateToken('114/04/19'), '04/19');
    assert.equal(normalizeDateToken('02/51'), '');
    assert.equal(normalizeDateToken('13/01'), '');
});

test('sanitizeDateList deduplicates and sorts by academic calendar', () => {
    const result = sanitizeDateList(['01/03', '12/27', '04/19', '12/27', 'foo']);
    assert.deepEqual(result, ['04/19', '12/27', '01/03']);
});

test('getWeekendID merges whole consecutive date chains into one exam id', () => {
    const allDates = ['02/28', '03/01', '03/02'];
    assert.equal(getWeekendID('03/01', allDates), '02/28');
    assert.equal(getWeekendID('03/02', allDates), '02/28');
    assert.equal(getWeekendID('02/28', allDates), '02/28');
});

test('getWeekendID keeps sunday->saturday fallback without availableDates', () => {
    assert.equal(getWeekendID('03/01'), '02/28');
});

test('getWeekendID does not invent saturday when explicit pool has no related pair', () => {
    assert.equal(getWeekendID('04/11', ['04/12', '04/19']), '04/11');
    assert.equal(getWeekendID('03/09', ['03/08']), '03/08');
});

test('resolvePhaseByDate follows phase boundaries', () => {
    assert.equal(resolvePhaseByDate('04/19'), 'p1');
    assert.equal(resolvePhaseByDate('08/02'), 'p1');
    assert.equal(resolvePhaseByDate('08/09'), 'p2');
    assert.equal(resolvePhaseByDate('12/20'), 'p2');
    assert.equal(resolvePhaseByDate('12/27'), 'mock');
    assert.equal(resolvePhaseByDate('03/15'), 'mock');
});

test('getWeekendDisplayLabel returns saturday-sunday range label', () => {
    assert.equal(getWeekendDisplayLabel('03/01'), '02/28-01');
});
