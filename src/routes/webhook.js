const express = require('express');
const { line, lineConfig } = require('../config/line');
const lineService = require('../services/lineService');
const storageService = require('../services/storageService');
const ocrService = require('../services/ocrService');
const transactionService = require('../services/transactionService');
const summaryService = require('../services/summaryService');
const budgetService = require('../services/budgetService');
const exportService = require('../services/exportService');
const { parseTextTransaction } = require('../parser/textParser');
const { parseOcrText } = require('../parser/ocrParser');
const { parseAmount, formatMoney } = require('../utils/moneyUtils');

const router = express.Router();
const hasLineCredentials = Boolean(lineConfig.channelAccessToken && lineConfig.channelSecret);
const lineMiddleware = hasLineCredentials ? line.middleware(lineConfig) : express.json();

router.post('/', lineMiddleware, async (req, res, next) => {
  try {
    if (!hasLineCredentials) {
      return res.status(503).json({
        error: 'LINE credentials are not configured',
        requiredEnv: ['LINE_CHANNEL_ACCESS_TOKEN', 'LINE_CHANNEL_SECRET']
      });
    }
    for (const event of req.body.events) {
      await handleEvent(event);
    }
    res.status(200).end();
  } catch (error) {
    next(error);
  }
});

async function handleEvent(event) {
  const lineUserId = event.source && event.source.userId;
  if (!lineUserId) return;
  const user = transactionService.findOrCreateUser(lineUserId);

  if (event.type === 'postback') {
    const reply = handlePostback(user, event.postback && event.postback.data);
    return replyToLine(event.replyToken, reply);
  }

  if (event.type !== 'message') return;

  if (event.message.type === 'text') {
    const reply = await handleText(user, event.message.text);
    return replyToLine(event.replyToken, reply);
  }

  if (event.message.type === 'image') {
    processImageAndPush(user, event.message.id).catch((error) => {
      console.error('Image OCR failed:', error);
      return pushToLine(
        user.lineUserId,
        buildErrorFlex('อ่านรูปไม่สำเร็จ', 'ลองส่งรูปที่ชัดขึ้น หรือพิมพ์ยอดเอง เช่น "กาแฟ 45"')
      ).catch((pushError) => console.error('Failed to push OCR error:', pushError));
    });
    return replyToLine(event.replyToken, buildProcessingFlex());
  }

  return replyToLine(event.replyToken, 'ตอนนี้รองรับข้อความและรูปภาพเท่านั้นครับ');
}

function normalizeLineMessage(reply) {
  if (typeof reply === 'string') return { type: 'text', text: String(reply).slice(0, 4900) };
  return reply;
}

function replyToLine(replyToken, reply) {
  return lineService.replyMessages(replyToken, normalizeLineMessage(reply));
}

function pushToLine(to, reply) {
  return lineService.pushMessages(to, normalizeLineMessage(reply));
}

