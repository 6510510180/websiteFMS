require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: {
    rejectUnauthorized: false
  }
});

// ทดสอบการเชื่อมต่อ
pool.connect()
  .then(client => {
    console.log('✅ Connected to Supabase PostgreSQL');
    client.release();
  })
  .catch(err => {
    console.error('❌ Database connection error:', err.message);
  });

module.exports = pool;
