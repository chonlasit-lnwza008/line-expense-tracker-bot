const db = require('../config/database');
const { currentMonth, monthRange } = require('../utils/dateUtils');
const { formatMoney } = require('../utils/moneyUtils');

function setBudget(userId, category, amount, month = currentMonth()) {
  db.prepare(`
    INSERT INTO budgets (userId, category, amount, month)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(userId, category, month)
    DO UPDATE SET amount = excluded.amount
  `).run(userId, category, amount, month);
  return { category, amount, month };
}

function getBudgetAlerts(userId, category, month = currentMonth()) {
  const range = monthRange(month);
  const budgets = db.prepare(`
    SELECT * FROM budgets
    WHERE userId = ? AND month = ? AND category IN (?, 'ทั้งหมด')
  `).all(userId, month, category);

  return budgets.map((budget) => {
    const categoryFilter = budget.category === 'ทั้งหมด' ? '' : 'AND category = @category';
    const spent = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) AS total
      FROM transactions
      WHERE userId = @userId
        AND status = 'confirmed'
        AND type = 'expense'
        AND transactionDate >= @start
        AND transactionDate < @endExclusive
        ${categoryFilter}
    `).get({ userId, category: budget.category, start: range.start, endExclusive: range.endExclusive }).total;

    const percent = budget.amount ? spent / budget.amount : 0;
    if (percent >= 1) return `งบ${budget.category}ใช้ครบ 100% แล้ว (${formatMoney(spent)}/${formatMoney(budget.amount)} บาท)`;
    if (percent >= 0.8) return `งบ${budget.category}ใช้ถึง 80% แล้ว (${formatMoney(spent)}/${formatMoney(budget.amount)} บาท)`;
    return null;
  }).filter(Boolean);
}

function createGoal(userId, name, targetAmount, months) {
  const deadline = new Date();
  deadline.setMonth(deadline.getMonth() + months);
  const deadlineText = deadline.toISOString().slice(0, 10);
  const result = db.prepare(`
    INSERT INTO goals (userId, name, targetAmount, deadline)
    VALUES (?, ?, ?, ?)
  `).run(userId, name, targetAmount, deadlineText);

  return {
    id: result.lastInsertRowid,
    name,
    targetAmount,
    months,
    monthlySaving: targetAmount / months,
    deadline: deadlineText
  };
}

module.exports = {
  setBudget,
  getBudgetAlerts,
  createGoal
};
