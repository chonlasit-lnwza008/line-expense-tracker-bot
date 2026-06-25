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
const transactionService = require('../src/services/transactionService');

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

test('LIFF dashboard updates every editable transaction field', async () => {
  await ensureDatabase();
  const lineUserId = uniqueLineUserId('update');

  const transaction = await liffDashboardService.createFromText(lineUserId, 'กาแฟ 45');
  const updated = await liffDashboardService.updateFromDashboard(lineUserId, transaction.id, {
    title: 'น้ำเปล่า',
    amount: 12.5,
    type: 'income',
    category: 'เครื่องดื่ม',
    transactionDate: '2026-06-09',
    note: 'แก้จาก dashboard'
  });

  assert.equal(updated.title, 'น้ำเปล่า');
  assert.equal(updated.amount, 12.5);
  assert.equal(updated.type, 'income');
  assert.equal(updated.category, 'เครื่องดื่ม');
  assert.equal(updated.transactionDate, '2026-06-09');
  assert.equal(updated.note, 'แก้จาก dashboard');
});

test('LIFF dashboard delete cancels only the owner transaction', async () => {
  await ensureDatabase();
  const ownerLineUserId = uniqueLineUserId('delete-owner');
  const otherLineUserId = uniqueLineUserId('delete-other');

  const transaction = await liffDashboardService.createFromText(ownerLineUserId, 'ข้าว 60');
  const blocked = await liffDashboardService.deleteFromDashboard(otherLineUserId, transaction.id);
  assert.equal(blocked, null);

  const deleted = await liffDashboardService.deleteFromDashboard(ownerLineUserId, transaction.id);
  assert.equal(deleted.id, transaction.id);
  assert.equal(deleted.status, 'cancelled');

  const overview = await liffDashboardService.getOverview(ownerLineUserId);
  assert.equal(overview.transactionCount, 0);
});

test('LIFF dashboard returns smart insights in overview', async () => {
  await ensureDatabase();
  const lineUserId = uniqueLineUserId('insights');

  await liffDashboardService.createFromText(lineUserId, 'กาแฟ 45');
  await liffDashboardService.createFromText(lineUserId, 'ข้าว 60');

  const overview = await liffDashboardService.getOverview(lineUserId);
  assert.ok(overview.smartInsights.headline);
  assert.ok(Array.isArray(overview.smartInsights.recommendations));
  assert.ok(overview.smartInsights.recommendations.some((item) => item.includes('กาแฟ')));
});

test('LIFF dashboard can set budget and return progress', async () => {
  await ensureDatabase();
  const lineUserId = uniqueLineUserId('budget');

  await liffDashboardService.createFromText(lineUserId, 'ข้าว 60');
  const budget = await liffDashboardService.setBudgetFromDashboard(lineUserId, {
    category: 'อาหาร',
    amount: 1000,
    month: '2026-06'
  });
  assert.equal(budget.category, 'อาหาร');
  assert.equal(budget.amount, 1000);

  const overview = await liffDashboardService.getOverview(lineUserId, '2026-06');
  assert.equal(overview.budgets.length, 1);
  assert.equal(overview.budgets[0].category, 'อาหาร');
  assert.equal(overview.budgets[0].spent, 60);
  assert.equal(overview.budgets[0].percent, 6);
});

