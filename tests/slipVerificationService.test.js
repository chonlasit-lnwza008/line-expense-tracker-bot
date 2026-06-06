const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeGhostxSlip } = require('../src/services/slipVerificationService');

test('normalizes GhostX slip verification response into a pending transaction shape', () => {
  const result = normalizeGhostxSlip({
    type: 'SLIP',
    slipVerification: {
      transfer: {
        transactionRef: '202504270001234567',
        transactionDateTime: '2025-04-27T10:30:00+07:00',
        fromBankName: 'SCB',
        fromAccountName: 'นาย ตัวอย่าง ทดสอบ',
        toBankName: 'KTB',
        toAccountName: 'ร้านกาแฟทดสอบ',
        amount: {
          amount: 500,
          currency: { code: 'THB', symbol: '฿' }
        }
      }
    }
  }, '004600000000010103');

  assert.equal(result.ok, true);
  assert.equal(result.source, 'slip');
  assert.equal(result.type, 'expense');
  assert.equal(result.amount, 500);
  assert.equal(result.title, 'ร้านกาแฟทดสอบ');
  assert.equal(result.date, '2025-04-27');
  assert.equal(result.reference, '202504270001234567');
  assert.match(result.note, /verified by GhostX QR/);
});
