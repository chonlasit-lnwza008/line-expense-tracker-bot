const db = require('../config/database');
const transactionService = require('./transactionService');
const exportService = require('./exportService');
const debtService = require('./debtService');
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

function daysLeftInMonth(month = currentMonth()) {
  const [year, monthIndex] = String(month).split('-').map(Number);
  const today = toDateOnly();
  const todayDate = new Date(`${today}T00:00:00+07:00`);
  const lastDate = new Date(year, monthIndex, 0);
  const diff = Math.ceil((lastDate - todayDate) / 86400000) + 1;
  return Math.max(1, diff);
}

function buildSpendingPlan(totals, budgets, month) {
  const totalBudget = budgets.find((budget) => budget.category === 'ทั้งหมด')
    || budgets.find((budget) => budget.category === 'à¸—à¸±à¹‰à¸‡à¸«à¸¡à¸”');
  const budgetAmount = totalBudget
    ? Number(totalBudget.amount || 0)
    : budgets.reduce((sum, budget) => sum + Number(budget.amount || 0), 0);
  const targetNet = Math.max(0, totals.income - budgetAmount);
  const remainingExpense = budgetAmount ? budgetAmount - totals.expense : Math.max(0, totals.income - totals.expense);
  const daysLeft = daysLeftInMonth(month);

  return {
    budgetAmount,
    targetNet,
    remainingExpense,
    daysLeft,
    dailyAllowance: Math.max(0, Math.floor(remainingExpense / daysLeft)),
    status: budgetAmount && remainingExpense < 0 ? 'over' : 'ok'
  };
}

function buildMonthlyReport(rows, categories, totals, smartInsights, spendingPlan) {
  const topItems = rows
    .filter((row) => row.type === 'expense')
    .slice()
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5)
    .map((row) => ({
      title: row.title,
      amount: row.amount,
      category: row.category,
      displayDate: formatDisplayDate(row.transactionDate)
    }));

  return {
    headline: smartInsights.headline,
    totals,
    categories: categories.slice(0, 5),
    topItems,
    dailyAllowance: spendingPlan.dailyAllowance,
    remainingExpense: spendingPlan.remainingExpense,
    tips: [
      ...(smartInsights.warnings || []),
      ...(smartInsights.recommendations || [])
    ].slice(0, 4)
  };
}

