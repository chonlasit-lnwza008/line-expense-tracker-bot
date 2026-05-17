const fs = require('fs');
const path = require('path');

function ensureDatabase() {
  const db = require('../config/database');
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');
  db.exec(schema);
}

if (require.main === module) {
  ensureDatabase();
  console.log('Database migrated successfully');
}

module.exports = { ensureDatabase };
