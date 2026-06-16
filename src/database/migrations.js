const fs = require('fs');
const path = require('path');
const db = require('../config/database');

async function ensureDatabase() {
  const schemaFile = db.client === 'postgres' ? 'schema.postgres.sql' : 'schema.sql';
  const schemaPath = path.join(__dirname, schemaFile);
  const schema = fs.readFileSync(schemaPath, 'utf8');
  await db.exec(schema);
  await migrateFlexibleDebtTypes();
}

async function migrateFlexibleDebtTypes() {
  if (db.client === 'postgres') {
    await db.exec('ALTER TABLE debts DROP CONSTRAINT IF EXISTS debts_type_check;');
    return;
  }

  const table = await db.get("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'debts'");
  if (!table || !/CHECK\s*\(\s*type\s+IN/i.test(table.sql || '')) return;

  await db.exec(`
    PRAGMA foreign_keys = OFF;
    CREATE TABLE IF NOT EXISTS debts_next (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      principalAmount REAL NOT NULL,
      remainingAmount REAL NOT NULL,
      interestRate REAL DEFAULT 0,
      minimumPayment REAL,
      dueDay INTEGER,
      dueDate TEXT,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paid', 'cancelled')),
      note TEXT,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (userId) REFERENCES users(id)
    );
    INSERT INTO debts_next (
      id, userId, name, type, principalAmount, remainingAmount, interestRate,
      minimumPayment, dueDay, dueDate, status, note, createdAt, updatedAt
    )
    SELECT
      id, userId, name, type, principalAmount, remainingAmount, interestRate,
      minimumPayment, dueDay, dueDate, status, note, createdAt, updatedAt
    FROM debts;
    DROP TABLE debts;
    ALTER TABLE debts_next RENAME TO debts;
    CREATE INDEX IF NOT EXISTS idx_debts_user_status ON debts(userId, status);
    PRAGMA foreign_keys = ON;
  `);
}

if (require.main === module) {
  ensureDatabase()
    .then(() => console.log('Database migrated successfully'))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { ensureDatabase };
