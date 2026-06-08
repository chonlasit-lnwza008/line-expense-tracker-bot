const config = window.APP_CONFIG || {};
const state = {
  accessToken: '',
  profile: null,
  data: null,
  month: new Date().toISOString().slice(0, 7),
  modalType: 'expense'
};

const money = new Intl.NumberFormat('th-TH', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2
});

function formatMoney(value) {
  return `${money.format(Number(value || 0))} บาท`;
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

function showLoading(text = 'กำลังโหลดข้อมูล') {
  document.getElementById('app').innerHTML = `<div class="loading">${escapeHtml(text)}</div>`;
}

function profileName() {
  return (state.profile && state.profile.displayName)
    || (state.data && state.data.user && state.data.user.displayName)
    || 'บัญชีของฉัน';
}

function profilePicture() {
  return state.profile && state.profile.pictureUrl
    ? `<img class="avatar" src="${escapeHtml(state.profile.pictureUrl)}" alt="">`
    : '<div class="avatar"></div>';
}

async function init() {
  showLoading();

  if (config.liffId && window.liff) {
    await liff.init({ liffId: config.liffId });
    if (!liff.isLoggedIn()) {
      liff.login();
      return;
    }
    state.accessToken = liff.getAccessToken();
    state.profile = await liff.getProfile();
  }

  await loadOverview();
  render();
}

async function loadOverview() {
  const params = new URLSearchParams({ month: state.month });
  const headers = {};

  if (state.accessToken) {
    headers.Authorization = `Bearer ${state.accessToken}`;
  } else if (config.dashboardToken && config.debugLineUserId) {
    params.set('token', config.dashboardToken);
    params.set('lineUserId', config.debugLineUserId);
  }

  const response = await fetch(`/api/liff/overview?${params.toString()}`, { headers });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'โหลดข้อมูลไม่ได้');
  }
  state.data = data;
}

function render() {
  const data = state.data;
  const topCategory = data.categories[0] ? data.categories[0].category : 'ยังไม่มีหมวดเด่น';
  const todayNet = data.todayTotals.net;
  document.getElementById('app').innerHTML = `
    <main class="app">
      <section class="topbar">
        <div class="profile">
          ${profilePicture()}
          <div>
            <div class="name">${escapeHtml(profileName())}</div>
            <div class="date">วันนี้ ${escapeHtml(data.displayToday)}</div>
          </div>
        </div>
        <button class="bell" type="button" data-command="วิเคราะห์เดือนนี้" aria-label="คำแนะนำ">!</button>
      </section>

      <section class="hero">
        <div class="hero-copy">
          <div class="hero-label">คงเหลือสุทธิเดือนนี้</div>
          <div class="net">${formatMoney(data.totals.net)}</div>
          <div class="hero-note">${todayNet >= 0 ? 'วันนี้ยังคุมงบได้ดี' : 'วันนี้รายจ่ายมากกว่ารายรับ'} · ${escapeHtml(topCategory)}</div>
        </div>
        <div class="mascot" aria-hidden="true">
          <div class="cat-face">
            <span class="cat-ear left"></span>
            <span class="cat-ear right"></span>
            <span class="cat-eye left"></span>
            <span class="cat-eye right"></span>
            <span class="cat-mouth"></span>
            <span class="cat-coin"></span>
          </div>
        </div>
        <div class="summary-grid">
          <div class="summary-pill"><span>รายรับ</span><strong>${formatMoney(data.totals.income)}</strong></div>
          <div class="summary-pill"><span>รายจ่าย</span><strong>${formatMoney(data.totals.expense)}</strong></div>
          <div class="summary-pill"><span>รายการ</span><strong>${money.format(data.transactionCount)}</strong></div>
        </div>
      </section>

      <section class="section-title">
        <h2>เมนูบัญชี</h2>
        <small>${escapeHtml(data.month)}</small>
      </section>
      <section class="menu-grid">
        ${menuCard('expense', 'จ่าย', 'บันทึกรายจ่าย', 'พิมพ์ไว', 'open-expense')}
        ${menuCard('income', 'รับ', 'บันทึกรายรับ', 'เงินเข้า', 'open-income')}
        ${menuCard('slip', 'สลิป', 'ส่งสลิป/บิล', 'ตรวจ QR', 'slip-help')}
        ${menuCard('today', 'วันนี้', 'สรุปวันนี้', 'ยอดรวม', 'สรุปวันนี้')}
        ${menuCard('chart', 'กราฟ', 'กราฟรายจ่าย', 'ตามหมวด', 'scroll-chart')}
        ${menuCard('edit', 'แก้', 'แก้ไข 7 วัน', 'รายการล่าสุด', 'scroll-edit')}
      </section>

      <section id="chart" class="section-title">
        <h2>กราฟรายจ่าย</h2>
        <small>ตามหมวด</small>
      </section>
      <section class="panel">
        ${renderCategoryBars(data.categories)}
      </section>

      <section id="edit" class="section-title">
        <h2>รายการย้อนหลัง 7 วัน</h2>
        <button class="text-action" type="button" data-command="แก้/ลบล่าสุด">เปิดตัวเลือก</button>
      </section>
      <section class="panel">
        ${renderTransactions(data.recentSevenDays)}
      </section>
    </main>

    <nav class="tabbar">
      <button class="active" type="button" data-scroll="top">หน้าหลัก</button>
      <button type="button" data-command="สรุปวันนี้">วันนี้</button>
      <button type="button" data-scroll="chart">กราฟ</button>
      <button type="button" data-scroll="edit">แก้ไข</button>
    </nav>

    <div id="quickModal" class="modal">
      <form class="sheet" id="quickForm">
        <h3 id="modalTitle">บันทึกรายจ่าย</h3>
        <input id="quickText" autocomplete="off" placeholder="เช่น กาแฟ 45">
        <div class="sheet-actions">
          <button class="secondary" type="button" id="closeModal">ยกเลิก</button>
          <button class="primary" type="submit">ส่งเข้าแชท</button>
        </div>
      </form>
    </div>
  `;

  bindEvents();
}

