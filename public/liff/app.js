const config = window.APP_CONFIG || {};
const state = {
  accessToken: '',
  profile: null,
  data: null,
  month: new Date().toISOString().slice(0, 7),
  modalType: 'expense',
  editingTransaction: null
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
  await loadOverview();
  render();
  alert('แก้ไขรายการแล้ว');
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
  await loadOverview();
  render();
  alert('ลบรายการแล้ว');
  return data.transaction;
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
        <button class="text-action" type="button" data-scroll="edit">เลือกจากรายการด้านล่าง</button>
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
        <p class="sheet-hint" id="modalHint">พิมพ์รายการแล้วบันทึกเข้าบัญชีทันที</p>
        <input id="quickText" autocomplete="off" placeholder="เช่น กาแฟ 45">
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
        <label>หมวด<input id="editCategory" autocomplete="off"></label>
        <label>วันที่<input id="editDate" type="date"></label>
        <label>โน้ต<input id="editNote" autocomplete="off"></label>
        <div class="sheet-actions three">
          <button class="secondary" type="button" id="closeEditModal">ยกเลิก</button>
          <button class="danger" type="button" id="deleteEditBtn">ลบ</button>
          <button class="primary" type="submit" id="saveEditBtn">บันทึก</button>
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

function renderTransactions(rows) {
  if (!rows.length) return '<div class="empty">ยังไม่มีรายการใน 7 วันล่าสุด</div>';
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
              <button type="button" data-edit-id="${escapeHtml(row.id)}" class="mini-action">จัดการ</button>
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
  document.querySelectorAll('[data-edit-id]').forEach((button) => {
    button.addEventListener('click', () => openEditModal(button.dataset.editId));
  });

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
  document.getElementById('quickForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const value = document.getElementById('quickText').value.trim();
    if (!value) return;
    const prefix = state.modalType === 'income' && !/^(รับ|รายรับ|ได้เงิน)/.test(value) ? 'รับ ' : '';
    const submitBtn = document.getElementById('submitBtn');
    submitBtn.disabled = true;
    try {
      await createDashboardTransaction(prefix + value);
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
  document.getElementById(id).scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function openQuickModal(type) {
  state.modalType = type;
  const isIncome = type === 'income';
  document.getElementById('modalTitle').textContent = isIncome ? 'บันทึกรายรับ' : 'บันทึกรายจ่าย';
  document.getElementById('modalHint').textContent = isIncome
    ? 'พิมพ์รายรับ แล้วบันทึกเข้าบัญชีทันที'
    : 'พิมพ์รายจ่าย แล้วบันทึกเข้าบัญชีทันที';
  document.getElementById('quickText').placeholder = isIncome ? 'เช่น เงินเดือน 18000' : 'เช่น กาแฟ 45';
  document.getElementById('quickText').value = '';

  const submitBtn = document.getElementById('submitBtn');
  submitBtn.textContent = isIncome ? 'บันทึกรายรับ' : 'บันทึกรายจ่าย';
  submitBtn.classList.toggle('expense', !isIncome);

  document.getElementById('quickModal').classList.add('open');
  setTimeout(() => document.getElementById('quickText').focus(), 50);
}

function closeQuickModal() {
  document.getElementById('quickModal').classList.remove('open');
}

function findTransaction(id) {
  const rows = [
    ...((state.data && state.data.recentSevenDays) || []),
    ...((state.data && state.data.recent) || [])
  ];
  return rows.find((row) => String(row.id) === String(id));
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
  document.getElementById('editCategory').value = transaction.category || 'อื่นๆ';
  document.getElementById('editDate').value = transaction.transactionDate || '';
  document.getElementById('editNote').value = transaction.note || '';
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
    await updateDashboardTransaction(state.editingTransaction.id, {
      title: document.getElementById('editTitle').value,
      amount: document.getElementById('editAmount').value,
      type: document.getElementById('editType').value,
      category: document.getElementById('editCategory').value,
      transactionDate: document.getElementById('editDate').value,
      note: document.getElementById('editNote').value
    });
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
    await deleteDashboardTransaction(state.editingTransaction.id);
  } catch (error) {
    alert(error.message);
  } finally {
    if (document.getElementById('deleteEditBtn')) {
      document.getElementById('deleteEditBtn').disabled = false;
    }
  }
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
