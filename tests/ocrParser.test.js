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

test('prefers merchant over successful payment header on slips', () => {
  const text = [
    'ชำระเงินสำเร็จ',
    '18 พ.ค. 69 13:01 น.',
    'นาย ชลสิทธิ์ ท',
    'ธ.กสิกรไทย',
    'xxx-x-x9142-x',
    'พาร์ค ก๋วยเตี๋ยวเรือ',
    'น.ส. เพชรินทร์',
    '202605181486343',
    'เลขที่รายการ: 016138130159BQR00175',
    'จำนวนเงิน',
    '80.00 บาท',
    'ค่าธรรมเนียม 0.00 บาท'
  ].join('\n');
  const result = parseOcrText(text);
  assert.equal(result.amount, 80);
  assert.equal(result.title, 'พาร์ค ก๋วยเตี๋ยวเรือ');
});

test('accepts noisy slip amount when baht is misread', () => {
  const text = [
    'โอนเงินสำเร็จ',
    '18 พ.ค. 69 19:45 น.',
    'Prompt Pay รหัสพร้อมเพย์',
    'เลขที่รายการ: 016138194554BPP07660',
    'จำนวน:',
    '1,400.00 บท',
    'ค่าธรรมเนียม:',
    '0.00 บาท'
  ].join('\n');
  const result = parseOcrText(text);
  assert.equal(result.source, 'slip');
  assert.equal(result.amount, 1400);
  assert.deepEqual(result.amountCandidates.map((item) => item.amount), [1400]);
});

test('parses KBank bill payment slips and avoids bill references as amounts', () => {
  const text = [
    'จ่ายบิลสำเร็จ',
    '7 มิ.ย. 69 19:08 น.',
    'นาย ชลสิทธิ์ ท',
    'ธ.กสิกรไทย',
    'xxx-x-x9142-x',
    'HOMEPRO',
    '000002201363215',
    '47058140ZOX6NL000000',
    'เลขที่รายการ:',
    '016158190829APM01326',
    'จำนวน:',
    '289.00 บาท',
    'ค่าธรรมเนียม:',
    '0.00 บาท'
  ].join('\n');

  const result = parseOcrText(text);
  assert.equal(result.source, 'slip');
  assert.equal(result.amount, 289);
  assert.deepEqual(result.amountCandidates.map((item) => item.amount), [289]);
  assert.equal(result.date, '2026-06-07');
  assert.equal(result.title, 'HOMEPRO');
  assert.equal(result.reference, '016158190829APM01326');
  assert.equal(result.category, 'ของใช้');
});

test('keeps Boonterm payment slips as expenses even when OCR contains receive wording', () => {
  const text = [
    'ชำระเงินสำเร็จ',
    '7 มิ.ย. 69 20:10 น.',
    'บุญเติม',
    'ตู้รับเงิน',
    'รับเงินจากลูกค้า',
    'เลขที่รายการ: 016158201000ABC12345',
    'จำนวนเงิน',
    '100.00 บาท',
    'ค่าธรรมเนียม 0.00 บาท'
  ].join('\n');

  const result = parseOcrText(text);
  assert.equal(result.source, 'slip');
  assert.equal(result.type, 'expense');
  assert.equal(result.title, 'บุญเติม');
  assert.equal(result.amount, 100);
  assert.equal(result.category, 'บิลประจำ');
});

test('keeps Tao Bin payment slips as expenses even when OCR contains receive wording', () => {
  const text = [
    'ชำระเงินสำเร็จ',
    '7 มิ.ย. 69 20:15 น.',
    'TAO BIN เต่าบิน',
    'เครื่องรับเงินอัตโนมัติ',
    'รับเงิน',
    'เลขที่รายการ: 016158201500ABC12345',
    'จำนวนเงิน',
    '45.00 บาท',
    'ค่าธรรมเนียม 0.00 บาท'
  ].join('\n');

  const result = parseOcrText(text);
  assert.equal(result.source, 'slip');
  assert.equal(result.type, 'expense');
  assert.equal(result.title, 'เต่าบิน');
  assert.equal(result.amount, 45);
  assert.equal(result.category, 'เครื่องดื่ม');
});

test('parses noisy bill payment merchant and ignores bill customer numbers', () => {
  const text = [
    'จ่ายบิลสำเร็จ',
    '7 มิ.ย. 69 19:08 น.',
    'นาย ชลสิทธิ์ ท',
    'ธ.กสิกรไทย',
    'xxx-x-x9142-x',
    'HOME PRO',
    '000002201363215',
    '47058140ZOX6NL000000',
    'เลขที่รายการ:',
    '016158190829APM01326',
    'จำนวน:',
    '289.00',
    'บาท',
    'ค่าธรรมเนียม:',
    '0.00 บาท'
  ].join('\n');

  const result = parseOcrText(text);
  assert.equal(result.source, 'slip');
  assert.equal(result.type, 'expense');
  assert.equal(result.title, 'HOMEPRO');
  assert.equal(result.amount, 289);
  assert.deepEqual(result.amountCandidates.map((item) => item.amount), [289]);
  assert.equal(result.reference, '016158190829APM01326');
});

test('rejects suspicious tiny bill amount from customer/reference numbers', () => {
  const text = [
    'จ่ายบิลสำเร็จ',
    '7 มิ.ย. 69 19:08 น.',
    'HOMEPRO',
    '000002201363215',
    '47058140ZOX6NL000000',
    'เลขที่รายการ:',
    '016158190829APM01326',
    'จำนวน:',
    '2 บาท',
    'ค่าธรรมเนียม:',
    '0.00 บาท'
  ].join('\n');

  const result = parseOcrText(text);
  assert.equal(result.ok, false);
  assert.equal(result.amount, null);
  assert.deepEqual(result.amountCandidates, []);
  assert.equal(result.title, 'HOMEPRO');
});
