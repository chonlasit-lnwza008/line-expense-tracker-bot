const jsQR = require('jsqr');
const sharp = require('sharp');

async function extractQrData(imagePath) {
  const { data, info } = await sharp(imagePath)
    .rotate()
    .resize({ width: 1400, height: 1400, fit: 'inside', withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const code = jsQR(new Uint8ClampedArray(data), info.width, info.height, {
    inversionAttempts: 'attemptBoth'
  });

  return code?.data || null;
}

function parseEmvTlv(value = '') {
  const fields = {};
  let index = 0;

  while (index + 4 <= value.length) {
    const id = value.slice(index, index + 2);
    const length = Number(value.slice(index + 2, index + 4));
    if (!/^\d{2}$/.test(id) || !Number.isInteger(length) || length < 0) break;

    const start = index + 4;
    const end = start + length;
    if (end > value.length) break;

    fields[id] = value.slice(start, end);
    index = end;
  }

  return fields;
}

function parseQrPaymentData(qrData = '') {
  if (!qrData || typeof qrData !== 'string') return null;

  const fields = parseEmvTlv(qrData.trim());
  const amount = fields['54'] ? Number(fields['54'].replace(/,/g, '')) : null;
  const merchant = fields['59'] ? fields['59'].trim() : null;
  const reference = fields['62'] ? parseEmvTlv(fields['62'])['05'] || null : null;

  if (!Number.isFinite(amount) || amount <= 0) {
    return merchant || reference ? { amount: null, merchant, reference, raw: qrData } : null;
  }

  return {
    amount,
    merchant,
    reference,
    raw: qrData
  };
}

module.exports = {
  extractQrData,
  parseQrPaymentData
};