function menuCard(iconClass, iconText, label, hint, action) {
  const attr = action.startsWith('scroll-')
    ? `data-scroll="${action.replace('scroll-', '')}"`
    : action.startsWith('open-')
      ? `data-open="${action.replace('open-', '')}"`
      : `data-command="${escapeHtml(action)}"`;
  return `
    <button class="menu-card" type="button" ${attr}>
      <div class="icon ${iconClass}">${escapeHtml(iconText)}</div>
      <span>${escapeHtml(label)}</span>
      <small>${escapeHtml(hint)}</small>
    </button>
  `;
}

function renderCategoryBars(categories) {
  if (!categories.length) return '<div class="empty">ยังไม่มีรายจ่ายเดือนนี้</div>';
  const max = Math.max(...categories.map((item) => Number(item.amount)), 1);
  return `
    <div class="chart-list">
      ${categories.map((item) => {
        const width = Math.max(8, (Number(item.amount) / max) * 100);
        return `
          <div class="bar-row">
            <div class="bar-label">${escapeHtml(item.category)}</div>
            <div class="bar-track"><div class="bar-fill" style="width:${width}%"></div></div>
            <div class="bar-amount">${formatMoney(item.amount)}</div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderTransactions(rows) {
  if (!rows.length) return '<div class="empty">ยังไม่มีรายการใน 7 วันล่าสุด</div>';
  return `
    <div class="transaction-list">
      ${rows.map((row) => {
        const typeClass = row.type === 'income' ? 'income-text' : 'expense-text';
        const sign = row.type === 'income' ? '+' : '-';
        return `
          <div class="tx">
            <div>
              <div class="tx-title">${escapeHtml(row.title)}</div>
              <div class="tx-meta">${escapeHtml(row.displayDate)} · ${escapeHtml(row.category)}</div>
            </div>
            <div class="tx-side">
              <div class="tx-amount ${typeClass}">${sign}${formatMoney(row.amount)}</div>
              <button type="button" data-command="แก้/ลบล่าสุด" class="mini-action">จัดการ</button>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function bindEvents() {
  document.querySelectorAll('[data-command]').forEach((button) => {
    button.addEventListener('click', () => handleCommand(button.dataset.command));
  });
  document.querySelectorAll('[data-scroll]').forEach((button) => {
    button.addEventListener('click', () => scrollToSection(button.dataset.scroll));
  });
  document.querySelectorAll('[data-open]').forEach((button) => {
    button.addEventListener('click', () => openQuickModal(button.dataset.open));
  });

  document.getElementById('closeModal').addEventListener('click', closeQuickModal);
  document.getElementById('quickModal').addEventListener('click', (event) => {
    if (event.target.id === 'quickModal') closeQuickModal();
  });
  document.getElementById('quickForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const value = document.getElementById('quickText').value.trim();
    if (!value) return;
    const prefix = state.modalType === 'income' && !/^(รับ|รายรับ|ได้เงิน)/.test(value) ? 'รับ ' : '';
    await sendChatText(prefix + value);
    closeQuickModal();
  });
}

function scrollToSection(id) {
  if (id === 'top') {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  document.getElementById(id).scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function openQuickModal(type) {
  state.modalType = type;
  document.getElementById('modalTitle').textContent = type === 'income' ? 'บันทึกรายรับ' : 'บันทึกรายจ่าย';
  document.getElementById('quickText').placeholder = type === 'income' ? 'เช่น เงินเดือน 18000' : 'เช่น กาแฟ 45';
  document.getElementById('quickText').value = '';
  document.getElementById('quickModal').classList.add('open');
  setTimeout(() => document.getElementById('quickText').focus(), 50);
}

function closeQuickModal() {
  document.getElementById('quickModal').classList.remove('open');
}

async function handleCommand(command) {
  if (command === 'slip-help') {
    await sendChatText('วิธีส่งสลิป');
    return;
  }
  await sendChatText(command);
}

async function sendChatText(text) {
  if (window.liff && liff.isInClient() && typeof liff.sendMessages === 'function') {
    await liff.sendMessages([{ type: 'text', text }]);
    alert('ส่งคำสั่งเข้าแชทแล้ว');
    return;
  }
  alert(`เปิดใน LINE แล้วระบบจะส่งคำสั่งนี้เข้าแชท: ${text}`);
}

init().catch((error) => {
  showLoading(`เปิดหน้าไม่ได้: ${error.message}`);
});
