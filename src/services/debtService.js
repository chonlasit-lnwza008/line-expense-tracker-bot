const db = require('../config/database');
const transactionService = require('./transactionService');
const { toDateOnly, formatDisplayDate } = require('../utils/dateUtils');

const DEBT_TYPES = new Set(['borrowed', 'lent', 'installment', 'credit_card', 'loan']);

function normalizeDebt(row) {
  if (!row) return null;
  const principalAmount = Number(row.principalAmount || 0);
  const remainingAmount = Number(row.remainingAmount || 0);
  const paidAmount = Math.max(0, principalAmount - remainingAmount);
  const percent = principalAmount ? Math.min(100, Math.round((paidAmount / principalAmount) * 100)) : 0;
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    type: row.type,
    typeLabel: formatDebtType(row.type),
    principalAmount,
    remainingAmount,
    paidAmount,
    percent,
    interestRate: Number(row.interestRate || 0),
    minimumPayment: row.minimumPayment == null ? null : Number(row.minimumPayment || 0),
    dueDay: row.dueDay == null ? null : Number(row.dueDay),
    dueDate: row.dueDate || null,
    displayDue: formatDue(row),
    status: row.status,
    computedStatus: computeDebtStatus(row),
    note: row.note || '',
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

function normalizePayment(row) {
  if (!row) return null;
  return {
    id: row.id,
    debtId: row.debtId,
    userId: row.userId,
    amount: Number(row.amount || 0),
    paymentDate: row.paymentDate,
    displayDate: formatDisplayDate(row.paymentDate),
    note: row.note || '',
    transactionId: row.transactionId || null,
    createdAt: row.createdAt
  };
}

function formatDebtType(type) {
  return {
    borrowed: 'หนี้ที่ต้องจ่าย',
    lent: 'ลูกหนี้/เงินที่คนอื่นติดเรา',
    installment: 'ผ่อนสินค้า',
    credit_card: 'บัตรเครดิต',
    loan: 'เงินกู้'
  }[type] || type || 'หนี้ทั่วไป';
}

function formatDue(row) {
  if (row.dueDate) return formatDisplayDate(row.dueDate);
  if (row.dueDay) return `ทุกวันที่ ${row.dueDay}`;
  return '-';
}

function computeDebtStatus(row) {
  if (!row || row.status !== 'active') return row?.status || 'active';
  const today = toDateOnly();
  if (row.dueDate) {
    if (row.dueDate < today) return 'overdue';
    const diff = Math.ceil((new Date(`${row.dueDate}T00:00:00+07:00`) - new Date(`${today}T00:00:00+07:00`)) / 86400000);
    if (diff <= 3) return 'due_soon';
  }
  if (row.dueDay) {
    const now = new Date();
    const due = new Date(now.getFullYear(), now.getMonth(), Number(row.dueDay));
    const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const diff = Math.ceil((due - todayDate) / 86400000);
    if (diff < 0) return 'overdue';
    if (diff <= 3) return 'due_soon';
  }
  return 'active';
}

function normalizeDebtInput(input = {}) {
  const name = String(input.name || '').trim().slice(0, 120);
  const requestedType = String(input.type || '').trim();
  const customType = String(input.customType || '').trim();
  const rawType = requestedType === 'custom' ? customType : requestedType;
  const type = normalizeDebtType(rawType);
  const principalAmount = Number(input.principalAmount ?? input.amount);
  const remainingAmount = input.remainingAmount === undefined ? principalAmount : Number(input.remainingAmount);
  const interestRate = Number(input.interestRate || 0);
  const minimumPayment = input.minimumPayment == null || input.minimumPayment === ''
    ? null
    : Number(input.minimumPayment);
  const dueDay = input.dueDay == null || input.dueDay === '' ? null : Number(input.dueDay);
  const dueDate = input.dueDate ? String(input.dueDate).trim() : null;
  const note = String(input.note || '').trim().slice(0, 500) || null;

  if (!name) throwInputError('Debt name is required', 'name_required');
  if (!Number.isFinite(principalAmount) || principalAmount <= 0) throwInputError('Debt amount must be greater than zero', 'invalid_amount');
  if (!Number.isFinite(remainingAmount) || remainingAmount < 0) throwInputError('Remaining amount is invalid', 'invalid_remaining');
  if (!Number.isFinite(interestRate) || interestRate < 0) throwInputError('Interest rate is invalid', 'invalid_interest');
  if (minimumPayment != null && (!Number.isFinite(minimumPayment) || minimumPayment < 0)) throwInputError('Minimum payment is invalid', 'invalid_minimum_payment');
  if (dueDay != null && (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31)) throwInputError('Due day must be 1-31', 'invalid_due_day');
  if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) throwInputError('Due date must use YYYY-MM-DD', 'invalid_due_date');

  return {
    name,
    type,
    principalAmount,
    remainingAmount,
    interestRate,
    minimumPayment,
    dueDay,
    dueDate,
    note
  };
}