function buildSmartInsights(monthlyRows, categories, totals, todayTotals) {
  const insights = [];
  const recommendations = [];
  const warnings = [];
  const topCategory = categories[0];
  const daysWithExpense = new Set(monthlyRows
    .filter((row) => row.type === 'expense')
    .map((row) => row.transactionDate)).size;
  const averageDailyExpense = daysWithExpense ? totals.expense / daysWithExpense : 0;

  if (!monthlyRows.length) {
    return {
      headline: 'เริ่มบันทึกรายการแรก แล้ว dashboard จะวิเคราะห์ให้เอง',
      insights: ['ยังไม่มีข้อมูลเดือนนี้พอสำหรับวิเคราะห์'],
      warnings: ['ส่งสลิปหรือพิมพ์รายการ เช่น กาแฟ 45 เพื่อเริ่มใช้งาน'],
      recommendations: ['ลองตั้งงบรายเดือน เพื่อให้ระบบเตือนเมื่อใช้ใกล้เกินงบ']
    };
  }

  if (totals.net >= 0) {
    insights.push(`เดือนนี้ยังเหลือสุทธิ ${totals.net.toLocaleString('th-TH')} บาท`);
  } else {
    warnings.push(`เดือนนี้รายจ่ายมากกว่ารายรับ ${Math.abs(totals.net).toLocaleString('th-TH')} บาท`);
  }

  if (topCategory) {
    const percent = totals.expense ? Math.round((topCategory.amount / totals.expense) * 100) : 0;
    insights.push(`หมวดที่ใช้เยอะสุดคือ ${topCategory.category} คิดเป็น ${percent}% ของรายจ่าย`);
    if (percent >= 50 && totals.expense >= 1000) {
      warnings.push(`รายจ่ายกระจุกในหมวด ${topCategory.category} ค่อนข้างสูง`);
    }
  }

  if (averageDailyExpense > 0) {
    insights.push(`วันที่มีรายจ่าย ใช้เฉลี่ยประมาณ ${Math.round(averageDailyExpense).toLocaleString('th-TH')} บาท/วัน`);
  }

  const coffeeRows = monthlyRows.filter((row) => row.type === 'expense' && /(กาแฟ|coffee|ลาเต้|อเมริกาโน|คาปู)/i.test(row.title || ''));
  if (coffeeRows.length) {
    const averageCoffee = coffeeRows.reduce((sum, row) => sum + Number(row.amount || 0), 0) / coffeeRows.length;
    recommendations.push(`ถ้าลดกาแฟวันละ 1 แก้ว จะประหยัดประมาณ ${Math.round(averageCoffee * 30).toLocaleString('th-TH')} บาท/เดือน`);
  }

  if (topCategory && topCategory.amount >= 500) {
    recommendations.push(`ลองตั้งงบหมวด ${topCategory.category} ไว้ที่ ${Math.ceil(topCategory.amount * 0.9).toLocaleString('th-TH')} บาทในเดือนหน้า`);
  }

  if (todayTotals.expense > averageDailyExpense * 1.5 && averageDailyExpense > 0) {
    warnings.push('วันนี้ใช้จ่ายสูงกว่าค่าเฉลี่ยรายวันพอสมควร');
  }

  const expenseRows = monthlyRows.filter((row) => row.type === 'expense');
  if (expenseRows.length >= 5) {
    const averageExpense = totals.expense / expenseRows.length;
    const largeItems = expenseRows
      .filter((row) => row.amount >= averageExpense * 2.5 && row.amount >= 500)
      .slice(0, 2);
    for (const item of largeItems) {
      warnings.push(`รายการ "${item.title}" สูงกว่าค่าใช้จ่ายเฉลี่ยของคุณ ลองตรวจว่าเป็นรายจ่ายจำเป็นหรือไม่`);
    }
  }

  if (!recommendations.length) {
    recommendations.push('บันทึกต่อเนื่องอีกสัก 1-2 สัปดาห์ ระบบจะแนะนำจุดประหยัดได้แม่นขึ้น');
  }

  return {
    headline: warnings.length ? warnings[0] : insights[0] || 'ภาพรวมยังดูดี',
    insights: insights.slice(0, 3),
    warnings: warnings.slice(0, 3),
    recommendations: recommendations.slice(0, 3)
  };
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
    hasImage: Boolean(row.imagePath),
    imageUrl: row.imagePath ? `/api/liff/transactions/${encodeURIComponent(row.id)}/image` : null,
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
  const categories = groupExpensesByCategory(monthlyRows).slice(0, 8);
  const budgets = await getBudgetProgress(user.id, month || currentMonth());
  const debts = await debtService.listDebts(user.id, 'all');
  const smartInsights = buildSmartInsights(monthlyRows, categories, totals, summarize(todayRows));
  const spendingPlan = buildSpendingPlan(totals, budgets, month || currentMonth());

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
    smartInsights,
    spendingPlan,
    monthlyReport: buildMonthlyReport(monthlyRows, categories, totals, smartInsights, spendingPlan),
    budgets,
    goals: await getGoals(user.id),
    debts,
    debtSummary: debtService.summarizeDebts(debts),
    categories,
    daily: groupByDate(monthlyRows),
    transactions: monthlyRows.map(mapTransaction),
    recentSevenDays: recentRows.map(mapTransaction),
    recent: monthlyRows.slice(0, 12).map(mapTransaction),
    transactionCount: monthlyRows.length
  };
}

