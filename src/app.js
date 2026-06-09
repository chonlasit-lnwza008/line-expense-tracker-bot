require('dotenv').config();

const express = require('express');
const path = require('path');
const fs = require('fs');
const webhookRouter = require('./routes/webhook');
const db = require('./config/database');
const dashboardService = require('./services/dashboardService');
const liffDashboardService = require('./services/liffDashboardService');
const { ensureDatabase } = require('./database/migrations');

const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.json({
    name: 'LINE Expense Tracker Bot',
    status: 'ok',
    webhook: '/webhook'
  });
});

app.get('/health/db', async (req, res, next) => {
  try {
    const expectedTables = ['users', 'transactions', 'budgets', 'goals'];
    const tables = db.client === 'postgres'
      ? await db.all(
        `SELECT table_name AS name
         FROM information_schema.tables
         WHERE table_schema = 'public'
           AND table_name = ANY($1::text[])
         ORDER BY table_name`,
        [expectedTables]
      )
      : await db.all(
        `SELECT name
         FROM sqlite_master
         WHERE type = 'table'
           AND name IN ('users', 'transactions', 'budgets', 'goals')
         ORDER BY name`
      );

    const tableNames = tables.map((table) => table.name);
    res.json({
      status: tableNames.length === expectedTables.length ? 'ok' : 'missing_tables',
      databaseClient: db.client,
      tables: tableNames,
      missingTables: expectedTables.filter((table) => !tableNames.includes(table))
    });
  } catch (error) {
    next(error);
  }
});

function canViewDashboard(req) {
  const token = process.env.DASHBOARD_TOKEN;
  return Boolean(token) && req.query.token === token;
}

app.get('/api/dashboard', async (req, res, next) => {
  try {
    if (!canViewDashboard(req)) {
      return res.status(401).json({
        error: 'Dashboard is locked',
        setup: 'Set DASHBOARD_TOKEN in Render and open /dashboard?token=your-token'
      });
    }
    res.json(await dashboardService.getDashboardData(req.query.month));
  } catch (error) {
    next(error);
  }
});

app.get('/dashboard', (req, res) => {
  if (!canViewDashboard(req)) {
    return res.status(401).send(renderLockedDashboard());
  }
  res.type('html').send(renderDashboardPage(String(req.query.token || '')));
});

app.use('/liff-assets', express.static(path.join(__dirname, '..', 'public', 'liff')));

app.get('/liff', (req, res) => {
  res.type('html').send(renderLiffPage({
    liffId: process.env.LIFF_ID || '',
    dashboardToken: req.query.token && canViewDashboard(req) ? String(req.query.token) : '',
    debugLineUserId: req.query.lineUserId && canViewDashboard(req) ? String(req.query.lineUserId) : ''
  }));
});

app.get('/api/liff/overview', async (req, res, next) => {
  try {
    const lineUserId = await resolveLiffLineUserId(req);
    res.json(await liffDashboardService.getOverview(lineUserId, req.query.month));
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    next(error);
  }
});

app.post('/api/liff/transactions', express.json({ limit: '32kb' }), async (req, res, next) => {
  try {
    const lineUserId = await resolveLiffLineUserId(req);
    const transaction = await liffDashboardService.createFromText(lineUserId, req.body && req.body.text);
    res.status(201).json({ transaction });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        error: error.message,
        reason: error.reason
      });
    }
    next(error);
  }
});

app.get('/api/liff/transactions/:id/image', async (req, res, next) => {
  try {
    const lineUserId = await resolveLiffLineUserId(req);
    const imagePath = await liffDashboardService.getTransactionImage(lineUserId, req.params.id);
    if (!imagePath || !fs.existsSync(imagePath)) {
      return res.status(404).json({ error: 'Transaction image not found' });
    }
    res.sendFile(path.resolve(imagePath));
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    next(error);
  }
});

app.patch('/api/liff/transactions/:id', express.json({ limit: '32kb' }), async (req, res, next) => {
  try {
    const lineUserId = await resolveLiffLineUserId(req);
    const transaction = await liffDashboardService.updateFromDashboard(lineUserId, req.params.id, req.body || {});
    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    res.json({ transaction });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        error: error.message,
        reason: error.reason
      });
    }
    next(error);
  }
});

app.delete('/api/liff/transactions/:id', async (req, res, next) => {
  try {
    const lineUserId = await resolveLiffLineUserId(req);
    const transaction = await liffDashboardService.deleteFromDashboard(lineUserId, req.params.id);
    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    res.json({ transaction });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    next(error);
  }
});

app.post('/api/liff/budgets', express.json({ limit: '16kb' }), async (req, res, next) => {
  try {
    const lineUserId = await resolveLiffLineUserId(req);
    const budget = await liffDashboardService.setBudgetFromDashboard(lineUserId, req.body || {});
    res.status(201).json({ budget });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        error: error.message,
        reason: error.reason
      });
    }
    next(error);
  }
});

