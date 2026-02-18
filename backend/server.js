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
// Serve Frontend
// =======================
app.use(express.static(path.join(__dirname, "../frontend")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/login.html"));
});
// =======================
// Add Course API
// =======================
app.post("/api/courses", async (req, res) => {
  const { course_code, course_name, credits } = req.body;

  // ตรวจสอบข้อมูล
  if (!course_code || !course_name || !credits) {
    return res.status(400).json({ message: "กรอกข้อมูลไม่ครบ" });
  }

  try {
    const result = await pool.query(
      `INSERT INTO courses (course_code, course_name, credits)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [course_code, course_name, credits]
    );

    res.json({
      message: "เพิ่มรายวิชาสำเร็จ",
      course: result.rows[0]
    });

  } catch (err) {
    console.error("Add course error:", err);
    res.status(500).json({ message: "Server error" });
  }
});


// =======================
// PostgreSQL (Supabase)
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

// Test API
app.get("/api/test", (req, res) => {
  res.json({ message: "API working" });
});


// =======================
// LOGIN API (แก้แล้ว)
// =======================
app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const result = await pool.query(
      "SELECT * FROM users WHERE email = $1",
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ message: "ไม่พบผู้ใช้งาน" });
    }

    const user = result.rows[0];

    // ตารางใช้ password_hash
    if (user.password_hash !== password) {
      return res.status(401).json({ message: "รหัสผ่านไม่ถูกต้อง" });
    }

    res.json({
      message: "เข้าสู่ระบบสำเร็จ",
      user: {
        id: user.id,
        email: user.email,
        role: user.role
      }
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});


// =======================
// Courses API (แก้ column)
// =======================
app.get("/api/courses", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM courses ORDER BY id DESC"
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});


// =======================
// PORT (สำคัญสำหรับ Render)
// =======================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