async function handleText(user, text) {
  const trimmed = text.trim();
  const pending = transactionService.getLatestPending(user.id);
  const isConfirm = /^(ยืนยัน|บันทึก|ตกลง|โอเค|ok|confirm|yes|ใช่)$/i.test(trimmed);
  const isCancel = /^(ยกเลิก|cancel|no|ไม่|ไม่เอา)$/i.test(trimmed);

  if (/^(help|วิธีใช้)$/i.test(trimmed)) return buildHelpFlex();
  if (isCancel && pending) {
    transactionService.cancelTransaction(user.id, pending.id);
    return buildResultFlex('ยกเลิกแล้ว', [
      ['สถานะ', 'รายการนี้ไม่ถูกบันทึก']
    ], '#6b7280');
  }
  if (isConfirm && pending) {
    const deleted = transactionService.confirmDeleteLatest(user.id);
    if (deleted) {
      return buildResultFlex('ลบรายการแล้ว', [
        ['รายการ', deleted.title],
        ['ยอด', `${formatMoney(deleted.amount)} บาท`]
      ], '#dc2626');
    }
    const confirmed = transactionService.confirmTransaction(user.id, pending.id);
    const alerts = budgetService.getBudgetAlerts(user.id, confirmed.category);
    return buildSavedFlex(confirmed, alerts);
  }

  if (/^ลบล่าสุด$/.test(trimmed)) {
    const request = transactionService.requestDeleteLatest(user.id);
    if (!request) return buildErrorFlex('ยังไม่มีรายการให้ลบ', 'บันทึกรายการก่อน แล้วค่อยใช้คำสั่งลบล่าสุด');
    const targetId = Number(String(request.title).split(':')[1]);
    const target = transactionService.getTransaction(targetId) || request;
    return buildDeleteConfirmFlex(target);
  }

  const editReply = handleEdit(user, trimmed, pending ? 'pending' : 'confirmed');
  if (editReply) return editReply;

  const candidateReply = handlePendingCandidateSelection(user, pending, trimmed);
  if (candidateReply) return candidateReply;

  if (/^(สรุป|สรุปยอด|สรุปวันนี้)$/.test(trimmed)) {
    return buildDailySummaryFlex(summaryService.dailySummary(user.id));
  }
  if (/^สรุปเดือนนี้$/.test(trimmed)) {
    return buildMonthlySummaryFlex(summaryService.monthlySummary(user.id));
  }
  if (/^export\s*เดือนนี้$/i.test(trimmed)) return exportService.exportTransactions(user.id, 'month');
  if (/^export\s*ทั้งหมด$/i.test(trimmed)) return exportService.exportTransactions(user.id, 'all');

  const budgetReply = handleBudget(user, trimmed);
  if (budgetReply) return budgetReply;

  const goalReply = handleGoal(user, trimmed);
  if (goalReply) return goalReply;

  if (pending && parseAmount(trimmed)) {
    const updated = transactionService.updateLatest(user.id, { amount: parseAmount(trimmed) }, 'pending');
    return buildPendingFlex(updated, { heading: 'แก้ยอดแล้ว ตรวจสอบอีกครั้ง' });
  }

  const parsed = parseTextTransaction(trimmed);
  if (!parsed.ok) return buildErrorFlex('ยังอ่านยอดเงินไม่ได้', 'ลองพิมพ์เช่น "กาแฟ 45" หรือส่งรูปบิล/สลิปได้เลย');

  const duplicate = transactionService.findDuplicate(user.id, parsed);
  const status = duplicate ? 'pending' : 'confirmed';
  const tx = transactionService.createTransaction(user.id, parsed, status);
  if (duplicate) {
    return buildPendingFlex(tx, { heading: 'รายการนี้อาจซ้ำ' });
  }

  const alerts = budgetService.getBudgetAlerts(user.id, tx.category);
  return buildSavedFlex(tx, alerts);
}