async function getTransactionImage(lineUserId, id) {
  const user = await transactionService.findOrCreateUser(lineUserId);
  const transaction = await transactionService.getUserTransaction(user.id, Number(id));
  if (!transaction || transaction.status !== 'confirmed' || !transaction.imagePath) return null;
  return transaction.imagePath;
}

async function getBudgetProgress(userId, month = currentMonth()) {
  const range = monthRange(month);
  const budgets = await db.all(`
    SELECT *
    FROM budgets
    WHERE userId = $1 AND month = $2
    ORDER BY category ASC
  `, [userId, month]);

  const result = [];
  for (const budget of budgets) {
    const isTotal = budget.category === 'ทั้งหมด';
    const categoryFilter = isTotal ? '' : 'AND category = $5';
    const params = [userId, range.start, range.endExclusive, 'confirmed'];
    if (!isTotal) params.push(budget.category);
    const spentRow = await db.get(`
      SELECT COALESCE(SUM(amount), 0) AS spent
      FROM transactions
      WHERE userId = $1
        AND transactionDate >= $2
        AND transactionDate < $3
        AND status = $4
        AND type = 'expense'
        ${categoryFilter}
    `, params);
    const amount = Number(budget.amount || 0);
    const spent = Number(spentRow?.spent || 0);
    result.push({
      id: budget.id,
      category: budget.category,
      amount,
      spent,
      remaining: amount - spent,
      percent: amount ? Math.round((spent / amount) * 100) : 0,
      month: budget.month
    });
  }
  return result;
}

async function getGoals(userId) {
  const goals = await db.all(`
    SELECT *
    FROM goals
    WHERE userId = $1
    ORDER BY deadline ASC, id ASC
    LIMIT 10
  `, [userId]);

  return goals.map(mapGoal);
}

function mapGoal(goal) {
  const targetAmount = Number(goal.targetAmount || 0);
  const currentAmount = Number(goal.currentAmount || 0);
  const remaining = Math.max(0, targetAmount - currentAmount);
  const percent = targetAmount ? Math.min(100, Math.round((currentAmount / targetAmount) * 100)) : 0;
  return {
    id: goal.id,
    name: goal.name,
    targetAmount,
    currentAmount,
    remaining,
    percent,
    deadline: goal.deadline,
    displayDeadline: formatDisplayDate(goal.deadline)
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

async function setBudgetFromDashboard(lineUserId, input = {}) {
  const user = await transactionService.findOrCreateUser(lineUserId);
  const category = String(input.category || 'ทั้งหมด').trim().slice(0, 80) || 'ทั้งหมด';
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    const error = new Error('Budget amount must be greater than zero');
    error.statusCode = 400;
    error.reason = 'invalid_amount';
    throw error;
  }
  const month = String(input.month || currentMonth()).slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(month)) {
    const error = new Error('Budget month must use YYYY-MM');
    error.statusCode = 400;
    error.reason = 'invalid_month';
    throw error;
  }

  if (db.client === 'postgres') {
    await db.run(`
      INSERT INTO budgets (userId, category, amount, month)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT(userId, category, month)
      DO UPDATE SET amount = EXCLUDED.amount
    `, [user.id, category, amount, month]);
  } else {
    await db.run(`
      INSERT INTO budgets (userId, category, amount, month)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT(userId, category, month)
      DO UPDATE SET amount = excluded.amount
    `, [user.id, category, amount, month]);
  }

  return { category, amount, month };
}