test('LIFF dashboard can create goal and export CSV', async () => {
  await ensureDatabase();
  const lineUserId = uniqueLineUserId('goal-export');

  await liffDashboardService.createFromText(lineUserId, 'กาแฟ 45');
  const goal = await liffDashboardService.createGoalFromDashboard(lineUserId, {
    name: 'iPad',
    targetAmount: 18000,
    months: 6
  });
  assert.equal(goal.name, 'iPad');
  assert.equal(goal.monthlySaving, 3000);

  const overview = await liffDashboardService.getOverview(lineUserId);
  assert.equal(overview.goals.length, 1);
  assert.equal(overview.goals[0].name, 'iPad');
  assert.equal(overview.goals[0].percent, 0);

  const saving = await liffDashboardService.addGoalSavingFromDashboard(lineUserId, goal.id, {
    amount: 1500
  });
  assert.equal(saving.goal.currentAmount, 1500);
  assert.equal(saving.goal.remaining, 16500);
  assert.equal(saving.goal.percent, 8);

  const cappedSaving = await liffDashboardService.addGoalSavingFromDashboard(lineUserId, goal.id, {
    amount: 99999
  });
  assert.equal(cappedSaving.goal.currentAmount, 18000);
  assert.equal(cappedSaving.goal.remaining, 0);
  assert.equal(cappedSaving.goal.percent, 100);
  assert.equal(cappedSaving.capped, true);

  const csv = await liffDashboardService.exportCsv(lineUserId, 'month');
  assert.match(csv, /date,type,title,category,amount,note,source/);
  assert.match(csv, /กาแฟ/);

  const pdf = await liffDashboardService.exportPdf(lineUserId, 'month', {
    title: 'Monthly report',
    note: 'Generated from test'
  });
  assert.match(pdf.filename, /\.pdf$/);
  assert.ok(Buffer.isBuffer(pdf.buffer));
  assert.equal(pdf.buffer.subarray(0, 4).toString(), '%PDF');
  assert.ok(pdf.buffer.length > 1000);
});

test('LIFF dashboard can manage debts and record debt payments', async () => {
  await ensureDatabase();
  const lineUserId = uniqueLineUserId('debt');

  const debt = await liffDashboardService.createDebtFromDashboard(lineUserId, {
    name: 'บัตรเครดิต',
    type: 'credit_card',
    principalAmount: 12000,
    dueDay: 25,
    minimumPayment: 1500,
    note: 'ทดสอบหนี้'
  });

  assert.equal(debt.name, 'บัตรเครดิต');
  assert.equal(debt.remainingAmount, 12000);
  assert.equal(debt.minimumPayment, 1500);
  assert.equal(debt.status, 'active');

  let overview = await liffDashboardService.getOverview(lineUserId);
  assert.equal(overview.debts.length, 1);
  assert.equal(overview.debtSummary.payableTotal, 12000);

  const payment = await liffDashboardService.payDebtFromDashboard(lineUserId, debt.id, {
    amount: 3000,
    note: 'จ่ายงวดแรก',
    createTransaction: true
  });

  assert.equal(payment.payment.amount, 3000);
  assert.equal(payment.debt.remainingAmount, 9000);
  assert.ok(payment.transactionId);

  overview = await liffDashboardService.getOverview(lineUserId);
  assert.equal(overview.debtSummary.payableTotal, 9000);
  assert.ok(overview.transactions.some((row) => row.title === 'จ่ายหนี้ บัตรเครดิต' && row.amount === 3000));
});

test('LIFF dashboard can track receivable debt without creating a transaction', async () => {
  await ensureDatabase();
  const lineUserId = uniqueLineUserId('receivable-debt');

  const debt = await liffDashboardService.createDebtFromDashboard(lineUserId, {
    name: 'เพื่อนยืม',
    type: 'lent',
    principalAmount: 5000
  });
  const payment = await liffDashboardService.payDebtFromDashboard(lineUserId, debt.id, {
    amount: 1000,
    createTransaction: false
  });

  assert.equal(payment.debt.remainingAmount, 4000);
  assert.equal(payment.transactionId, null);

  const overview = await liffDashboardService.getOverview(lineUserId);
  assert.equal(overview.debtSummary.receivableTotal, 4000);
  assert.equal(overview.transactionCount, 0);
});

