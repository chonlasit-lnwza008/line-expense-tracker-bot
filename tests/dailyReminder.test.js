const test = require('node:test');
const assert = require('node:assert/strict');

const { buildReminderText } = require('../src/scripts/sendDailyReminders');

test('daily reminder summarizes empty and active days', () => {
  const emptyText = buildReminderText({
    date: '2026-06-09',
    rows: [],
    income: 0,
    expense: 0,
    net: 0
  });
  assert.match(emptyText, /ยังไม่มีรายการ/);

  const activeText = buildReminderText({
    date: '2026-06-09',
    rows: [
      { type: 'income', title: 'เงินเดือน', amount: 1000 },
      { type: 'expense', title: 'กาแฟ', amount: 45 },
      { type: 'expense', title: 'ข้าว', amount: 60 }
    ],
    income: 1000,
    expense: 105,
    net: 895
  });
  assert.match(activeText, /รายรับ/);
  assert.match(activeText, /รายจ่าย/);
  assert.match(activeText, /จ่ายสูงสุด: ข้าว/);
});