function normalizeDebtType(value) {
  const type = String(value || '').trim().slice(0, 60);
  if (!type) return 'borrowed';
  if (DEBT_TYPES.has(type)) return type;
  return type;
}

function throwInputError(message, reason) {
  const error = new Error(message);
  error.statusCode = 400;
  error.reason = reason;
  throw error;
}

async function createDebt(userId, input = {}) {
  const data = normalizeDebtInput(input);
  const row = await db.get(`
    INSERT INTO debts (
      userId, name, type, principalAmount, remainingAmount, interestRate,
      minimumPayment, dueDay, dueDate, note
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING *
  `, [
    userId,
    data.name,
    data.type,
    data.principalAmount,
    data.remainingAmount,
    data.interestRate,
    data.minimumPayment,
    data.dueDay,
    data.dueDate,
    data.note
  ]);
  return normalizeDebt(row);
}

async function listDebts(userId, status = 'active') {
  const rows = await db.all(`
    SELECT *
    FROM debts
    WHERE userId = $1
      AND ($2 = 'all' OR status = $2)
    ORDER BY status ASC, dueDate ASC, dueDay ASC, id DESC
  `, [userId, status || 'active']);
  return rows.map(normalizeDebt);
}

async function getDebt(userId, id) {
  return normalizeDebt(await db.get('SELECT * FROM debts WHERE id = $1 AND userId = $2', [Number(id), userId]));
}

async function findDebtByName(userId, name) {
  const keyword = `%${String(name || '').trim()}%`;
  return normalizeDebt(await db.get(`
    SELECT *
    FROM debts
    WHERE userId = $1
      AND status = 'active'
      AND name LIKE $2
    ORDER BY id DESC
    LIMIT 1
  `, [userId, keyword]));
}

async function updateDebt(userId, id, input = {}) {
  const existing = await getDebt(userId, id);
  if (!existing || existing.status === 'cancelled') return null;
  const next = normalizeDebtInput({
    name: input.name ?? existing.name,
    type: input.type ?? existing.type,
    principalAmount: input.principalAmount ?? existing.principalAmount,
    remainingAmount: input.remainingAmount ?? existing.remainingAmount,
    interestRate: input.interestRate ?? existing.interestRate,
    minimumPayment: input.minimumPayment ?? existing.minimumPayment,
    dueDay: input.dueDay ?? existing.dueDay,
    dueDate: input.dueDate ?? existing.dueDate,
    note: input.note ?? existing.note
  });
  const status = Number(next.remainingAmount) <= 0 ? 'paid' : 'active';
  const row = await db.get(`
    UPDATE debts
    SET name = $1, type = $2, principalAmount = $3, remainingAmount = $4,
        interestRate = $5, minimumPayment = $6, dueDay = $7, dueDate = $8,
        status = $9, note = $10, updatedAt = CURRENT_TIMESTAMP
    WHERE id = $11 AND userId = $12
    RETURNING *
  `, [
    next.name,
    next.type,
    next.principalAmount,
    next.remainingAmount,
    next.interestRate,
    next.minimumPayment,
    next.dueDay,
    next.dueDate,
    status,
    next.note,
    Number(id),
    userId
  ]);
  return normalizeDebt(row);
}

