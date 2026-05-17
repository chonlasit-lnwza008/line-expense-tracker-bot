const db = require('../config/database');
const { toDateOnly } = require('../utils/dateUtils');

function findOrCreateUser(lineUserId, displayName = null) {
  const found = db.prepare('SELECT * FROM users WHERE lineUserId = ?').get(lineUserId);
  if (found) return found;

  const result = db.prepare('INSERT INTO users (lineUserId, displayName) VALUES (?, ?)').run(lineUserId, displayName);
  return db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
}

function createTransaction(userId, data, status = 'confirmed') {
  const stmt = db.prepare(`
    INSERT INTO transactions (
      userId, type, amount, title, category, note, transactionDate, source,
      imagePath, ocrText, status, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `);

  const result = stmt.run(
    userId,
    data.type,
    data.amount,
    data.title || data.merchant || 'ไม่ระบุรายการ',
    data.category || 'อื่นๆ',
    data.note || null,
    data.date || data.transactionDate || toDateOnly(),
    data.source || 'text',
    data.imagePath || null,
    data.rawText || data.ocrText || null,
    status
  );

  return getTransaction(result.lastInsertRowid);
}

function getTransaction(id) {
  return db.prepare('SELECT * FROM transactions WHERE id = ?').get(id);
}

function getLatestTransaction(userId, status = 'confirmed') {
  return db.prepare(`
    SELECT * FROM transactions
    WHERE userId = ? AND status = ?
    ORDER BY datetime(createdAt) DESC, id DESC
    LIMIT 1
  `).get(userId, status);
}

function getLatestPending(userId) {
  return getLatestTransaction(userId, 'pending');
}

function confirmTransaction(userId, id) {
  db.prepare(`
    UPDATE transactions
    SET status = 'confirmed', updatedAt = CURRENT_TIMESTAMP
    WHERE id = ? AND userId = ? AND status = 'pending'
  `).run(id, userId);
  return getTransaction(id);
}

function cancelTransaction(userId, id) {
  db.prepare(`
    UPDATE transactions
    SET status = 'cancelled', updatedAt = CURRENT_TIMESTAMP
    WHERE id = ? AND userId = ? AND status = 'pending'
  `).run(id, userId);
  return getTransaction(id);
}

function updateLatest(userId, patch, status = 'confirmed') {
  const latest = getLatestTransaction(userId, status);
  if (!latest) return null;

  const allowed = ['amount', 'category', 'title', 'note', 'transactionDate'];
  const entries = Object.entries(patch).filter(([key]) => allowed.includes(key));
  if (!entries.length) return latest;

  const setSql = entries.map(([key]) => `${key} = ?`).join(', ');
  db.prepare(`
    UPDATE transactions
    SET ${setSql}, updatedAt = CURRENT_TIMESTAMP
    WHERE id = ? AND userId = ?
  `).run(...entries.map((entry) => entry[1]), latest.id, userId);

  return getTransaction(latest.id);
}

function requestDeleteLatest(userId) {
  const latest = getLatestTransaction(userId, 'confirmed');
  if (!latest) return null;
  return createTransaction(userId, {
    type: latest.type,
    amount: latest.amount,
    title: `DELETE_REQUEST:${latest.id}`,
    category: latest.category,
    date: latest.transactionDate,
    source: 'text',
    note: 'pending delete confirmation'
  }, 'pending');
}

function confirmDeleteLatest(userId) {
  const pending = getLatestPending(userId);
  if (!pending || !pending.title.startsWith('DELETE_REQUEST:')) return null;
  const id = Number(pending.title.split(':')[1]);
  db.prepare('UPDATE transactions SET status = ? WHERE id = ? AND userId = ?').run('cancelled', pending.id, userId);
  db.prepare('UPDATE transactions SET status = ? WHERE id = ? AND userId = ?').run('cancelled', id, userId);
  return getTransaction(id);
}

function findDuplicate(userId, data) {
  return db.prepare(`
    SELECT * FROM transactions
    WHERE userId = ?
      AND status = 'confirmed'
      AND transactionDate = ?
      AND amount = ?
      AND lower(title) LIKE ?
    ORDER BY id DESC
    LIMIT 1
  `).get(userId, data.date || toDateOnly(), data.amount, `%${String(data.title || '').toLowerCase().slice(0, 8)}%`);
}

module.exports = {
  findOrCreateUser,
  createTransaction,
  getTransaction,
  getLatestTransaction,
  getLatestPending,
  confirmTransaction,
  cancelTransaction,
  updateLatest,
  requestDeleteLatest,
  confirmDeleteLatest,
  findDuplicate
};
