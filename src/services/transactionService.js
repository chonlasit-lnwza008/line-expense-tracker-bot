const db = require('../config/database');
const { toDateOnly } = require('../utils/dateUtils');

async function findOrCreateUser(lineUserId, displayName = null) {
  const found = await db.get('SELECT * FROM users WHERE lineUserId = $1', [lineUserId]);
  if (found) return found;

  const inserted = await db.get(
    'INSERT INTO users (lineUserId, displayName) VALUES ($1, $2) RETURNING *',
    [lineUserId, displayName]
  );
  if (inserted) return inserted;

  return db.get('SELECT * FROM users WHERE lineUserId = $1', [lineUserId]);
}

async function createTransaction(userId, data, status = 'confirmed') {
  const inserted = await db.get(`
    INSERT INTO transactions (
      userId, type, amount, title, category, note, transactionDate, source,
      imagePath, ocrText, status, createdAt, updatedAt
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    RETURNING *
  `, [
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
  ]);

  if (inserted) return inserted;
  return getLatestTransaction(userId, status);
}

async function getTransaction(id) {
  return db.get('SELECT * FROM transactions WHERE id = $1', [id]);
}

async function getUserTransaction(userId, id) {
  return db.get('SELECT * FROM transactions WHERE id = $1 AND userId = $2', [id, userId]);
}

async function getLatestTransaction(userId, status = 'confirmed') {
  return db.get(`
    SELECT * FROM transactions
    WHERE userId = $1 AND status = $2
    ORDER BY createdAt DESC, id DESC
    LIMIT 1
  `, [userId, status]);
}

async function getLatestPending(userId) {
  return getLatestTransaction(userId, 'pending');
}

async function listRecentTransactions(userId, limit = 10) {
  return db.all(`
    SELECT * FROM transactions
    WHERE userId = $1 AND status = 'confirmed'
    ORDER BY transactionDate DESC, createdAt DESC, id DESC
    LIMIT $2
  `, [userId, Math.max(1, Math.min(Number(limit) || 10, 30))]);
}

async function listTransactionsFromDate(userId, startDate, limit = 30) {
  return db.all(`
    SELECT * FROM transactions
    WHERE userId = $1
      AND status = 'confirmed'
      AND transactionDate >= $2
    ORDER BY transactionDate DESC, createdAt DESC, id DESC
    LIMIT $3
  `, [userId, startDate, Math.max(1, Math.min(Number(limit) || 30, 80))]);
}

async function listTransactionsByDate(userId, date = toDateOnly(), limit = 30) {
  return db.all(`
    SELECT * FROM transactions
    WHERE userId = $1
      AND status = 'confirmed'
      AND transactionDate = $2
    ORDER BY createdAt DESC, id DESC
    LIMIT $3
  `, [userId, date, Math.max(1, Math.min(Number(limit) || 30, 80))]);
}

async function confirmTransaction(userId, id) {
  await db.run(`
    UPDATE transactions
    SET status = 'confirmed', updatedAt = CURRENT_TIMESTAMP
    WHERE id = $1 AND userId = $2 AND status = 'pending'
  `, [id, userId]);
  return getTransaction(id);
}

async function cancelTransaction(userId, id) {
  await db.run(`
    UPDATE transactions
    SET status = 'cancelled', updatedAt = CURRENT_TIMESTAMP
    WHERE id = $1 AND userId = $2 AND status = 'pending'
  `, [id, userId]);
  return getTransaction(id);
}

async function updateLatest(userId, patch, status = 'confirmed') {
  const latest = await getLatestTransaction(userId, status);
  if (!latest) return null;

  const allowed = ['amount', 'category', 'title', 'note', 'transactionDate'];
  const entries = Object.entries(patch).filter(([key]) => allowed.includes(key));
  if (!entries.length) return latest;

  const setSql = entries.map(([key], index) => `${key} = $${index + 1}`).join(', ');
  await db.run(`
    UPDATE transactions
    SET ${setSql}, updatedAt = CURRENT_TIMESTAMP
    WHERE id = $${entries.length + 1} AND userId = $${entries.length + 2}
  `, [...entries.map((entry) => entry[1]), latest.id, userId]);

  return getTransaction(latest.id);
}

async function updateTransaction(userId, id, patch) {
  const target = await getUserTransaction(userId, id);
  if (!target || target.status !== 'confirmed') return null;

  const allowed = ['amount', 'category', 'title', 'note', 'transactionDate'];
  const entries = Object.entries(patch).filter(([key]) => allowed.includes(key));
  if (!entries.length) return target;

  const setSql = entries.map(([key], index) => `${key} = $${index + 1}`).join(', ');
  await db.run(`
    UPDATE transactions
    SET ${setSql}, updatedAt = CURRENT_TIMESTAMP
    WHERE id = $${entries.length + 1} AND userId = $${entries.length + 2}
  `, [...entries.map((entry) => entry[1]), id, userId]);

  return getTransaction(id);
}

