const db = require('../config/database');
const { currentMonth, monthRange, toDateOnly } = require('../utils/dateUtils');

function normalizeDate(value) {
  return value instanceof Date ? toDateOnly(value) : value;
}

function csvEscape(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function rowsToCsv(rows) {
  const headers = ['date', 'type', 'title', 'category', 'amount', 'note', 'source'];
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push([
      normalizeDate(row.transactionDate),
      row.type,
      row.title,
      row.category,
      row.amount,
      row.note,
      row.source
    ].map(csvEscape).join(','));
  }
  return lines.join('\n');
}

async function exportTransactions(userId, scope = 'month') {
  let rows;
  if (scope === 'all') {
    rows = await db.all(`
      SELECT * FROM transactions
      WHERE userId = $1 AND status = 'confirmed'
      ORDER BY transactionDate ASC, id ASC
    `, [userId]);
  } else {
    const range = monthRange(currentMonth());
    rows = await db.all(`
      SELECT * FROM transactions
      WHERE userId = $1 AND status = 'confirmed'
        AND transactionDate >= $2 AND transactionDate < $3
      ORDER BY transactionDate ASC, id ASC
    `, [userId, range.start, range.endExclusive]);
  }
  return rowsToCsv(rows);
}

module.exports = {
  exportTransactions,
  rowsToCsv
};
