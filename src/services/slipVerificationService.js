const { detectCategory } = require('../parser/categoryRules');
const { toDateOnly } = require('../utils/dateUtils');

const DEFAULT_GHOSTX_URL = 'https://externalauth.ghostxapi.xyz/qr/scan';

function isEnabled() {
  return process.env.SLIP_VERIFY_PROVIDER !== 'off';
}

async function verifyQrData(qrData) {
  if (!isEnabled() || !qrData) return null;

  const url = process.env.GHOSTX_VERIFY_URL || DEFAULT_GHOSTX_URL;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ qrData })
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = body.message || body.error || `Slip verification returned ${response.status}`;
    throw new Error(message);
  }

  return normalizeGhostxSlip(body, qrData);
}

function normalizeGhostxSlip(body, qrData) {
  const transfer = body?.slipVerification?.transfer;
  const amount = Number(transfer?.amount?.amount);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const toName = transfer?.toAccountName || transfer?.toBankName;
  const fromName = transfer?.fromAccountName || transfer?.fromBankName;
  const date = normalizeTransactionDate(transfer?.transactionDateTime);
  const reference = transfer?.transactionRef || null;
  const title = toName || 'รายการจากสลิปโอนเงิน';
  const rawText = JSON.stringify(body, null, 2);

  return {
    ok: true,
    type: 'expense',
    amount,
    amountCandidates: [{ amount, line: 'verified slip qr', score: 10 }],
    title,
    merchant: title,
    category: detectCategory(`${title} ${fromName || ''}`, 'expense'),
    date,
    reference,
    source: 'slip',
    rawText,
    note: [
      'verified by GhostX QR',
      reference ? `ref: ${reference}` : null,
      fromName ? `from: ${fromName}` : null,
      toName ? `to: ${toName}` : null,
      `qrData: ${qrData.slice(0, 120)}`
    ].filter(Boolean).join('\n')
  };
}

function normalizeTransactionDate(value) {
  if (!value) return toDateOnly();
  const isoDate = String(value).match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (isoDate) return `${isoDate[1]}-${isoDate[2]}-${isoDate[3]}`;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return toDateOnly();
  return toDateOnly(date);
}

module.exports = {
  verifyQrData,
  normalizeGhostxSlip
};
