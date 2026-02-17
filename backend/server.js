require('dotenv').config();
const express = require("express");
const { Pool } = require("pg");

const app = express();

// Middleware
app.use(express.json());

// PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// ทดสอบ DB
pool.connect()
  .then(() => console.log("✅ Connected to PostgreSQL"))
  .catch(err => console.error("❌ Database connection error:", err));

// Route ทดสอบ
app.get("/", (req, res) => {
  res.send("FMS Backend Running");
});

// ⭐ ตรงนี้สำคัญมาก
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
