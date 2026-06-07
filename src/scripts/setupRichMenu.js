require('dotenv').config();

const sharp = require('sharp');
const { lineClient, blobClient, lineConfig } = require('../config/line');

const WIDTH = 2500;
const HEIGHT = 1686;
const ROW_HEIGHT = 843;
const COLS = [833, 833, 834];
const MENU_NAME = process.env.RICH_MENU_NAME || 'LINE Expense Tracker Menu';

const buttons = [
  { label: 'สรุปวันนี้', hint: 'ยอดวันนี้', message: 'สรุปวันนี้', color: '#0f766e' },
  { label: 'เดือนนี้', hint: 'ภาพรวมเดือน', message: 'สรุปเดือนนี้', color: '#2563eb' },
  { label: 'ล่าสุด', hint: 'รายการล่าสุด', message: 'รายการล่าสุด', color: '#7c3aed' },
  { label: 'ย้อนหลัง', hint: '7 วันล่าสุด', message: 'ย้อนหลัง 7 วัน', color: '#ea580c' },
  { label: 'วิเคราะห์', hint: 'คำแนะนำ AI', message: 'วิเคราะห์เดือนนี้', color: '#111827' },
  { label: 'วิธีใช้', hint: 'คำสั่งทั้งหมด', message: 'help', color: '#6b7280' }
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
        action: { type: 'message', text: buttons[index].message }
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

function richMenuSvg() {
  const cells = [];
  for (let row = 0; row < 2; row += 1) {
    let x = 0;
    for (let col = 0; col < 3; col += 1) {
      const index = row * 3 + col;
      const button = buttons[index];
      const width = COLS[col];
      const y = row * ROW_HEIGHT;
      cells.push(`
        <rect x="${x}" y="${y}" width="${width}" height="${ROW_HEIGHT}" fill="#ffffff"/>
        <rect x="${x + 56}" y="${y + 92}" width="${width - 112}" height="${ROW_HEIGHT - 184}" rx="44" fill="${button.color}"/>
        <text x="${x + width / 2}" y="${y + 390}" text-anchor="middle" font-size="92" font-weight="700" fill="#ffffff">${escapeXml(button.label)}</text>
        <text x="${x + width / 2}" y="${y + 510}" text-anchor="middle" font-size="46" font-weight="500" fill="#e5e7eb">${escapeXml(button.hint)}</text>
      `);
      x += width;
    }
  }

  return Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
      <rect width="100%" height="100%" fill="#f3f4f6"/>
      <text x="80" y="88" font-size="44" font-weight="700" fill="#111827">LINE Expense Tracker</text>
      ${cells.join('\n')}
      <path d="M833 0V1686M1666 0V1686M0 843H2500" stroke="#e5e7eb" stroke-width="6"/>
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