app.post('/api/liff/goals', express.json({ limit: '16kb' }), async (req, res, next) => {
  try {
    const lineUserId = await resolveLiffLineUserId(req);
    const goal = await liffDashboardService.createGoalFromDashboard(lineUserId, req.body || {});
    res.status(201).json({ goal });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        error: error.message,
        reason: error.reason
      });
    }
    next(error);
  }
});

app.post('/api/liff/goals/:id/savings', express.json({ limit: '16kb' }), async (req, res, next) => {
  try {
    const lineUserId = await resolveLiffLineUserId(req);
    const result = await liffDashboardService.addGoalSavingFromDashboard(lineUserId, req.params.id, req.body || {});
    if (!result) {
      return res.status(404).json({ error: 'Goal not found' });
    }
    res.json(result);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        error: error.message,
        reason: error.reason
      });
    }
    next(error);
  }
});

app.get('/api/liff/export', async (req, res, next) => {
  try {
    const lineUserId = await resolveLiffLineUserId(req);
    const csv = await liffDashboardService.exportCsv(lineUserId, req.query.scope);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="line-expense-export.csv"');
    res.send(csv);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    next(error);
  }
});

app.use('/webhook', webhookRouter);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

async function start() {
  await ensureDatabase();
  app.listen(port, () => {
    console.log(`LINE Expense Tracker Bot listening on port ${port}`);
  });
}

if (require.main === module) {
  start().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = app;
module.exports.start = start;

async function resolveLiffLineUserId(req) {
  if (canViewDashboard(req) && req.query.lineUserId) {
    return String(req.query.lineUserId);
  }

  const authHeader = req.get('authorization') || '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    const error = new Error('Missing LIFF access token');
    error.statusCode = 401;
    throw error;
  }

  const response = await fetch('https://api.line.me/v2/profile', {
    headers: { Authorization: `Bearer ${match[1]}` }
  });

  if (!response.ok) {
    const error = new Error('Invalid LIFF access token');
    error.statusCode = 401;
    throw error;
  }

  const profile = await response.json();
  if (!profile.userId) {
    const error = new Error('LINE profile has no userId');
    error.statusCode = 401;
    throw error;
  }
  return profile.userId;
}

function renderLiffPage({ liffId, dashboardToken, debugLineUserId }) {
  return `<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>LINE Expense Tracker</title>
  <link rel="stylesheet" href="/liff-assets/app.css">
</head>
<body>
  <div id="app"></div>
  <script>
    window.APP_CONFIG = {
      liffId: ${JSON.stringify(liffId)},
      dashboardToken: ${JSON.stringify(dashboardToken)},
      debugLineUserId: ${JSON.stringify(debugLineUserId)}
    };
  </script>
  <script src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script>
  <script src="/liff-assets/app.js"></script>
</body>
</html>`;
}

function renderLockedDashboard() {
  return `<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Dashboard Locked</title>
  <style>
    body{font-family:Arial,sans-serif;background:#f8fafc;color:#111827;margin:0;display:grid;min-height:100vh;place-items:center}
    main{max-width:520px;background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:28px;box-shadow:0 10px 30px rgba(15,23,42,.08)}
    code{background:#f3f4f6;border-radius:6px;padding:2px 6px}
  </style>
</head>
<body>
  <main>
    <h1>Dashboard locked</h1>
    <p>ตั้งค่า <code>DASHBOARD_TOKEN</code> ใน Render ก่อน แล้วเปิด <code>/dashboard?token=รหัสของคุณ</code></p>
  </main>
</body>
</html>`;
}