function handlePostback(user, data = '') {
  const params = new URLSearchParams(data);
  const action = params.get('action');
  const pending = transactionService.getLatestPending(user.id);

  if (!pending) {
    return buildErrorFlex('ไม่มีรายการรอตรวจสอบ', 'ส่งสลิปใหม่ หรือพิมพ์รายการ เช่น "กาแฟ 45" ได้เลย');
  }

  if (action === 'confirm') {
    const deleted = transactionService.confirmDeleteLatest(user.id);
    if (deleted) {
      return buildResultFlex('ลบรายการแล้ว', [
        ['รายการ', deleted.title],
        ['ยอด', `${formatMoney(deleted.amount)} บาท`]
      ], '#dc2626');
    }

    const confirmed = transactionService.confirmTransaction(user.id, pending.id);
    const alerts = budgetService.getBudgetAlerts(user.id, confirmed.category);
    return buildResultFlex('บันทึกแล้ว', [
      ['รายการ', confirmed.title],
      ['ยอด', `${formatMoney(confirmed.amount)} บาท`],
      ['หมวด', confirmed.category],
      ['วันที่', confirmed.transactionDate],
      ...alerts.map((alert) => ['แจ้งเตือน', alert])
    ]);
  }

  if (action === 'cancel') {
    transactionService.cancelTransaction(user.id, pending.id);
    return buildResultFlex('ยกเลิกแล้ว', [
      ['สถานะ', 'รายการนี้ไม่ถูกบันทึก']
    ], '#6b7280');
  }

  if (action === 'select_amount') {
    const candidates = parsePendingAmountCandidates(pending);
    const selected = candidates[Number(params.get('index')) - 1];
    if (!selected) return buildErrorFlex('เลือกยอดไม่ได้', 'ลองพิมพ์ยอดที่ถูกต้องเอง เช่น "80"');

    const updated = transactionService.updateLatest(user.id, { amount: selected }, 'pending');
    return buildPendingFlex(updated, { heading: 'เลือกยอดแล้ว ตรวจสอบอีกครั้ง' });
  }

  return buildErrorFlex('คำสั่งไม่ถูกต้อง', 'ลองส่งรายการใหม่ หรือพิมพ์ help เพื่อดูคำสั่ง');
}

function handlePendingCandidateSelection(user, pending, text) {
  if (!pending) return null;
  const candidates = parsePendingAmountCandidates(pending);
  if (!candidates.length) return null;

  const match = text.match(/^(?:เลือก(?:ข้อ)?\s*)?([1-9]\d*)$/);
  if (!match) return null;

  const selected = candidates[Number(match[1]) - 1];
  if (!selected) return `มีตัวเลือก 1-${candidates.length} เท่านั้นครับ หรือพิมพ์ยอดเงินที่ถูกต้องได้เลย`;

  const updated = transactionService.updateLatest(user.id, { amount: selected }, 'pending');
  return formatPending(updated, `เลือกยอดข้อ ${match[1]} แล้ว ตรวจสอบอีกครั้ง แล้วตอบ "ยืนยัน" เพื่อบันทึก`);
}

function parsePendingAmountCandidates(pending) {
  const match = String(pending.note || '').match(/amount candidates:\s*([0-9.,\s]+)/i);
  if (!match) return [];
  return match[1]
    .split(',')
    .map((item) => parseAmount(item))
    .filter((amount) => amount && amount > 0);
}

async function handleImage(user, messageId) {
  const stream = await lineService.getMessageContent(messageId);
  const imagePath = await storageService.saveLineImageStream(stream, messageId);
  const rawText = await ocrService.recognizeImage(imagePath);

  if (!rawText.trim()) {
    return buildErrorFlex('OCR อ่านรูปไม่ออก', 'กรุณาพิมพ์ยอดเอง เช่น "ข้าว 60"');
  }

  const parsed = parseOcrText(rawText);
  if (!parsed.ok) {
    return buildErrorFlex('ยังหาเงินจากสลิปไม่ได้', 'OCR อ่านข้อความได้ แต่ยังไม่เจอยอดที่มั่นใจ กรุณาพิมพ์ยอดเอง เช่น "กาแฟ 45"');
  }

  if (!parsed.amount && parsed.amountCandidates.length > 1) {
    const tx = transactionService.createTransaction(user.id, {
      ...parsed,
      amount: parsed.amountCandidates[0].amount,
      note: `amount candidates: ${parsed.amountCandidates.map((item) => item.amount).join(', ')}`,
      imagePath
    }, 'pending');
    return buildPendingFlex(tx, {
      heading: 'พบหลายยอดจากสลิป',
      candidates: parsed.amountCandidates
    });
  }

  const tx = transactionService.createTransaction(user.id, { ...parsed, imagePath }, 'pending');
  return buildPendingFlex(tx, { heading: 'ตรวจสอบก่อนบันทึก' });
}

