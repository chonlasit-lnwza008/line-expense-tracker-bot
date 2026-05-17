const { lineClient, blobClient } = require('../config/line');

async function replyText(replyToken, text) {
  return lineClient.replyMessage({
    replyToken,
    messages: [{ type: 'text', text: String(text).slice(0, 4900) }]
  });
}

async function getMessageContent(messageId) {
  return blobClient.getMessageContent(messageId);
}

module.exports = {
  replyText,
  getMessageContent
};
