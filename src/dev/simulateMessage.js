require('dotenv').config();

const { ensureDatabase } = require('../database/migrations');
const transactionService = require('../services/transactionService');
const { handleText } = require('../routes/webhook');

async function main() {
  const text = process.argv.slice(2).join(' ').trim();
  if (!text) {
    console.log('Usage: node src/dev/simulateMessage.js "กาแฟ 45"');
    process.exitCode = 1;
    return;
  }

  ensureDatabase();
  const user = transactionService.findOrCreateUser('local-dev-user', 'Local Dev');
  const reply = await handleText(user, text);
  console.log(reply);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
