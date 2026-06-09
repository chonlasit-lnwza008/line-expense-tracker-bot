const os = require('os');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

process.env.DB_CLIENT = 'sqlite';
process.env.DATABASE_PATH = path.join(
  os.tmpdir(),
  `line-expense-liff-dashboard-${Date.now()}-${Math.random().toString(16).slice(2)}.db`
);

const { ensureDatabase } = require('../src/database/migrations');
const liffDashboardService = require('../src/services/liffDashboardService');

function uniqueLineUserId(suffix) {
  return `liff-dashboard-${suffix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

test('LIFF dashboard creates a confirmed expense from text and updates overview', async () => {
  await ensureDatabase();
  const lineUserId = uniqueLineUserId('expense');

  const transaction = await liffDashboardService.createFromText(lineUserId, 'กาแฟ 45');
  assert.equal(transaction.title, 'กาแฟ');
  assert.equal(transaction.amount, 45);
  assert.equal(transaction.type, 'expense');
  assert.equal(transaction.status, 'confirmed');
  assert.equal(transaction.source, 'text');

  const overview = await liffDashboardService.getOverview(lineUserId);
  assert.equal(overview.totals.expense, 45);
  assert.equal(overview.totals.net, -45);
  assert.equal(overview.transactionCount, 1);
  assert.equal(overview.recentSevenDays[0].title, 'กาแฟ');
});

test('LIFF dashboard creates a confirmed income from text', async () => {
  await ensureDatabase();
  const lineUserId = uniqueLineUserId('income');

  const transaction = await liffDashboardService.createFromText(lineUserId, 'รับ เงินเดือน 18000');
  assert.equal(transaction.title, 'เงินเดือน');
  assert.equal(transaction.amount, 18000);
  assert.equal(transaction.type, 'income');
  assert.equal(transaction.category, 'รายรับ');

  const overview = await liffDashboardService.getOverview(lineUserId);
  assert.equal(overview.totals.income, 18000);
  assert.equal(overview.totals.net, 18000);
});

test('LIFF dashboard rejects text without an amount', async () => {
  await ensureDatabase();
  const lineUserId = uniqueLineUserId('invalid');

  await assert.rejects(
    () => liffDashboardService.createFromText(lineUserId, 'กาแฟ'),
    (error) => {
      assert.equal(error.statusCode, 400);
      assert.equal(error.reason, 'amount_not_found');
      return true;
    }
  );
});
