const db = require('../config/database');
const { currentMonth, monthRange } = require('../utils/dateUtils');
const { normalizeTransaction } = require('./summaryService');

function summarize(rows) {
  const income = rows.filter((row) => row.type === 'income').reduce((sum, row) => sum + row.amount, 0);
  const expense = rows.filter((row) => row.type === 'expense').reduce((sum, row) => sum + row.amount, 0);
  return { income, expense, net: income - expense };
}

function groupExpensesByCategory(rows) {
  const totals = new Map();
  for (const row of rows.filter((item) => item.type === 'expense')) {
    totals.set(row.category, (totals.get(row.category) || 0) + row.amount);
  }
  return [...totals.entries()]
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);
}

function groupByDate(rows) {
  const totals = new Map();
  for (const row of rows) {
    const current = totals.get(row.transactionDate) || { date: row.transactionDate, income: 0, expense: 0 };
    current[row.type === 'income' ? 'income' : 'expense'] += row.amount;
    totals.set(row.transactionDate, current);
  }
  return [...totals.values()].sort((a, b) => a.date.localeCompare(b.date));
}

async function getDashboardData(month = currentMonth()) {
  const range = monthRange(month);
  const rows = (await db.all(`
    SELECT transactions.*, users.lineUserId, users.displayName
    FROM transactions
    JOIN users ON users.id = transactions.userId
    WHERE transactions.status = 'confirmed'
      AND transactions.transactionDate >= $1
      AND transactions.transactionDate < $2
    ORDER BY transactions.transactionDate DESC, transactions.createdAt DESC, transactions.id DESC
  `, [range.start, range.endExclusive])).map(normalizeTransaction);

  return {
    month,
    totals: summarize(rows),
    categories: groupExpensesByCategory(rows).slice(0, 8),
    daily: groupByDate(rows),
    recent: rows.slice(0, 20),
    transactionCount: rows.length,
    userCount: new Set(rows.map((row) => row.userId)).size
  };
}

module.exports = { getDashboardData };
