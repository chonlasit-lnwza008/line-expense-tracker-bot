const { detectCategory } = require('./categoryRules');
const { parseAmount } = require('../utils/moneyUtils');
const { toDateOnly } = require('../utils/dateUtils');

const totalKeywords = ['ยอดรวม', 'รวม', 'total', 'amount', 'จำนวนเงิน', 'ยอดเงิน', 'สุทธิ'];
const amountContextKeywords = ['บาท', '฿', 'ยอด', 'รวม', 'จำนวนเงิน', 'ยอดเงิน', 'สุทธิ', 'total', 'amount'];
const referenceKeywords = ['เลขที่รายการ', 'เลขอ้างอิง', 'อ้างอิง', 'reference', 'ref', 'transaction', 'บัญชี', 'account'];

function hasAmountContext(line) {
  const lower = line.toLowerCase();
  return amountContextKeywords.some((keyword) => lower.includes(keyword.toLowerCase()));
}

function isReferenceLine(line) {
  const lower = line.toLowerCase();
  return referenceKeywords.some((keyword) => lower.includes(keyword.toLowerCase())) && !hasAmountContext(line);
}

function isDateOrTimeLine(line) {
  return /\b\d{1,2}:\d{2}\b/.test(line)
    || /\b\d{1,2}\.\d{2}\s*น\.?/.test(line)
    || /\b\d{1,2}[/-]\d{1,2}[/-](?:\d{2}|20\d{2}|25\d{2})\b/.test(line)
    || /\b\d{1,2}\s*(ม\.ค\.|ก\.พ\.|มี\.ค\.|เม\.ย\.|พ\.ค\.|มิ\.ย\.|ก\.ค\.|ส\.ค\.|ก\.ย\.|ต\.ค\.|พ\.ย\.|ธ\.ค\.)\s*(25\d{2}|20\d{2}|\d{2})\b/.test(line);
}

function normalizeYear(yearText) {
  let year = Number(yearText);
  if (year > 2400) return year - 543;
  if (year < 100) return year >= 50 ? 1957 + year : 2000 + year;
  return year;
}

function shouldSkipAmountToken(token, line, amount, options = {}, contextLine = line) {
  const digitsOnly = token.replace(/\D/g, '');
  const hasDecimal = /\.\d{1,2}$/.test(token);
  const context = hasAmountContext(contextLine);

  if (!amount || amount < 1) return true;
  if (options.requireAmountContext && !context) return true;
  if (digitsOnly.length >= 7) return true;
  if (amount > 1000000) return true;
  if (isReferenceLine(line)) return true;
  if (isDateOrTimeLine(line)) return true;
  if (!context && !hasDecimal && amount >= 1000) return true;
  return false;
}

