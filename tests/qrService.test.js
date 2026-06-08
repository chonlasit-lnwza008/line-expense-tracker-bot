const test = require('node:test');
const assert = require('node:assert/strict');
const { parseQrPaymentData } = require('../src/services/qrService');

test('extracts amount and merchant from Thai QR payment data', () => {
  const qrData = [
    '000201',
    '010212',
    '5303764',
    '5406289.00',
    '5802TH',
    '5907HOMEPRO',
    '62070503ABC',
    '6304ABCD'
  ].join('');

  const result = parseQrPaymentData(qrData);
  assert.equal(result.amount, 289);
  assert.equal(result.merchant, 'HOMEPRO');
  assert.equal(result.reference, 'ABC');
});

test('returns null when QR data has no useful payment fields', () => {
  assert.equal(parseQrPaymentData('not-a-tlv'), null);
});
