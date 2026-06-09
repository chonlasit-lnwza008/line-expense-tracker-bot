const db = require('../config/database');
const transactionService = require('./transactionService');
const { parseTextTransaction } = require('../parser/textParser');
const { currentMonth, monthRange, toDateOnly, formatDisplayDate } = require('../utils/dateUtils');
const { normalizeTransaction } = require('./summaryService');

function summarize(rows) {
  const income = rows
    .filter((row) => row.type === 'income')
    .reduce((sum, row) => sum + row.amount, 0);
  const expense = rows
    .filter((row) => row.type === 'expense')
    .reduce((sum, row) => sum + row.amount, 0);
  return { income, expense, net: income - expense };
}

function groupExpensesByCategory(rows) {
  const totals = new Map();
  for (const row of rows.filter((item) => item.type === 'expense')) {
    totals.set(row.category || 'อื่นๆ', (totals.get(row.category || 'อื่นๆ') || 0) + row.amount);
  }
  return [...totals.entries()]
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);
}

function groupByDate(rows) {
  const totals = new Map();
  for (const row of rows) {
    const current = totals.get(row.transactionDate) || {
      date: row.transactionDate,
      displayDate: formatDisplayDate(row.transactionDate),
      income: 0,
      expense: 0
    };
    current[row.type === 'income' ? 'income' : 'expense'] += row.amount;
    totals.set(row.transactionDate, current);
  }
  return [...totals.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function sevenDaysAgo() {
  const date = new Date();
  date.setDate(date.getDate() - 6);
  return toDateOnly(date);
}

function mapTransaction(row) {
  return {
    id: row.id,
    type: row.type,
    amount: Number(row.amount || 0),
    title: row.title,
    category: row.category,
    note: row.note,
    source: row.source,
    transactionDate: row.transactionDate,
    displayDate: formatDisplayDate(row.transactionDate),
    status: row.status
  };
}

async function getOverview(lineUserId, month = currentMonth()) {
  const user = await transactionService.findOrCreateUser(lineUserId);
  const range = monthRange(month || currentMonth());
  const monthlyRows = (await db.all(`
    SELECT *
    FROM transactions
    WHERE userId = $1
      AND status = 'confirmed'
      AND transactionDate >= $2
      AND transactionDate < $3
    ORDER BY transactionDate DESC, createdAt DESC, id DESC
  `, [user.id, range.start, range.endExclusive])).map(normalizeTransaction);

  const recentRows = (await db.all(`
    SELECT *
    FROM transactions
    WHERE userId = $1
      AND status = 'confirmed'
      AND transactionDate >= $2
    ORDER BY transactionDate DESC, createdAt DESC, id DESC
    LIMIT 80
  `, [user.id, sevenDaysAgo()])).map(normalizeTransaction);

  const totals = summarize(monthlyRows);
  const today = toDateOnly();
  const todayRows = monthlyRows.filter((row) => row.transactionDate === today);

  return {
    user: {
      id: user.id,
      lineUserId: user.lineUserId,
      displayName: user.displayName
    },
    month: month || currentMonth(),
    today,
    displayToday: formatDisplayDate(today),
    totals,
    todayTotals: summarize(todayRows),
    categories: groupExpensesByCategory(monthlyRows).slice(0, 8),
    daily: groupByDate(monthlyRows),
    recentSevenDays: recentRows.map(mapTransaction),
    recent: monthlyRows.slice(0, 12).map(mapTransaction),
    transactionCount: monthlyRows.length
  };
}

async function createFromText(lineUserId, text) {
  const user = await transactionService.findOrCreateUser(lineUserId);
  const parsed = parseTextTransaction(String(text || '').trim());
  if (!parsed.ok) {
    const error = new Error('Cannot parse transaction amount');
    error.statusCode = 400;
    error.reason = parsed.reason;
    throw error;
  }

  const tx = await transactionService.createTransaction(user.id, {
    ...parsed,
    source: 'text'
  }, 'confirmed');

  return mapTransaction(normalizeTransaction(tx));
}

function normalizePatch(input = {}) {
  const patch = {};

  if (['income', 'expense', 'transfer'].includes(input.type)) {
    patch.type = input.type;
  }

  if (input.amount !== undefined) {
    const amount = Number(input.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      const error = new Error('Amount must be greater than zero');
      error.statusCode = 400;
      error.reason = 'invalid_amount';
      throw error;
    }
    patch.amount = amount;
  }

  if (input.title !== undefined) {
    const title = String(input.title || '').trim();
    if (!title) {
      const error = new Error('Title is required');
      error.statusCode = 400;
      error.reason = 'title_required';
      throw error;
    }
    patch.title = title.slice(0, 120);
  }

  if (input.category !== undefined) {
    patch.category = String(input.category || 'อื่นๆ').trim().slice(0, 80) || 'อื่นๆ';
  }

  if (input.note !== undefined) {
    const note = String(input.note || '').trim();
    patch.note = note ? note.slice(0, 500) : null;
  }

  if (input.transactionDate !== undefined) {
    const transactionDate = String(input.transactionDate || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(transactionDate)) {
      const error = new Error('Transaction date must use YYYY-MM-DD');
      error.statusCode = 400;
      error.reason = 'invalid_date';
      throw error;
    }
    patch.transactionDate = transactionDate;
  }

  return patch;
}

async function updateFromDashboard(lineUserId, id, input) {
  const user = await transactionService.findOrCreateUser(lineUserId);
  const patch = normalizePatch(input);
  if (!Object.keys(patch).length) {
    const existing = await transactionService.getUserTransaction(user.id, Number(id));
    return existing && existing.status === 'confirmed' ? mapTransaction(normalizeTransaction(existing)) : null;
  }

  const updated = await transactionService.updateTransaction(user.id, Number(id), patch);
  return updated ? mapTransaction(normalizeTransaction(updated)) : null;
}

async function deleteFromDashboard(lineUserId, id) {
  const user = await transactionService.findOrCreateUser(lineUserId);
  const deleted = await transactionService.cancelConfirmedTransaction(user.id, Number(id));
  return deleted ? mapTransaction(normalizeTransaction(deleted)) : null;
}

module.exports = {
  getOverview,
  createFromText,
  updateFromDashboard,
  deleteFromDashboard
};