test('LIFF dashboard accepts a custom debt type', async () => {
  await ensureDatabase();
  const lineUserId = uniqueLineUserId('custom-debt-type');

  const debt = await liffDashboardService.createDebtFromDashboard(lineUserId, {
    name: 'กยศ',
    type: 'custom',
    customType: 'กยศ.',
    principalAmount: 50000,
    dueDay: 5
  });

  assert.equal(debt.type, 'กยศ.');
  assert.equal(debt.typeLabel, 'กยศ.');

  const overview = await liffDashboardService.getOverview(lineUserId);
  assert.equal(overview.debts[0].type, 'กยศ.');
  assert.equal(overview.debts[0].typeLabel, 'กยศ.');
  assert.equal(overview.debtSummary.payableTotal, 50000);
});

test('LIFF dashboard persists custom categories and applies personal category rules', async () => {
  await ensureDatabase();
  const lineUserId = uniqueLineUserId('custom-category');

  const customCategory = await liffDashboardService.upsertCustomCategoryFromDashboard(lineUserId, {
    name: 'คาเฟ่'
  });
  assert.equal(customCategory.name, 'คาเฟ่');

  const rule = await liffDashboardService.upsertCategoryRuleFromDashboard(lineUserId, {
    keyword: 'amazon cafe',
    category: 'คาเฟ่'
  });
  assert.equal(rule.keyword, 'amazon cafe');
  assert.equal(rule.category, 'คาเฟ่');

  const transaction = await liffDashboardService.createFromText(lineUserId, 'amazon cafe 80');
  assert.equal(transaction.category, 'คาเฟ่');

  const overview = await liffDashboardService.getOverview(lineUserId);
  assert.ok(overview.customCategories.some((category) => category.name === 'คาเฟ่'));
  assert.ok(overview.categoryRules.some((item) => item.keyword === 'amazon cafe' && item.category === 'คาเฟ่'));
});

test('LIFF dashboard can re-apply category rules to existing monthly transactions', async () => {
  await ensureDatabase();
  const lineUserId = uniqueLineUserId('apply-category-rules');

  const transaction = await liffDashboardService.createFromText(lineUserId, 'foobarxyz 120');
  assert.notEqual(transaction.category, 'ทดสอบเอง');

  await liffDashboardService.upsertCategoryRuleFromDashboard(lineUserId, {
    keyword: 'foobarxyz',
    category: 'ทดสอบเอง'
  });

  const result = await liffDashboardService.applyCategoryRulesFromDashboard(lineUserId);
  assert.equal(result.updatedCount, 1);

  const overview = await liffDashboardService.getOverview(lineUserId);
  const updated = overview.transactions.find((row) => row.id === transaction.id);
  assert.equal(updated.category, 'ทดสอบเอง');
});

test('LIFF dashboard returns monthly transactions, report, spending plan, and image metadata', async () => {
  await ensureDatabase();
  const lineUserId = uniqueLineUserId('monthly-tools');
  const user = await transactionService.findOrCreateUser(lineUserId);

  await transactionService.createTransaction(user.id, {
    type: 'income',
    amount: 3000,
    title: 'เงินเดือน',
    category: 'รายรับ',
    date: '2026-06-01',
    source: 'text'
  }, 'confirmed');
  const imageTransaction = await transactionService.createTransaction(user.id, {
    type: 'expense',
    amount: 850,
    title: 'ของใช้',
    category: 'สิ่งใช้ประจำวัน',
    date: '2026-06-02',
    source: 'slip',
    imagePath: path.join(os.tmpdir(), 'fake-slip.jpg')
  }, 'confirmed');

  await liffDashboardService.setBudgetFromDashboard(lineUserId, {
    category: 'ทั้งหมด',
    amount: 2000,
    month: '2026-06'
  });

  const overview = await liffDashboardService.getOverview(lineUserId, '2026-06');
  assert.equal(overview.transactions.length, 2);
  assert.equal(overview.spendingPlan.budgetAmount, 2000);
  assert.ok(overview.monthlyReport.topItems.some((item) => item.title === 'ของใช้'));

  const mapped = overview.transactions.find((row) => row.id === imageTransaction.id);
  assert.equal(mapped.hasImage, true);
  assert.match(mapped.imageUrl, new RegExp(`/api/liff/transactions/${imageTransaction.id}/image`));
});
