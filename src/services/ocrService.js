const { createWorker } = require('tesseract.js');

async function recognizeImage(imagePath) {
  const worker = await createWorker('tha+eng');
  try {
    const result = await worker.recognize(imagePath);
    return result.data.text || '';
  } finally {
    await worker.terminate();
  }
}

module.exports = {
  recognizeImage
};
