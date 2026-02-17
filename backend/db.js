// backend/db.js
const { Pool } = require('pg');

// ใช้ DATABASE_URL จาก Render หรือใส่ Supabase connection string ตรงนี้
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 
    'postgresql://postgres:6510510180651051018@db.pbxcqybjlmzxrxrcfsed.supabase.co:5432/postgres',
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
    console.error('❌ Database connection error:', err);
  });

module.exports = pool;
