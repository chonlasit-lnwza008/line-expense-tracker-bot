const config = window.APP_CONFIG || {};
const state = {
  accessToken: '',
  profile: null,
  data: null,
  month: new Date().toISOString().slice(0, 7),
  modalType: 'expense',
  editingTransaction: null,
  savingGoal: null,
  payingDebt: null,
  activeView: 'overview',
  transactionFilter: {
    period: 'month',
    type: 'all',
    category: 'all',
    search: ''
  }
};

const STANDARD_CATEGORIES = [
  'ทั้งหมด',
  'อาหาร',
  'เครื่องดื่ม',
  'เดินทาง',
  'บิลประจำ',
  'สิ่งใช้ประจำวัน',
  'ของใช้',
  'สุขภาพ',
  'ช้อปปิ้ง',
  'ครอบครัว',
  'บันเทิง',
  'การศึกษา',
  'ชำระหนี้',
  'รับคืนหนี้',
  'รายรับ',
  'อื่นๆ'
];

const CATEGORY_SUGGESTIONS = [
  { category: 'เครื่องดื่ม', keywords: ['กาแฟ', 'coffee', 'ชา', 'ชานม', 'โกโก้', 'น้ำ', 'โค้ก', 'เต่าบิน', 'taobin'] },
  { category: 'อาหาร', keywords: ['ข้าว', 'อาหาร', 'ก๋วยเตี๋ยว', 'หมูกระทะ', 'ขนม', 'ของกินเล่น'] },
  { category: 'เดินทาง', keywords: ['น้ำมัน', 'bts', 'mrt', 'รถ', 'แท็กซี่', 'taxi', 'grab'] },
  { category: 'บิลประจำ', keywords: ['ค่าไฟ', 'ค่าน้ำ', 'ค่าเน็ต', 'โทรศัพท์', 'บุญเติม', 'boonterm'] },
  { category: 'สิ่งใช้ประจำวัน', keywords: ['ทิชชู่', 'ยาสีฟัน', 'น้ำยาซักผ้า', 'น้ำยาล้างจาน', 'ถุงขยะ'] },
  { category: 'ของใช้', keywords: ['homepro', 'โฮมโปร', 'เสื้อ', 'รองเท้า', 'ซื้อของ', 'แชมพู', 'สบู่'] }
];

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

  const debugMode = Boolean(config.dashboardToken && config.debugLineUserId);
  if (!debugMode && config.liffId && window.liff) {
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
  const response = await fetch(`/api/liff/overview?${liffQueryParams().toString()}`, {
    headers: liffHeaders()
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'โหลดข้อมูลไม่ได้');
  }
  state.data = data;
}

function liffQueryParams() {
  const params = new URLSearchParams({ month: state.month });
  if (!state.accessToken && config.dashboardToken && config.debugLineUserId) {
    params.set('token', config.dashboardToken);
    params.set('lineUserId', config.debugLineUserId);
  }
  return params;
}

function liffHeaders(includeJson = false) {
  const headers = {};
  if (includeJson) {
    headers['Content-Type'] = 'application/json';
  }
  if (state.accessToken) {
    headers.Authorization = `Bearer ${state.accessToken}`;
  }
  return headers;
}

async function createDashboardTransaction(text) {
  const response = await fetch(`/api/liff/transactions?${liffQueryParams().toString()}`, {
    method: 'POST',
    headers: liffHeaders(true),
    body: JSON.stringify({ text })
  });
  const data = await response.json();
  if (!response.ok) {
    const message = data.reason === 'amount_not_found'
      ? 'ยังอ่านยอดเงินไม่ได้ ลองพิมพ์เช่น "กาแฟ 45"'
      : data.error || 'บันทึกไม่สำเร็จ';
    throw new Error(message);
  }
  await loadOverview();
  render();
  alert(`บันทึกแล้ว: ${data.transaction.title} ${formatMoney(data.transaction.amount)}`);
  return data.transaction;
}

async function updateDashboardTransaction(id, payload) {
  const response = await fetch(`/api/liff/transactions/${encodeURIComponent(id)}?${liffQueryParams().toString()}`, {
    method: 'PATCH',
    headers: liffHeaders(true),
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'แก้ไขไม่สำเร็จ');
  }
  return data.transaction;
}

async function deleteDashboardTransaction(id) {
  const response = await fetch(`/api/liff/transactions/${encodeURIComponent(id)}?${liffQueryParams().toString()}`, {
    method: 'DELETE',
    headers: liffHeaders()
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'ลบรายการไม่สำเร็จ');
  }
  return data.transaction;
}

async function createDashboardBudget(payload) {
  const response = await fetch(`/api/liff/budgets?${liffQueryParams().toString()}`, {
    method: 'POST',
    headers: liffHeaders(true),
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'ตั้งงบไม่สำเร็จ');
  }
  await loadOverview();
  render();
  alert('ตั้งงบแล้ว');
  return data.budget;
}

async function createDashboardGoal(payload) {
  const response = await fetch(`/api/liff/goals?${liffQueryParams().toString()}`, {
    method: 'POST',
    headers: liffHeaders(true),
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'ตั้งเป้าไม่สำเร็จ');
  }
  await loadOverview();
  render();
  alert(`ตั้งเป้าแล้ว ต้องเก็บประมาณ ${formatMoney(data.goal.monthlySaving)}/เดือน`);
  return data.goal;
}

async function addDashboardGoalSaving(id, payload) {
  const response = await fetch(`/api/liff/goals/${encodeURIComponent(id)}/savings?${liffQueryParams().toString()}`, {
    method: 'POST',
    headers: liffHeaders(true),
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'ออมเข้าเป้าไม่สำเร็จ');
  }
  upsertLocalGoal(data.goal);
  render();
  refreshOverviewQuietly();
  alert(data.goal.percent >= 100 ? 'ถึงเป้าหมายแล้ว เก่งมาก!' : `ออมเพิ่มแล้ว: ${formatMoney(data.savedAmount)}`);
  return data.goal;
}

async function createDashboardDebt(payload) {
  const response = await fetch(`/api/liff/debts?${liffQueryParams().toString()}`, {
    method: 'POST',
    headers: liffHeaders(true),
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'เพิ่มหนี้ไม่สำเร็จ');
  }
  await loadOverview();
  render();
  alert(`เพิ่มหนี้แล้ว: ${data.debt.name} ${formatMoney(data.debt.remainingAmount)}`);
  return data.debt;
}

async function payDashboardDebt(id, payload) {
  const response = await fetch(`/api/liff/debts/${encodeURIComponent(id)}/payments?${liffQueryParams().toString()}`, {
    method: 'POST',
    headers: liffHeaders(true),
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'จ่ายหนี้ไม่สำเร็จ');
  }
  upsertLocalDebt(data.debt);
  render();
  refreshOverviewQuietly();
  alert(data.debt.status === 'paid' ? 'ปิดหนี้ก้อนนี้แล้ว' : `จ่ายแล้ว: ${formatMoney(data.payment.amount)}`);
  return data;
}

async function cancelDashboardDebt(id) {
  const response = await fetch(`/api/liff/debts/${encodeURIComponent(id)}?${liffQueryParams().toString()}`, {
    method: 'DELETE',
    headers: liffHeaders()
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'ยกเลิกหนี้ไม่สำเร็จ');
  }
  upsertLocalDebt(data.debt);
  render();
  refreshOverviewQuietly();
  return data.debt;
}

