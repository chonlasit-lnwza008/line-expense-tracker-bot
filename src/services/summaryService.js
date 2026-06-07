const db = require('../config/database');
const { toDateOnly, currentMonth, monthRange, formatDisplayDate, formatDisplayMonth } = require('../utils/dateUtils');
const { formatMoney } = require('../utils/moneyUtils');

function normalizeTransaction(row) {
  return {
    ...row,
    amount: Number(row.amount || 0),
    transactionDate: row.transactionDate instanceof Date ? toDateOnly(row.transactionDate) : row.transactionDate
  };
}

function summarizeRows(rows) {
  const income = rows.filter((row) => row.type === 'income').reduce((sum, row) => sum + row.amount, 0);
  const expense = rows.filter((row) => row.type === 'expense').reduce((sum, row) => sum + row.amount, 0);
  return { income, expense, net: income - expense };
}

async function dailySummary(userId, date = toDateOnly()) {
  const rows = (await db.all(`
    SELECT * FROM transactions
    WHERE userId = $1 AND status = 'confirmed' AND transactionDate = $2
    ORDER BY id ASC
  `, [userId, date])).map(normalizeTransaction);
  const summary = summarizeRows(rows);
  return { date, rows, ...summary };
}

async function monthlySummary(userId, month = currentMonth()) {
  const range = monthRange(month);
  const rows = (await db.all(`
    SELECT * FROM transactions
    WHERE userId = $1 AND status = 'confirmed'
      AND transactionDate >= $2 AND transactionDate < $3
  `, [userId, range.start, range.endExclusive])).map(normalizeTransaction);
  const summary = summarizeRows(rows);
  const categories = new Map();
  for (const row of rows.filter((item) => item.type === 'expense')) {
    categories.set(row.category, (categories.get(row.category) || 0) + row.amount);
  }
  const topCategory = [...categories.entries()].sort((a, b) => b[1] - a[1])[0] || null;
  return { month, rows, topCategory, ...summary };
}

function formatDailySummary(summary) {
  const list = summary.rows.map((row) => `- ${row.title} ${formatMoney(row.amount)} (${row.category})`).join('\n') || '- ไม่มีรายการ';
  return [
    `สรุปวันนี้ (${formatDisplayDate(summary.date)})`,
    `รายรับรวม: ${formatMoney(summary.income)} บาท`,
    `รายจ่ายรวม: ${formatMoney(summary.expense)} บาท`,
    `คงเหลือสุทธิ: ${formatMoney(summary.net)} บาท`,
    'รายการวันนี้:',
    list
  ].join('\n');
}

function formatMonthlySummary(summary) {
  const top = summary.topCategory ? `${summary.topCategory[0]} ${formatMoney(summary.topCategory[1])} บาท` : 'ไม่มี';
  return [
    `สรุปเดือนนี้ (${formatDisplayMonth(summary.month)})`,
    `รายรับรวม: ${formatMoney(summary.income)} บาท`,
    `รายจ่ายรวม: ${formatMoney(summary.expense)} บาท`,
    `คงเหลือ: ${formatMoney(summary.net)} บาท`,
    `หมวดที่ใช้เยอะที่สุด: ${top}`,
    `จำนวนรายการทั้งหมด: ${summary.rows.length}`
  ].join('\n');
}

module.exports = {
  dailySummary,
  monthlySummary,
  formatDailySummary,
  formatMonthlySummary,
  normalizeTransaction
};