function extractAmounts(rawText = '', options = {}) {
  const amounts = [];
  const lines = rawText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const contextLine = [lines[index - 1], line, lines[index + 1]].filter(Boolean).join(' ');
    const matches = line.match(/\d[\d,]*(?:\.\d{1,2})?/g) || [];
    for (const match of matches) {
      const amount = parseAmount(match);
      if (!shouldSkipAmountToken(match, line, amount, options, contextLine)) {
        let score = 1;
        if (hasAmountContext(contextLine)) score += 1;
        if (totalKeywords.some((keyword) => contextLine.toLowerCase().includes(keyword.toLowerCase()))) score += 2;
        if (/\.\d{1,2}$/.test(match)) score += 0.5;
        amounts.push({ amount, line, score });
      }
    }
  }

  const unique = [];
  const seen = new Set();
  for (const item of amounts.sort((a, b) => b.score - a.score || b.amount - a.amount)) {
    const key = `${item.amount}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(item);
    }
  }

  return unique;
}

function extractDate(rawText = '') {
  const iso = rawText.match(/\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;

  const thai = rawText.match(/\b(\d{1,2})[-/](\d{1,2})[-/](25\d{2}|20\d{2}|\d{2})\b/);
  if (!thai) {
    const thaiMonth = rawText.match(/\b(\d{1,2})\s*(ม\.ค\.|ก\.พ\.|มี\.ค\.|เม\.ย\.|พ\.ค\.|มิ\.ย\.|ก\.ค\.|ส\.ค\.|ก\.ย\.|ต\.ค\.|พ\.ย\.|ธ\.ค\.)\s*(25\d{2}|20\d{2}|\d{2})\b/);
    if (!thaiMonth) return toDateOnly();

    const monthMap = {
      'ม.ค.': '01',
      'ก.พ.': '02',
      'มี.ค.': '03',
      'เม.ย.': '04',
      'พ.ค.': '05',
      'มิ.ย.': '06',
      'ก.ค.': '07',
      'ส.ค.': '08',
      'ก.ย.': '09',
      'ต.ค.': '10',
      'พ.ย.': '11',
      'ธ.ค.': '12'
    };
    const year = normalizeYear(thaiMonth[3]);
    return `${year}-${monthMap[thaiMonth[2]]}-${thaiMonth[1].padStart(2, '0')}`;
  }

  const year = normalizeYear(thai[3]);
  return `${year}-${thai[2].padStart(2, '0')}-${thai[1].padStart(2, '0')}`;
}

function extractReference(rawText = '') {
  const match = rawText.match(/(?:ref|reference|เลขที่|อ้างอิง|transaction)\s*[:#]?\s*([A-Z0-9-]{6,})/i);
  return match ? match[1] : null;
}

function extractMerchant(rawText = '') {
  const lines = rawText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const ignored = /ยอด|รวม|บาท|วันที่|เวลา|ref|เลข|ภาษี|tax|total|amount|จำนวนเงิน|ค่าธรรมเนียม|บัญชี|account|พร้อมเพย์|promptpay|qr payment|ธนาคาร|ธ\.|xxx|สำเร็จ/i;
  const shopKeywords = /ร้าน|ก๋วยเตี๋ยว|กาแฟ|คาเฟ่|ข้าว|อาหาร|ชานม|หมูกระทะ|ตลาด|market|coffee|cafe|restaurant|food|shop|store/i;

  const candidates = lines
    .filter((line) => {
      if (line.length < 2) return false;
      if (ignored.test(line)) return false;
      if (isDateOrTimeLine(line)) return false;
      if (/^\d[\d,]*(?:\.\d{1,2})?$/.test(line)) return false;
      if (/^[A-Z0-9-]{8,}$/i.test(line.replace(/\s/g, ''))) return false;
      return true;
    })
    .map((line, index) => {
      let score = 1;
      if (shopKeywords.test(line)) score += 10;
      if (/(นาย|นาง|น\.ส\.|mr\.|mrs\.|ms\.)/i.test(line)) score -= 2;
      if (index > 0) score += 1;
      return { line, score };
    })
    .sort((a, b) => b.score - a.score);

  return candidates[0]?.line || 'รายการจากรูปภาพ';
}

function detectOcrType(rawText = '') {
  const text = rawText.toLowerCase();
  if (/(รับเงิน|เงินเข้า|received|ได้เงิน)/i.test(text)) return 'income';
  if (/(โอนเงิน|transfer)/i.test(text)) return 'transfer';
  return 'expense';
}

function detectSource(rawText = '') {
  return /(สลิป|โอนเงิน|transfer|promptpay|พร้อมเพย์|ชำระเงินสำเร็จ|เลขที่รายการ|qr payment|ธนาคาร|บัญชี)/i.test(rawText)
    ? 'slip'
    : 'receipt_image';
}

function parseOcrText(rawText = '') {
  const source = detectSource(rawText);
  const amounts = extractAmounts(rawText, { requireAmountContext: source === 'slip' });
  const selectedAmount = amounts.length === 1 ? amounts[0].amount : null;
  const merchant = extractMerchant(rawText);
  const type = detectOcrType(rawText);

  return {
    ok: amounts.length > 0,
    type,
    amount: selectedAmount,
    amountCandidates: amounts.slice(0, 5),
    title: merchant,
    merchant,
    category: detectCategory(rawText, type),
    date: extractDate(rawText),
    reference: extractReference(rawText),
    source,
    rawText
  };
}

module.exports = {
  parseOcrText,
  extractAmounts,
  extractDate,
  extractReference,
  extractMerchant,
  detectSource
};
