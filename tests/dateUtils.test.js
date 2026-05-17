const test = require('node:test');
const assert = require('node:assert/strict');
const { toDateOnly, currentMonth } = require('../src/utils/dateUtils');

test('formats date using local calendar fields instead of UTC slice', () => {
  const date = new Date(2026, 4, 17, 1, 30, 0);
  assert.equal(toDateOnly(date), '2026-05-17');
  assert.equal(currentMonth(date), '2026-05');
});