async function createGoalFromDashboard(lineUserId, input = {}) {
  const user = await transactionService.findOrCreateUser(lineUserId);
  const name = String(input.name || '').trim().slice(0, 100);
  const targetAmount = Number(input.targetAmount);
  const months = Math.max(1, Math.min(Number(input.months) || 1, 120));
  if (!name) {
    const error = new Error('Goal name is required');
    error.statusCode = 400;
    error.reason = 'name_required';
    throw error;
  }
  if (!Number.isFinite(targetAmount) || targetAmount <= 0) {
    const error = new Error('Goal amount must be greater than zero');
    error.statusCode = 400;
    error.reason = 'invalid_amount';
    throw error;
  }

  const deadline = new Date();
  deadline.setMonth(deadline.getMonth() + months);
  const deadlineText = toDateOnly(deadline);
  const inserted = await db.get(`
    INSERT INTO goals (userId, name, targetAmount, deadline)
    VALUES ($1, $2, $3, $4)
    RETURNING *
  `, [user.id, name, targetAmount, deadlineText]);

  return {
    id: inserted?.id,
    name,
    targetAmount,
    currentAmount: 0,
    monthlySaving: Math.ceil(targetAmount / months),
    deadline: deadlineText,
    displayDeadline: formatDisplayDate(deadlineText)
  };
}

async function addGoalSavingFromDashboard(lineUserId, id, input = {}) {
  const user = await transactionService.findOrCreateUser(lineUserId);
  const goalId = Number(id);
  const amount = Number(input.amount);
  if (!Number.isInteger(goalId) || goalId <= 0) {
    const error = new Error('Goal id is invalid');
    error.statusCode = 400;
    error.reason = 'invalid_goal_id';
    throw error;
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    const error = new Error('Saving amount must be greater than zero');
    error.statusCode = 400;
    error.reason = 'invalid_amount';
    throw error;
  }

  const goal = await db.get(`
    SELECT *
    FROM goals
    WHERE id = $1 AND userId = $2
  `, [goalId, user.id]);
  if (!goal) {
    return null;
  }

  const targetAmount = Number(goal.targetAmount || 0);
  const currentAmount = Number(goal.currentAmount || 0);
  const nextAmount = Math.min(targetAmount, currentAmount + amount);
  await db.run(`
    UPDATE goals
    SET currentAmount = $1
    WHERE id = $2 AND userId = $3
  `, [nextAmount, goalId, user.id]);

  const updated = await db.get(`
    SELECT *
    FROM goals
    WHERE id = $1 AND userId = $2
  `, [goalId, user.id]);

  return {
    goal: mapGoal(updated),
    savedAmount: Math.max(0, nextAmount - currentAmount),
    capped: currentAmount + amount > targetAmount
  };
}

async function createDebtFromDashboard(lineUserId, input = {}) {
  const user = await transactionService.findOrCreateUser(lineUserId);
  return debtService.createDebt(user.id, input);
}

async function updateDebtFromDashboard(lineUserId, id, input = {}) {
  const user = await transactionService.findOrCreateUser(lineUserId);
  return debtService.updateDebt(user.id, Number(id), input);
}

async function payDebtFromDashboard(lineUserId, id, input = {}) {
  const user = await transactionService.findOrCreateUser(lineUserId);
  return debtService.recordPayment(user.id, Number(id), input);
}

async function cancelDebtFromDashboard(lineUserId, id) {
  const user = await transactionService.findOrCreateUser(lineUserId);
  return debtService.cancelDebt(user.id, Number(id));
}

async function exportCsv(lineUserId, scope = 'month') {
  const user = await transactionService.findOrCreateUser(lineUserId);
  return exportService.exportTransactions(user.id, scope === 'all' ? 'all' : 'month');
}

async function exportPdf(lineUserId, scope = 'month', options = {}) {
  const user = await transactionService.findOrCreateUser(lineUserId);
  return exportService.exportTransactionsPdf(user.id, scope === 'all' ? 'all' : 'month', options);
}

module.exports = {
  getOverview,
  getTransactionImage,
  createFromText,
  updateFromDashboard,
  deleteFromDashboard,
  setBudgetFromDashboard,
  createGoalFromDashboard,
  addGoalSavingFromDashboard,
  createDebtFromDashboard,
  updateDebtFromDashboard,
  payDebtFromDashboard,
  cancelDebtFromDashboard,
  exportCsv,
  exportPdf
};