async function processImageAndPush(user, messageId) {
  const reply = await handleImage(user, messageId);
  await pushToLine(user.lineUserId, reply);
}

function handleEdit(user, text, status) {
  const amountMatch = text.match(/^แก้ล่าสุด\s+(\d[\d,]*(?:\.\d{1,2})?)$/);
  if (amountMatch) {
    const tx = transactionService.updateLatest(user.id, { amount: parseAmount(amountMatch[1]) }, status);
    return tx ? `แก้ยอดแล้ว: ${tx.title} ${formatMoney(tx.amount)} บาท` : 'ยังไม่มีรายการให้แก้';
  }

  const categoryMatch = text.match(/^แก้หมวดล่าสุด\s+(.+)$/);
  if (categoryMatch) {
    const tx = transactionService.updateLatest(user.id, { category: categoryMatch[1].trim() }, status);
    return tx ? `แก้หมวดแล้ว: ${tx.title} (${tx.category})` : 'ยังไม่มีรายการให้แก้';
  }

  const titleMatch = text.match(/^แก้ชื่อรายการล่าสุด\s+(.+)$/);
  if (titleMatch) {
    const tx = transactionService.updateLatest(user.id, { title: titleMatch[1].trim() }, status);
    return tx ? `แก้ชื่อแล้ว: ${tx.title}` : 'ยังไม่มีรายการให้แก้';
  }

  return null;
}

function handleBudget(user, text) {
  const total = text.match(/^ตั้งงบ\s+(\d[\d,]*(?:\.\d{1,2})?)$/);
  if (total) {
    const budget = budgetService.setBudget(user.id, 'ทั้งหมด', parseAmount(total[1]));
    return buildResultFlex('ตั้งงบแล้ว', [
      ['หมวด', budget.category],
      ['งบเดือนนี้', `${formatMoney(budget.amount)} บาท`]
    ], '#2563eb');
  }

  const category = text.match(/^งบ(.+?)\s+(\d[\d,]*(?:\.\d{1,2})?)$/);
  if (category) {
    const budget = budgetService.setBudget(user.id, category[1].trim(), parseAmount(category[2]));
    return buildResultFlex('ตั้งงบแล้ว', [
      ['หมวด', budget.category],
      ['งบเดือนนี้', `${formatMoney(budget.amount)} บาท`]
    ], '#2563eb');
  }

  return null;
}

function handleGoal(user, text) {
  const match = text.match(/^ตั้งเป้า\s+(.+?)\s+(\d[\d,]*(?:\.\d{1,2})?)\s+ใน\s+(\d+)\s+เดือน$/);
  if (!match) return null;
  const goal = budgetService.createGoal(user.id, match[1].trim(), parseAmount(match[2]), Number(match[3]));
  return buildResultFlex('ตั้งเป้าแล้ว', [
    ['เป้าหมาย', goal.name],
    ['ยอดรวม', `${formatMoney(goal.targetAmount)} บาท`],
    ['ระยะเวลา', `${goal.months} เดือน`],
    ['ต้องเก็บเดือนละ', `${formatMoney(goal.monthlySaving)} บาท`]
  ], '#7c3aed');
}

function flexMessage(altText, contents) {
  return { type: 'flex', altText, contents };
}

function buildProcessingFlex() {
  return flexMessage('กำลังอ่านสลิปด้วย OCR', {
    type: 'bubble',
    size: 'mega',
    header: flexHeader('กำลังอ่านสลิป', 'OCR ฟรีอาจใช้เวลาสักครู่', '#0f766e'),
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'md',
      contents: [
        flexText('รับรูปแล้วครับ', { weight: 'bold', size: 'xl' }),
        flexText('ระบบกำลังดึงข้อความและยอดเงินจากรูป แล้วจะส่งการ์ดตรวจสอบกลับมาให้กดยืนยันก่อนบันทึก', {
          color: '#4b5563',
          wrap: true
        }),
        flexText('ยังไม่มีการบันทึกรายการในขั้นตอนนี้', { size: 'sm', color: '#0f766e', weight: 'bold' })
      ]
    }
  });
}

