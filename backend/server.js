require("dotenv").config();

const express = require("express");
const path = require("path");
const cors = require("cors");
const { Pool } = require("pg");
const multer = require("multer");
const fs = require("fs");


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
// UPLOAD CONFIG
// =======================
const uploadDir = path.join(__dirname, "uploads");

// สร้างโฟลเดอร์ถ้ายังไม่มี
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

app.use("/uploads", express.static(uploadDir));

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueName = Date.now() + "-" + file.originalname;
    cb(null, uniqueName);
  }
});

const upload = multer({ storage });


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
// TEST API
// =======================
app.get("/api/test", (req, res) => {
  res.json({ message: "API working" });
});


// =======================
// LOGIN API
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
// COURSES API
// =======================

// เพิ่มรายวิชา
app.post("/api/courses", async (req, res) => {
  const {
    name_th,
    name_en,
    degree_level,
    status,
    program_type,
    study_system,
    award_title,
    total_credits,
    short_detail,
    hero_image,
    info_image
  } = req.body;

  if (!name_th) {
    return res.status(400).json({ message: "กรอกข้อมูลไม่ครบ" });
  }

  try {
    const result = await pool.query(
      `INSERT INTO courses
      (name_th, name_en, degree_level, status, program_type, study_system,
       award_title, total_credits, short_detail, hero_image, info_image)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      RETURNING id`,
      [
        name_th,
        name_en,
        degree_level,
        status,
        program_type,
        study_system,
        award_title,
        total_credits,
        short_detail,
        hero_image,
        info_image
      ]
    );

    res.json({
      message: "เพิ่มหลักสูตรสำเร็จ",
      id: result.rows[0].id
    });

  } catch (err) {
    console.error("Add course error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// =======================
// UPLOAD API
// =======================
app.post("/api/upload", upload.single("image"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "No file uploaded" });
  }

  res.json({
    url: "/uploads/" + req.file.filename
  });
});
// =======================
// GET COURSE BY ID
// =======================
app.get("/api/courses/:id", async (req, res) => {
  const id = req.params.id;

  try {
    const result = await pool.query(
      "SELECT * FROM courses WHERE id = $1",
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "ไม่พบหลักสูตร" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Get course error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// =======================
// GET MAJORS BY COURSE
// =======================
app.get("/api/courses/:id/majors", async (req, res) => {
  const courseId = req.params.id;

  try {
    const result = await pool.query(
      "SELECT * FROM majors WHERE course_id = $1 ORDER BY id DESC",
      [courseId]
    );

    res.json(result.rows);
  } catch (err) {
    console.error("Get majors error:", err);
    res.status(500).json({ message: "Server error" });
  }
});


// ดูรายการรายวิชา
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
// ======================
// DELETE COURSE
// ======================
app.delete("/api/courses/:id", async (req, res) => {
  const { id } = req.params;

  try {
    // ลบหลักสูตร (majors จะถูกลบอัตโนมัติ เพราะ ON DELETE CASCADE)
    const result = await pool.query(
      "DELETE FROM courses WHERE id = $1 RETURNING *",
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "ไม่พบหลักสูตร" });
    }

    res.json({ message: "ลบหลักสูตรสำเร็จ" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});



// =======================
// MAJORS API
// =======================

// เพิ่มสาขา (ปุ่ม Finish)
app.post("/api/majors", async (req, res) => {
  const {
    course_id,
    name_th,
    name_en,
    intro,
    image_url,
    career_path,
    plan_1,
    plan_2,
    plan_3,
    plan_4
  } = req.body;

  if (!course_id || !name_th) {
    return res.status(400).json({ message: "ข้อมูลไม่ครบ" });
  }

  try {
    const result = await pool.query(
      `INSERT INTO majors
      (course_id, name_th, name_en, intro, image_url, career_path, plan_1, plan_2, plan_3, plan_4)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      RETURNING id`,
      [
        course_id,
        name_th,
        name_en,
        intro,
        image_url,
        career_path,
        plan_1,
        plan_2,
        plan_3,
        plan_4
      ]
    );

    res.json({
      message: "เพิ่มสาขาสำเร็จ",
      majorId: result.rows[0].id
    });

  } catch (err) {
    console.error("Add major error:", err);
    res.status(500).json({ message: "Server error" });
  }
});


// แก้ไขสาขา
app.put("/api/majors/:id", async (req, res) => {
  const id = req.params.id;

  const {
    name_th,
    name_en,
    intro,
    image_url,
    career_path,
    plan_1,
    plan_2,
    plan_3,
    plan_4
  } = req.body;

  try {
    await pool.query(
      `UPDATE majors SET
        name_th=$1,
        name_en=$2,
        intro=$3,
        image_url=$4,
        career_path=$5,
        plan_1=$6,
        plan_2=$7,
        plan_3=$8,
        plan_4=$9
      WHERE id=$10`,
      [
        name_th,
        name_en,
        intro,
        image_url,
        career_path,
        plan_1,
        plan_2,
        plan_3,
        plan_4,
        id
      ]
    );

    res.json({ message: "อัปเดตสาขาสำเร็จ" });

  } catch (err) {
    console.error("Update major error:", err);
    res.status(500).json({ message: "Server error" });
  }
});
// ======================
// UPDATE COURSE
// ======================
app.put("/api/courses/:id", async (req, res) => {
  const { id } = req.params;

  const {
    name_th,
    name_en,
    degree_level,
    status,
    program_type,
    study_system,
    award_title,
    total_credits,
    short_detail,
    hero_image,
    info_image
  } = req.body;

  if (!name_th) {
    return res.status(400).json({ message: "กรอกข้อมูลไม่ครบ" });
  }

  try {
    const result = await pool.query(
      `UPDATE courses SET
        name_th=$1,
        name_en=$2,
        degree_level=$3,
        status=$4,
        program_type=$5,
        study_system=$6,
        award_title=$7,
        total_credits=$8,
        short_detail=$9,
        hero_image=$10,
        info_image=$11
      WHERE id=$12
      RETURNING id`,
      [
        name_th,
        name_en,
        degree_level,
        status,
        program_type,
        study_system,
        award_title,
        total_credits,
        short_detail,
        hero_image,
        info_image,
        id
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "ไม่พบหลักสูตร" });
    }

    res.json({
      message: "อัปเดตหลักสูตรสำเร็จ",
      id: result.rows[0].id
    });

  } catch (err) {
    console.error("Update course error:", err);
    res.status(500).json({ message: "Server error" });
  }
});



// ดึงข้อมูลสาขา
app.get("/api/majors/:id", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM majors WHERE id=$1",
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "ไม่พบข้อมูล" });
    }

    res.json(result.rows[0]);

  } catch (err) {
    console.error("Get major error:", err);
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
