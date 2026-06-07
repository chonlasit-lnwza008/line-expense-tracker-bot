const test = require('node:test');
const assert = require('node:assert/strict');
const { toDateOnly, currentMonth, formatDisplayDate, formatDisplayMonth } = require('../src/utils/dateUtils');

test('formats date using local calendar fields instead of UTC slice', () => {
  const date = new Date(2026, 4, 17, 1, 30, 0);
  assert.equal(toDateOnly(date), '2026-05-17');
  assert.equal(currentMonth(date), '2026-05');
});

test('formats display dates as day month year', () => {
  assert.equal(formatDisplayDate('2026-06-07'), '7/6/2026');
  assert.equal(formatDisplayDate(new Date(2026, 5, 7, 9, 0, 0)), '7/6/2026');
  assert.equal(formatDisplayMonth('2026-06'), '6/2026');
});
