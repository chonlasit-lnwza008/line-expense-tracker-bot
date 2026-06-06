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

module.exports = {
  extractQrData
};
