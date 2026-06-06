const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { Pool } = require('pg');

const usePostgres = process.env.DB_CLIENT === 'postgres' || Boolean(process.env.DATABASE_URL);

function normalizeSqlForSqlite(sql) {
  return sql.replace(/\$\d+/g, '?');
}

function createSqliteClient() {
  const databasePath = process.env.DATABASE_PATH || './data/app.db';
  const resolvedPath = path.resolve(databasePath);
  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });

  const db = new DatabaseSync(resolvedPath);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 5000');

  return {
    client: 'sqlite',
    async exec(sql) {
      db.exec(sql);
    },
    async get(sql, params = []) {
      return db.prepare(normalizeSqlForSqlite(sql)).get(...params);
    },
    async all(sql, params = []) {
      return db.prepare(normalizeSqlForSqlite(sql)).all(...params);
    },
    async run(sql, params = []) {
      const result = db.prepare(normalizeSqlForSqlite(sql)).run(...params);
      return { lastInsertRowid: result.lastInsertRowid, changes: result.changes, rows: [] };
    }
  };
}

function createPostgresClient() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false }
  });

  const keyMap = {
    lineuserid: 'lineUserId',
    displayname: 'displayName',
    createdat: 'createdAt',
    updatedat: 'updatedAt',
    userid: 'userId',
    transactiondate: 'transactionDate',
    imagepath: 'imagePath',
    ocrtext: 'ocrText',
    targetamount: 'targetAmount',
    currentamount: 'currentAmount'
  };

  function normalizeRow(row) {
    if (!row) return row;
    return Object.fromEntries(
      Object.entries(row).map(([key, value]) => {
        const normalizedKey = keyMap[key] || key;
        const normalizedValue = value instanceof Date && normalizedKey.toLowerCase().includes('date')
          ? value.toISOString().slice(0, 10)
          : value;
        return [normalizedKey, normalizedValue];
      })
    );
  }

  return {
    client: 'postgres',
    async exec(sql) {
      await pool.query(sql);
    },
    async get(sql, params = []) {
      const result = await pool.query(sql, params);
      return normalizeRow(result.rows[0]) || null;
    },
    async all(sql, params = []) {
      const result = await pool.query(sql, params);
      return result.rows.map(normalizeRow);
    },
    async run(sql, params = []) {
      const result = await pool.query(sql, params);
      return { rowCount: result.rowCount, rows: result.rows.map(normalizeRow) };
    }
  };
}

module.exports = usePostgres ? createPostgresClient() : createSqliteClient();
