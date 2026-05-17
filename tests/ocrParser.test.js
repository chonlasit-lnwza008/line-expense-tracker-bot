const test = require('node:test');
const assert = require('node:assert/strict');
const { parseOcrText, extractAmounts, extractDate, extractReference } = require('../src/parser/ocrParser');

test('extracts total amount with priority', () => {
  const text = ['ร้านข้าวดี', 'ข้าว 60.00', 'น้ำ 10.00', 'ยอดรวม 70.00 บาท'].join('\n');
  const amounts = extractAmounts(text);
  assert.equal(amounts[0].amount, 70);
});

test('parses Thai style date and Buddhist year', () => {
  assert.equal(extractDate('วันที่ 17/05/2569 เวลา 12:00'), '2026-05-17');
});

test('parses Thai abbreviated month date from slips', () => {
  assert.equal(extractDate('16 พ.ค. 69 13:32 น.'), '2026-05-16');
});

test('extracts reference number', () => {
  assert.equal(extractReference('เลขที่อ้างอิง ABCD123456'), 'ABCD123456');
});

test('parses OCR receipt and auto-selects one usable amount', () => {
  const text = ['ร้านกาแฟ', 'กาแฟ 45.00', 'ยอดรวม 45.00 บาท', 'วันที่ 17/05/2569'].join('\n');
  const result = parseOcrText(text);
  assert.equal(result.ok, true);
  assert.equal(result.type, 'expense');
  assert.equal(result.amount, 45);
  assert.equal(result.amountCandidates[0].amount, 45);
  assert.equal(result.date, '2026-05-17');
});

test('ignores slip reference numbers and prefers baht amount', () => {
  const text = [
    'ชำระเงินสำเร็จ',
    '16 พ.ค. 69 14:28 น.',
    'เลขที่รายการ: 016136142817AQRQ7165',
    'จำนวนเงิน',
    '77.00 บาท',
    'ค่าธรรมเนียม 0.00 บาท'
  ].join('\n');
  const result = parseOcrText(text);
  assert.equal(result.ok, true);
  assert.equal(result.amountCandidates[0].amount, 77);
  assert.equal(result.amountCandidates.some((item) => item.amount > 1000000), false);
});

test('uses stricter amount extraction for payment slips', () => {
  const text = [
    'ชำระเงินสำเร็จ',
    '16 พ.ค. 69 13:32 น.',
    'นาย สิทธิ์ ท',
    '202605161407041',
    'เลขที่รายการ: 016136133219AQR04063',
    'จำนวนเงิน',
    '110.00 บาท',
    'ค่าธรรมเนียม',
    '0.00 บาท'
  ].join('\n');
  const result = parseOcrText(text);
  assert.equal(result.source, 'slip');
  assert.equal(result.amount, 110);
  assert.deepEqual(result.amountCandidates.map((item) => item.amount), [110]);
});

test('uses nearby amount context when OCR splits amount label and value', () => {
  const text = [
    'ชำระเงินสำเร็จ',
    'จำนวนเงิน',
    '220.00',
    'บาท',
    'เลขที่รายการ: 016136133219AQR04063'
  ].join('\n');
  const result = parseOcrText(text);
  assert.equal(result.amount, 220);
  assert.deepEqual(result.amountCandidates.map((item) => item.amount), [220]);
});
