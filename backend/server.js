require("dotenv").config();

const express = require("express");
const path = require("path");
const cors = require("cors");
const { Pool } = require("pg");

const app = express();

// =======================
// Middleware
// =======================
app.use(cors());
app.use(express.json());

// =======================
// Serve Frontend (สำคัญที่สุด)
// =======================

// บอก Express ให้ใช้โฟลเดอร์ frontend
app.use(express.static(path.join(__dirname, "../frontend")));

// หน้าแรก = login
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/login.html"));
});

// =======================
// PostgreSQL
// =======================
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: { rejectUnauthorized: false }
});

// Test connection
pool.connect()
  .then(client => {
    console.log("✅ Connected to PostgreSQL");
    client.release();
  })
  .catch(err => {
    console.error("❌ Database connection error:", err);
  });

// =======================
// API
// =======================
app.get("/api/test", (req, res) => {
  res.json({ message: "API working" });
});

app.get("/api/courses", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM courses ORDER BY course_id DESC"
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// =======================
// PORT (Render)
// =======================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
