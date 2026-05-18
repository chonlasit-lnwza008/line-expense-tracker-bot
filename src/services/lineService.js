const { lineClient, blobClient } = require('../config/line');

async function replyText(replyToken, text) {
  return replyMessages(replyToken, [{ type: 'text', text: String(text).slice(0, 4900) }]);
}

async function pushText(to, text) {
  return pushMessages(to, [{ type: 'text', text: String(text).slice(0, 4900) }]);
}

async function replyMessages(replyToken, messages) {
  return lineClient.replyMessage({
    replyToken,
    messages: Array.isArray(messages) ? messages : [messages]
  });
}

async function pushMessages(to, messages) {
  return lineClient.pushMessage({
    to,
    messages: Array.isArray(messages) ? messages : [messages]
  });
}

async function getMessageContent(messageId) {
  return blobClient.getMessageContent(messageId);
}

module.exports = {
  replyText,
  pushText,
  replyMessages,
  pushMessages,
  getMessageContent
};