function renderDashboardPage(token) {
  return `<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>LINE Expense Dashboard</title>
  <style>
    :root{color-scheme:light;--bg:#f8fafc;--ink:#111827;--muted:#6b7280;--line:#e5e7eb;--green:#16a34a;--red:#dc2626;--blue:#2563eb}
    *{box-sizing:border-box}
    body{margin:0;background:var(--bg);color:var(--ink);font-family:Arial,'Noto Sans Thai',sans-serif}
    header{background:#fff;border-bottom:1px solid var(--line)}
    .wrap{max-width:1120px;margin:0 auto;padding:20px}
    .top{display:flex;gap:16px;align-items:center;justify-content:space-between;flex-wrap:wrap}
    h1{font-size:24px;margin:0}
    input{border:1px solid var(--line);border-radius:6px;padding:10px 12px;font:inherit;background:#fff}
    button{border:0;border-radius:6px;padding:10px 14px;font-weight:700;background:var(--ink);color:#fff;cursor:pointer}
    .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:18px}
    .panel{background:#fff;border:1px solid var(--line);border-radius:8px;padding:16px}
    .label{font-size:12px;color:var(--muted);margin-bottom:6px}
    .value{font-size:24px;font-weight:800}
    .layout{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px}
    canvas{width:100%;height:260px}
    table{width:100%;border-collapse:collapse;font-size:14px}
    th,td{padding:10px;border-bottom:1px solid var(--line);text-align:left}
    th{color:var(--muted);font-weight:700}
    td.amount{text-align:right;font-weight:700}
    .income{color:var(--green)}
    .expense{color:var(--red)}
    @media (max-width:820px){.grid,.layout{grid-template-columns:1fr}canvas{height:220px}}
  </style>
</head>
<body>
  <header>
    <div class="wrap top">
      <h1>LINE Expense Dashboard</h1>
      <form id="filters">
        <input id="month" name="month" type="month">
        <button type="submit">ดูข้อมูล</button>
      </form>
    </div>
  </header>
  <main class="wrap">
    <section class="grid">
      <div class="panel"><div class="label">รายรับ</div><div id="income" class="value income">-</div></div>
      <div class="panel"><div class="label">รายจ่าย</div><div id="expense" class="value expense">-</div></div>
      <div class="panel"><div class="label">คงเหลือ</div><div id="net" class="value">-</div></div>
      <div class="panel"><div class="label">จำนวนรายการ</div><div id="count" class="value">-</div></div>
    </section>
    <section class="layout">
      <div class="panel">
        <h2>รายจ่ายตามหมวด</h2>
        <canvas id="categoryChart" width="520" height="260"></canvas>
      </div>
      <div class="panel">
        <h2>รายวัน</h2>
        <canvas id="dailyChart" width="520" height="260"></canvas>
      </div>
    </section>
    <section class="panel" style="margin-top:12px">
      <h2>รายการล่าสุด</h2>
      <table>
        <thead><tr><th>วันที่</th><th>รายการ</th><th>หมวด</th><th>ประเภท</th><th style="text-align:right">ยอด</th></tr></thead>
        <tbody id="recent"></tbody>
      </table>
    </section>
  </main>
  <script>
    const token = ${JSON.stringify(token)};
    const fmt = new Intl.NumberFormat('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
    const money = (value) => fmt.format(Number(value || 0)) + ' บาท';
    const now = new Date();
    const monthInput = document.getElementById('month');
    monthInput.value = now.toISOString().slice(0, 7);

    function drawBars(canvas, items, getLabel, getValue, color) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.font = '13px Arial';
      const max = Math.max(...items.map(getValue), 1);
      const barArea = canvas.width - 150;
      items.slice(0, 8).forEach((item, index) => {
        const y = 18 + index * 30;
        const value = getValue(item);
        ctx.fillStyle = '#374151';
        ctx.fillText(String(getLabel(item)).slice(0, 16), 0, y + 14);
        ctx.fillStyle = color;
        ctx.fillRect(120, y, Math.max(4, (value / max) * barArea), 18);
        ctx.fillStyle = '#111827';
        ctx.fillText(fmt.format(value), 128 + Math.max(4, (value / max) * barArea), y + 14);
      });
      if (!items.length) {
        ctx.fillStyle = '#6b7280';
        ctx.fillText('ยังไม่มีข้อมูลเดือนนี้', 0, 32);
      }
    }

    async function loadDashboard(month) {
      const response = await fetch('/api/dashboard?token=' + encodeURIComponent(token) + '&month=' + encodeURIComponent(month));
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'โหลดข้อมูลไม่ได้');

      document.getElementById('income').textContent = money(data.totals.income);
      document.getElementById('expense').textContent = money(data.totals.expense);
      document.getElementById('net').textContent = money(data.totals.net);
      document.getElementById('count').textContent = fmt.format(data.transactionCount);
      document.getElementById('net').className = 'value ' + (data.totals.net < 0 ? 'expense' : 'income');

      drawBars(document.getElementById('categoryChart'), data.categories, (item) => item.category, (item) => item.amount, '#dc2626');
      drawBars(document.getElementById('dailyChart'), data.daily, (item) => item.date.slice(5), (item) => item.expense, '#2563eb');

      document.getElementById('recent').innerHTML = data.recent.map((row) => {
        const typeClass = row.type === 'income' ? 'income' : 'expense';
        const sign = row.type === 'income' ? '+' : '-';
        return '<tr><td>' + row.transactionDate + '</td><td>' + escapeHtml(row.title) + '</td><td>' + escapeHtml(row.category) + '</td><td>' + row.type + '</td><td class="amount ' + typeClass + '">' + sign + money(row.amount) + '</td></tr>';
      }).join('') || '<tr><td colspan="5">ยังไม่มีรายการ</td></tr>';
    }

    function escapeHtml(value) {
      return String(value || '').replace(/[&<>"']/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
    }

    document.getElementById('filters').addEventListener('submit', (event) => {
      event.preventDefault();
      loadDashboard(monthInput.value).catch((error) => alert(error.message));
    });
    loadDashboard(monthInput.value).catch((error) => alert(error.message));
  </script>
</body>
</html>`;
}