async function downloadDashboardCsv(scope = 'month') {
  const response = await fetch(`/api/liff/export?scope=${encodeURIComponent(scope)}&${liffQueryParams().toString()}`, {
    headers: liffHeaders()
  });
  if (!response.ok) {
    throw new Error('export ไม่สำเร็จ');
  }
  const csv = await response.text();
  const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `line-expense-${scope}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function downloadDashboardPdfBlobFallback(options = {}) {
  const scope = options.scope || 'month';
  const params = liffQueryParams();
  params.set('scope', scope);
  if (options.title) params.set('title', options.title);
  if (options.note) params.set('note', options.note);

  const response = await fetch(`/api/liff/export.pdf?${params.toString()}`, {
    headers: liffHeaders()
  });
  if (!response.ok) {
    throw new Error('export PDF ไม่สำเร็จ');
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `line-expense-${scope}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function downloadDashboardPdf(options = {}) {
  const response = await fetch(`/api/liff/export.pdf/link?${liffQueryParams().toString()}`, {
    method: 'POST',
    headers: liffHeaders(true),
    body: JSON.stringify({
      scope: options.scope || 'month',
      title: options.title || '',
      note: options.note || ''
    })
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'export PDF ไม่สำเร็จ');
  }
  openExternalUrl(data.url);
}

function openExternalUrl(url) {
  if (!url) return;
  if (window.liff && typeof liff.isInClient === 'function' && liff.isInClient() && typeof liff.openWindow === 'function') {
    liff.openWindow({ url, external: true });
    return;
  }
  const opened = window.open(url, '_blank', 'noopener');
  if (!opened) {
    window.location.assign(url);
  }
}

function render() {
  const data = state.data;
  const topCategory = data.categories[0] ? data.categories[0].category : 'ยังไม่มีหมวดเด่น';
  const todayNet = data.todayTotals.net;
  document.getElementById('app').innerHTML = `
    <main class="app view-${state.activeView}">
      <section class="topbar">
        <div class="profile">
          ${profilePicture()}
          <div>
            <div class="name">${escapeHtml(profileName())}</div>
            <div class="date">วันนี้ ${escapeHtml(data.displayToday)}</div>
          </div>
        </div>
        <button class="bell" type="button" data-command="วิเคราะห์เดือนนี้" aria-label="คำแนะนำ">${iconGraphic('insight')}</button>
      </section>

      <section class="hero">
        <div class="hero-copy">
          <div class="hero-label">คงเหลือสุทธิเดือนนี้</div>
          <div class="net">${formatMoney(data.totals.net)}</div>
          <div class="hero-note">${todayNet >= 0 ? '😺 วันนี้ยังคุมงบได้ดี' : '🙀 วันนี้รายจ่ายมากกว่ารายรับ'} · ${escapeHtml(topCategory)}</div>
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

      <section class="panel smart-panel">
        ${renderSmartInsights(data.smartInsights)}
      </section>

      ${renderViewSwitcher()}

      <section class="section-title overview-section">
        <h2>เมนูบัญชี</h2>
        <small>${escapeHtml(data.month)}</small>
      </section>
      <section class="menu-grid overview-section">
        ${menuCard('expense', 'จ่าย', 'บันทึกรายจ่าย', 'พิมพ์ไว', 'open-expense')}
        ${menuCard('income', 'รับ', 'บันทึกรายรับ', 'เงินเข้า', 'open-income')}
        ${menuCard('slip', 'สลิป', 'ส่งสลิป/บิล', 'ตรวจ QR', 'slip-help')}
        ${menuCard('today', 'วันนี้', 'สรุปวันนี้', 'ยอดรวม', 'สรุปวันนี้')}
        ${menuCard('chart', 'กราฟ', 'กราฟรายจ่าย', 'ตามหมวด', 'view-reports')}
        ${menuCard('edit', 'แก้', 'รายการเดือนนี้', 'กรอง/แก้/ลบ', 'view-transactions')}
        ${menuCard('budget', 'งบ', 'ตั้งงบ', 'คุมใช้จ่าย', 'open-budget')}
        ${menuCard('goal', 'เป้า', 'ตั้งเป้า', 'เงินเก็บ', 'open-goal')}
        ${menuCard('debt', 'หนี้', 'หนี้สิน', 'จ่าย/ติดตาม', 'view-finance')}
        ${menuCard('export', 'CSV', 'Export', 'เปิด Excel', 'export-month')}
        ${menuCard('pdf', 'PDF', 'รายงาน PDF', 'สรุปพร้อมส่ง', 'open-export-pdf')}
      </section>

      <section class="section-title overview-section">
        <h2>วันนี้</h2>
        <small>รายรับ/รายจ่าย</small>
      </section>
      <section class="panel today-panel overview-section">
        <div><span>รับวันนี้</span><strong class="income-text">${formatMoney(data.todayTotals.income)}</strong></div>
        <div><span>จ่ายวันนี้</span><strong class="expense-text">${formatMoney(data.todayTotals.expense)}</strong></div>
        <div><span>สุทธิวันนี้</span><strong>${formatMoney(data.todayTotals.net)}</strong></div>
      </section>

      <section class="section-title overview-section">
        <h2>เป้าหมายเดือนนี้</h2>
        <small>ใช้ได้อีกเท่าไหร่</small>
      </section>
      <section class="panel overview-section">
        ${renderSpendingPlan(data.spendingPlan)}
      </section>

      <section id="finance-start" class="section-title finance-section">
        <h2>งบประมาณ</h2>
        <button class="text-action" type="button" data-open="budget">ตั้งงบ</button>
      </section>
      <section class="panel finance-section">
        ${renderBudgets(data.budgets)}
      </section>

      <section class="section-title finance-section">
        <h2>เป้าหมายเก็บเงิน</h2>
        <button class="text-action" type="button" data-open="goal">ตั้งเป้า</button>
      </section>
      <section class="panel finance-section">
        ${renderGoals(data.goals)}
      </section>

      <section id="debts" class="section-title finance-section">
        <h2>หนี้สิน</h2>
        <button class="text-action" type="button" data-open="debt">เพิ่มหนี้</button>
      </section>
      <section class="panel finance-section">
        ${renderDebts(data.debts, data.debtSummary)}
      </section>

      <section id="reports-start" class="section-title reports-section">
        <h2>คู่มือเร็ว</h2>
        <small>ตัวอย่างใช้งานจริง</small>
      </section>
      <section class="panel reports-section">
        ${renderDashboardGuide()}
      </section>

      <section id="chart" class="section-title reports-section">
        <h2>กราฟรายจ่าย</h2>
        <small>ตามหมวด</small>
      </section>
      <section class="panel reports-section">
        ${renderCategoryBars(data.categories)}
      </section>

      <section class="section-title reports-section">
        <h2>รายงานเดือนนี้</h2>
        <small>สรุปพร้อมคำแนะนำ</small>
      </section>
      <section class="panel report-card reports-section">
        ${renderMonthlyReport(data.monthlyReport)}
      </section>

      <section id="edit" class="section-title transactions-section">
        <h2>รายการเดือนนี้</h2>
        <button class="text-action" type="button" data-scroll="edit">กรองแล้วจัดการได้เลย</button>
      </section>
      <section class="panel transactions-section">
        ${renderTransactionFilters(data.transactions || data.recentSevenDays)}
        ${renderTransactions(getFilteredTransactions(data.transactions || data.recentSevenDays))}
      </section>
    </main>

    <nav class="tabbar">
      ${bottomTab('overview', 'home', 'หน้าหลัก')}
      ${bottomTab('transactions', 'edit', 'รายการ')}
      ${bottomTab('finance', 'debt', 'หนี้/เป้า')}
      ${bottomTab('reports', 'chart', 'รายงาน')}
    </nav>

    <div id="quickModal" class="modal">
      <form class="sheet" id="quickForm">
        <h3 id="modalTitle">บันทึกรายจ่าย</h3>
        <p class="sheet-hint" id="modalHint">พิมพ์รายการแล้วบันทึกเข้าบัญชีทันที</p>
        <input id="quickText" autocomplete="off" placeholder="เช่น กาแฟ 45">
        ${categoryPicker('quickCategory', '', 'เลือกหมวด')}
        <div class="sheet-actions">
          <button class="secondary" type="button" id="closeModal">ยกเลิก</button>
          <button class="primary" type="submit" id="submitBtn">บันทึก</button>
        </div>
      </form>
    </div>

    <div id="editModal" class="modal">
      <form class="sheet edit-sheet" id="editForm">
        <h3>แก้ไขรายการ</h3>
        <p class="sheet-hint">ปรับข้อมูลได้ทุกช่อง แล้วกดบันทึก</p>
        <label>ชื่อรายการ<input id="editTitle" autocomplete="off"></label>
        <label>ยอดเงิน<input id="editAmount" type="number" min="0.01" step="0.01"></label>
        <label>ประเภท<select id="editType">
          <option value="expense">รายจ่าย</option>
          <option value="income">รายรับ</option>
          <option value="transfer">โอนเงิน</option>
        </select></label>
        ${categoryPicker('editCategory', '', 'เลือกหมวด')}
        <label>วันที่<input id="editDate" type="date"></label>
        <label>โน้ต<input id="editNote" autocomplete="off"></label>
        <div class="sheet-actions three">
          <button class="secondary" type="button" id="closeEditModal">ยกเลิก</button>
          <button class="danger" type="button" id="deleteEditBtn">ลบ</button>
          <button class="primary" type="submit" id="saveEditBtn">บันทึก</button>
        </div>
      </form>
    </div>

    <div id="budgetModal" class="modal">
      <form class="sheet" id="budgetForm">
        <h3>ตั้งงบประมาณ</h3>
        <p class="sheet-hint">ใช้ "ทั้งหมด" สำหรับงบรวม หรือใส่ชื่อหมวด เช่น อาหาร</p>
        ${categoryPicker('budgetCategory', 'ทั้งหมด', 'เลือกหมวดงบ', { includeAll: true })}
        <label>วงเงิน<input id="budgetAmount" type="number" min="1" step="1" placeholder="8000"></label>
        <div class="sheet-actions">
          <button class="secondary" type="button" id="closeBudgetModal">ยกเลิก</button>
          <button class="primary" type="submit" id="saveBudgetBtn">ตั้งงบ</button>
        </div>
      </form>
    </div>

    <div id="goalModal" class="modal">
      <form class="sheet" id="goalForm">
        <h3>ตั้งเป้าเก็บเงิน</h3>
        <p class="sheet-hint">ระบบจะคำนวณยอดที่ควรเก็บต่อเดือนให้</p>
        <label>ชื่อเป้าหมาย<input id="goalName" autocomplete="off" placeholder="iPad"></label>
        <label>ยอดเป้าหมาย<input id="goalAmount" type="number" min="1" step="1" placeholder="18000"></label>
        <label>จำนวนเดือน<input id="goalMonths" type="number" min="1" max="120" step="1" placeholder="6"></label>
        <div class="sheet-actions">
          <button class="secondary" type="button" id="closeGoalModal">ยกเลิก</button>
          <button class="primary" type="submit" id="saveGoalBtn">ตั้งเป้า</button>
        </div>
      </form>
    </div>

    <div id="goalSavingModal" class="modal">
      <form class="sheet" id="goalSavingForm">
        <h3 id="goalSavingTitle">ออมเข้าเป้า</h3>
        <p class="sheet-hint" id="goalSavingHint">กรอกยอดที่เก็บเพิ่ม ระบบจะอัปเดตความคืบหน้าให้ทันที</p>
        <label>ยอดที่ออมเพิ่ม<input id="goalSavingAmount" type="number" min="1" step="1" placeholder="500"></label>
        <div class="sheet-actions">
          <button class="secondary" type="button" id="closeGoalSavingModal">ยกเลิก</button>
          <button class="primary" type="submit" id="saveGoalSavingBtn">บันทึกยอดออม</button>
        </div>
      </form>
    </div>

    <div id="debtModal" class="modal">
      <form class="sheet" id="debtForm">
        <h3>เพิ่มหนี้สิน</h3>
        <p class="sheet-hint">ใช้สำหรับบัตรเครดิต เงินยืม ผ่อนของ หรือเงินที่คนอื่นยืมเรา</p>
        <label>ชื่อหนี้<input id="debtName" autocomplete="off" placeholder="บัตรเครดิต / ผ่อนมือถือ"></label>
        <label>ยอดตั้งต้น<input id="debtAmount" type="number" min="1" step="1" placeholder="12000"></label>
        <label>ประเภท<select id="debtType">
          <option value="credit_card">บัตรเครดิต</option>
          <option value="installment">ผ่อนสินค้า</option>
          <option value="loan">เงินกู้/หนี้ทั่วไป</option>
          <option value="borrowed">เรายืมคนอื่น</option>
          <option value="lent">คนอื่นยืมเรา</option>
          <option value="custom">ประเภทอื่น ๆ</option>
        </select></label>
        <label id="debtCustomTypeRow" class="hidden">พิมพ์ประเภทหนี้เอง<input id="debtCustomType" autocomplete="off" placeholder="เช่น กยศ., ผ่อนรถ, ยืมครอบครัว"></label>
        <label>ครบกำหนดทุกวันที่<input id="debtDueDay" type="number" min="1" max="31" step="1" placeholder="25"></label>
        <label>ยอดจ่ายขั้นต่ำ/งวด<input id="debtMinimumPayment" type="number" min="0" step="1" placeholder="1500"></label>
        <label>โน้ต<input id="debtNote" autocomplete="off" placeholder="เช่น ดอก 0%, จ่ายผ่านแอป"></label>
        <div class="sheet-actions">
          <button class="secondary" type="button" id="closeDebtModal">ยกเลิก</button>
          <button class="primary" type="submit" id="saveDebtBtn">เพิ่มหนี้</button>
        </div>
      </form>
    </div>

    <div id="debtPaymentModal" class="modal">
      <form class="sheet" id="debtPaymentForm">
        <h3 id="debtPaymentTitle">จ่ายหนี้</h3>
        <p class="sheet-hint" id="debtPaymentHint">กรอกยอดที่จ่าย ระบบจะลดยอดคงเหลือให้</p>
        <label>ยอดที่จ่าย<input id="debtPaymentAmount" type="number" min="1" step="1" placeholder="1000"></label>
        <label class="check-row">
          <input id="debtCreateTransaction" type="checkbox" checked>
          <span>ลงเป็นรายการรายรับ/รายจ่ายในบัญชีด้วย</span>
        </label>
        <label>โน้ต<input id="debtPaymentNote" autocomplete="off" placeholder="เช่น งวดเดือนนี้"></label>
        <div class="sheet-actions">
          <button class="secondary" type="button" id="closeDebtPaymentModal">ยกเลิก</button>
          <button class="primary" type="submit" id="saveDebtPaymentBtn">บันทึกการจ่าย</button>
        </div>
      </form>
    </div>

    <div id="exportPdfModal" class="modal">
      <form class="sheet" id="exportPdfForm">
        <h3>Export PDF</h3>
        <p class="sheet-hint">สร้างรายงานสรุปบัญชีเป็น PDF มีภาพรวม หมวดเด่น และรายการล่าสุด</p>
        <label>ช่วงข้อมูล<select id="pdfScope">
          <option value="month">เดือนนี้</option>
          <option value="all">ทั้งหมด</option>
        </select></label>
        <label>ชื่อรายงาน<input id="pdfTitle" autocomplete="off" placeholder="เช่น รายงานบัญชีส่วนตัว"></label>
        <label>หมายเหตุ<input id="pdfNote" autocomplete="off" placeholder="เช่น ใช้ส่งให้ตัวเองหรือครอบครัว"></label>
        <div class="sheet-actions">
          <button class="secondary" type="button" id="closeExportPdfModal">ยกเลิก</button>
          <button class="primary" type="submit" id="saveExportPdfBtn">ดาวน์โหลด PDF</button>
        </div>
      </form>
    </div>

    <div id="imageModal" class="modal">
      <div class="sheet image-sheet">
        <h3>รูปแนบรายการ</h3>
        <p class="sheet-hint">สลิป/บิลเดิมที่ใช้บันทึกรายการนี้</p>
        <div id="imagePreview" class="image-preview">กำลังโหลดรูป</div>
        <div class="sheet-actions">
          <button class="secondary" type="button" id="closeImageModal">ปิด</button>
        </div>
      </div>
    </div>
  `;

  bindEvents();
}

function renderViewSwitcher() {
  return `
    <section class="view-switcher" aria-label="เลือกมุมมอง Dashboard">
      ${viewTab('overview', 'ภาพรวม', 'เมนูด่วน', 'home')}
      ${viewTab('transactions', 'รายการ', 'แก้/กรอง', 'edit')}
      ${viewTab('finance', 'หนี้/เป้า', 'คุมเงิน', 'debt')}
      ${viewTab('reports', 'รายงาน', 'กราฟ/PDF', 'chart')}
    </section>
  `;
}

function viewTab(key, label, hint, iconName) {
  const active = state.activeView === key ? ' active' : '';
  return `
    <button class="view-tab${active}" type="button" data-view="${key}">
      <span class="view-tab-icon">${iconGraphic(iconName)}</span>
      <strong>${escapeHtml(label)}</strong>
      <small>${escapeHtml(hint)}</small>
    </button>
  `;
}

function bottomTab(key, iconName, label) {
  const active = state.activeView === key ? 'active' : '';
  return `
    <button class="${active}" type="button" data-view="${key}">
      <span class="tab-icon">${iconGraphic(iconName)}</span>
      <span>${escapeHtml(label)}</span>
    </button>
  `;
}

function navigateView(view) {
  state.activeView = view || 'overview';
  const sectionByView = {
    overview: 'top',
    transactions: 'edit',
    finance: 'finance-start',
    reports: 'reports-start'
  };
  render();
  scrollToSection(sectionByView[state.activeView] || 'top');
}

function menuCard(iconClass, iconText, label, hint, action) {
  const attr = action.startsWith('scroll-')
    ? `data-scroll="${action.replace('scroll-', '')}"`
    : action.startsWith('open-')
      ? `data-open="${action.replace('open-', '')}"`
      : action.startsWith('view-')
        ? `data-view="${action.replace('view-', '')}"`
        : `data-command="${escapeHtml(action)}"`;
  return `
    <button class="menu-card" type="button" ${attr}>
      <div class="icon ${iconClass}" aria-hidden="true">${iconGraphic(iconClass, iconText)}</div>
      <span>${escapeHtml(label)}</span>
      <small>${escapeHtml(hint)}</small>
    </button>
  `;
}

function iconGraphic(name, fallback = '') {
  const icons = {
    expense: `
      <svg viewBox="0 0 48 48" role="img" aria-label="รายจ่าย">
        <path d="M11 14h26a5 5 0 0 1 5 5v16a5 5 0 0 1-5 5H11a5 5 0 0 1-5-5V19a5 5 0 0 1 5-5Z"/>
        <path d="M13 14V10a5 5 0 0 1 5-5h16"/>
        <path d="M34 27h8"/>
        <path d="M23 22v10"/>
        <path d="m18 27 5 5 5-5"/>
      </svg>`,
    income: `
      <svg viewBox="0 0 48 48" role="img" aria-label="รายรับ">
        <circle cx="24" cy="24" r="16"/>
        <path d="M24 14v20"/>
        <path d="M18 20c1.5-3 10.5-3 12 1.5 1.7 5-10.8 3.5-9 8.5 1.3 3.7 9.5 3.1 11-.5"/>
        <path d="m9 14 7-7 7 7"/>
      </svg>`,
    slip: `
      <svg viewBox="0 0 48 48" role="img" aria-label="สลิป">
        <path d="M13 5h22v38l-5-3-6 3-6-3-5 3V5Z"/>
        <path d="M18 16h12"/>
        <path d="M18 24h14"/>
        <path d="M18 32h9"/>
        <path d="M34 34h7v7h-7z"/>
      </svg>`,
    today: `
      <svg viewBox="0 0 48 48" role="img" aria-label="วันนี้">
        <path d="M10 12h28a4 4 0 0 1 4 4v22a4 4 0 0 1-4 4H10a4 4 0 0 1-4-4V16a4 4 0 0 1 4-4Z"/>
        <path d="M6 20h36"/>
        <path d="M16 7v8"/>
        <path d="M32 7v8"/>
        <path d="m17 31 5 5 10-12"/>
      </svg>`,
    chart: `
      <svg viewBox="0 0 48 48" role="img" aria-label="กราฟ">
        <path d="M8 40h34"/>
        <path d="M13 34V22"/>
        <path d="M24 34V13"/>
        <path d="M35 34V18"/>
        <path d="m12 15 8-6 9 7 8-10"/>
      </svg>`,
    edit: `
      <svg viewBox="0 0 48 48" role="img" aria-label="แก้ไข">
        <path d="M10 38h28"/>
        <path d="M15 33 34 14l5 5-19 19-7 2 2-7Z"/>
        <path d="m30 18 5 5"/>
        <path d="M12 12h13"/>
      </svg>`,
    budget: `
      <svg viewBox="0 0 48 48" role="img" aria-label="งบประมาณ">
        <path d="M9 14h30v25H9z"/>
        <path d="M13 14V9h22v5"/>
        <path d="M16 24h16"/>
        <path d="M16 31h10"/>
        <circle cx="35" cy="31" r="5"/>
      </svg>`,
    goal: `
      <svg viewBox="0 0 48 48" role="img" aria-label="เป้าหมาย">
        <circle cx="24" cy="24" r="17"/>
        <circle cx="24" cy="24" r="10"/>
        <circle cx="24" cy="24" r="3"/>
        <path d="m30 18 10-10"/>
        <path d="M36 8h4v4"/>
      </svg>`,
    debt: `
      <svg viewBox="0 0 48 48" role="img" aria-label="หนี้สิน">
        <path d="M12 7h21l6 6v28H12z"/>
        <path d="M33 7v8h6"/>
        <path d="M18 20h13"/>
        <path d="M18 28h10"/>
        <path d="M18 36h6"/>
        <circle cx="34" cy="34" r="7"/>
        <path d="M34 30v8"/>
        <path d="M30 34h8"/>
      </svg>`,
    export: `
      <svg viewBox="0 0 48 48" role="img" aria-label="Export CSV">
        <path d="M14 5h15l8 8v30H14z"/>
        <path d="M29 5v9h8"/>
        <path d="M20 27h8"/>
        <path d="M24 19v16"/>
        <path d="m18 29 6 6 6-6"/>
      </svg>`,
    pdf: `
      <svg viewBox="0 0 48 48" role="img" aria-label="Export PDF">
        <path d="M13 5h17l7 7v31H13z"/>
        <path d="M30 5v8h7"/>
        <path d="M18 22h14"/>
        <path d="M18 29h14"/>
        <path d="M18 36h8"/>
        <path d="M9 18h11v15H9z"/>
        <path d="M12 23h5"/>
        <path d="M12 28h4"/>
      </svg>`,
    insight: `
      <svg viewBox="0 0 48 48" role="img" aria-label="คำแนะนำ">
        <path d="M24 5v7"/>
        <path d="M24 36v7"/>
        <path d="M5 24h7"/>
        <path d="M36 24h7"/>
        <path d="m11 11 5 5"/>
        <path d="m32 32 5 5"/>
        <path d="m37 11-5 5"/>
        <path d="m16 32-5 5"/>
        <circle cx="24" cy="24" r="7"/>
      </svg>`,
    home: `
      <svg viewBox="0 0 48 48" role="img" aria-label="หน้าหลัก">
        <path d="M7 23 24 8l17 15"/>
        <path d="M13 21v20h22V21"/>
        <path d="M20 41V29h8v12"/>
      </svg>`
  };
  return icons[name] || `<span>${escapeHtml(fallback)}</span>`;
}

function categoryPicker(id, value = '', label = 'เลือกหมวด', options = {}) {
  const categories = options.includeAll
    ? STANDARD_CATEGORIES
    : STANDARD_CATEGORIES.filter((category) => category !== 'ทั้งหมด');
  return `
    <div class="category-field" data-category-field="${id}">
      <div class="category-label">${escapeHtml(label)}</div>
      <input id="${id}" type="hidden" value="${escapeHtml(value)}">
      <div class="category-choice-grid">
        ${categories.map((category) => `
          <button class="category-choice${category === value ? ' selected' : ''}" type="button" data-category-target="${id}" data-category-value="${escapeHtml(category)}">${escapeHtml(category)}</button>
        `).join('')}
        <button class="category-choice add-choice" type="button" data-category-custom="${id}">+ เพิ่มหมวด</button>
      </div>
      <div class="category-current" data-category-current="${id}">${value ? `เลือกอยู่: ${escapeHtml(value)}` : 'ยังไม่ได้เลือกหมวด ระบบจะเดาให้อัตโนมัติ'}</div>
    </div>
  `;
}

function setCategoryValue(id, value) {
  const input = document.getElementById(id);
  if (!input) return;
  const normalized = String(value || '').trim();
  input.value = normalized;

  document.querySelectorAll(`[data-category-target="${id}"]`).forEach((button) => {
    button.classList.toggle('selected', button.dataset.categoryValue === normalized);
  });

  const current = document.querySelector(`[data-category-current="${id}"]`);
  if (current) {
    current.textContent = normalized ? `เลือกอยู่: ${normalized}` : 'ยังไม่ได้เลือกหมวด ระบบจะเดาให้อัตโนมัติ';
  }
}

function suggestCategoryFromText(text = '') {
  const normalized = text.toLowerCase();
  const match = CATEGORY_SUGGESTIONS.find((rule) => (
    rule.keywords.some((keyword) => normalized.includes(keyword.toLowerCase()))
  ));
  return match ? match.category : '';
}

function maybeSuggestEditCategory() {
  const title = document.getElementById('editTitle');
  const type = document.getElementById('editType');
  const category = document.getElementById('editCategory');
  if (!title || !type || !category || type.value !== 'expense') return;

  const suggestion = suggestCategoryFromText(title.value);
  const weakCategories = ['อาหาร', 'อื่นๆ', 'ของใช้'];
  if (suggestion && (weakCategories.includes(category.value) || !category.value)) {
    setCategoryValue('editCategory', suggestion);
  }
}

function bindCategoryPickers() {
  document.querySelectorAll('[data-category-target]').forEach((button) => {
    button.addEventListener('click', () => {
      setCategoryValue(button.dataset.categoryTarget, button.dataset.categoryValue);
    });
  });

  document.querySelectorAll('[data-category-custom]').forEach((button) => {
    button.addEventListener('click', () => {
      const target = button.dataset.categoryCustom;
      const currentValue = document.getElementById(target).value;
      const value = prompt('พิมพ์ชื่อหมวดที่ต้องการเพิ่ม', currentValue && !STANDARD_CATEGORIES.includes(currentValue) ? currentValue : '');
      if (value === null) return;
      const trimmed = value.trim().slice(0, 80);
      if (trimmed) setCategoryValue(target, trimmed);
    });
  });
}

function renderSmartInsights(smartInsights) {
  const data = smartInsights || {};
  const insights = data.insights || [];
  const warnings = data.warnings || [];
  const recommendations = data.recommendations || [];
  return `
    <div class="smart-head">
      <span>AI แนะนำ</span>
      <strong>${escapeHtml(data.headline || 'พร้อมช่วยดูเงินให้')}</strong>
    </div>
    <div class="smart-list">
      ${[...warnings, ...recommendations, ...insights].slice(0, 4).map((item) => `
        <div class="smart-item">${escapeHtml(item)}</div>
      `).join('')}
    </div>
  `;
}

function renderSpendingPlan(plan = {}) {
  const hasBudget = Number(plan.budgetAmount || 0) > 0;
  const remaining = Number(plan.remainingExpense || 0);
  const statusText = plan.status === 'over'
    ? `เกินงบแล้ว ${formatMoney(Math.abs(remaining))}`
    : `ยังใช้ได้อีก ${formatMoney(remaining)}`;
  return `
    <div class="plan-grid">
      <div class="plan-main ${plan.status === 'over' ? 'over' : ''}">
        <span>${hasBudget ? 'งบเดือนนี้' : 'ประเมินจากรายรับสุทธิ'}</span>
        <strong>${statusText}</strong>
      </div>
      <div class="plan-mini">
        <span>ใช้ได้ต่อวัน</span>
        <strong>${formatMoney(plan.dailyAllowance || 0)}</strong>
      </div>
      <div class="plan-mini">
        <span>เหลือในเดือน</span>
        <strong>${money.format(plan.daysLeft || 1)} วัน</strong>
      </div>
      <div class="plan-mini">
        <span>เป้าเงินเหลือ</span>
        <strong>${formatMoney(plan.targetNet || 0)}</strong>
      </div>
    </div>
  `;
}

function renderMonthlyReport(report = {}) {
  const totals = report.totals || {};
  const tips = report.tips || [];
  const topItems = report.topItems || [];
  return `
    <div class="report-head">
      <span>ภาพรวมเดือนนี้</span>
      <strong>${escapeHtml(report.headline || 'ยังไม่มีข้อมูลพอสำหรับรายงาน')}</strong>
    </div>
    <div class="report-stats">
      <div><span>รับ</span><strong class="income-text">${formatMoney(totals.income)}</strong></div>
      <div><span>จ่าย</span><strong class="expense-text">${formatMoney(totals.expense)}</strong></div>
      <div><span>คงเหลือ</span><strong>${formatMoney(totals.net)}</strong></div>
    </div>
    <div class="report-subtitle">รายการจ่ายก้อนใหญ่</div>
    <div class="report-list">
      ${topItems.length ? topItems.map((item) => `
        <div class="report-row">
          <div>
            <strong>${escapeHtml(item.title)}</strong>
            <span>${escapeHtml(item.displayDate)} · ${escapeHtml(item.category)}</span>
          </div>
          <b>${formatMoney(item.amount)}</b>
        </div>
      `).join('') : '<div class="empty compact">ยังไม่มีรายจ่ายเดือนนี้</div>'}
    </div>
    <div class="report-subtitle">คำแนะนำ</div>
    <div class="smart-list">
      ${tips.length ? tips.map((tip) => `<div class="smart-item">${escapeHtml(tip)}</div>`).join('') : '<div class="smart-item">บันทึกเพิ่มอีกนิด ระบบจะเริ่มเห็นพฤติกรรมใช้เงินชัดขึ้น</div>'}
    </div>
  `;
}

function renderBudgets(budgets) {
  if (!budgets || !budgets.length) {
    return '<div class="empty">ยังไม่มีงบประมาณ กดตั้งงบเพื่อให้ระบบช่วยเตือน</div>';
  }
  return `
    <div class="budget-list">
      ${budgets.map((budget) => {
        const percent = Math.min(Math.max(Number(budget.percent || 0), 0), 999);
        const statusClass = percent >= 100 ? 'danger-fill' : percent >= 80 ? 'warn-fill' : 'ok-fill';
        return `
          <div class="budget-row">
            <div class="budget-top">
              <strong>${escapeHtml(budget.category)}</strong>
              <span>${percent}%</span>
            </div>
            <div class="budget-meta">ใช้ ${formatMoney(budget.spent)} / ${formatMoney(budget.amount)}</div>
            <div class="bar-track"><div class="bar-fill ${statusClass}" style="width:${Math.min(percent, 100)}%"></div></div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderGoals(goals) {
  if (!goals || !goals.length) {
    return '<div class="empty">ยังไม่มีเป้าหมาย ลองตั้งเป้า เช่น iPad 18000 ใน 6 เดือน</div>';
  }
  return `
    <div class="goal-list">
      ${goals.map((goal) => {
        const percent = Math.min(Math.max(Number(goal.percent || 0), 0), 100);
        const completed = percent >= 100;
        return `
          <div class="goal-row">
            <div class="goal-main">
              <div class="goal-heading">
                <strong>${escapeHtml(goal.name)}</strong>
                <span>${percent}%</span>
              </div>
              <div class="goal-progress" aria-label="ความคืบหน้า ${percent}%">
                <div class="goal-progress-fill" style="width:${percent}%"></div>
              </div>
              <div class="goal-meta">
                <span>เก็บแล้ว ${formatMoney(goal.currentAmount)}</span>
                <span>เหลือ ${formatMoney(goal.remaining)}</span>
              </div>
              <div class="tx-meta">ครบกำหนด ${escapeHtml(goal.displayDeadline)}</div>
            </div>
            <button class="mini-action goal-save-btn" type="button" data-goal-save-id="${escapeHtml(goal.id)}" ${completed ? 'disabled' : ''}>${completed ? 'ถึงเป้าแล้ว' : 'ออมเข้าเป้า'}</button>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderDebts(debts = [], summary = {}) {
  const activeDebts = debts.filter((debt) => debt.status === 'active');
  const paidDebts = debts.filter((debt) => debt.status === 'paid').slice(0, 3);
  const payableTotal = Number(summary.payableTotal || 0);
  const receivableTotal = Number(summary.receivableTotal || 0);

  return `
    <div class="debt-summary-grid">
      <div><span>ต้องจ่ายคืน</span><strong class="expense-text">${formatMoney(payableTotal)}</strong></div>
      <div><span>รอรับคืน</span><strong class="income-text">${formatMoney(receivableTotal)}</strong></div>
      <div><span>ใกล้ครบกำหนด</span><strong>${money.format(Number(summary.dueSoonCount || 0) + Number(summary.overdueCount || 0))}</strong></div>
    </div>
    ${activeDebts.length ? `
      <div class="debt-list">
        ${activeDebts.map((debt) => {
          const percent = Math.min(Math.max(Number(debt.percent || 0), 0), 100);
          const isReceivable = debt.type === 'lent';
          const statusClass = debt.computedStatus === 'overdue' ? 'overdue' : debt.computedStatus === 'due_soon' ? 'due-soon' : '';
          const statusText = debt.computedStatus === 'overdue' ? 'เลยกำหนด' : debt.computedStatus === 'due_soon' ? 'ใกล้ครบกำหนด' : 'ปกติ';
          return `
            <article class="debt-card ${statusClass}">
              <div class="debt-top">
                <div class="debt-title">
                  <span class="debt-badge ${isReceivable ? 'receivable' : 'payable'}">${isReceivable ? 'รอรับ' : 'ต้องจ่าย'}</span>
                  <strong>${escapeHtml(debt.name)}</strong>
                </div>
                <span class="debt-status">${statusText}</span>
              </div>
              <div class="debt-amount">${formatMoney(debt.remainingAmount)} <small>เหลือจาก ${formatMoney(debt.principalAmount)}</small></div>
              <div class="goal-progress" aria-label="จ่ายแล้ว ${percent}%">
                <div class="goal-progress-fill debt-progress" style="width:${percent}%"></div>
              </div>
              <div class="debt-percent">
                <span>ชำระแล้ว ${percent}%</span>
                <span>เหลือ ${Math.max(0, 100 - percent)}%</span>
              </div>
              <div class="debt-meta">
                <span>${escapeHtml(debt.typeLabel)}</span>
                <span>${escapeHtml(debt.displayDue || 'ไม่ตั้งวันครบกำหนด')}</span>
              </div>
              ${debt.minimumPayment ? `<div class="debt-meta"><span>งวดขั้นต่ำ ${formatMoney(debt.minimumPayment)}</span></div>` : ''}
              <div class="debt-actions">
                <button class="mini-action" type="button" data-debt-pay-id="${escapeHtml(debt.id)}">${isReceivable ? 'รับคืน' : 'จ่ายงวด'}</button>
                <button class="mini-action ghost" type="button" data-debt-cancel-id="${escapeHtml(debt.id)}">ปิด/ยกเลิก</button>
              </div>
            </article>
          `;
        }).join('')}
      </div>
    ` : '<div class="empty">ยังไม่มีหนี้สิน กดเพิ่มหนี้เพื่อเริ่มติดตามยอดคงเหลือและวันครบกำหนด</div>'}
    ${paidDebts.length ? `
      <div class="paid-debts">
        <strong>ปิดแล้วล่าสุด</strong>
        ${paidDebts.map((debt) => `<span>${escapeHtml(debt.name)} · ${formatMoney(debt.principalAmount)}</span>`).join('')}
      </div>
    ` : ''}
  `;
}

function renderDashboardGuide() {
  return `
    <div class="guide-grid">
      <div class="guide-card">
        <strong>บันทึกเร็ว</strong>
        <span>กาแฟ 45</span>
        <span>รับ เงินเดือน 18000</span>
      </div>
      <div class="guide-card">
        <strong>หนี้สิน</strong>
        <span>เพิ่มหนี้ บัตรเครดิต 12000 ครบกำหนด 25</span>
        <span>เพิ่มหนี้ กยศ 50000 ประเภท กยศ.</span>
        <span>จ่ายหนี้ บัตรเครดิต 3000</span>
      </div>
      <div class="guide-card">
        <strong>ดูภาพรวม</strong>
        <span>สรุปวันนี้</span>
        <span>วิเคราะห์เดือนนี้</span>
      </div>
      <div class="guide-card">
        <strong>จัดการ</strong>
        <span>แก้ไขรายการ</span>
        <span>export เดือนนี้</span>
      </div>
    </div>
  `;
}

function renderCategoryBars(categories) {
  if (!categories.length) return '<div class="empty">ยังไม่มีรายจ่ายเดือนนี้</div>';
  const max = Math.max(...categories.map((item) => Number(item.amount)), 1);
  const total = categories.reduce((sum, item) => sum + Number(item.amount || 0), 0) || 1;
  return `
    <div class="chart-list">
      ${categories.map((item, index) => {
        const amount = Number(item.amount || 0);
        const width = Math.max(8, (amount / max) * 100);
        const pct = Math.round((amount / total) * 100);
        const colorClass = `c${index % 6}`;
        return `
          <div class="bar-row">
            <div class="bar-label">${escapeHtml(item.category)}</div>
            <div class="bar-amount">${formatMoney(item.amount)}<span class="bar-pct">${pct}%</span></div>
            <div class="bar-track"><div class="bar-fill ${colorClass}" style="width:${width}%"></div></div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function uniqueTransactionCategories(rows) {
  const categories = rows
    .map((row) => row.category || 'อื่นๆ')
    .filter(Boolean);
  return [...new Set(categories)];
}

function getFilteredTransactions(rows) {
  const query = state.transactionFilter.search.trim().toLowerCase();
  return rows.filter((row) => {
    const periodMatches = matchesPeriod(row);
    const typeMatches = state.transactionFilter.type === 'all' || row.type === state.transactionFilter.type;
    const categoryMatches = state.transactionFilter.category === 'all' || row.category === state.transactionFilter.category;
    const searchMatches = !query || `${row.title || ''} ${row.category || ''} ${row.note || ''}`.toLowerCase().includes(query);
    return periodMatches && typeMatches && categoryMatches && searchMatches;
  });
}

function matchesPeriod(row) {
  const period = state.transactionFilter.period || 'month';
  if (period === 'month') return true;
  const date = String(row.transactionDate || '').slice(0, 10);
  const today = state.data && state.data.today ? state.data.today : new Date().toISOString().slice(0, 10);
  if (period === 'today') return date === today;
  if (period === '7d') {
    const from = new Date(`${today}T00:00:00+07:00`);
    from.setDate(from.getDate() - 6);
    return date >= formatDateOnly(from) && date <= today;
  }
  return true;
}

function formatDateOnly(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function filteredSummary(rows) {
  return rows.reduce((summary, row) => {
    const amount = Number(row.amount || 0);
    if (row.type === 'income') summary.income += amount;
    if (row.type === 'expense') summary.expense += amount;
    summary.count += 1;
    return summary;
  }, { count: 0, income: 0, expense: 0 });
}

function renderTransactionFilters(rows) {
  const categories = uniqueTransactionCategories(rows);
  const filteredRows = getFilteredTransactions(rows);
  const summary = filteredSummary(filteredRows);
  return `
    <div class="filter-panel">
      <div class="filter-row">
        ${filterButton('period', 'today', 'วันนี้')}
        ${filterButton('period', '7d', '7 วัน')}
        ${filterButton('period', 'month', 'เดือนนี้')}
      </div>
      <div class="filter-row">
        ${filterButton('type', 'all', 'ทั้งหมด')}
        ${filterButton('type', 'income', 'รายรับ')}
        ${filterButton('type', 'expense', 'รายจ่าย')}
      </div>
      <div class="filter-row category-filter-row">
        ${filterButton('category', 'all', 'ทุกหมวด')}
        ${categories.map((category) => filterButton('category', category, category)).join('')}
      </div>
      <label class="filter-search">
        <span>ค้นหารายการ</span>
        <input id="transactionSearch" type="search" value="${escapeHtml(state.transactionFilter.search)}" placeholder="เช่น กาแฟ, อาหาร, HOMEPRO">
      </label>
      <div class="filter-summary">
        <span>${money.format(summary.count)} รายการ</span>
        <span class="income-text">รับ ${formatMoney(summary.income)}</span>
        <span class="expense-text">จ่าย ${formatMoney(summary.expense)}</span>
      </div>
    </div>
  `;
}

function filterButton(kind, value, label) {
  const selected = state.transactionFilter[kind] === value;
  return `<button class="filter-chip${selected ? ' selected' : ''}" type="button" data-filter-kind="${kind}" data-filter-value="${escapeHtml(value)}">${escapeHtml(label)}</button>`;
}

function renderTransactions(rows) {
  if (!rows.length) return '<div class="empty">ไม่พบรายการตามตัวกรองนี้</div>';
  return `
    <div class="transaction-list">
      ${rows.map((row) => {
        const isIncome = row.type === 'income';
        const typeClass = isIncome ? 'income-text' : 'expense-text';
        const sign = isIncome ? '+' : '-';
        const badgeLabel = isIncome ? 'รับ' : 'จ่าย';
        return `
          <div class="tx">
            <div>
              <div class="tx-title">
                <span class="tx-badge ${isIncome ? 'income' : 'expense'}">${badgeLabel}</span>
                <span>${escapeHtml(row.title)}</span>
              </div>
              <div class="tx-meta">${escapeHtml(row.displayDate)} · ${escapeHtml(row.category)}</div>
            </div>
            <div class="tx-side">
              <div class="tx-amount ${typeClass}">${sign}${formatMoney(row.amount)}</div>
              <div class="tx-actions">
                ${row.hasImage ? `<button type="button" data-image-id="${escapeHtml(row.id)}" class="mini-action ghost">ดูรูป</button>` : ''}
                <button type="button" data-edit-id="${escapeHtml(row.id)}" class="mini-action">จัดการ</button>
              </div>
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
  document.querySelectorAll('[data-view]').forEach((button) => {
    button.addEventListener('click', () => navigateView(button.dataset.view));
  });
  document.querySelectorAll('[data-open]').forEach((button) => {
    button.addEventListener('click', () => openQuickModal(button.dataset.open));
  });
  document.querySelectorAll('[data-edit-id]').forEach((button) => {
    button.addEventListener('click', () => openEditModal(button.dataset.editId));
  });
  document.querySelectorAll('[data-image-id]').forEach((button) => {
    button.addEventListener('click', () => openImageModal(button.dataset.imageId));
  });
  document.querySelectorAll('[data-goal-save-id]').forEach((button) => {
    button.addEventListener('click', () => openGoalSavingModal(button.dataset.goalSaveId));
  });
  document.querySelectorAll('[data-debt-pay-id]').forEach((button) => {
    button.addEventListener('click', () => openDebtPaymentModal(button.dataset.debtPayId));
  });
  document.querySelectorAll('[data-debt-cancel-id]').forEach((button) => {
    button.addEventListener('click', () => handleCancelDebt(button.dataset.debtCancelId));
  });
  document.querySelectorAll('[data-filter-kind]').forEach((button) => {
    button.addEventListener('click', () => {
      state.transactionFilter[button.dataset.filterKind] = button.dataset.filterValue;
      state.activeView = 'transactions';
      render();
      scrollToSection('edit');
    });
  });
  const transactionSearch = document.getElementById('transactionSearch');
  if (transactionSearch) {
    transactionSearch.addEventListener('input', () => {
      state.transactionFilter.search = transactionSearch.value;
      state.activeView = 'transactions';
      render();
      scrollToSection('edit');
      const nextSearch = document.getElementById('transactionSearch');
      if (nextSearch) {
        nextSearch.focus();
        nextSearch.setSelectionRange(nextSearch.value.length, nextSearch.value.length);
      }
    });
  }
  bindCategoryPickers();

  document.getElementById('closeModal').addEventListener('click', closeQuickModal);
  document.getElementById('quickModal').addEventListener('click', (event) => {
    if (event.target.id === 'quickModal') closeQuickModal();
  });
  document.getElementById('closeEditModal').addEventListener('click', closeEditModal);
  document.getElementById('editModal').addEventListener('click', (event) => {
    if (event.target.id === 'editModal') closeEditModal();
  });
  document.getElementById('deleteEditBtn').addEventListener('click', handleDeleteEdit);
  document.getElementById('editForm').addEventListener('submit', handleSubmitEdit);
  document.getElementById('editTitle').addEventListener('input', maybeSuggestEditCategory);
  document.getElementById('editType').addEventListener('change', maybeSuggestEditCategory);
  document.getElementById('closeBudgetModal').addEventListener('click', closeBudgetModal);
  document.getElementById('budgetModal').addEventListener('click', (event) => {
    if (event.target.id === 'budgetModal') closeBudgetModal();
  });
  document.getElementById('budgetForm').addEventListener('submit', handleSubmitBudget);
  document.getElementById('closeGoalModal').addEventListener('click', closeGoalModal);
  document.getElementById('goalModal').addEventListener('click', (event) => {
    if (event.target.id === 'goalModal') closeGoalModal();
  });
  document.getElementById('goalForm').addEventListener('submit', handleSubmitGoal);
  document.getElementById('closeGoalSavingModal').addEventListener('click', closeGoalSavingModal);
  document.getElementById('goalSavingModal').addEventListener('click', (event) => {
    if (event.target.id === 'goalSavingModal') closeGoalSavingModal();
  });
  document.getElementById('goalSavingForm').addEventListener('submit', handleSubmitGoalSaving);
  document.getElementById('closeDebtModal').addEventListener('click', closeDebtModal);
  document.getElementById('debtModal').addEventListener('click', (event) => {
    if (event.target.id === 'debtModal') closeDebtModal();
  });
  document.getElementById('debtForm').addEventListener('submit', handleSubmitDebt);
  document.getElementById('debtType').addEventListener('change', syncDebtCustomType);
  document.getElementById('closeDebtPaymentModal').addEventListener('click', closeDebtPaymentModal);
  document.getElementById('debtPaymentModal').addEventListener('click', (event) => {
    if (event.target.id === 'debtPaymentModal') closeDebtPaymentModal();
  });
  document.getElementById('debtPaymentForm').addEventListener('submit', handleSubmitDebtPayment);
  document.getElementById('closeExportPdfModal').addEventListener('click', closeExportPdfModal);
  document.getElementById('exportPdfModal').addEventListener('click', (event) => {
    if (event.target.id === 'exportPdfModal') closeExportPdfModal();
  });
  document.getElementById('exportPdfForm').addEventListener('submit', handleSubmitExportPdf);
  document.getElementById('closeImageModal').addEventListener('click', closeImageModal);
  document.getElementById('imageModal').addEventListener('click', (event) => {
    if (event.target.id === 'imageModal') closeImageModal();
  });
  document.getElementById('quickForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const value = document.getElementById('quickText').value.trim();
    if (!value) return;
    const prefix = state.modalType === 'income' && !/^(รับ|รายรับ|ได้เงิน)/.test(value) ? 'รับ ' : '';
    const category = document.getElementById('quickCategory').value.trim();
    const categorySuffix = category ? ` หมวด ${category}` : '';
    const submitBtn = document.getElementById('submitBtn');
    submitBtn.disabled = true;
    try {
      await createDashboardTransaction(`${prefix}${value}${categorySuffix}`);
    } catch (error) {
      alert(error.message);
    } finally {
      if (document.getElementById('submitBtn')) {
        document.getElementById('submitBtn').disabled = false;
      }
    }
  });
}

function scrollToSection(id) {
  if (id === 'top') {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  const target = document.getElementById(id);
  if (target) {
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function openQuickModal(type) {
  if (type === 'budget') {
    openBudgetModal();
    return;
  }
  if (type === 'goal') {
    openGoalModal();
    return;
  }
  if (type === 'debt') {
    openDebtModal();
    return;
  }
  if (type === 'export-pdf') {
    openExportPdfModal();
    return;
  }
  state.modalType = type;
  const isIncome = type === 'income';
  document.getElementById('modalTitle').textContent = isIncome ? 'บันทึกรายรับ' : 'บันทึกรายจ่าย';
  document.getElementById('modalHint').textContent = isIncome
    ? 'พิมพ์รายรับ แล้วบันทึกเข้าบัญชีทันที'
    : 'พิมพ์รายจ่าย แล้วบันทึกเข้าบัญชีทันที';
  document.getElementById('quickText').placeholder = isIncome ? 'เช่น เงินเดือน 18000' : 'เช่น กาแฟ 45';
  document.getElementById('quickText').value = '';
  setCategoryValue('quickCategory', isIncome ? 'รายรับ' : '');

  const submitBtn = document.getElementById('submitBtn');
  submitBtn.textContent = isIncome ? 'บันทึกรายรับ' : 'บันทึกรายจ่าย';
  submitBtn.classList.toggle('expense', !isIncome);

  document.getElementById('quickModal').classList.add('open');
  setTimeout(() => document.getElementById('quickText').focus(), 50);
}

function closeQuickModal() {
  document.getElementById('quickModal').classList.remove('open');
}

function openBudgetModal() {
  setCategoryValue('budgetCategory', 'ทั้งหมด');
  document.getElementById('budgetAmount').value = '';
  document.getElementById('budgetModal').classList.add('open');
  setTimeout(() => document.getElementById('budgetAmount').focus(), 50);
}

function closeBudgetModal() {
  document.getElementById('budgetModal').classList.remove('open');
}

function openGoalModal() {
  document.getElementById('goalName').value = '';
  document.getElementById('goalAmount').value = '';
  document.getElementById('goalMonths').value = '';
  document.getElementById('goalModal').classList.add('open');
  setTimeout(() => document.getElementById('goalName').focus(), 50);
}

function closeGoalModal() {
  document.getElementById('goalModal').classList.remove('open');
}

function openGoalSavingModal(id) {
  const goal = findGoal(id);
  if (!goal) return;
  state.savingGoal = goal;
  document.getElementById('goalSavingTitle').textContent = `ออมเข้าเป้า: ${goal.name}`;
  document.getElementById('goalSavingHint').textContent = `เก็บแล้ว ${formatMoney(goal.currentAmount)} เหลือ ${formatMoney(goal.remaining)}`;
  document.getElementById('goalSavingAmount').value = '';
  document.getElementById('goalSavingModal').classList.add('open');
  setTimeout(() => document.getElementById('goalSavingAmount').focus(), 50);
}

function closeGoalSavingModal() {
  document.getElementById('goalSavingModal').classList.remove('open');
  state.savingGoal = null;
}

function openDebtModal() {
  document.getElementById('debtName').value = '';
  document.getElementById('debtAmount').value = '';
  document.getElementById('debtType').value = 'credit_card';
  document.getElementById('debtCustomType').value = '';
  syncDebtCustomType();
  document.getElementById('debtDueDay').value = '';
  document.getElementById('debtMinimumPayment').value = '';
  document.getElementById('debtNote').value = '';
  document.getElementById('debtModal').classList.add('open');
  setTimeout(() => document.getElementById('debtName').focus(), 50);
}

function closeDebtModal() {
  document.getElementById('debtModal').classList.remove('open');
}

function openDebtPaymentModal(id) {
  const debt = findDebt(id);
  if (!debt) return;
  state.payingDebt = debt;
  document.getElementById('debtPaymentTitle').textContent = `${debt.type === 'lent' ? 'รับคืน' : 'จ่ายหนี้'}: ${debt.name}`;
  document.getElementById('debtPaymentHint').textContent = `ยอดคงเหลือ ${formatMoney(debt.remainingAmount)}${debt.minimumPayment ? ` · งวดขั้นต่ำ ${formatMoney(debt.minimumPayment)}` : ''}`;
  document.getElementById('debtPaymentAmount').value = debt.minimumPayment ? Math.min(Number(debt.minimumPayment), Number(debt.remainingAmount)) : '';
  document.getElementById('debtCreateTransaction').checked = true;
  document.getElementById('debtPaymentNote').value = '';
  document.getElementById('debtPaymentModal').classList.add('open');
  setTimeout(() => document.getElementById('debtPaymentAmount').focus(), 50);
}

function closeDebtPaymentModal() {
  document.getElementById('debtPaymentModal').classList.remove('open');
  state.payingDebt = null;
}

function openExportPdfModal() {
  document.getElementById('pdfScope').value = 'month';
  document.getElementById('pdfTitle').value = `รายงานบัญชี ${state.month}`;
  document.getElementById('pdfNote').value = '';
  document.getElementById('exportPdfModal').classList.add('open');
  setTimeout(() => document.getElementById('pdfTitle').focus(), 50);
}

function closeExportPdfModal() {
  document.getElementById('exportPdfModal').classList.remove('open');
}

function findGoal(id) {
  const goals = (state.data && state.data.goals) || [];
  return goals.find((goal) => String(goal.id) === String(id));
}

function findDebt(id) {
  const debts = (state.data && state.data.debts) || [];
  return debts.find((debt) => String(debt.id) === String(id));
}

function upsertLocalGoal(goal) {
  if (!state.data || !goal) return;
  if (!Array.isArray(state.data.goals)) {
    state.data.goals = [goal];
    return;
  }
  const index = state.data.goals.findIndex((item) => String(item.id) === String(goal.id));
  if (index >= 0) {
    state.data.goals[index] = { ...state.data.goals[index], ...goal };
  } else {
    state.data.goals.push(goal);
  }
}

function upsertLocalDebt(debt) {
  if (!state.data || !debt) return;
  if (!Array.isArray(state.data.debts)) {
    state.data.debts = [debt];
    return;
  }
  const index = state.data.debts.findIndex((item) => String(item.id) === String(debt.id));
  if (index >= 0) {
    state.data.debts[index] = { ...state.data.debts[index], ...debt };
  } else {
    state.data.debts.push(debt);
  }
}

function findTransaction(id) {
  const rows = [
    ...((state.data && state.data.transactions) || []),
    ...((state.data && state.data.recentSevenDays) || []),
    ...((state.data && state.data.recent) || [])
  ];
  return rows.find((row) => String(row.id) === String(id));
}

function upsertLocalTransaction(transaction) {
  if (!state.data || !transaction) return;
  ['transactions', 'recentSevenDays', 'recent'].forEach((key) => {
    if (!Array.isArray(state.data[key])) return;
    state.data[key] = state.data[key].map((row) => (
      String(row.id) === String(transaction.id) ? { ...row, ...transaction } : row
    ));
  });
}

function removeLocalTransaction(id) {
  if (!state.data) return;
  ['transactions', 'recentSevenDays', 'recent'].forEach((key) => {
    if (!Array.isArray(state.data[key])) return;
    state.data[key] = state.data[key].filter((row) => String(row.id) !== String(id));
  });
}

async function refreshOverviewQuietly() {
  try {
    await loadOverview();
    render();
  } catch (error) {
    console.warn('Unable to refresh dashboard overview', error);
  }
}

async function openImageModal(id) {
  const transaction = findTransaction(id);
  if (!transaction || !transaction.imageUrl) {
    alert('รายการนี้ไม่มีรูปแนบ');
    return;
  }

  const modal = document.getElementById('imageModal');
  const preview = document.getElementById('imagePreview');
  modal.classList.add('open');
  preview.textContent = 'กำลังโหลดรูป';

  try {
    const response = await fetch(`${transaction.imageUrl}?${liffQueryParams().toString()}`, {
      headers: liffHeaders()
    });
    if (!response.ok) throw new Error('โหลดรูปไม่สำเร็จ');
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    preview.innerHTML = `<img src="${url}" alt="รูปแนบรายการ">`;
  } catch (error) {
    preview.textContent = error.message;
  }
}

function closeImageModal() {
  const preview = document.getElementById('imagePreview');
  const image = preview && preview.querySelector('img');
  if (image && image.src.startsWith('blob:')) URL.revokeObjectURL(image.src);
  document.getElementById('imageModal').classList.remove('open');
}

function openEditModal(id) {
  const transaction = findTransaction(id);
  if (!transaction) {
    alert('ไม่พบรายการนี้ ลองโหลดหน้าใหม่อีกครั้ง');
    return;
  }

  state.editingTransaction = transaction;
  document.getElementById('editTitle').value = transaction.title || '';
  document.getElementById('editAmount').value = Number(transaction.amount || 0);
  document.getElementById('editType').value = transaction.type || 'expense';
  setCategoryValue('editCategory', transaction.category || 'อื่นๆ');
  document.getElementById('editDate').value = transaction.transactionDate || '';
  document.getElementById('editNote').value = transaction.note || '';
  maybeSuggestEditCategory();
  document.getElementById('editModal').classList.add('open');
  setTimeout(() => document.getElementById('editTitle').focus(), 50);
}

function closeEditModal() {
  state.editingTransaction = null;
  document.getElementById('editModal').classList.remove('open');
}

async function handleSubmitEdit(event) {
  event.preventDefault();
  if (!state.editingTransaction) return;

  const saveBtn = document.getElementById('saveEditBtn');
  saveBtn.disabled = true;
  try {
    const updated = await updateDashboardTransaction(state.editingTransaction.id, {
      title: document.getElementById('editTitle').value,
      amount: document.getElementById('editAmount').value,
      type: document.getElementById('editType').value,
      category: document.getElementById('editCategory').value,
      transactionDate: document.getElementById('editDate').value,
      note: document.getElementById('editNote').value
    });
    upsertLocalTransaction(updated);
    closeEditModal();
    render();
    refreshOverviewQuietly();
  } catch (error) {
    alert(error.message);
  } finally {
    if (document.getElementById('saveEditBtn')) {
      document.getElementById('saveEditBtn').disabled = false;
    }
  }
}

async function handleDeleteEdit() {
  if (!state.editingTransaction) return;
  if (!confirm(`ลบ "${state.editingTransaction.title}" ใช่ไหม?`)) return;

  const deleteBtn = document.getElementById('deleteEditBtn');
  deleteBtn.disabled = true;
  try {
    const deletedId = state.editingTransaction.id;
    await deleteDashboardTransaction(deletedId);
    removeLocalTransaction(deletedId);
    closeEditModal();
    render();
    refreshOverviewQuietly();
  } catch (error) {
    alert(error.message);
  } finally {
    if (document.getElementById('deleteEditBtn')) {
      document.getElementById('deleteEditBtn').disabled = false;
    }
  }
}

async function handleSubmitBudget(event) {
  event.preventDefault();
  const saveBtn = document.getElementById('saveBudgetBtn');
  saveBtn.disabled = true;
  try {
    await createDashboardBudget({
      category: document.getElementById('budgetCategory').value || 'ทั้งหมด',
      amount: document.getElementById('budgetAmount').value,
      month: state.month
    });
  } catch (error) {
    alert(error.message);
  } finally {
    if (document.getElementById('saveBudgetBtn')) {
      document.getElementById('saveBudgetBtn').disabled = false;
    }
  }
}

async function handleSubmitGoal(event) {
  event.preventDefault();
  const saveBtn = document.getElementById('saveGoalBtn');
  saveBtn.disabled = true;
  try {
    await createDashboardGoal({
      name: document.getElementById('goalName').value,
      targetAmount: document.getElementById('goalAmount').value,
      months: document.getElementById('goalMonths').value
    });
  } catch (error) {
    alert(error.message);
  } finally {
    if (document.getElementById('saveGoalBtn')) {
      document.getElementById('saveGoalBtn').disabled = false;
    }
  }
}

async function handleSubmitGoalSaving(event) {
  event.preventDefault();
  if (!state.savingGoal) return;
  const saveBtn = document.getElementById('saveGoalSavingBtn');
  saveBtn.disabled = true;
  try {
    await addDashboardGoalSaving(state.savingGoal.id, {
      amount: document.getElementById('goalSavingAmount').value
    });
    closeGoalSavingModal();
  } catch (error) {
    alert(error.message);
  } finally {
    if (document.getElementById('saveGoalSavingBtn')) {
      document.getElementById('saveGoalSavingBtn').disabled = false;
    }
  }
}

async function handleSubmitDebt(event) {
  event.preventDefault();
  const saveBtn = document.getElementById('saveDebtBtn');
  saveBtn.disabled = true;
  try {
    const selectedType = document.getElementById('debtType').value;
    const customType = document.getElementById('debtCustomType').value.trim();
    if (selectedType === 'custom' && !customType) {
      throw new Error('พิมพ์ประเภทหนี้ที่ต้องการก่อน');
    }
    await createDashboardDebt({
      name: document.getElementById('debtName').value,
      type: selectedType,
      customType,
      principalAmount: document.getElementById('debtAmount').value,
      dueDay: document.getElementById('debtDueDay').value,
      minimumPayment: document.getElementById('debtMinimumPayment').value,
      note: document.getElementById('debtNote').value
    });
    closeDebtModal();
  } catch (error) {
    alert(error.message);
  } finally {
    if (document.getElementById('saveDebtBtn')) {
      document.getElementById('saveDebtBtn').disabled = false;
    }
  }
}

function syncDebtCustomType() {
  const row = document.getElementById('debtCustomTypeRow');
  const input = document.getElementById('debtCustomType');
  const isCustom = document.getElementById('debtType').value === 'custom';
  row.classList.toggle('hidden', !isCustom);
  if (!isCustom) input.value = '';
}

async function handleSubmitDebtPayment(event) {
  event.preventDefault();
  if (!state.payingDebt) return;
  const saveBtn = document.getElementById('saveDebtPaymentBtn');
  saveBtn.disabled = true;
  try {
    await payDashboardDebt(state.payingDebt.id, {
      amount: document.getElementById('debtPaymentAmount').value,
      note: document.getElementById('debtPaymentNote').value,
      createTransaction: document.getElementById('debtCreateTransaction').checked
    });
    closeDebtPaymentModal();
  } catch (error) {
    alert(error.message);
  } finally {
    if (document.getElementById('saveDebtPaymentBtn')) {
      document.getElementById('saveDebtPaymentBtn').disabled = false;
    }
  }
}

async function handleSubmitExportPdf(event) {
  event.preventDefault();
  const saveBtn = document.getElementById('saveExportPdfBtn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'กำลังสร้าง PDF...';
  try {
    await downloadDashboardPdf({
      scope: document.getElementById('pdfScope').value,
      title: document.getElementById('pdfTitle').value.trim(),
      note: document.getElementById('pdfNote').value.trim()
    });
    closeExportPdfModal();
  } catch (error) {
    alert(error.message);
  } finally {
    if (document.getElementById('saveExportPdfBtn')) {
      document.getElementById('saveExportPdfBtn').disabled = false;
      document.getElementById('saveExportPdfBtn').textContent = 'ดาวน์โหลด PDF';
    }
  }
}

async function handleCancelDebt(id) {
  const debt = findDebt(id);
  if (!debt) return;
  if (!confirm(`ปิด/ยกเลิก "${debt.name}" ใช่ไหม?`)) return;
  try {
    await cancelDashboardDebt(id);
  } catch (error) {
    alert(error.message);
  }
}

async function handleCommand(command) {
  if (command === 'export-month') {
    try {
      await downloadDashboardCsv('month');
    } catch (error) {
      alert(error.message);
    }
    return;
  }
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