async function updatePendingTransaction(userId, id, patch) {
  const target = await getUserTransaction(userId, id);
  if (!target || target.status !== 'pending') return null;

  const allowed = ['amount', 'category', 'title', 'note', 'transactionDate'];
  const entries = Object.entries(patch).filter(([key]) => allowed.includes(key));
  if (!entries.length) return target;

  const setSql = entries.map(([key], index) => `${key} = $${index + 1}`).join(', ');
  await db.run(`
    UPDATE transactions
    SET ${setSql}, updatedAt = CURRENT_TIMESTAMP
    WHERE id = $${entries.length + 1} AND userId = $${entries.length + 2} AND status = 'pending'
  `, [...entries.map((entry) => entry[1]), id, userId]);

  return getTransaction(id);
}

async function cancelConfirmedTransaction(userId, id) {
  const target = await getUserTransaction(userId, id);
  if (!target || target.status !== 'confirmed') return null;
  await db.run('UPDATE transactions SET status = $1, updatedAt = CURRENT_TIMESTAMP WHERE id = $2 AND userId = $3', ['cancelled', id, userId]);
  return getTransaction(id);
}

async function setPendingEdit(userId, transactionId, field) {
  if (db.client === 'postgres') {
    await db.run(`
      INSERT INTO pending_actions (userId, transactionId, action, field, createdAt)
      VALUES ($1, $2, 'edit_transaction', $3, CURRENT_TIMESTAMP)
      ON CONFLICT (userId)
      DO UPDATE SET transactionId = EXCLUDED.transactionId, action = EXCLUDED.action, field = EXCLUDED.field, createdAt = CURRENT_TIMESTAMP
    `, [userId, transactionId, field]);
  } else {
    await db.run(`
      INSERT INTO pending_actions (userId, transactionId, action, field, createdAt)
      VALUES ($1, $2, 'edit_transaction', $3, CURRENT_TIMESTAMP)
      ON CONFLICT(userId)
      DO UPDATE SET transactionId = excluded.transactionId, action = excluded.action, field = excluded.field, createdAt = CURRENT_TIMESTAMP
    `, [userId, transactionId, field]);
  }

  return getPendingAction(userId);
}

async function getPendingAction(userId) {
  return db.get(`
    SELECT pending_actions.*, transactions.title, transactions.amount, transactions.category, transactions.transactionDate, transactions.status
    FROM pending_actions
    JOIN transactions ON transactions.id = pending_actions.transactionId
    WHERE pending_actions.userId = $1
    LIMIT 1
  `, [userId]);
}

async function clearPendingAction(userId) {
  await db.run('DELETE FROM pending_actions WHERE userId = $1', [userId]);
}

async function requestDeleteLatest(userId) {
  const latest = await getLatestTransaction(userId, 'confirmed');
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

async function confirmDeleteLatest(userId) {
  const pending = await getLatestPending(userId);
  if (!pending || !pending.title.startsWith('DELETE_REQUEST:')) return null;
  const id = Number(pending.title.split(':')[1]);
  await db.run('UPDATE transactions SET status = $1 WHERE id = $2 AND userId = $3', ['cancelled', pending.id, userId]);
  await db.run('UPDATE transactions SET status = $1 WHERE id = $2 AND userId = $3', ['cancelled', id, userId]);
  return getTransaction(id);
}

async function findDuplicate(userId, data) {
  return db.get(`
    SELECT * FROM transactions
    WHERE userId = $1
      AND status = 'confirmed'
      AND transactionDate = $2
      AND amount = $3
      AND lower(title) LIKE $4
    ORDER BY id DESC
    LIMIT 1
  `, [userId, data.date || toDateOnly(), data.amount, `%${String(data.title || '').toLowerCase().slice(0, 8)}%`]);
}

module.exports = {
  findOrCreateUser,
  createTransaction,
  getTransaction,
  getUserTransaction,
  getLatestTransaction,
  getLatestPending,
  listRecentTransactions,
  listTransactionsFromDate,
  listTransactionsByDate,
  confirmTransaction,
  cancelTransaction,
  updateLatest,
  updateTransaction,
  updatePendingTransaction,
  cancelConfirmedTransaction,
  setPendingEdit,
  getPendingAction,
  clearPendingAction,
  requestDeleteLatest,
  confirmDeleteLatest,
  findDuplicate
};
