const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_iMP7KFIryVG0@ep-withered-tooth-alt7lorm-pooler.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require',
  ssl: { rejectUnauthorized: false },
});

// Tables already exist in the DB — no CREATE needed
async function init() {
  await pool.query('SELECT 1');
}

module.exports = { pool, init };
