require('dotenv').config();

const db = require('../config/database');
const { ensureDatabase } = require('../database/migrations');
const summaryService = require('../services/summaryService');
const lineService = require('../services/lineService');
const { formatMoney } = require('../utils/moneyUtils');
const { toDateOnly, formatDisplayDate } = require('../utils/dateUtils');

function buildReminderText(summary) {
  const date = formatDisplayDate(summary.date);
  if (!summary.rows.length) {
    return [
      `สรุปวันนี้ (${date})`,
      'วันนี้ยังไม่มีรายการที่บันทึกไว้',
      'ถ้ามีรายการลืมลง ลองพิมพ์เช่น "กาแฟ 45" หรือส่งสลิป/บิลเข้ามาได้เลย'
    ].join('\n');
  }

  const topExpense = summary.rows
    .filter((row) => row.type === 'expense')
    .sort((a, b) => b.amount - a.amount)[0];

  return [
    `สรุปวันนี้ (${date})`,
    `รายรับ: ${formatMoney(summary.income)} บาท`,
    `รายจ่าย: ${formatMoney(summary.expense)} บาท`,
    `สุทธิ: ${formatMoney(summary.net)} บาท`,
    topExpense ? `จ่ายสูงสุด: ${topExpense.title} ${formatMoney(topExpense.amount)} บาท` : 'วันนี้ยังไม่มีรายจ่าย',
    'ถ้าลืมรายการไหน พิมพ์เพิ่มได้เลยครับ'
  ].join('\n');
}

async function sendDailyReminders(date = toDateOnly()) {
  await ensureDatabase();
  const users = await db.all('SELECT id, lineUserId FROM users ORDER BY id ASC');
  let sent = 0;
  let failed = 0;

  for (const user of users) {
    try {
      const summary = await summaryService.dailySummary(user.id, date);
      await lineService.pushText(user.lineUserId, buildReminderText(summary));
      sent += 1;
    } catch (error) {
      failed += 1;
      console.error(`Failed to send reminder to user ${user.id}:`, error.message);
    }
  }

  return { date, users: users.length, sent, failed };
}

if (require.main === module) {
  sendDailyReminders(process.argv[2] || toDateOnly())
    .then((result) => {
      console.log(`Daily reminders done: ${JSON.stringify(result)}`);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { sendDailyReminders, buildReminderText };
