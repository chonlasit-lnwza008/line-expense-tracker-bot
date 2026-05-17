const db = require('../config/database');
const { currentMonth, monthRange } = require('../utils/dateUtils');

function csvEscape(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function rowsToCsv(rows) {
  const headers = ['date', 'type', 'title', 'category', 'amount', 'note', 'source'];
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push([
      row.transactionDate,
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

function exportTransactions(userId, scope = 'month') {
  let rows;
  if (scope === 'all') {
    rows = db.prepare(`
      SELECT * FROM transactions
      WHERE userId = ? AND status = 'confirmed'
      ORDER BY transactionDate ASC, id ASC
    `).all(userId);
  } else {
    const range = monthRange(currentMonth());
    rows = db.prepare(`
      SELECT * FROM transactions
      WHERE userId = ? AND status = 'confirmed'
        AND transactionDate >= ? AND transactionDate < ?
      ORDER BY transactionDate ASC, id ASC
    `).all(userId, range.start, range.endExclusive);
  }
  return rowsToCsv(rows);
}

module.exports = {
  exportTransactions,
  rowsToCsv
};
