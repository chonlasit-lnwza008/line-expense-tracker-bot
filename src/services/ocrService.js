const { createWorker } = require('tesseract.js');
const fs = require('fs/promises');

function shouldUseGoogleVision() {
  return process.env.OCR_PROVIDER !== 'tesseract' && Boolean(process.env.GOOGLE_VISION_API_KEY);
}

async function recognizeWithGoogleVision(imagePath) {
  const image = await fs.readFile(imagePath);
  const response = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${process.env.GOOGLE_VISION_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requests: [
        {
          image: { content: image.toString('base64') },
          features: [{ type: 'TEXT_DETECTION' }],
          imageContext: { languageHints: ['th', 'en'] }
        }
      ]
    })
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = body.error?.message || `Google Vision returned ${response.status}`;
    throw new Error(message);
  }

  const result = body.responses?.[0];
  if (result?.error) throw new Error(result.error.message || 'Google Vision OCR failed');

  return result?.fullTextAnnotation?.text || result?.textAnnotations?.[0]?.description || '';
}

async function recognizeWithTesseract(imagePath) {
  const worker = await createWorker('tha+eng');
  try {
    const result = await worker.recognize(imagePath);
    return result.data.text || '';
  } finally {
    await worker.terminate();
  }
}

async function recognizeImage(imagePath) {
  if (shouldUseGoogleVision()) {
    try {
      return await recognizeWithGoogleVision(imagePath);
    } catch (error) {
      console.error('Google Vision OCR failed, falling back to Tesseract:', error.message);
    }
  }

  return recognizeWithTesseract(imagePath);
}

module.exports = {
  recognizeImage,
  recognizeWithGoogleVision,
  recognizeWithTesseract
};
