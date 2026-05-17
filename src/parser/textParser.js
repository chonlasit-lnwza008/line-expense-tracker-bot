const { detectCategory } = require('./categoryRules');
const { parseAmount } = require('../utils/moneyUtils');
const { toDateOnly } = require('../utils/dateUtils');

const incomeWords = ['รับ', 'รายรับ', 'ได้เงิน', 'เงินเดือน', 'ขายของ', 'โบนัส'];
const expenseWords = ['จ่าย', 'ซื้อ', 'ซื้อของ', 'ค่า', 'โอนจ่าย'];
const transferWords = ['โอน', 'ย้ายเงิน', 'transfer'];

function detectType(text) {
  const lower = text.toLowerCase();
  if (incomeWords.some((word) => lower.includes(word))) return 'income';
  if (transferWords.some((word) => lower.includes(word))) return 'transfer';
  if (expenseWords.some((word) => lower.includes(word))) return 'expense';
  return 'expense';
}

function extractCategory(text) {
  const match = text.match(/(?:หมวด|category)\s*([^\d,]+)/i);
  return match ? match[1].trim() : null;
}

function cleanTitle(text, amount, explicitCategory) {
  let title = text
    .replace(/(?:หมวด|category)\s*[^\d,]+/i, '')
    .replace(/\d[\d,]*(?:\.\d{1,2})?/, '')
    .replace(/^(จ่าย|รับ|รายรับ|ได้เงิน|ซื้อ|โอนจ่าย|โอน)\s*/i, '')
    .trim();

  if (explicitCategory) {
    title = title.replace(explicitCategory, '').trim();
  }

  return title || 'ไม่ระบุรายการ';
}

function parseTextTransaction(text, options = {}) {
  const amount = parseAmount(text);
  if (!amount) {
    return {
      ok: false,
      reason: 'amount_not_found',
      rawText: text
    };
  }

  const type = detectType(text);
  const explicitCategory = extractCategory(text);
  const title = cleanTitle(text, amount, explicitCategory);
  const category = explicitCategory || detectCategory(`${title} ${text}`, type);

  return {
    ok: true,
    type,
    amount,
    title,
    category,
    note: null,
    date: options.date || toDateOnly(),
    source: 'text',
    rawText: text
  };
}

module.exports = {
  parseTextTransaction,
  detectType,
  extractCategory
};
