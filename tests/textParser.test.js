const test = require('node:test');
const assert = require('node:assert/strict');
const { parseTextTransaction } = require('../src/parser/textParser');

test('parses simple Thai expense', () => {
  const result = parseTextTransaction('จ่าย ข้าว 60', { date: '2026-05-17' });
  assert.equal(result.ok, true);
  assert.equal(result.type, 'expense');
  assert.equal(result.amount, 60);
  assert.equal(result.title, 'ข้าว');
  assert.equal(result.category, 'อาหาร');
  assert.equal(result.date, '2026-05-17');
});

test('parses expense without explicit verb', () => {
  const result = parseTextTransaction('กาแฟ 45');
  assert.equal(result.ok, true);
  assert.equal(result.type, 'expense');
  assert.equal(result.amount, 45);
  assert.equal(result.category, 'อาหาร');
});

test('parses explicit category', () => {
  const result = parseTextTransaction('ซื้อของ 1200 หมวด ของใช้');
  assert.equal(result.ok, true);
  assert.equal(result.amount, 1200);
  assert.equal(result.category, 'ของใช้');
});

test('detects daily essentials category', () => {
  const result = parseTextTransaction('ทิชชู่ 89');
  assert.equal(result.ok, true);
  assert.equal(result.amount, 89);
  assert.equal(result.category, 'สิ่งใช้ประจำวัน');
});

test('allows dashboard custom daily essentials category', () => {
  const result = parseTextTransaction('น้ำยาซักผ้า 159 หมวด สิ่งใช้ประจำวัน');
  assert.equal(result.ok, true);
  assert.equal(result.amount, 159);
  assert.equal(result.category, 'สิ่งใช้ประจำวัน');
});

test('parses income', () => {
  const result = parseTextTransaction('รับ เงินเดือน 18000');
  assert.equal(result.ok, true);
  assert.equal(result.type, 'income');
  assert.equal(result.amount, 18000);
  assert.equal(result.category, 'รายรับ');
});

test('returns amount_not_found when no amount exists', () => {
  const result = parseTextTransaction('วันนี้กินข้าว');
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'amount_not_found');
});
