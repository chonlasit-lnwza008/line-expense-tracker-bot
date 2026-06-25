const db = require('../config/database');

function normalizeKeyword(keyword) {
  return String(keyword || '').trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 80);
}

function normalizeCategory(category) {
  return String(category || '').trim().slice(0, 80) || 'อื่นๆ';
}

function mapCategory(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

function mapRule(row) {
  if (!row) return null;
  return {
    id: row.id,
    keyword: row.keyword,
    category: row.category,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

async function listCustomCategories(userId) {
  const rows = await db.all(`
    SELECT *
    FROM user_categories
    WHERE userId = $1
    ORDER BY name ASC
  `, [userId]);
  return rows.map(mapCategory);
}

async function upsertCustomCategory(userId, input = {}) {
  const rawName = typeof input === 'string' ? input : input.name;
  const name = normalizeCategory(rawName);
  if (!name || name === 'ทั้งหมด') {
    const error = new Error('Category name is required');
    error.statusCode = 400;
    error.reason = 'category_required';
    throw error;
  }

  if (db.client === 'postgres') {
    const inserted = await db.get(`
      INSERT INTO user_categories (userId, name, createdAt, updatedAt)
      VALUES ($1, $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(userId, name)
      DO UPDATE SET updatedAt = CURRENT_TIMESTAMP
      RETURNING *
    `, [userId, name]);
    return mapCategory(inserted);
  }

  await db.run(`
    INSERT INTO user_categories (userId, name, createdAt, updatedAt)
    VALUES ($1, $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(userId, name)
    DO UPDATE SET updatedAt = CURRENT_TIMESTAMP
  `, [userId, name]);

  const row = await db.get(`
    SELECT *
    FROM user_categories
    WHERE userId = $1 AND name = $2
  `, [userId, name]);
  return mapCategory(row);
}

async function deleteCustomCategory(userId, id) {
  const category = await db.get('SELECT * FROM user_categories WHERE id = $1 AND userId = $2', [Number(id), userId]);
  if (!category) return null;
  await db.run('DELETE FROM user_categories WHERE id = $1 AND userId = $2', [Number(id), userId]);
  return mapCategory(category);
}

async function listRules(userId) {
  const rows = await db.all(`
    SELECT *
    FROM category_rules
    WHERE userId = $1
    ORDER BY keyword ASC
  `, [userId]);
  return rows.map(mapRule);
}

async function upsertRule(userId, input = {}) {
  const keyword = normalizeKeyword(input.keyword);
  const category = normalizeCategory(input.category);
  if (!keyword) {
    const error = new Error('Keyword is required');
    error.statusCode = 400;
    error.reason = 'keyword_required';
    throw error;
  }

  await upsertCustomCategory(userId, category);

  if (db.client === 'postgres') {
    const inserted = await db.get(`
      INSERT INTO category_rules (userId, keyword, category, createdAt, updatedAt)
      VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(userId, keyword)
      DO UPDATE SET category = EXCLUDED.category, updatedAt = CURRENT_TIMESTAMP
      RETURNING *
    `, [userId, keyword, category]);
    return mapRule(inserted);
  }

  await db.run(`
    INSERT INTO category_rules (userId, keyword, category, createdAt, updatedAt)
    VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(userId, keyword)
    DO UPDATE SET category = excluded.category, updatedAt = CURRENT_TIMESTAMP
  `, [userId, keyword, category]);

  const row = await db.get(`
    SELECT *
    FROM category_rules
    WHERE userId = $1 AND keyword = $2
  `, [userId, keyword]);
  return mapRule(row);
}

async function deleteRule(userId, id) {
  const rule = await db.get('SELECT * FROM category_rules WHERE id = $1 AND userId = $2', [Number(id), userId]);
  if (!rule) return null;
  await db.run('DELETE FROM category_rules WHERE id = $1 AND userId = $2', [Number(id), userId]);
  return mapRule(rule);
}

async function detectUserCategory(userId, text) {
  const normalizedText = String(text || '').toLowerCase();
  if (!normalizedText.trim()) return null;
  const rules = await listRules(userId);
  const matched = rules
    .filter((rule) => rule.keyword && normalizedText.includes(rule.keyword.toLowerCase()))
    .sort((a, b) => b.keyword.length - a.keyword.length)[0];
  return matched ? matched.category : null;
}

async function applyRulesToTransactions(userId, options = {}) {
  const month = String(options.month || '').slice(0, 7);
  const monthFilter = /^\d{4}-\d{2}$/.test(month)
    ? 'AND transactionDate >= $2 AND transactionDate < $3'
    : '';
  const params = [userId];
  if (monthFilter) {
    params.push(`${month}-01`);
    const [year, monthIndex] = month.split('-').map(Number);
    const nextYear = monthIndex === 12 ? year + 1 : year;
    const nextMonth = monthIndex === 12 ? 1 : monthIndex + 1;
    params.push(`${nextYear}-${String(nextMonth).padStart(2, '0')}-01`);
  }

  const rows = await db.all(`
    SELECT *
    FROM transactions
    WHERE userId = $1
      AND status = 'confirmed'
      ${monthFilter}
  `, params);

  let updatedCount = 0;
  for (const row of rows) {
    const category = await detectUserCategory(userId, `${row.title || ''} ${row.note || ''}`);
    if (category && category !== row.category) {
      await db.run(`
        UPDATE transactions
        SET category = $1, updatedAt = CURRENT_TIMESTAMP
        WHERE id = $2 AND userId = $3
      `, [category, row.id, userId]);
      updatedCount += 1;
    }
  }

  return { updatedCount };
}

module.exports = {
  listCustomCategories,
  upsertCustomCategory,
  deleteCustomCategory,
  listRules,
  upsertRule,
  deleteRule,
  detectUserCategory,
  applyRulesToTransactions
};
