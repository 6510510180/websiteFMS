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

// ===== POST /api/courses =====
app.post("/api/courses", async (req, res) => {
  const {
    name_th, name_en, degree_level, status,
    program_type, study_system, award_title,
    total_credits, short_detail, hero_image,
    info_image, student_range
  } = req.body;

  if (!name_th) return res.status(400).json({ message: "กรอกข้อมูลไม่ครบ" });

  try {
    const result = await pool.query(
      `INSERT INTO courses
      (name_th, name_en, degree_level, status, program_type, study_system,
       award_title, total_credits, short_detail, hero_image, info_image, student_range)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      RETURNING id`,
      [
        name_th,
        name_en || null,
        degree_level || null,
        status,
        program_type || null,
        study_system || null,
        award_title || null,
        total_credits || null,   // ✅ แก้แล้ว: "" → null ป้องกัน integer error
        short_detail || null,
        hero_image || null,
        info_image || null,
        student_range || null
      ]
    );
    res.json({ message: "เพิ่มหลักสูตรสำเร็จ", id: result.rows[0].id });
  } catch (err) {
    console.error("Add course error:", err.message, err.detail);
    res.status(500).json({ message: err.message });
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

app.delete("/api/majors/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      "DELETE FROM majors WHERE id = $1 RETURNING *",
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "ไม่พบสาขา" });
    }

    res.json({ message: "ลบสาขาสำเร็จ" });
  } catch (err) {
    console.error("Delete major error:", err);
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
        name_en || null,
        intro || null,
        image_url || null,
        career_path || null,
        plan_1 || null,
        plan_2 || null,
        plan_3 || null,
        plan_4 || null
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
        name_en || null,
        intro || null,
        image_url || null,
        career_path || null,
        plan_1 || null,
        plan_2 || null,
        plan_3 || null,
        plan_4 || null,
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
    info_image,
    student_range
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
        info_image=$11,
        student_range=$12
      WHERE id=$13
      RETURNING id`,
      [
        name_th,
        name_en || null,
        degree_level || null,
        status,
        program_type || null,
        study_system || null,
        award_title || null,
        total_credits || null,   // ✅ แก้แล้ว: "" → null ป้องกัน integer error
        short_detail || null,
        hero_image || null,
        info_image || null,
        student_range || null,
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
    console.error("Update course error:", err.message, err.detail);
    res.status(500).json({ message: err.message });
  }
});

// GET หลักสูตรเดียว
app.get("/api/courses/:id", async (req, res) => {
  const { id } = req.params;
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
    console.error(err);
    res.status(500).json({ message: err.message });
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

// =======================
// STUDY PLAN API
// =======================

/**
 * LIST study plans ของหลักสูตร + ค้นหา/แบ่งหน้า
 * GET /api/courses/:courseId/study-plans?search=&year_no=&status=&page=1&pageSize=10
 */
app.get("/api/courses/:courseId/study-plans", async (req, res) => {
  const { courseId } = req.params;
  const { search = "", year_no, status, page = 1, pageSize = 10 } = req.query;

  const values = [courseId];
  let where = "WHERE sp.course_id = $1";
  let idx = 2;

  if (year_no) {
    where += ` AND sp.year_no = $${idx++}`;
    values.push(year_no);
  }
  if (status) {
    where += ` AND sp.status = $${idx++}`;
    values.push(status);
  }
  if (search) {
    where += ` AND EXISTS (
      SELECT 1 FROM semesters s
      JOIN semester_subjects ss ON ss.semester_id = s.id
      JOIN subjects sbj ON sbj.id = ss.subject_id
      WHERE s.study_plan_id = sp.id
        AND (sbj.code ILIKE $${idx} OR sbj.name_th ILIKE $${idx} OR sbj.name_en ILIKE $${idx})
    )`;
    values.push(`%${search}%`);
    idx++;
  }

  const offset = (Number(page) - 1) * Number(pageSize);
  const limitClause = ` LIMIT ${Number(pageSize)} OFFSET ${offset}`;

  try {
    const total = await pool.query(
      `SELECT COUNT(*) FROM study_plans sp ${where}`, values
    );

    const result = await pool.query(
      `SELECT sp.*, 
              (SELECT COALESCE(SUM(total_credits),0) FROM semesters WHERE study_plan_id=sp.id) AS sum_credits
       FROM study_plans sp
       ${where}
       ORDER BY sp.academic_year DESC, sp.year_no ASC
       ${limitClause}`,
      values
    );

    res.json({
      data: result.rows,
      total: Number(total.rows[0].count),
      page: Number(page),
      pageSize: Number(pageSize)
    });

  } catch (err) {
    console.error("List study plans error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * CREATE study plan
 * body: { academic_year, year_no, status }
 */
app.post("/api/courses/:courseId/study-plans", async (req, res) => {
  const { courseId } = req.params;
  const { academic_year, year_no, status = "active" } = req.body;
  if (!academic_year || !year_no) return res.status(400).json({ message: "ข้อมูลไม่ครบ" });

  try {
    const result = await pool.query(
      `INSERT INTO study_plans(course_id, academic_year, year_no, status)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [courseId, academic_year, year_no, status]
    );
    res.json({ message: "สร้างแผนการศึกษาสำเร็จ", plan: result.rows[0] });
  } catch (err) {
    console.error("Create study plan error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * GET study plan detail (รวม semester + subjects)
 */
app.get("/api/study-plans/:planId", async (req, res) => {
  const { planId } = req.params;
  try {
    const plan = await pool.query("SELECT * FROM study_plans WHERE id=$1", [planId]);
    if (plan.rows.length === 0) return res.status(404).json({ message: "ไม่พบแผน" });

    const semesters = await pool.query(
      `SELECT * FROM semesters WHERE study_plan_id=$1 ORDER BY sort_order ASC, term_no ASC`,
      [planId]
    );

    const semesterIds = semesters.rows.map(r => r.id);
    let subjectsMap = {};
    if (semesterIds.length > 0) {
      const ss = await pool.query(
        `SELECT ss.*, sbj.code, sbj.name_th, sbj.name_en, sbj.default_credits, sbj.default_hour_structure
         FROM semester_subjects ss
         JOIN subjects sbj ON sbj.id = ss.subject_id
         WHERE ss.semester_id = ANY($1::int[])
         ORDER BY ss.sort_order ASC, ss.id ASC`,
        [semesterIds]
      );
      ss.rows.forEach(row => {
        if (!subjectsMap[row.semester_id]) subjectsMap[row.semester_id] = [];
        subjectsMap[row.semester_id].push(row);
      });
    }

    const tree = semesters.rows.map(s => ({
      ...s,
      subjects: subjectsMap[s.id] || []
    }));

    res.json({ plan: plan.rows[0], semesters: tree });

  } catch (err) {
    console.error("Get plan detail error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * UPDATE study plan (เปลี่ยนสถานะ ฯลฯ)
 */
app.put("/api/study-plans/:planId", async (req, res) => {
  const { planId } = req.params;
  const { academic_year, year_no, status } = req.body;
  try {
    await pool.query(
      `UPDATE study_plans SET
         academic_year = COALESCE($1, academic_year),
         year_no = COALESCE($2, year_no),
         status = COALESCE($3, status)
       WHERE id=$4`,
      [academic_year, year_no, status, planId]
    );
    res.json({ message: "อัปเดตแผนสำเร็จ" });
  } catch (err) {
    console.error("Update plan error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * DELETE study plan
 */
app.delete("/api/study-plans/:planId", async (req, res) => {
  const { planId } = req.params;
  try {
    const r = await pool.query("DELETE FROM study_plans WHERE id=$1 RETURNING *", [planId]);
    if (r.rows.length === 0) return res.status(404).json({ message: "ไม่พบแผน" });
    res.json({ message: "ลบแผนสำเร็จ" });
  } catch (err) {
    console.error("Delete plan error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * SEMESTERS
 * POST /api/study-plans/:planId/semesters  body: { term_no, title, sort_order }
 */
app.post("/api/study-plans/:planId/semesters", async (req, res) => {
  const { planId } = req.params;
  const { term_no, title, sort_order = 1 } = req.body;
  if (!term_no) return res.status(400).json({ message: "ข้อมูลไม่ครบ" });

  try {
    const result = await pool.query(
      `INSERT INTO semesters(study_plan_id, term_no, title, sort_order)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [planId, term_no, title, sort_order]
    );
    res.json({ message: "เพิ่มภาคเรียนสำเร็จ", semester: result.rows[0] });
  } catch (err) {
    console.error("Create semester error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * PUT /api/semesters/:semesterId  body: { title, sort_order }
 */
app.put("/api/semesters/:semesterId", async (req, res) => {
  const { semesterId } = req.params;
  const { title, sort_order } = req.body;
  try {
    await pool.query(
      `UPDATE semesters SET
         title = COALESCE($1, title),
         sort_order = COALESCE($2, sort_order)
       WHERE id=$3`,
      [title, sort_order, semesterId]
    );
    res.json({ message: "อัปเดตภาคเรียนสำเร็จ" });
  } catch (err) {
    console.error("Update semester error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * DELETE /api/semesters/:semesterId
 */
app.delete("/api/semesters/:semesterId", async (req, res) => {
  const { semesterId } = req.params;
  try {
    const r = await pool.query("DELETE FROM semesters WHERE id=$1 RETURNING *", [semesterId]);
    if (r.rows.length === 0) return res.status(404).json({ message: "ไม่พบภาคเรียน" });
    res.json({ message: "ลบภาคเรียนสำเร็จ" });
  } catch (err) {
    console.error("Delete semester error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * SUBJECTS (คลังวิชา)
 * POST /api/subjects  body: { code, name_th, name_en, default_credits, default_hour_structure }
 */
app.post("/api/subjects", async (req, res) => {
  const {
    code, name_th, name_en,
    default_credits, default_hour_structure,
    description_th, description_en,
    outcomes_th, outcomes_en
  } = req.body;

  if (!code || !name_th || !default_credits) {
    return res.status(400).json({ message: "ข้อมูลไม่ครบ" });
  }

  try {
    const r = await pool.query(
      `INSERT INTO subjects(
         code, name_th, name_en,
         default_credits, default_hour_structure,
         description_th, description_en, outcomes_th, outcomes_en
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [
        code, name_th, name_en || null,
        default_credits, default_hour_structure || null,
        description_th || null, description_en || null,
        outcomes_th || null, outcomes_en || null
      ]
    );
    res.json({ message: "เพิ่มรายวิชาสำเร็จ", subject: r.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ message: "รหัสวิชาซ้ำ" });
    console.error("Create subject error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * SEARCH subjects สำหรับ autocomplete
 * GET /api/subjects?query=460-10
 */
app.get("/api/subjects", async (req, res) => {
  const { query = "" } = req.query;
  try {
    const r = await pool.query(
      `SELECT * FROM subjects
       WHERE code ILIKE $1 OR name_th ILIKE $1 OR name_en ILIKE $1
       ORDER BY code ASC LIMIT 20`,
      [`%${query}%`]
    );
    res.json(r.rows);
  } catch (err) {
    console.error("Search subject error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * UPDATE รายวิชาในภาคเรียน
 */
app.put("/api/semester-subjects/:id", async (req, res) => {
  const { id } = req.params;
  const { category, credits, hour_structure, sort_order } = req.body;

  try {
    const updated = await pool.query(
      `UPDATE semester_subjects SET
         category = COALESCE($1, category),
         credits = $2,
         hour_structure = $3,
         sort_order = COALESCE($4, sort_order)
       WHERE id=$5
       RETURNING semester_id`,
      [category || null, credits ?? null, hour_structure || null, sort_order || null, id]
    );

    if (updated.rows.length === 0) return res.status(404).json({ message: "ไม่พบข้อมูล" });
    const semesterId = updated.rows[0].semester_id;

    await pool.query(
      `UPDATE semesters s
       SET total_credits = COALESCE((
         SELECT SUM(COALESCE(ss.credits, sb.default_credits))
         FROM semester_subjects ss
         JOIN subjects sb ON sb.id = ss.subject_id
         WHERE ss.semester_id = s.id
       ),0)
       WHERE s.id=$1`,
      [semesterId]
    );

    res.json({ message: "อัปเดตรายวิชาสำเร็จ" });
  } catch (err) {
    console.error("Update semester-subject error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * DELETE รายวิชาในภาคเรียน
 */
app.delete("/api/semester-subjects/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const r = await pool.query(
      `DELETE FROM semester_subjects WHERE id=$1 RETURNING semester_id`,
      [id]
    );
    if (r.rows.length === 0) return res.status(404).json({ message: "ไม่พบข้อมูล" });

    const semesterId = r.rows[0].semester_id;
    await pool.query(
      `UPDATE semesters s
       SET total_credits = COALESCE((
         SELECT SUM(COALESCE(ss.credits, sb.default_credits))
         FROM semester_subjects ss
         JOIN subjects sb ON sb.id = ss.subject_id
         WHERE ss.semester_id = s.id
       ),0)
       WHERE s.id=$1`,
      [semesterId]
    );

    res.json({ message: "ลบรายวิชาสำเร็จ" });
  } catch (err) {
    console.error("Delete semester-subject error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// LIST แผนของสาขา + ค้นหา/แบ่งหน้า
// GET /api/majors/:majorId/study-plans?search=&year_no=&status=&page=1&pageSize=10
app.get("/api/majors/:majorId/study-plans", async (req, res) => {
  const { majorId } = req.params;
  const { search = "", year_no, status, page = 1, pageSize = 10 } = req.query;
  const values = [majorId]; let where = "WHERE sp.major_id = $1"; let idx = 2;

  if (year_no) { where += ` AND sp.year_no = $${idx++}`; values.push(year_no); }
  if (status) { where += ` AND sp.status = $${idx++}`; values.push(status); }
  if (search) {
    where += ` AND EXISTS (
      SELECT 1 FROM semesters s
      JOIN semester_subjects ss ON ss.semester_id = s.id
      JOIN subjects sbj ON sbj.id = ss.subject_id
      WHERE s.study_plan_id = sp.id
        AND (sbj.code ILIKE $${idx} OR sbj.name_th ILIKE $${idx} OR sbj.name_en ILIKE $${idx})
    )`; values.push(`%${search}%`); idx++;
  }

  const offset = (Number(page) - 1) * Number(pageSize);
  try {
    const total = await pool.query(`SELECT COUNT(*) FROM study_plans sp ${where}`, values);
    const rows = await pool.query(
      `SELECT sp.*,
        (SELECT COALESCE(SUM(total_credits),0) FROM semesters WHERE study_plan_id=sp.id) AS sum_credits
       FROM study_plans sp
       ${where}
       ORDER BY sp.academic_year DESC, sp.year_no ASC
       LIMIT ${Number(pageSize)} OFFSET ${offset}`, values
    );
    res.json({ data: rows.rows, total: Number(total.rows[0].count), page: Number(page), pageSize: Number(pageSize) });
  } catch (e) { console.error(e); res.status(500).json({ message: "Server error" }); }
});

// CREATE แผนของสาขา
// POST /api/majors/:majorId/study-plans
// body: { academic_year, year_no, status }
app.post("/api/majors/:majorId/study-plans", async (req, res) => {
  const { majorId } = req.params;
  const { academic_year, year_no, status = "active" } = req.body;
  if (!academic_year || !year_no) return res.status(400).json({ message: "ข้อมูลไม่ครบ" });

  try {
    const r = await pool.query(
      `INSERT INTO study_plans(major_id, academic_year, year_no, status)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [majorId, academic_year, year_no, status]
    );
    res.json({ message: "สร้างแผนการศึกษาสำเร็จ", plan: r.rows[0] });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ message: "แผนของสาขา ปี/ปีการศึกษานี้มีอยู่แล้ว" });
    console.error(e); res.status(500).json({ message: "Server error" });
  }
});

// เพิ่มรายวิชาเข้าเทอม (ภาคเรียน)
// POST /api/semesters/:semesterId/subjects
app.post("/api/semesters/:semesterId/subjects", async (req, res) => {
  const { semesterId } = req.params;
  let {
    subject_id,
    code, name_th, name_en,
    default_credits, default_hour_structure,
    description_th, description_en,
    outcomes_th, outcomes_en,
    category = "Core", credits, hour_structure, sort_order = 1
  } = req.body;

  try {
    await pool.query("BEGIN");

    if (!subject_id) {
      if (!code || !name_th || !default_credits) {
        await pool.query("ROLLBACK");
        return res.status(400).json({ message: "ข้อมูลวิชาไม่ครบ" });
      }
      const created = await pool.query(
        `INSERT INTO subjects(
           code, name_th, name_en,
           default_credits, default_hour_structure,
           description_th, description_en, outcomes_th, outcomes_en
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         RETURNING id`,
        [
          code, name_th, name_en || null,
          default_credits, default_hour_structure || null,
          description_th || null, description_en || null,
          outcomes_th || null, outcomes_en || null
        ]
      );
      subject_id = created.rows[0].id;
    }

    const r = await pool.query(
      `INSERT INTO semester_subjects(semester_id, subject_id, category, credits, hour_structure, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [semesterId, subject_id, category, credits ?? null, hour_structure || null, sort_order]
    );

    await pool.query(
      `UPDATE semesters s
       SET total_credits = COALESCE((
         SELECT SUM(COALESCE(ss.credits, sb.default_credits))
         FROM semester_subjects ss
         JOIN subjects sb ON sb.id = ss.subject_id
         WHERE ss.semester_id = s.id
       ),0)
       WHERE s.id=$1`,
      [semesterId]
    );

    await pool.query("COMMIT");
    res.json({ message: "เพิ่มรายวิชาสำเร็จ", item: r.rows[0] });

  } catch (err) {
    await pool.query("ROLLBACK");
    console.error("Add subject to semester error:", err);
    res.status(500).json({ message: "Server error" });
  }
});