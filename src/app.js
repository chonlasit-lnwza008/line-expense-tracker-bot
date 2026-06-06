require('dotenv').config();

const express = require('express');
const webhookRouter = require('./routes/webhook');
const db = require('./config/database');
const { ensureDatabase } = require('./database/migrations');

const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.json({
    name: 'LINE Expense Tracker Bot',
    status: 'ok',
    webhook: '/webhook'
  });
});

app.get('/health/db', async (req, res, next) => {
  try {
    const expectedTables = ['users', 'transactions', 'budgets', 'goals'];
    const tables = db.client === 'postgres'
      ? await db.all(
        `SELECT table_name AS name
         FROM information_schema.tables
         WHERE table_schema = 'public'
           AND table_name = ANY($1::text[])
         ORDER BY table_name`,
        [expectedTables]
      )
      : await db.all(
        `SELECT name
         FROM sqlite_master
         WHERE type = 'table'
           AND name IN ('users', 'transactions', 'budgets', 'goals')
         ORDER BY name`
      );

    const tableNames = tables.map((table) => table.name);
    res.json({
      status: tableNames.length === expectedTables.length ? 'ok' : 'missing_tables',
      databaseClient: db.client,
      tables: tableNames,
      missingTables: expectedTables.filter((table) => !tableNames.includes(table))
    });
  } catch (error) {
    next(error);
  }
});

app.use('/webhook', webhookRouter);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

async function start() {
  await ensureDatabase();
  app.listen(port, () => {
    console.log(`LINE Expense Tracker Bot listening on port ${port}`);
  });
}

if (require.main === module) {
  start().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = app;
module.exports.start = start;
