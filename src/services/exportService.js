const db = require('../config/database');
const sharp = require('sharp');
const { currentMonth, monthRange, toDateOnly } = require('../utils/dateUtils');

function normalizeDate(value) {
  return value instanceof Date ? toDateOnly(value) : value;
}

function csvEscape(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function rowsToCsv(rows) {
  const headers = ['date', 'type', 'title', 'category', 'amount', 'note', 'source'];
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push([
      normalizeDate(row.transactionDate),
      row.type,
      row.title,
      row.category,
      row.amount,
      row.note,
      row.source
    ].map(csvEscape).join(','));
  }
  return lines.join('\n');
}

async function exportTransactions(userId, scope = 'month') {
  const rows = await getExportRows(userId, scope);
  return rowsToCsv(rows);
}

async function getExportRows(userId, scope = 'month') {
  let rows;
  if (scope === 'all') {
    rows = await db.all(`
      SELECT * FROM transactions
      WHERE userId = $1 AND status = 'confirmed'
      ORDER BY transactionDate ASC, id ASC
    `, [userId]);
  } else {
    const range = monthRange(currentMonth());
    rows = await db.all(`
      SELECT * FROM transactions
      WHERE userId = $1 AND status = 'confirmed'
        AND transactionDate >= $2 AND transactionDate < $3
      ORDER BY transactionDate ASC, id ASC
    `, [userId, range.start, range.endExclusive]);
  }
  return rows;
}

async function exportTransactionsPdf(userId, scope = 'month', options = {}) {
  const normalizedScope = scope === 'all' ? 'all' : 'month';
  const rows = await getExportRows(userId, normalizedScope);
  const title = String(options.title || (normalizedScope === 'all' ? 'รายงานบัญชีทั้งหมด' : `รายงานบัญชีเดือน ${currentMonth()}`)).slice(0, 80);
  const note = String(options.note || '').slice(0, 160);
  const svg = buildReportSvg(rows, { title, note, scope: normalizedScope });
  const image = await sharp(Buffer.from(svg)).jpeg({ quality: 92, mozjpeg: true }).toBuffer();
  const pdf = imageToSinglePagePdf(image, 1240, 1754);
  return {
    buffer: pdf,
    filename: `line-expense-${normalizedScope}-${toDateOnly()}.pdf`
  };
}

function buildReportSvg(rows, { title, note, scope }) {
  const width = 1240;
  const height = 1754;
  const margin = 72;
  const income = rows.filter((row) => row.type === 'income').reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const expense = rows.filter((row) => row.type === 'expense').reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const net = income - expense;
  const visibleRows = rows.slice(-32).reverse();
  const categoryTotals = new Map();
  for (const row of rows.filter((item) => item.type === 'expense')) {
    const category = row.category || 'อื่นๆ';
    categoryTotals.set(category, (categoryTotals.get(category) || 0) + Number(row.amount || 0));
  }
  const topCategories = [...categoryTotals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const generated = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });

  let y = 72;
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    '<rect width="1240" height="1754" fill="#fffaf0"/>',
    '<rect x="0" y="0" width="1240" height="250" fill="#0f766e"/>',
    text(title, margin, y + 50, 54, '#ffffff', 'bold'),
    text(scope === 'all' ? 'Export ทั้งหมด' : 'Export เดือนนี้', margin, y + 98, 26, '#d1fae5'),
    text(`สร้างเมื่อ ${generated}`, margin, y + 138, 24, '#ccfbf1'),
    note ? text(note, margin, y + 178, 24, '#ffffff') : '',
    card(margin, 292, 320, 150, 'รายรับ', formatMoney(income), '#16a34a'),
    card(margin + 360, 292, 320, 150, 'รายจ่าย', formatMoney(expense), '#dc2626'),
    card(margin + 720, 292, 320, 150, 'คงเหลือสุทธิ', formatMoney(net), net >= 0 ? '#0f766e' : '#dc2626')
  ];

  y = 500;
  parts.push(text('หมวดรายจ่ายเด่น', margin, y, 34, '#111827', 'bold'));
  y += 36;
  if (topCategories.length) {
    const max = Math.max(...topCategories.map(([, amount]) => amount));
    for (const [category, amount] of topCategories) {
      const barWidth = Math.max(18, Math.round((amount / max) * 520));
      parts.push(text(category, margin, y + 24, 24, '#374151'));
      parts.push(`<rect x="${margin + 250}" y="${y + 2}" width="540" height="28" rx="14" fill="#e5e7eb"/>`);
      parts.push(`<rect x="${margin + 250}" y="${y + 2}" width="${barWidth}" height="28" rx="14" fill="#14b8a6"/>`);
      parts.push(text(formatMoney(amount), margin + 820, y + 25, 24, '#111827', 'bold'));
      y += 48;
    }
  } else {
    parts.push(text('ยังไม่มีรายจ่ายในช่วงนี้', margin, y + 24, 24, '#6b7280'));
    y += 56;
  }

  y += 28;
  parts.push(text('รายการล่าสุด', margin, y, 34, '#111827', 'bold'));
  parts.push(text(`${rows.length} รายการทั้งหมด${rows.length > visibleRows.length ? `, แสดงล่าสุด ${visibleRows.length} รายการ` : ''}`, margin + 220, y, 22, '#6b7280'));
  y += 36;
  parts.push(`<rect x="${margin}" y="${y}" width="${width - margin * 2}" height="48" rx="16" fill="#111827"/>`);
  parts.push(text('วันที่', margin + 24, y + 32, 20, '#ffffff', 'bold'));
  parts.push(text('รายการ', margin + 190, y + 32, 20, '#ffffff', 'bold'));
  parts.push(text('หมวด', margin + 650, y + 32, 20, '#ffffff', 'bold'));
  parts.push(text('ยอด', margin + 940, y + 32, 20, '#ffffff', 'bold'));
  y += 62;

  for (const row of visibleRows) {
    const amount = Number(row.amount || 0);
    const isIncome = row.type === 'income';
    parts.push(`<rect x="${margin}" y="${y - 28}" width="${width - margin * 2}" height="54" rx="14" fill="${isIncome ? '#ecfdf5' : '#fff1f2'}"/>`);
    parts.push(text(normalizeDate(row.transactionDate) || '-', margin + 24, y + 6, 20, '#374151'));
    parts.push(text(truncate(row.title || '-', 34), margin + 190, y + 6, 22, '#111827', 'bold'));
    parts.push(text(truncate(row.category || '-', 18), margin + 650, y + 6, 20, '#4b5563'));
    parts.push(text(`${isIncome ? '+' : '-'}${formatMoney(amount)}`, margin + 940, y + 6, 22, isIncome ? '#16a34a' : '#dc2626', 'bold'));
    y += 62;
    if (y > 1640) break;
  }

  parts.push(text('LINE Expense Tracker Bot', margin, 1696, 22, '#6b7280'));
  parts.push(text('ข้อมูลนี้สร้างจากรายการที่ยืนยันแล้วเท่านั้น', margin + 750, 1696, 22, '#6b7280'));
  parts.push('</svg>');
  return parts.join('');
}

