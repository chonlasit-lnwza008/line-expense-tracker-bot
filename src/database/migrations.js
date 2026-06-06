const fs = require('fs');
const path = require('path');
const db = require('../config/database');

async function ensureDatabase() {
  const schemaFile = db.client === 'postgres' ? 'schema.postgres.sql' : 'schema.sql';
  const schemaPath = path.join(__dirname, schemaFile);
  const schema = fs.readFileSync(schemaPath, 'utf8');
  await db.exec(schema);
}

if (require.main === module) {
  ensureDatabase()
    .then(() => console.log('Database migrated successfully'))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { ensureDatabase };
