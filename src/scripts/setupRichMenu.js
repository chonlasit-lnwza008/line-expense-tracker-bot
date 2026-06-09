require('dotenv').config();

const sharp = require('sharp');
const { lineClient, blobClient, lineConfig } = require('../config/line');

const WIDTH = 2500;
const HEIGHT = 1686;
const ROW_HEIGHT = 843;
const COLS = [833, 833, 834];
const MENU_NAME = process.env.RICH_MENU_NAME || 'LINE Expense Tracker Menu';
const LIFF_ID = process.env.LIFF_ID || '';
const APP_URL = resolveAppUrl();

function resolveAppUrl() {
  const configuredUrl = process.env.LIFF_URL || '';
  const liffLauncherUrl = LIFF_ID ? `https://liff.line.me/${LIFF_ID}` : '';

  if (configuredUrl && LIFF_ID && !configuredUrl.includes('liff.line.me') && /\/liff(?:[?#].*)?$/.test(configuredUrl)) {
    return liffLauncherUrl;
  }

  if (configuredUrl && !LIFF_ID && !configuredUrl.includes('liff.line.me') && /\/liff(?:[?#].*)?$/.test(configuredUrl)) {
    throw new Error('LIFF_URL points to the Render /liff endpoint. Set LIFF_ID or change LIFF_URL to https://liff.line.me/<LIFF_ID> before running richmenu:setup.');
  }

  return configuredUrl || liffLauncherUrl || process.env.DASHBOARD_URL || '';
}

const buttons = [
  { label: 'วันนี้', hint: 'สรุปยอด', message: 'สรุปวันนี้', color: '#0f766e', icon: 'calendar' },
  { label: 'หน้าหลัก', hint: 'ดูกราฟ', message: 'dashboard', uri: APP_URL, color: '#2563eb', icon: 'chart' },
  { label: 'รายการ', hint: 'ล่าสุด', message: 'รายการล่าสุด', color: '#7c3aed', icon: 'list' },
  { label: 'แก้/ลบ', hint: 'เลือกจากวันนี้', message: 'แก้/ลบล่าสุด', color: '#ea580c', icon: 'edit' },
  { label: 'AI แนะนำ', hint: 'ใช้เงินยังไง', message: 'วิเคราะห์เดือนนี้', color: '#111827', icon: 'spark' },
  { label: 'วิธีใช้', hint: 'คำสั่ง', message: 'help', color: '#6b7280', icon: 'help' }
];

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buttonAreas() {
  const areas = [];
  for (let row = 0; row < 2; row += 1) {
    let x = 0;
    for (let col = 0; col < 3; col += 1) {
      const index = row * 3 + col;
      areas.push({
        bounds: { x, y: row * ROW_HEIGHT, width: COLS[col], height: ROW_HEIGHT },
        action: buttons[index].uri
          ? { type: 'uri', uri: buttons[index].uri }
          : { type: 'message', text: buttons[index].message }
      });
      x += COLS[col];
    }
  }
  return areas;
}

function richMenuBody() {
  return {
    size: { width: WIDTH, height: HEIGHT },
    selected: true,
    name: MENU_NAME,
    chatBarText: 'เมนูบัญชี',
    areas: buttonAreas()
  };
}

function catMascotSvg(x, y, scale = 1) {
  const s = scale;
  return `
    <g transform="translate(${x} ${y}) scale(${s})">
      <path d="M42 23 L64 2 L80 31 Q99 43 99 70 Q99 116 50 116 Q1 116 1 70 Q1 43 20 31 L36 2 Z" fill="#fff7ed" stroke="#111827" stroke-width="5" stroke-linejoin="round"/>
      <circle cx="34" cy="63" r="5" fill="#111827"/>
      <circle cx="66" cy="63" r="5" fill="#111827"/>
      <path d="M48 75 Q50 78 52 75" fill="none" stroke="#111827" stroke-width="4" stroke-linecap="round"/>
      <path d="M34 86 Q50 98 66 86" fill="none" stroke="#111827" stroke-width="4" stroke-linecap="round"/>
      <path d="M14 74 H31 M69 74 H86 M17 86 H32 M68 86 H83" stroke="#111827" stroke-width="3" stroke-linecap="round"/>
      <circle cx="23" cy="78" r="7" fill="#fecdd3" opacity="0.9"/>
      <circle cx="77" cy="78" r="7" fill="#fecdd3" opacity="0.9"/>
      <circle cx="50" cy="44" r="13" fill="#16a34a"/>
      <text x="50" y="51" text-anchor="middle" font-size="22" font-weight="800" fill="#ffffff">฿</text>
    </g>
  `;
}

function iconSvg(type, cx, cy, color) {
  const stroke = '#ffffff';
  const soft = 'rgba(255,255,255,0.22)';
  const base = `<circle cx="${cx}" cy="${cy}" r="82" fill="${soft}" stroke="rgba(255,255,255,0.45)" stroke-width="6"/>`;
  if (type === 'calendar') {
    return `${base}<rect x="${cx - 46}" y="${cy - 40}" width="92" height="86" rx="12" fill="none" stroke="${stroke}" stroke-width="8"/><path d="M${cx - 46} ${cy - 16}H${cx + 46}M${cx - 24} ${cy - 58}V${cy - 28}M${cx + 24} ${cy - 58}V${cy - 28}" stroke="${stroke}" stroke-width="8" stroke-linecap="round"/><circle cx="${cx - 18}" cy="${cy + 15}" r="8" fill="${stroke}"/><circle cx="${cx + 18}" cy="${cy + 15}" r="8" fill="${stroke}"/>`;
  }
  if (type === 'chart') {
    return `${base}<path d="M${cx - 50} ${cy + 46}H${cx + 52}" stroke="${stroke}" stroke-width="8" stroke-linecap="round"/><rect x="${cx - 42}" y="${cy - 4}" width="22" height="50" rx="6" fill="${stroke}"/><rect x="${cx - 8}" y="${cy - 34}" width="22" height="80" rx="6" fill="${stroke}"/><rect x="${cx + 26}" y="${cy - 56}" width="22" height="102" rx="6" fill="${stroke}"/>`;
  }
  if (type === 'list') {
    return `${base}<path d="M${cx - 36} ${cy - 35}H${cx + 48}M${cx - 36} ${cy}H${cx + 48}M${cx - 36} ${cy + 35}H${cx + 48}" stroke="${stroke}" stroke-width="9" stroke-linecap="round"/><circle cx="${cx - 58}" cy="${cy - 35}" r="8" fill="${stroke}"/><circle cx="${cx - 58}" cy="${cy}" r="8" fill="${stroke}"/><circle cx="${cx - 58}" cy="${cy + 35}" r="8" fill="${stroke}"/>`;
  }
  if (type === 'edit') {
    return `${base}<path d="M${cx - 42} ${cy + 38}L${cx - 28} ${cy - 5}L${cx + 20} ${cy - 53}Q${cx + 32} ${cy - 65} ${cx + 44} ${cy - 53}Q${cx + 56} ${cy - 41} ${cx + 44} ${cy - 29}L${cx - 4} ${cy + 19}Z" fill="none" stroke="${stroke}" stroke-width="8" stroke-linejoin="round"/><path d="M${cx + 16} ${cy - 50}L${cx + 47} ${cy - 19}" stroke="${stroke}" stroke-width="8" stroke-linecap="round"/>`;
  }
  if (type === 'spark') {
    return `${base}<path d="M${cx} ${cy - 60}L${cx + 18} ${cy - 18}L${cx + 60} ${cy}L${cx + 18} ${cy + 18}L${cx} ${cy + 60}L${cx - 18} ${cy + 18}L${cx - 60} ${cy}L${cx - 18} ${cy - 18}Z" fill="${stroke}"/><circle cx="${cx + 48}" cy="${cy - 48}" r="10" fill="${stroke}"/><circle cx="${cx - 48}" cy="${cy + 48}" r="8" fill="${stroke}"/>`;
  }
  return `${base}<circle cx="${cx}" cy="${cy - 20}" r="26" fill="none" stroke="${stroke}" stroke-width="8"/><path d="M${cx} ${cy + 10}V${cy + 18}" stroke="${stroke}" stroke-width="10" stroke-linecap="round"/><circle cx="${cx}" cy="${cy + 46}" r="7" fill="${stroke}"/>`;
}

function richMenuSvg() {
  const cells = [];
  for (let row = 0; row < 2; row += 1) {
    let x = 0;
    for (let col = 0; col < 3; col += 1) {
      const index = row * 3 + col;
      const button = buttons[index];
      const width = COLS[col];
      const y = row * ROW_HEIGHT;
      const cardX = x + 48;
      const cardY = y + 100;
      const cardWidth = width - 96;
      const cardHeight = ROW_HEIGHT - 156;
      cells.push(`
        <rect x="${x}" y="${y}" width="${width}" height="${ROW_HEIGHT}" fill="transparent"/>
        <rect x="${cardX}" y="${cardY}" width="${cardWidth}" height="${cardHeight}" rx="56" fill="${button.color}"/>
        <path d="M${cardX + 42} ${cardY + 110}Q${cardX + 130} ${cardY + 20} ${cardX + 220} ${cardY + 120}T${cardX + 420} ${cardY + 120}" fill="none" stroke="rgba(255,255,255,0.22)" stroke-width="24" stroke-linecap="round"/>
        ${iconSvg(button.icon, x + width / 2, y + 260, button.color)}
        <text x="${x + width / 2}" y="${y + 500}" text-anchor="middle" font-size="92" font-weight="800" fill="#ffffff">${escapeXml(button.label)}</text>
        <text x="${x + width / 2}" y="${y + 610}" text-anchor="middle" font-size="46" font-weight="600" fill="#fef3c7">${escapeXml(button.hint)}</text>
        <circle cx="${cardX + cardWidth - 74}" cy="${cardY + cardHeight - 74}" r="16" fill="rgba(255,255,255,0.34)"/>
        <circle cx="${cardX + cardWidth - 114}" cy="${cardY + cardHeight - 42}" r="10" fill="rgba(255,255,255,0.26)"/>
      `);
      x += width;
    }
  }

  return Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
      <defs>
        <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stop-color="#fff7ed"/>
          <stop offset="48%" stop-color="#ecfeff"/>
          <stop offset="100%" stop-color="#f5f3ff"/>
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#bg)"/>
      <circle cx="2340" cy="120" r="190" fill="#fde68a" opacity="0.35"/>
      <circle cx="190" cy="1600" r="250" fill="#a7f3d0" opacity="0.32"/>
      ${catMascotSvg(72, 34, 0.72)}
      <text x="168" y="92" font-size="48" font-weight="800" fill="#111827">LINE Expense Tracker</text>
      <text x="168" y="142" font-size="30" font-weight="600" fill="#6b7280">บัญชีส่วนตัวของเจ้าเหมียว</text>
      ${cells.join('\n')}
      <path d="M833 160V1686M1666 160V1686M0 843H2500" stroke="#ffffff" stroke-width="10" opacity="0.8"/>
    </svg>
  `);
}

async function createRichMenuImage() {
  return sharp(richMenuSvg()).png().toBuffer();
}

async function setupRichMenu() {
  if (!lineConfig.channelAccessToken) {
    throw new Error('Missing LINE_CHANNEL_ACCESS_TOKEN');
  }

  const existing = await lineClient.getRichMenuList();
  const oldMenus = (existing.richmenus || []).filter((menu) => menu.name === MENU_NAME);

  const created = await lineClient.createRichMenu(richMenuBody());
  const richMenuId = created.richMenuId;
  const image = await createRichMenuImage();

  await blobClient.setRichMenuImage(richMenuId, new Blob([image], { type: 'image/png' }));
  await lineClient.setDefaultRichMenu(richMenuId);

  if (process.env.RICH_MENU_KEEP_OLD !== 'true') {
    for (const menu of oldMenus) {
      if (menu.richMenuId !== richMenuId) {
        await lineClient.deleteRichMenu(menu.richMenuId);
      }
    }
  }

  return { richMenuId, deletedOldMenus: process.env.RICH_MENU_KEEP_OLD === 'true' ? 0 : oldMenus.length };
}

if (require.main === module) {
  setupRichMenu()
    .then((result) => {
      console.log(`Rich menu is ready: ${result.richMenuId}`);
      console.log(`Deleted old menus: ${result.deletedOldMenus}`);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { setupRichMenu, createRichMenuImage, richMenuBody };