function buildPendingFlex(tx, options = {}) {
  const candidates = Array.isArray(options.candidates) ? options.candidates.slice(0, 3) : [];
  const candidateButtons = candidates.map((item, index) => ({
    type: 'button',
    style: 'secondary',
    height: 'sm',
    action: {
      type: 'postback',
      label: `เลือก ${formatMoney(item.amount)}`,
      data: `action=select_amount&index=${index + 1}`,
      displayText: `เลือกยอด ${formatMoney(item.amount)}`
    }
  }));

  const bodyContents = [
    flexText(tx.title || 'รายการจากสลิป', { weight: 'bold', size: 'xl', wrap: true }),
    detailRow('ยอด', `${formatMoney(tx.amount)} บาท`, true),
    detailRow('ประเภท', tx.type || '-'),
    detailRow('หมวด', tx.category || '-'),
    detailRow('วันที่', tx.transactionDate || '-'),
    flexText('ตรวจสอบก่อนกดยืนยัน ระบบจะยังไม่บันทึกจนกว่าจะกดปุ่ม', {
      size: 'xs',
      color: '#0f766e',
      wrap: true
    })
  ];

  if (candidates.length) {
    bodyContents.push({
      type: 'box',
      layout: 'vertical',
      margin: 'md',
      spacing: 'xs',
      contents: [
        flexText('ยอดที่ OCR พบ', { size: 'sm', weight: 'bold', color: '#374151' }),
        ...candidates.map((item, index) => flexText(`${index + 1}. ${formatMoney(item.amount)} บาท`, {
          size: 'sm',
          color: '#4b5563'
        }))
      ]
    });
  }

  return flexMessage('ตรวจสอบรายการก่อนบันทึก', {
    type: 'bubble',
    size: 'mega',
    header: flexHeader(options.heading || 'ตรวจสอบก่อนบันทึก', 'กดยืนยันเมื่อข้อมูลถูกต้อง', '#0f766e'),
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'md',
      contents: bodyContents
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      contents: [
        ...candidateButtons,
        {
          type: 'button',
          style: 'primary',
          color: '#16a34a',
          action: { type: 'postback', label: 'ยืนยันบันทึก', data: 'action=confirm', displayText: 'ยืนยัน' }
        },
        {
          type: 'button',
          style: 'secondary',
          action: { type: 'postback', label: 'ยกเลิก', data: 'action=cancel', displayText: 'ยกเลิก' }
        }
      ]
    }
  });
}

function buildResultFlex(title, rows, color = '#16a34a') {
  return flexMessage(title, {
    type: 'bubble',
    size: 'mega',
    header: flexHeader(title, 'LINE Expense Tracker Bot', color),
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'md',
      contents: rows.map(([label, value]) => detailRow(label, value, label === 'ยอด'))
    }
  });
}

function buildSavedFlex(tx, alerts = []) {
  return buildResultFlex('บันทึกแล้ว', [
    ['รายการ', tx.title],
    ['ยอด', `${formatMoney(tx.amount)} บาท`],
    ['หมวด', tx.category],
    ['วันที่', tx.transactionDate],
    ...alerts.map((alert) => ['แจ้งเตือน', alert])
  ]);
}

function buildDeleteConfirmFlex(tx) {
  return flexMessage('ยืนยันการลบรายการล่าสุด', {
    type: 'bubble',
    size: 'mega',
    header: flexHeader('ยืนยันการลบ', 'กดยืนยันเมื่อต้องการลบรายการนี้', '#dc2626'),
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'md',
      contents: [
        flexText(tx.title || 'รายการล่าสุด', { weight: 'bold', size: 'xl', wrap: true }),
        detailRow('ยอด', `${formatMoney(tx.amount)} บาท`, true),
        detailRow('หมวด', tx.category || '-'),
        detailRow('วันที่', tx.transactionDate || '-')
      ]
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      contents: [
        {
          type: 'button',
          style: 'primary',
          color: '#dc2626',
          action: { type: 'postback', label: 'ยืนยันลบ', data: 'action=confirm', displayText: 'ยืนยัน' }
        },
        {
          type: 'button',
          style: 'secondary',
          action: { type: 'postback', label: 'ยกเลิก', data: 'action=cancel', displayText: 'ยกเลิก' }
        }
      ]
    }
  });
}

