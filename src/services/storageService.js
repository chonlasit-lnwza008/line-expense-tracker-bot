const fs = require('fs');
const path = require('path');

const storageRoot = path.resolve(process.env.IMAGE_STORAGE_PATH || './uploads');

function ensureStorage() {
  fs.mkdirSync(storageRoot, { recursive: true });
}

async function saveLineImageStream(stream, messageId) {
  ensureStorage();
  const filename = `${Date.now()}-${messageId}.jpg`;
  const filePath = path.join(storageRoot, filename);

  await new Promise((resolve, reject) => {
    const writer = fs.createWriteStream(filePath);
    stream.pipe(writer);
    stream.on('error', reject);
    writer.on('finish', resolve);
    writer.on('error', reject);
  });

  return filePath;
}

module.exports = {
  saveLineImageStream,
  ensureStorage,
  storageRoot
};