async function cancelDebt(userId, id) {
  const row = await db.get(`
    UPDATE debts
    SET status = 'cancelled', updatedAt = CURRENT_TIMESTAMP
    WHERE id = $1 AND userId = $2
    RETURNING *
  `, [Number(id), userId]);
  return normalizeDebt(row);
}

async function recordPayment(userId, id, input = {}) {
  const debt = await getDebt(userId, id);
  if (!debt || debt.status !== 'active') return null;
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) throwInputError('Payment amount must be greater than zero', 'invalid_amount');
  const paymentDate = input.paymentDate ? String(input.paymentDate).trim() : toDateOnly();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)) throwInputError('Payment date must use YYYY-MM-DD', 'invalid_date');
  const note = String(input.note || '').trim().slice(0, 500) || null;
  const paidAmount = Math.min(amount, debt.remainingAmount);
  const nextRemaining = Math.max(0, debt.remainingAmount - paidAmount);
  let transactionId = null;

  if (input.createTransaction) {
    const tx = await transactionService.createTransaction(userId, {
      type: debt.type === 'lent' ? 'income' : 'expense',
      amount: paidAmount,
      title: debt.type === 'lent' ? `รับคืนหนี้ ${debt.name}` : `จ่ายหนี้ ${debt.name}`,
      category: debt.type === 'lent' ? 'รับคืนหนี้' : 'ชำระหนี้',
      note,
      date: paymentDate,
      source: 'text'
    }, 'confirmed');
    transactionId = tx.id;
  }

  const payment = await db.get(`
    INSERT INTO debt_payments (debtId, userId, amount, paymentDate, note, transactionId)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *
  `, [debt.id, userId, paidAmount, paymentDate, note, transactionId]);

  const updatedDebt = await db.get(`
    UPDATE debts
    SET remainingAmount = $1,
        status = $2,
        updatedAt = CURRENT_TIMESTAMP
    WHERE id = $3 AND userId = $4
    RETURNING *
  `, [nextRemaining, nextRemaining <= 0 ? 'paid' : 'active', debt.id, userId]);

  return {
    debt: normalizeDebt(updatedDebt),
    payment: normalizePayment(payment),
    transactionId,
    capped: amount > paidAmount
  };
}

async function listPayments(userId, debtId = null, limit = 20) {
  const rows = await db.all(`
    SELECT *
    FROM debt_payments
    WHERE userId = $1
      AND ($2 = 0 OR debtId = $2)
    ORDER BY paymentDate DESC, id DESC
    LIMIT $3
  `, [userId, Number(debtId || 0), Number(limit || 20)]);
  return rows.map(normalizePayment);
}

function summarizeDebts(debts = []) {
  const active = debts.filter((debt) => debt.status === 'active');
  const payable = active.filter((debt) => debt.type !== 'lent');
  const receivable = active.filter((debt) => debt.type === 'lent');
  return {
    activeCount: active.length,
    payableTotal: payable.reduce((sum, debt) => sum + debt.remainingAmount, 0),
    receivableTotal: receivable.reduce((sum, debt) => sum + debt.remainingAmount, 0),
    dueSoonCount: active.filter((debt) => debt.computedStatus === 'due_soon').length,
    overdueCount: active.filter((debt) => debt.computedStatus === 'overdue').length
  };
}

module.exports = {
  createDebt,
  listDebts,
  getDebt,
  findDebtByName,
  updateDebt,
  cancelDebt,
  recordPayment,
  listPayments,
  summarizeDebts,
  normalizeDebt,
  formatDebtType
};