function buildDailySummaryFlex(summary) {
  const rows = summary.rows.slice(0, 5).map((row) => ({
    type: 'box',
    layout: 'baseline',
    spacing: 'sm',
    contents: [
      flexText(row.type === 'income' ? '+' : '-', {
        size: 'sm',
        color: row.type === 'income' ? '#16a34a' : '#dc2626',
        flex: 1,
        weight: 'bold'
      }),
      flexText(row.title, { size: 'sm', color: '#111827', flex: 5, wrap: true }),
      flexText(formatMoney(row.amount), { size: 'sm', color: '#374151', flex: 3, align: 'end' })
    ]
  }));

  return flexMessage('สรุปวันนี้', {
    type: 'bubble',
    size: 'mega',
    header: flexHeader(`สรุปวันนี้ ${summary.date}`, 'ภาพรวมรายรับรายจ่าย', '#2563eb'),
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'md',
      contents: [
        detailRow('รายรับ', `${formatMoney(summary.income)} บาท`, true),
        detailRow('รายจ่าย', `${formatMoney(summary.expense)} บาท`, true),
        detailRow('สุทธิ', `${formatMoney(summary.net)} บาท`, true),
        {
          type: 'separator',
          margin: 'md'
        },
        flexText('รายการล่าสุด', { size: 'sm', weight: 'bold', color: '#374151', margin: 'md' }),
        ...(rows.length ? rows : [flexText('ยังไม่มีรายการวันนี้', { size: 'sm', color: '#6b7280' })])
      ]
    }
  });
}

function buildMonthlySummaryFlex(summary) {
  const topCategory = summary.topCategory
    ? `${summary.topCategory[0]} ${formatMoney(summary.topCategory[1])} บาท`
    : 'ยังไม่มี';

  return flexMessage('สรุปเดือนนี้', {
    type: 'bubble',
    size: 'mega',
    header: flexHeader(`สรุปเดือน ${summary.month}`, 'ภาพรวมทั้งเดือน', '#7c3aed'),
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'md',
      contents: [
        detailRow('รายรับ', `${formatMoney(summary.income)} บาท`, true),
        detailRow('รายจ่าย', `${formatMoney(summary.expense)} บาท`, true),
        detailRow('คงเหลือ', `${formatMoney(summary.net)} บาท`, true),
        detailRow('หมวดสูงสุด', topCategory),
        detailRow('จำนวนรายการ', `${summary.rows.length} รายการ`)
      ]
    }
  });
}

function buildErrorFlex(title, detail) {
  return flexMessage(title, {
    type: 'bubble',
    size: 'mega',
    header: flexHeader(title, 'ยังไม่มีการบันทึกรายการ', '#dc2626'),
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'md',
      contents: [
        flexText(detail, { wrap: true, color: '#4b5563' }),
        flexText('เพื่อความชัวร์ รายการจาก OCR ต้องให้คุณยืนยันก่อนเสมอ', {
          size: 'xs',
          color: '#6b7280',
          wrap: true
        })
      ]
    }
  });
}

function flexHeader(title, subtitle, color) {
  return {
    type: 'box',
    layout: 'vertical',
    paddingAll: '16px',
    backgroundColor: color,
    contents: [
      flexText(title, { color: '#ffffff', weight: 'bold', size: 'lg', wrap: true }),
      flexText(subtitle, { color: '#dcfce7', size: 'xs', margin: 'sm', wrap: true })
    ]
  };
}