function imageToSinglePagePdf(imageBuffer, imageWidth, imageHeight) {
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const objects = [];
  objects.push('<< /Type /Catalog /Pages 2 0 R >>');
  objects.push('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im1 4 0 R >> >> /Contents 5 0 R >>`);
  objects.push(Buffer.concat([
    Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${imageWidth} /Height ${imageHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imageBuffer.length} >>\nstream\n`, 'binary'),
    imageBuffer,
    Buffer.from('\nendstream')
  ]));
  const content = `q\n${pageWidth} 0 0 ${pageHeight} 0 0 cm\n/Im1 Do\nQ`;
  objects.push(`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`);

  const chunks = [Buffer.from('%PDF-1.4\n%\xFF\xFF\xFF\xFF\n', 'binary')];
  const offsets = [0];
  for (let i = 0; i < objects.length; i += 1) {
    offsets.push(Buffer.concat(chunks).length);
    chunks.push(Buffer.from(`${i + 1} 0 obj\n`, 'binary'));
    chunks.push(Buffer.isBuffer(objects[i]) ? objects[i] : Buffer.from(objects[i], 'utf8'));
    chunks.push(Buffer.from('\nendobj\n', 'binary'));
  }
  const xrefOffset = Buffer.concat(chunks).length;
  const xref = ['xref', `0 ${objects.length + 1}`, '0000000000 65535 f '];
  for (let i = 1; i < offsets.length; i += 1) {
    xref.push(`${String(offsets[i]).padStart(10, '0')} 00000 n `);
  }
  chunks.push(Buffer.from(`${xref.join('\n')}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`, 'binary'));
  return Buffer.concat(chunks);
}

function card(x, y, w, h, label, value, color) {
  return [
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="28" fill="#ffffff" stroke="#fde68a" stroke-width="3"/>`,
    text(label, x + 32, y + 48, 24, '#6b7280', 'bold'),
    text(value, x + 32, y + 108, 34, color, 'bold')
  ].join('');
}

function text(value, x, y, size, color = '#111827', weight = 'normal') {
  return `<text x="${x}" y="${y}" font-family="Tahoma, Arial, 'Noto Sans Thai', sans-serif" font-size="${size}" font-weight="${weight}" fill="${color}">${escapeXml(value)}</text>`;
}

function escapeXml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&apos;'
  }[char]));
}

function formatMoney(value) {
  return `${Number(value || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 })} บาท`;
}

function truncate(value, length) {
  const text = String(value || '');
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
}

module.exports = {
  exportTransactions,
  exportTransactionsPdf,
  rowsToCsv
};
