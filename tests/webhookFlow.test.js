const os = require('os');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

process.env.DB_CLIENT = 'sqlite';
process.env.DATABASE_PATH = path.join(
  os.tmpdir(),
  `line-expense-webhook-flow-${Date.now()}-${Math.random().toString(16).slice(2)}.db`
);

const db = require('../src/config/database');
const { ensureDatabase } = require('../src/database/migrations');
const transactionService = require('../src/services/transactionService');
const webhook = require('../src/routes/webhook');

async function createUser(suffix) {
  await ensureDatabase();
  return transactionService.findOrCreateUser(`webhook-flow-${suffix}-${Date.now()}-${Math.random()}`);
}

test('delete latest can be confirmed with text confirmation', async () => {
  const user = await createUser('delete');

  await webhook.handleText(user, 'กาแฟ 45');
  const deletePrompt = await webhook.handleText(user, 'ลบล่าสุด');
  assert.equal(deletePrompt.type, 'flex');
  assert.equal(deletePrompt.altText, 'ยืนยันการลบรายการล่าสุด');

  const confirmed = await webhook.handleText(user, 'ยืนยัน');
  assert.equal(confirmed.type, 'flex');
  assert.equal(confirmed.altText, 'ลบรายการแล้ว');

  const rows = await transactionService.listRecentTransactions(user.id, 10);
  assert.equal(rows.length, 0);
});

test('new transaction text cancels stale pending duplicate instead of editing it', async () => {
  const user = await createUser('pending');

  await webhook.handleText(user, 'กาแฟ 40');
  const duplicatePrompt = await webhook.handleText(user, 'กาแฟ 40');
  assert.equal(duplicatePrompt.type, 'flex');
  assert.equal(duplicatePrompt.altText, 'ตรวจสอบรายการก่อนบันทึก');

  const newItem = await webhook.handleText(user, 'น้ำ 15');
  assert.equal(newItem.type, 'flex');
  assert.equal(newItem.altText, 'บันทึกแล้ว');

  const rows = await db.all('SELECT * FROM transactions WHERE userId = $1 ORDER BY id ASC', [user.id]);
  assert.deepEqual(rows.map((row) => ({
    title: row.title,
    amount: Number(row.amount),
    status: row.status
  })), [
    { title: 'กาแฟ', amount: 40, status: 'confirmed' },
    { title: 'กาแฟ', amount: 40, status: 'cancelled' },
    { title: 'น้ำ', amount: 15, status: 'confirmed' }
  ]);
});
