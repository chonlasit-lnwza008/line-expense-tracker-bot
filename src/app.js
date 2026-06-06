require('dotenv').config();

const express = require('express');
const webhookRouter = require('./routes/webhook');
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