function detailRow(label, value, strong = false) {
  return {
    type: 'box',
    layout: 'baseline',
    spacing: 'sm',
    contents: [
      flexText(label, { size: 'sm', color: '#6b7280', flex: 2 }),
      flexText(String(value || '-'), {
        size: strong ? 'lg' : 'sm',
        color: '#111827',
        weight: strong ? 'bold' : 'regular',
        flex: 5,
        wrap: true
      })
    ]
  };
}

function flexText(text, options = {}) {
  return {
    type: 'text',
    text: String(text || '-').slice(0, 300),
    wrap: Boolean(options.wrap),
    ...options
  };
}

function buildHelpFlex() {
  return flexMessage('วิธีใช้ LINE Expense Tracker Bot', {
    type: 'bubble',
    size: 'mega',
    header: flexHeader('วิธีใช้', 'พิมพ์สั้น ๆ หรือส่งรูปสลิปได้เลย', '#0f766e'),
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'md',
      contents: [
        flexText('บันทึกรายจ่าย', { weight: 'bold', color: '#111827' }),
        flexText('กาแฟ 45, จ่าย ข้าว 60, ซื้อของ 1200 หมวด ของใช้', { size: 'sm', color: '#4b5563', wrap: true }),
        flexText('บันทึกรายรับ', { weight: 'bold', color: '#111827', margin: 'md' }),
        flexText('รับ เงินเดือน 18000, ได้เงิน 1000', { size: 'sm', color: '#4b5563', wrap: true }),
        flexText('รูปสลิป', { weight: 'bold', color: '#111827', margin: 'md' }),
        flexText('ส่งรูป แล้วกดปุ่มยืนยันบนการ์ดหลังตรวจสอบ', { size: 'sm', color: '#4b5563', wrap: true }),
        flexText('คำสั่งอื่น', { weight: 'bold', color: '#111827', margin: 'md' }),
        flexText('สรุป, สรุปเดือนนี้, ลบล่าสุด, ตั้งงบ 8000, export เดือนนี้', {
          size: 'sm',
          color: '#4b5563',
          wrap: true
        })
      ]
    }
  });
}

function formatPending(tx, heading = 'รอตรวจสอบ') {
  return [
    heading,
    `ประเภท: ${tx.type}`,
    `รายการ: ${tx.title}`,
    `ยอด: ${formatMoney(tx.amount)} บาท`,
    `หมวด: ${tx.category}`,
    `วันที่: ${tx.transactionDate}`,
    'ตอบ "ยืนยัน" เพื่อบันทึก, "ยกเลิก" เพื่อยกเลิก หรือใช้คำสั่งแก้ล่าสุด'
  ].join('\n');
}

function helpText() {
  return [
    'คำสั่ง LINE Expense Tracker Bot',
    '- รายจ่าย: กาแฟ 45, จ่าย ข้าว 60, ซื้อของ 1200 หมวด ของใช้',
    '- รายรับ: รับ เงินเดือน 18000, ได้เงิน 1000',
    '- รูปภาพ: ส่งรูปบิล/สลิป แล้วตอบ ยืนยัน หลังตรวจสอบ',
    '- แก้ไข: แก้ล่าสุด 120, แก้หมวดล่าสุด อาหาร, แก้ชื่อรายการล่าสุด ข้าวเที่ยง',
    '- ลบ: ลบล่าสุด แล้วตอบ ยืนยัน',
    '- สรุป: สรุปวันนี้, สรุปเดือนนี้',
    '- งบ: ตั้งงบ 8000, งบอาหาร 3000',
    '- เป้า: ตั้งเป้า iPad 18000 ใน 6 เดือน',
    '- Export: export เดือนนี้, export ทั้งหมด'
  ].join('\n');
}

module.exports = router;
module.exports.handleText = handleText;
module.exports.handleImage = handleImage;
