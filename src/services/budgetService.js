const db = require('../config/database');
const { currentMonth, monthRange } = require('../utils/dateUtils');
const { formatMoney } = require('../utils/moneyUtils');

async function setBudget(userId, category, amount, month = currentMonth()) {
  await db.run(`
    INSERT INTO budgets (userId, category, amount, month)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT(userId, category, month)
    DO UPDATE SET amount = excluded.amount
  `, [userId, category, amount, month]);
  return { category, amount, month };
}

async function getBudgetAlerts(userId, category, month = currentMonth()) {
  const range = monthRange(month);
  const budgets = await db.all(`
    SELECT * FROM budgets
    WHERE userId = $1 AND month = $2 AND category IN ($3, 'ทั้งหมด')
  `, [userId, month, category]);

  const alerts = [];
  for (const budget of budgets) {
    const categoryFilter = budget.category === 'ทั้งหมด' ? '' : 'AND category = $5';
    const params = [userId, range.start, range.endExclusive, 'confirmed'];
    if (budget.category !== 'ทั้งหมด') params.push(budget.category);

    const row = await db.get(`
      SELECT COALESCE(SUM(amount), 0) AS total
      FROM transactions
      WHERE userId = $1
        AND transactionDate >= $2
        AND transactionDate < $3
        AND status = $4
        AND type = 'expense'
        ${categoryFilter}
    `, params);

    const spent = Number(row?.total || 0);
    const amount = Number(budget.amount || 0);
    const percent = amount ? spent / amount : 0;
    if (percent >= 1) alerts.push(`งบ${budget.category}ใช้ครบ 100% แล้ว (${formatMoney(spent)}/${formatMoney(amount)} บาท)`);
    else if (percent >= 0.8) alerts.push(`งบ${budget.category}ใช้ถึง 80% แล้ว (${formatMoney(spent)}/${formatMoney(amount)} บาท)`);
  }

  return alerts;
}

async function createGoal(userId, name, targetAmount, months) {
  const deadline = new Date();
  deadline.setMonth(deadline.getMonth() + months);
  const deadlineText = deadline.toISOString().slice(0, 10);
  const inserted = await db.get(`
    INSERT INTO goals (userId, name, targetAmount, deadline)
    VALUES ($1, $2, $3, $4)
    RETURNING id
  `, [userId, name, targetAmount, deadlineText]);

  return {
    id: inserted?.id,
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
