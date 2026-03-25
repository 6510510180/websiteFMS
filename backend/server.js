require("dotenv").config();

const express = require("express");
const mysql   = require("mysql2/promise");
const cors    = require("cors");
const path    = require("path");
const multer  = require("multer");

const app  = express();
const PORT = process.env.PORT || 3000;

function startServer(port) {
  const server = app.listen(port)
    .on('listening', () => {
      console.log(`Server running on port ${port}`);
    })
    .on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`Port ${port} is busy, trying ${port + 1}...`);
        startServer(port + 1);
      } else {
        console.error('Server error:', err);
      }
    });
}

startServer(PORT);

// ── Middleware ───────────────────────────────────────────────
const CORS_ORIGINS = (process.env.CORS_ORIGINS || "http://localhost:3000,http://localhost:5500,http://localhost:5173")
  .split(',').map(o => o.trim()).filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // อนุญาต localhost เสมอในทุก port (dev)
    const isLocalhost = !origin || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
    if (isLocalhost || CORS_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS: origin "${origin}" is not allowed`));
    }
  },
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
// ============================================================
//  STUDENTS DASHBOARD API (สำหรับ bba-students.html)
// ============================================================
app.get("/api/students/programs", async (req, res) => {
  try {
    const result = await query("SELECT id, name_th, name_en, code FROM programs ORDER BY year DESC, code");
    res.json({ programs: result.rows });
  } catch (err) { res.status(500).json({ message: "Server error" }); }
});

app.get("/api/students", async (req, res) => {
  const { program_id } = req.query;

  // ══ ไม่มี program_id → ดึงจาก bba_* (Student Data Hub) ══
  if (!program_id) {
    try {
      const [[pub]] = await pool.execute(
        "SELECT published FROM bba_publish_state WHERE section = 'students'"
      );
      if (!pub?.published) {
        return res.json({ ok: false, published: false });
      }

      const [intakeRows] = await pool.execute("SELECT * FROM bba_intake ORDER BY year, major_id");
      const intake = {};
      intakeRows.forEach(r => {
        if (!intake[r.major_id]) intake[r.major_id] = [];
        intake[r.major_id].push([r.year, r.plan, r.interviewed, r.confirmed, r.reported, r.no_show]);
      });

      const [trendRows] = await pool.execute("SELECT * FROM bba_trend ORDER BY year");
      const trend = {};
      trendRows.forEach(r => { trend[r.year] = { enrolled: r.enrolled, graduated: r.graduated }; });

      const [statusRows] = await pool.execute("SELECT * FROM bba_status ORDER BY year, id");
      const status = {};
      statusRows.forEach(r => {
        if (!status[r.year]) status[r.year] = [];
        status[r.year].push({ label: r.label, val: r.val, color: r.color });
      });

      const [coopRows]   = await pool.execute("SELECT * FROM bba_coop WHERE type='coop'   ORDER BY year, major_id");
      const [internRows] = await pool.execute("SELECT * FROM bba_coop WHERE type='intern' ORDER BY year, major_id");
      const coopYrs   = [...new Set(coopRows.map(r => r.year))].sort((a,b) => a-b);
      const internYrs = [...new Set(internRows.map(r => r.year))].sort((a,b) => a-b);
      const MJ_KEYS = ['fin','mkt','hrm','lsm','mice','bis'];
      const coop = {}, intern = {};
      MJ_KEYS.forEach(m => {
        coop[m]   = coopYrs.map(y   => { const r = coopRows.find(x => x.year===y && x.major_id===m);  return r ? r.count : 0; });
        intern[m] = internYrs.map(y => { const r = internRows.find(x => x.year===y && x.major_id===m); return r ? r.count : 0; });
      });

      const [top5Rows]    = await pool.execute("SELECT * FROM bba_top5 ORDER BY type, rank_no");
      const [partnerRows] = await pool.execute("SELECT * FROM bba_partners ORDER BY type, id");

      return res.json({
        ok: true, published: true,
        intake, trend, status,
        coop, coopYrs, intern, internYrs,
        top5Coop:      top5Rows.filter(r => r.type==='coop').map(r => r.company),
        top5Intern:    top5Rows.filter(r => r.type==='intern').map(r => r.company),
        partnersCoop:  partnerRows.filter(r => r.type==='coop').map(r => r.name),
        partnersIntern:partnerRows.filter(r => r.type==='intern').map(r => r.name),
      });

    } catch (err) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  }

  // ══ มี program_id → ใช้ logic เดิม ══
  try {
    // ดึง majors
    const majors = (await query(
      "SELECT id, name_th, name_en FROM majors WHERE course_id = (SELECT course_id FROM programs WHERE id = $1) ORDER BY id",
      [program_id]
    )).rows;
    // ... โค้ดเดิมที่เหลือทั้งหมด
    

    // ดึง intake stats
    const stats = (await query(
      "SELECT * FROM student_stats WHERE program_id = $1 ORDER BY academic_year DESC",
      [program_id]
    )).rows;

    // ดึง status snapshots
    const snapshots = (await query(
      "SELECT * FROM student_status_snapshots WHERE program_id = $1 ORDER BY academic_year DESC",
      [program_id]
    )).rows;

    // ดึง coop stats
    const coopStats = (await query(
      "SELECT * FROM coop_intern_stats WHERE program_id = $1 ORDER BY academic_year DESC",
      [program_id]
    )).rows;

    // สร้าง years list
    const yearsSet = new Set([
      ...stats.map(s => s.academic_year),
      ...snapshots.map(s => s.academic_year),
    ]);
    const years = [...yearsSet].sort((a, b) => b - a);

    if (!years.length) return res.status(404).json({ ok: false, error: "ยังไม่มีข้อมูลในฐานข้อมูล" });

    // สร้าง intake object { major_id: [[year, plan, inv, confirm, reported, no_show], ...] }
    const intake = {};
    majors.forEach(m => { intake[m.id] = []; });
    stats.forEach(s => {
      if (!intake[s.major_id]) intake[s.major_id] = [];
      intake[s.major_id].push([
        s.academic_year, s.plan_intake, s.interviewed,
        s.confirmed, s.reported, s.no_show_intake,
        s.total_enrolled, s.total_graduated
      ]);
    });

    // สร้าง trend array
    const trendMap = {};
    snapshots.forEach(s => {
      trendMap[s.academic_year] = {
        year: s.academic_year,
        currently_enrolled: s.currently_enrolled,
        graduated: s.graduated,
        no_show: s.no_show,
        transferred: s.transferred,
        dropped_out: s.dropped_out,
        on_leave: s.on_leave,
      };
    });
    const trend = Object.values(trendMap).sort((a, b) => b.year - a.year);

    // สร้าง coop object { year: { coop_total, intern_total, byMajor: { major_id: { coop, intern } } } }
    const coopByYear = {};
    coopStats.forEach(c => {
      if (!coopByYear[c.academic_year]) coopByYear[c.academic_year] = { coop_total: 0, intern_total: 0, byMajor: {} };
      coopByYear[c.academic_year].coop_total  += c.coop_count  || 0;
      coopByYear[c.academic_year].intern_total += c.intern_count || 0;
      coopByYear[c.academic_year].byMajor[c.major_id] = { coop: c.coop_count || 0, intern: c.intern_count || 0 };
    });

    // major colors/icons
    const COLORS = ['#7c3aed','#2563eb','#0891b2','#ea580c','#059669','#db2777'];
    const ICONS  = ['💰','📢','👥','🚚','💻','🎪'];
    const majorsFmt = majors.map((m, i) => ({
      id:    m.id,
      short: m.name_en || m.name_th,
      color: COLORS[i % COLORS.length],
      icon:  ICONS[i % ICONS.length],
    }));

    res.json({
      ok: true,
      years,
      majors:  majorsFmt,
      intake,
      trend,
      coop:    coopByYear,
    });
  } catch (err) {
    console.error("/api/students error:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});


// ── Cloudinary (คงไว้เหมือนเดิม) ────────────────────────────
// ── Cloudinary ────────────────────────────────────────────────
const { v2: cloudinary } = require("cloudinary");

// 1. config ก่อน
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// 2. ค่อยสร้าง storage
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinaryStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder:          'fms-uploads',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
    transformation:  [{ quality: 'auto', fetch_format: 'auto' }],
  },
});
const upload = multer({ storage: cloudinaryStorage });
// ── Upload Routes (ต้องอยู่ก่อน static middleware) ──────────
app.post("/api/upload/image", (req, res) => {
  upload.single("image")(req, res, (err) => {
    if (err) {
      console.error("❌ Upload/image error:", err.message);
      return res.status(500).json({ success: false, message: err.message });
    }
    if (!req.file) return res.status(400).json({ success: false, message: "No file uploaded" });
    console.log("✅ Upload success:", req.file.path);
    res.json({ success: true, url: req.file.path });
  });
});

app.post("/api/upload", (req, res) => {
  upload.single("image")(req, res, (err) => {
    if (err) return res.status(500).json({ message: err.message });
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });
    res.json({ url: req.file.path });
  });
});


// ── Serve Frontend ───────────────────────────────────────────
app.use(express.static(path.join(__dirname, "../frontend")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/login.html"));
});
// ── Database: MySQL / MariaDB (XAMPP) ────────────────────────
const pool = mysql.createPool({
  host:               process.env.DB_HOST     || "localhost",
  port:               process.env.DB_PORT     || 3306,
  user:               process.env.DB_USER     || "root",
  password:           process.env.DB_PASSWORD || "",   // XAMPP default = ไม่มี password
  database:           process.env.DB_NAME     || "fms_db",
  waitForConnections: true,
  connectionLimit:    10,
  queueLimit:         0,
  typeCast: (field, next) => {
    if (field.type === "TINY" && field.length === 1) return field.string() === "1";
    return next();
  },
});
// ── Query helper ─────────────────────────────────────────────
// แปลง $1,$2,... (PostgreSQL style) → ? (MySQL style) อัตโนมัติ
// ห่อผลลัพธ์เป็น { rows } เหมือน pg เพื่อให้โค้ดส่วนที่เหลือเปลี่ยนน้อยที่สุด
function pgToMysql(sql) {
  return sql.replace(/\$\d+/g, "?");
}
async function query(sql, values = []) {
  const [rows] = await pool.execute(pgToMysql(sql), values);
  return { rows: Array.isArray(rows) ? rows : [rows] };
}
// PLO Scores routes
const ploRoutes = require('./routes/plo-scores')(pool);
app.use('/api/plo', ploRoutes);
// ── Test connection ──────────────────────────────────────────
(async () => {
  try {
    const conn = await pool.getConnection();
    console.log("✅ Connected to MySQL (XAMPP)");
    conn.release();
  } catch (err) {
    console.error("❌ Database connection error:", err.message);
  }
})();
// ใน server.js — วางหลัง pool สร้างแล้ว (ใกล้กับ studentsRouter)
const graduateRouter = require('./routes/Graduate')(pool);
app.use('/api', graduateRouter);
// ── Major Subjects Router ─────────────────────────────────
const subjectsRouter = require('./routes/subjects-router');
app.use('/api', subjectsRouter);
// ── Minor Groups ──────────────────────────────────────────────
// ── Minor Groups (ตาราง minor_groups) ────────────────────────
app.get('/api/minor-groups', async (req, res) => {
  try {
    const { course_id } = req.query;
    let sql = 'SELECT * FROM minor_groups WHERE is_active = 1';
    const args = [];
    if (course_id) { sql += ' AND course_id = ?'; args.push(course_id); }
    sql += ' ORDER BY sort_order, id';
    const result = await query(sql, args);
    res.json(result.rows);
  } catch(e) { res.status(500).json({ message: e.message }); }
});
// ============================================================
//  STUDENT PAGE CONTENT
// ============================================================
app.get('/api/student-page-content', async (req, res) => {
  try {
    const { course_id } = req.query;
    if (!course_id) return res.status(400).json({ success: false, message: 'ต้องส่ง course_id' });
    const result = await query(
      'SELECT * FROM student_page_content WHERE course_id = ? LIMIT 1', [course_id]
    );
    if (!result.rows.length) return res.json({ success: true, data: null });
    const row = result.rows[0];
    res.json({
      success: true,
      data: {
        structure: row.structure ? JSON.parse(row.structure) : null,
        minor_header: row.minor_header ? JSON.parse(row.minor_header) : null,
      }
    });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

app.put('/api/student-page-content', async (req, res) => {
  try {
    const { course_id, structure, minor_header } = req.body;
    if (!course_id) return res.status(400).json({ success: false, message: 'ต้องส่ง course_id' });
    await query(
      `INSERT INTO student_page_content (course_id, structure, minor_header)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE
         structure    = VALUES(structure),
         minor_header = VALUES(minor_header),
         updated_at   = NOW()`,
      [course_id, JSON.stringify(structure || {}), JSON.stringify(minor_header || {})]
    );
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ============================================================
//  MINOR GROUPS — POST / PUT / DELETE (GET มีอยู่แล้ว)
// ============================================================
app.post('/api/minor-groups', async (req, res) => {
  try {
    const { course_id, name_th, name_en, note, free_note, sort_order, allow_mix, color } = req.body;
    if (!course_id || !name_th) return res.status(400).json({ success: false, message: 'ต้องส่ง course_id และ name_th' });
    const result = await query(
      `INSERT INTO minor_groups (course_id, name_th, name_en, note, free_note, sort_order, allow_mix, color, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [course_id, name_th, name_en || null, note || null, free_note || null,
       sort_order || 0, allow_mix ? 1 : 0, color || '#7c3aed']
    );
    res.status(201).json({ success: true, id: result.rows[0].insertId });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

app.put('/api/minor-groups/:id', async (req, res) => {
  try {
    const { name_th, name_en, note, free_note, sort_order, allow_mix, color } = req.body;
    const result = await query(
      `UPDATE minor_groups SET
         name_th    = COALESCE(?, name_th),
         name_en    = ?,
         note       = ?,
         free_note  = ?,
         sort_order = COALESCE(?, sort_order),
         allow_mix  = ?,
         color      = COALESCE(?, color)
       WHERE id = ?`,
      [name_th || null, name_en || null, note || null, free_note || null,
       sort_order ?? null, allow_mix ? 1 : 0, color || null, req.params.id]
    );
    if (result.rows[0].affectedRows === 0)
      return res.status(404).json({ success: false, message: 'ไม่พบกลุ่มวิชาโท' });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

app.delete('/api/minor-groups/:id', async (req, res) => {
  try {
    const result = await query('DELETE FROM minor_groups WHERE id = ?', [req.params.id]);
    if (result.rows[0].affectedRows === 0)
      return res.status(404).json({ success: false, message: 'ไม่พบกลุ่มวิชาโท' });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});
// ── Minor Subjects (รวม BBA + ภายนอก) ────────────────────────
app.get('/api/minor-subjects', async (req, res) => {
  try {
    const { minor_group_id } = req.query;
    if (!minor_group_id) return res.status(400).json({ message: 'ต้องส่ง minor_group_id' });

    // ดูก่อนว่า group นี้เป็น bba หรือ external
    const grpResult = await query(
      'SELECT * FROM minor_groups WHERE id = ?', [minor_group_id]
    );
    if (!grpResult.rows.length) return res.status(404).json({ message: 'ไม่พบกลุ่ม' });
    const grp = grpResult.rows[0];

    let rows = [];
    if (grp.source_type === 'bba' && grp.major_id) {
      // ดึงจาก major_subjects ตาม major_id
      const r = await query(
        `SELECT * FROM major_subjects
         WHERE major_id = ? AND is_active = 1 AND credits != '—'
         ORDER BY subject_type DESC, sort_order, id`,
        [grp.major_id]
      );
      rows = r.rows;
    } else {
      // ดึงจาก minor_ext_subjects
      const r = await query(
        `SELECT * FROM minor_ext_subjects
         WHERE minor_group_id = ? AND is_active = 1
         ORDER BY subject_type DESC, sort_order, id`,
        [minor_group_id]
      );
      rows = r.rows;
    }

    res.json(rows);
  } catch(e) { res.status(500).json({ message: e.message }); }
});
// ── Health check ─────────────────────────────────────────────
app.get("/health", (req, res) => res.json({ status: "ok" }));
app.get("/api/test", (req, res) => res.json({ message: "API working" }));

// ============================================================
//  AUTH
// ============================================================
const bcrypt = require('bcryptjs');

app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ message: "กรุณากรอกอีเมลและรหัสผ่าน" });
  try {
    const result = await query("SELECT * FROM users WHERE email = $1", [email]);
    if (result.rows.length === 0)
      return res.status(401).json({ message: "อีเมลหรือรหัสผ่านไม่ถูกต้อง" });
    const user = result.rows[0];
    // รองรับทั้ง bcrypt hash และ plain text (กรณี migrate ยังไม่เสร็จ)
    const isHashed = user.password_hash?.startsWith('$2');
    const match = isHashed
      ? await bcrypt.compare(password, user.password_hash)
      : user.password_hash === password;
    if (!match)
      return res.status(401).json({ message: "อีเมลหรือรหัสผ่านไม่ถูกต้อง" });
    const { password_hash: _, ...safeUser } = user;
    res.json({ message: "เข้าสู่ระบบสำเร็จ", user: safeUser });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ============================================================
//  PUBLIC API
// ============================================================
app.get("/api/public/courses/:id", async (req, res) => {
  try {
    const result = await query("SELECT * FROM courses WHERE id = $1 AND status = 'active'", [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ message: "ไม่พบหลักสูตร" });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ message: "Server error" }); }
});

app.get("/api/public/courses/:id/majors", async (req, res) => {
  try {
    const result = await query("SELECT * FROM majors WHERE course_id = $1 ORDER BY id ASC", [req.params.id]);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ message: "Server error" }); }
});

app.get("/api/public/majors/:id", async (req, res) => {
  try {
    const result = await query("SELECT * FROM majors WHERE id = $1", [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ message: "ไม่พบวิชาเอก" });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ message: "Server error" }); }
});

// ============================================================
//  COURSES
// ============================================================
app.get("/api/courses", async (req, res) => {
  try {
    // ถ้าส่ง ?public=true มา → กรองเฉพาะ active
    const isPublic = req.query.public === 'true';
    const sql = isPublic
      ? "SELECT * FROM courses WHERE status = 'active' ORDER BY id DESC"
      : "SELECT * FROM courses ORDER BY id DESC";
    const result = await query(sql);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ message: "Server error" }); }
});
// เพิ่มใน serve.js ใต้ "/api/public/courses/:id"
app.get("/api/public/courses", async (req, res) => {
  try {
    const result = await query(
      "SELECT * FROM courses WHERE status IN ('active', 'maintenance') ORDER BY id DESC"
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ message: "Server error" }); }
});

app.get("/api/courses/:id", async (req, res) => {
  try {
    const result = await query("SELECT * FROM courses WHERE id = $1", [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ message: "ไม่พบหลักสูตร" });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.post("/api/courses", async (req, res) => {
  const { name_th, name_en, degree_level, status, program_type, study_system,
          award_title, total_credits, short_detail,
          hero_image, bg_image, info_image, student_range } = req.body;
  if (!name_th) return res.status(400).json({ message: "กรอกข้อมูลไม่ครบ" });
  try {
    const result = await query(
      `INSERT INTO courses
       (name_th,name_en,degree_level,status,program_type,study_system,
        award_title,total_credits,short_detail,hero_image,bg_image,info_image,student_range)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [name_th, name_en||null, degree_level||null, status, program_type||null,
       study_system||null, award_title||null, total_credits||null, short_detail||null,
       hero_image||null, bg_image||null, info_image||null, student_range||null]
    );
    res.json({ message: "เพิ่มหลักสูตรสำเร็จ", id: result.rows[0].insertId });
  } catch (err) { res.status(500).json({ message: err.message }); }
});
app.patch("/api/courses/:id/hero-image", async (req, res) => {
  const { hero_image_url } = req.body;
  try {
    await query(
      "UPDATE courses SET hero_image_url = $1 WHERE id = $2",
      [hero_image_url || null, req.params.id]
    );
    res.json({ success: true, hero_image_url: hero_image_url || null });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});
 

app.put("/api/courses/:id", async (req, res) => {
  const { name_th, name_en, degree_level, status, program_type, study_system,
          award_title, total_credits, short_detail,
          hero_image, bg_image, info_image, student_range } = req.body;
  if (!name_th) return res.status(400).json({ message: "กรอกข้อมูลไม่ครบ" });
  try {
    await query(
      `UPDATE courses SET
        name_th=$1,name_en=$2,degree_level=$3,status=$4,program_type=$5,
        study_system=$6,award_title=$7,total_credits=$8,short_detail=$9,
        hero_image=$10,bg_image=$11,info_image=$12,student_range=$13
       WHERE id=$14`,
      [name_th, name_en||null, degree_level||null, status, program_type||null,
       study_system||null, award_title||null, total_credits||null, short_detail||null,
       hero_image||null, bg_image||null, info_image||null, student_range||null, req.params.id]
    );
    res.json({ message: "อัปเดตหลักสูตรสำเร็จ", id: req.params.id });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.delete("/api/courses/:id", async (req, res) => {
  try {
    const result = await query("DELETE FROM courses WHERE id=$1", [req.params.id]);
    if (result.rows[0].affectedRows === 0) return res.status(404).json({ message: "ไม่พบหลักสูตร" });
    res.json({ message: "ลบหลักสูตรสำเร็จ" });
  } catch (err) { res.status(500).json({ message: "Server error" }); }
});

// ============================================================
//  MAJORS
// ============================================================
app.get("/api/courses/:id/majors", async (req, res) => {
  try {
    const result = await query("SELECT * FROM majors WHERE course_id=$1 ORDER BY id DESC", [req.params.id]);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ message: "Server error" }); }
});

app.get("/api/majors/:id", async (req, res) => {
  try {
    const result = await query("SELECT * FROM majors WHERE id=$1", [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ message: "ไม่พบข้อมูล" });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ message: "Server error" }); }
});

app.post("/api/majors", async (req, res) => {
  const { course_id, name_th, name_en, intro, hero_image, image_url,
          career_path, plan_1, plan_2, plan_3, plan_4 } = req.body;
  if (!course_id || !name_th) return res.status(400).json({ message: "ข้อมูลไม่ครบ" });
  try {
    const result = await query(
      `INSERT INTO majors (course_id,name_th,name_en,intro,hero_image,image_url,career_path,plan_1,plan_2,plan_3,plan_4)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [course_id, name_th, name_en||null, intro||null, hero_image||null, image_url||null,
       career_path||null, plan_1||null, plan_2||null, plan_3||null, plan_4||null]
    );
    res.json({ message: "เพิ่มวิชาเอกสำเร็จ", majorId: result.rows[0].insertId });
  } catch (err) { res.status(500).json({ message: "Server error" }); }
});

app.put("/api/majors/:id", async (req, res) => {
  const { name_th, name_en, intro, hero_image, image_url, career_path,
          plan_1, plan_2, plan_3, plan_4 } = req.body;
  try {
    const result = await query(
      `UPDATE majors SET name_th=$1,name_en=$2,intro=$3,hero_image=$4,image_url=$5,
       career_path=$6,plan_1=$7,plan_2=$8,plan_3=$9,plan_4=$10 WHERE id=$11`,
      [name_th, name_en||null, intro||null, hero_image||null, image_url||null,
       career_path||null, plan_1||null, plan_2||null, plan_3||null, plan_4||null, req.params.id]
    );
    if (result.rows[0].affectedRows === 0) return res.status(404).json({ message: "ไม่พบวิชาเอก" });
    res.json({ message: "อัปเดตวิชาเอกสำเร็จ" });
  } catch (err) { res.status(500).json({ message: "Server error" }); }
});

app.delete("/api/majors/:id", async (req, res) => {
  try {
    const result = await query("DELETE FROM majors WHERE id=$1", [req.params.id]);
    if (result.rows[0].affectedRows === 0) return res.status(404).json({ message: "ไม่พบวิชาเอก" });
    res.json({ message: "ลบวิชาเอกสำเร็จ" });
  } catch (err) { res.status(500).json({ message: "Server error" }); }
});

// ============================================================
//  STUDENT STATS
// ============================================================
app.get("/api/programs/:programId/student-stats", async (req, res) => {
  const { year, major_id } = req.query;
  let sql = `SELECT ss.*, m.name_th AS major_name, m.name_en AS major_name_en
             FROM student_stats ss LEFT JOIN majors m ON m.id=ss.major_id
             WHERE ss.program_id=$1`;
  const values = [req.params.programId]; let idx = 2;
  if (year)     { sql += ` AND ss.academic_year=$${idx++}`; values.push(year); }
  if (major_id) { sql += ` AND ss.major_id=$${idx++}`;      values.push(major_id); }
  sql += " ORDER BY ss.academic_year DESC, m.name_th";
  try { res.json((await query(sql, values)).rows); }
  catch (err) { res.status(500).json({ message: "Server error" }); }
});

app.get("/api/student-stats/:id", async (req, res) => {
  try {
    const result = await query("SELECT * FROM student_stats WHERE id=$1", [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ message: "ไม่พบข้อมูล" });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ message: "Server error" }); }
});

app.post("/api/student-stats", async (req, res) => {
  const { program_id, academic_year, major_id, plan_intake, interviewed, confirmed,
          reported, no_show_intake, total_enrolled, total_graduated } = req.body;
  if (!program_id || !academic_year)
    return res.status(400).json({ message: "ต้องส่ง program_id และ academic_year" });
  try {
    await query(
      `INSERT INTO student_stats
         (program_id,academic_year,major_id,plan_intake,interviewed,confirmed,
          reported,no_show_intake,total_enrolled,total_graduated)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON DUPLICATE KEY UPDATE
         plan_intake=VALUES(plan_intake),interviewed=VALUES(interviewed),
         confirmed=VALUES(confirmed),reported=VALUES(reported),
         no_show_intake=VALUES(no_show_intake),total_enrolled=VALUES(total_enrolled),
         total_graduated=VALUES(total_graduated),updated_at=now()`,
      [program_id, academic_year, major_id||null, plan_intake||0, interviewed||0,
       confirmed||0, reported||0, no_show_intake||0, total_enrolled||0, total_graduated||0]
    );
    res.status(201).json({ message: "บันทึกสถิตินักศึกษาสำเร็จ" });
  } catch (err) { res.status(500).json({ message: "Server error" }); }
});

app.put("/api/student-stats/:id", async (req, res) => {
  const { plan_intake, interviewed, confirmed, reported, no_show_intake,
          total_enrolled, total_graduated } = req.body;
  try {
    const result = await query(
      `UPDATE student_stats SET
         plan_intake=COALESCE($1,plan_intake),interviewed=COALESCE($2,interviewed),
         confirmed=COALESCE($3,confirmed),reported=COALESCE($4,reported),
         no_show_intake=COALESCE($5,no_show_intake),total_enrolled=COALESCE($6,total_enrolled),
         total_graduated=COALESCE($7,total_graduated),updated_at=now() WHERE id=$8`,
      [plan_intake, interviewed, confirmed, reported, no_show_intake, total_enrolled, total_graduated, req.params.id]
    );
    if (result.rows[0].affectedRows === 0) return res.status(404).json({ message: "ไม่พบข้อมูล" });
    res.json({ message: "อัปเดตสถิตินักศึกษาสำเร็จ" });
  } catch (err) { res.status(500).json({ message: "Server error" }); }
});

app.delete("/api/student-stats/:id", async (req, res) => {
  try {
    const result = await query("DELETE FROM student_stats WHERE id=$1", [req.params.id]);
    if (result.rows[0].affectedRows === 0) return res.status(404).json({ message: "ไม่พบข้อมูล" });
    res.json({ message: "ลบสถิตินักศึกษาสำเร็จ" });
  } catch (err) { res.status(500).json({ message: "Server error" }); }
});

app.get("/api/programs/:programId/annual-summary", async (req, res) => {
  const { year } = req.query;
  let sql = "SELECT * FROM v_annual_summary WHERE program_id=$1";
  const values = [req.params.programId];
  if (year) { sql += " AND academic_year=$2"; values.push(year); }
  try { res.json((await query(sql + " ORDER BY academic_year DESC", values)).rows); }
  catch (err) { res.status(500).json({ message: "Server error" }); }
});

// ============================================================
//  STUDENT STATUS SNAPSHOTS
// ============================================================
app.get("/api/programs/:programId/status-snapshots", async (req, res) => {
  const { year } = req.query;
  let sql = "SELECT * FROM student_status_snapshots WHERE program_id=$1";
  const values = [req.params.programId];
  if (year) { sql += " AND academic_year=$2"; values.push(year); }
  try { res.json((await query(sql + " ORDER BY academic_year DESC", values)).rows); }
  catch (err) { res.status(500).json({ message: "Server error" }); }
});

app.get("/api/status-snapshots/:id", async (req, res) => {
  try {
    const result = await query("SELECT * FROM student_status_snapshots WHERE id=$1", [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ message: "ไม่พบข้อมูล" });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ message: "Server error" }); }
});

app.post("/api/status-snapshots", async (req, res) => {
  const { program_id, academic_year, currently_enrolled, graduated,
          no_show, transferred, dropped_out, on_leave } = req.body;
  if (!program_id || !academic_year)
    return res.status(400).json({ message: "ต้องส่ง program_id และ academic_year" });
  try {
    await query(
      `INSERT INTO student_status_snapshots
         (program_id,academic_year,currently_enrolled,graduated,no_show,transferred,dropped_out,on_leave)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON DUPLICATE KEY UPDATE
         currently_enrolled=VALUES(currently_enrolled),graduated=VALUES(graduated),
         no_show=VALUES(no_show),transferred=VALUES(transferred),
         dropped_out=VALUES(dropped_out),on_leave=VALUES(on_leave),updated_at=now()`,
      [program_id, academic_year, currently_enrolled||0, graduated||0,
       no_show||0, transferred||0, dropped_out||0, on_leave||0]
    );
    res.status(201).json({ message: "บันทึก Snapshot สำเร็จ" });
  } catch (err) { res.status(500).json({ message: "Server error" }); }
});

app.put("/api/status-snapshots/:id", async (req, res) => {
  const { currently_enrolled, graduated, no_show, transferred, dropped_out, on_leave } = req.body;
  try {
    const result = await query(
      `UPDATE student_status_snapshots SET
         currently_enrolled=COALESCE($1,currently_enrolled),graduated=COALESCE($2,graduated),
         no_show=COALESCE($3,no_show),transferred=COALESCE($4,transferred),
         dropped_out=COALESCE($5,dropped_out),on_leave=COALESCE($6,on_leave),updated_at=now()
       WHERE id=$7`,
      [currently_enrolled, graduated, no_show, transferred, dropped_out, on_leave, req.params.id]
    );
    if (result.rows[0].affectedRows === 0) return res.status(404).json({ message: "ไม่พบข้อมูล" });
    res.json({ message: "อัปเดต Snapshot สำเร็จ" });
  } catch (err) { res.status(500).json({ message: "Server error" }); }
});

app.delete("/api/status-snapshots/:id", async (req, res) => {
  try {
    const result = await query("DELETE FROM student_status_snapshots WHERE id=$1", [req.params.id]);
    if (result.rows[0].affectedRows === 0) return res.status(404).json({ message: "ไม่พบข้อมูล" });
    res.json({ message: "ลบ Snapshot สำเร็จ" });
  } catch (err) { res.status(500).json({ message: "Server error" }); }
});

// ============================================================
//  COOP / INTERN STATS
// ============================================================
app.get("/api/programs/:programId/coop-stats", async (req, res) => {
  const { year, major_id } = req.query;
  let sql = `SELECT cs.*, m.name_th AS major_name, m.name_en AS major_name_en
             FROM coop_intern_stats cs LEFT JOIN majors m ON m.id=cs.major_id
             WHERE cs.program_id=$1`;
  const values = [req.params.programId]; let idx = 2;
  if (year)     { sql += ` AND cs.academic_year=$${idx++}`; values.push(year); }
  if (major_id) { sql += ` AND cs.major_id=$${idx++}`;      values.push(major_id); }
  try { res.json((await query(sql + " ORDER BY cs.academic_year DESC, m.name_th", values)).rows); }
  catch (err) { res.status(500).json({ message: "Server error" }); }
});

app.get("/api/coop-stats/:id", async (req, res) => {
  try {
    const result = await query("SELECT * FROM coop_intern_stats WHERE id=$1", [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ message: "ไม่พบข้อมูล" });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ message: "Server error" }); }
});

app.post("/api/coop-stats", async (req, res) => {
  const { program_id, academic_year, major_id, coop_count, intern_count } = req.body;
  if (!program_id || !academic_year)
    return res.status(400).json({ message: "ต้องส่ง program_id และ academic_year" });
  try {
    await query(
      `INSERT INTO coop_intern_stats (program_id,academic_year,major_id,coop_count,intern_count)
       VALUES ($1,$2,$3,$4,$5)
       ON DUPLICATE KEY UPDATE coop_count=VALUES(coop_count),intern_count=VALUES(intern_count),updated_at=now()`,
      [program_id, academic_year, major_id||null, coop_count||0, intern_count||0]
    );
    res.status(201).json({ message: "บันทึกสถิติสหกิจ/ฝึกงานสำเร็จ" });
  } catch (err) { res.status(500).json({ message: "Server error" }); }
});

app.put("/api/coop-stats/:id", async (req, res) => {
  const { coop_count, intern_count } = req.body;
  try {
    const result = await query(
      "UPDATE coop_intern_stats SET coop_count=COALESCE($1,coop_count),intern_count=COALESCE($2,intern_count),updated_at=now() WHERE id=$3",
      [coop_count, intern_count, req.params.id]
    );
    if (result.rows[0].affectedRows === 0) return res.status(404).json({ message: "ไม่พบข้อมูล" });
    res.json({ message: "อัปเดตสถิติสหกิจ/ฝึกงานสำเร็จ" });
  } catch (err) { res.status(500).json({ message: "Server error" }); }
});

app.delete("/api/coop-stats/:id", async (req, res) => {
  try {
    const result = await query("DELETE FROM coop_intern_stats WHERE id=$1", [req.params.id]);
    if (result.rows[0].affectedRows === 0) return res.status(404).json({ message: "ไม่พบข้อมูล" });
    res.json({ message: "ลบสถิติสหกิจ/ฝึกงานสำเร็จ" });
  } catch (err) { res.status(500).json({ message: "Server error" }); }
});

app.post("/api/programs/:programId/coop-stats/bulk", async (req, res) => {
  const { programId } = req.params;
  const { academic_year, items } = req.body;
  if (!academic_year || !Array.isArray(items) || items.length === 0)
    return res.status(400).json({ message: "ต้องส่ง academic_year และ items (array)" });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    for (const item of items) {
      await conn.execute(
        `INSERT INTO coop_intern_stats (program_id,academic_year,major_id,coop_count,intern_count)
         VALUES (?,?,?,?,?)
         ON DUPLICATE KEY UPDATE coop_count=VALUES(coop_count),intern_count=VALUES(intern_count),updated_at=now()`,
        [programId, academic_year, item.major_id||null, item.coop_count||0, item.intern_count||0]
      );
    }
    await conn.commit();
    res.json({ message: `นำเข้าสำเร็จ ${items.length} รายการ` });
  } catch (err) { await conn.rollback(); res.status(500).json({ message: "Server error: "+err.message }); }
  finally { conn.release(); }
});

// ============================================================
//  KAS REFERENCES API
// ============================================================
app.get("/api/kas", async (req, res) => {
  const { type } = req.query;
  try {
    let sql = "SELECT * FROM kas_references"; const values = [];
    if (type) { sql += " WHERE type=$1"; values.push(type); }
    res.json((await query(sql + " ORDER BY type, code", values)).rows);
  } catch (err) { res.status(500).json({ message: "Server error" }); }
});

app.post("/api/kas", async (req, res) => {
  const { type, code, label, plo_count, mlo_count } = req.body;
  if (!type || !code) return res.status(400).json({ message: "ต้องส่ง type และ code" });
  try {
    await query(
     `INSERT INTO kas_references (type,code,label,plo_count,mlo_count) VALUES ($1,$2,$3,$4,$5)
 ON DUPLICATE KEY UPDATE label=VALUES(label),plo_count=VALUES(plo_count),mlo_count=VALUES(mlo_count),updated_at=now()`,
[type, code, label||code, plo_count||0, mlo_count||0]
    );
    res.json({ message: "บันทึกสำเร็จ" });
  } catch (err) { res.status(500).json({ message: "Server error" }); }
});

app.put("/api/kas/:id", async (req, res) => {
  const { plo_count, mlo_count, label } = req.body;
  try {
    const result = await query(
      "UPDATE kas_references SET label=COALESCE($1,label),plo_count=COALESCE($2,plo_count),mlo_count=COALESCE($3,mlo_count),updated_at=now() WHERE id=$4",
[label||null, plo_count, mlo_count, req.params.id]
    );
    if (result.rows[0].affectedRows === 0) return res.status(404).json({ message: "ไม่พบข้อมูล" });
    res.json({ message: "อัปเดตสำเร็จ" });
  } catch (err) { res.status(500).json({ message: "Server error" }); }
});

app.delete("/api/kas/:id", async (req, res) => {
  try {
    const result = await query("DELETE FROM kas_references WHERE id=$1", [req.params.id]);
    if (result.rows[0].affectedRows === 0) return res.status(404).json({ message: "ไม่พบข้อมูล" });
    res.json({ message: "ลบสำเร็จ" });
  } catch (err) { res.status(500).json({ message: "Server error" }); }
});

app.post("/api/kas/bulk", async (req, res) => {
  const { items } = req.body;
  if (!Array.isArray(items) || items.length === 0)
    return res.status(400).json({ message: "ต้องส่ง items (array)" });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    for (const item of items) {
      await conn.execute(
  `INSERT INTO kas_references (type,code,label,plo_count,mlo_count) VALUES (?,?,?,?,?)
   ON DUPLICATE KEY UPDATE label=VALUES(label),plo_count=VALUES(plo_count),mlo_count=VALUES(mlo_count),updated_at=now()`,
  [item.type, item.code, item.label||item.code, item.plo_count||0, item.mlo_count||0]
);
    }
    await conn.commit();
    res.json({ message: `นำเข้าสำเร็จ ${items.length} รายการ` });
  } catch (err) { await conn.rollback(); res.status(500).json({ message: "Server error: "+err.message }); }
  finally { conn.release(); }
});

// ============================================================
//  SANKEY COURSES API
// ============================================================
app.get("/api/sankey-courses", async (req, res) => {
  const { major } = req.query;
  try {
    let sql = "SELECT * FROM sankey_courses"; const values = [];
    if (major) { sql += " WHERE major=$1"; values.push(major); }
    res.json((await query(sql + " ORDER BY major, group_type, code", values)).rows);
  } catch (err) { res.status(500).json({ message: "Server error" }); }
});

app.post("/api/sankey-courses", async (req, res) => {
  const { major, code, name, group_type, plo_mapping } = req.body;
  if (!major || !code || !name || !group_type) return res.status(400).json({ message: "ข้อมูลไม่ครบ" });
  try {
    await query(
      `INSERT INTO sankey_courses (major,code,name,group_type,plo_mapping) VALUES ($1,$2,$3,$4,$5)
       ON DUPLICATE KEY UPDATE name=VALUES(name),group_type=VALUES(group_type),plo_mapping=VALUES(plo_mapping),updated_at=now()`,
      [major, code, name, group_type, JSON.stringify(plo_mapping||{})]
    );
    res.json({ message: "บันทึกสำเร็จ" });
  } catch (err) { res.status(500).json({ message: "Server error" }); }
});

app.put("/api/sankey-courses/:id", async (req, res) => {
  const { name, group_type, plo_mapping } = req.body;
  try {
    const result = await query(
      "UPDATE sankey_courses SET name=COALESCE($1,name),group_type=COALESCE($2,group_type),plo_mapping=COALESCE($3,plo_mapping),updated_at=now() WHERE id=$4",
      [name, group_type, plo_mapping ? JSON.stringify(plo_mapping) : null, req.params.id]
    );
    if (result.rows[0].affectedRows === 0) return res.status(404).json({ message: "ไม่พบข้อมูล" });
    res.json({ message: "อัปเดตสำเร็จ" });
  } catch (err) { res.status(500).json({ message: "Server error" }); }
});

app.delete("/api/sankey-courses/:id", async (req, res) => {
  try {
    const result = await query("DELETE FROM sankey_courses WHERE id=$1", [req.params.id]);
    if (result.rows[0].affectedRows === 0) return res.status(404).json({ message: "ไม่พบข้อมูล" });
    res.json({ message: "ลบสำเร็จ" });
  } catch (err) { res.status(500).json({ message: "Server error" }); }
});

// ============================================================
//  STUDY PLANS
// ============================================================
app.get("/api/courses/:courseId/study-plans", async (req, res) => {
  const { courseId } = req.params;
  const { year_no, status, page = 1, pageSize = 10 } = req.query;
  let where = "WHERE sp.course_id=$1"; const values = [courseId]; let idx = 2;
  if (year_no) { where += ` AND sp.year_no=$${idx++}`; values.push(year_no); }
  if (status)  { where += ` AND sp.status=$${idx++}`;  values.push(status); }
  const offset = (Number(page)-1) * Number(pageSize);
  try {
    const total = await query(`SELECT COUNT(*) AS cnt FROM study_plans sp ${where}`, values);
    const rows  = await query(
      `SELECT sp.*, (SELECT COALESCE(SUM(total_credits),0) FROM semesters WHERE study_plan_id=sp.id) AS sum_credits
       FROM study_plans sp ${where} ORDER BY sp.academic_year DESC, sp.year_no ASC
       LIMIT $${idx} OFFSET $${idx+1}`, [...values, Number(pageSize), offset]
    );
    res.json({ data: rows.rows, total: Number(total.rows[0].cnt), page: Number(page), pageSize: Number(pageSize) });
  } catch (err) { res.status(500).json({ message: "Server error" }); }
});

app.post("/api/courses/:courseId/study-plans", async (req, res) => {
  const { courseId } = req.params;
  const { academic_year, year_no, status = "active" } = req.body;
  if (!academic_year || !year_no) return res.status(400).json({ message: "ข้อมูลไม่ครบ" });
  try {
    await query("INSERT INTO study_plans (course_id,academic_year,year_no,status) VALUES ($1,$2,$3,$4)", [courseId, academic_year, year_no, status]);
    res.json({ message: "สร้างแผนการศึกษาสำเร็จ" });
  } catch (err) { res.status(500).json({ message: "Server error" }); }
});

app.get("/api/majors/:majorId/study-plans", async (req, res) => {
  const { majorId } = req.params;
  const { year_no, status, plan_type, page = 1, pageSize = 10 } = req.query;
  let where = "WHERE sp.major_id=$1"; const values = [majorId]; let idx = 2;
  if (year_no)   { where += ` AND sp.year_no=$${idx++}`;   values.push(year_no); }
  if (status)    { where += ` AND sp.status=$${idx++}`;    values.push(status); }
  if (plan_type) { where += ` AND sp.plan_type=$${idx++}`; values.push(plan_type); }
  const offset = (Number(page)-1) * Number(pageSize);
  try {
    const total = await query(`SELECT COUNT(*) AS cnt FROM study_plans sp ${where}`, values);
    const rows  = await query(
      `SELECT sp.*, (SELECT COALESCE(SUM(total_credits),0) FROM semesters WHERE study_plan_id=sp.id) AS sum_credits
       FROM study_plans sp ${where} ORDER BY sp.academic_year DESC, sp.year_no ASC
       LIMIT $${idx} OFFSET $${idx+1}`, [...values, Number(pageSize), offset]
    );
    res.json({ data: rows.rows, total: Number(total.rows[0].cnt), page: Number(page), pageSize: Number(pageSize) });
  } catch (err) { res.status(500).json({ message: "Server error" }); }
});

app.post("/api/majors/:majorId/study-plans", async (req, res) => {
  const { majorId } = req.params;
  const { academic_year, year_no, status = "active", plan_type = "normal" } = req.body;
  if (!academic_year || !year_no) return res.status(400).json({ message: "ข้อมูลไม่ครบ (academic_year, year_no)" });
  if (!["normal","coop"].includes(plan_type)) return res.status(400).json({ message: "plan_type ต้องเป็น 'normal' หรือ 'coop'" });
  try {
    await query("INSERT INTO study_plans (major_id,academic_year,year_no,status,plan_type) VALUES ($1,$2,$3,$4,$5)", [majorId, academic_year, year_no, status, plan_type]);
    res.json({ message: "สร้างแผนการศึกษาสำเร็จ" });
  } catch (e) {
    if (e.code === "ER_DUP_ENTRY") return res.status(409).json({ message: `แผน${plan_type==="coop"?"สหกิจ":"ปกติ"}ของวิชาเอกนี้ ปี ${year_no} มีอยู่แล้ว` });
    res.status(500).json({ message: "Server error" });
  }
});

app.get("/api/study-plans/:planId", async (req, res) => {
  const { planId } = req.params;
  try {
    const plan = await query("SELECT * FROM study_plans WHERE id=$1", [planId]);
    if (plan.rows.length === 0) return res.status(404).json({ message: "ไม่พบแผน" });
    const semesters = await query("SELECT * FROM semesters WHERE study_plan_id=$1 ORDER BY sort_order ASC, term_no ASC", [planId]);
    const semesterIds = semesters.rows.map(r => r.id);
    let subjectsMap = {};
    if (semesterIds.length > 0) {
      const ph = semesterIds.map(() => "?").join(",");
      const ss = await query(
        `SELECT ss.*, sbj.code, sbj.name_th, sbj.name_en, sbj.default_credits, sbj.default_hour_structure
         FROM semester_subjects ss JOIN subjects sbj ON sbj.id=ss.subject_id
         WHERE ss.semester_id IN (${ph}) ORDER BY ss.sort_order ASC, ss.id ASC`, semesterIds
      );
      ss.rows.forEach(row => { if (!subjectsMap[row.semester_id]) subjectsMap[row.semester_id]=[]; subjectsMap[row.semester_id].push(row); });
    }
    res.json({ plan: plan.rows[0], semesters: semesters.rows.map(s => ({ ...s, subjects: subjectsMap[s.id]||[] })) });
  } catch (err) { res.status(500).json({ message: "Server error" }); }
});

app.put("/api/study-plans/:planId", async (req, res) => {
  const { academic_year, year_no, status } = req.body;
  try {
    await query("UPDATE study_plans SET academic_year=COALESCE($1,academic_year),year_no=COALESCE($2,year_no),status=COALESCE($3,status) WHERE id=$4", [academic_year, year_no, status, req.params.planId]);
    res.json({ message: "อัปเดตแผนสำเร็จ" });
  } catch (err) { res.status(500).json({ message: "Server error" }); }
});

app.delete("/api/study-plans/:planId", async (req, res) => {
  try {
    const r = await query("DELETE FROM study_plans WHERE id=$1", [req.params.planId]);
    if (r.rows[0].affectedRows === 0) return res.status(404).json({ message: "ไม่พบแผน" });
    res.json({ message: "ลบแผนสำเร็จ" });
  } catch (err) { res.status(500).json({ message: "Server error" }); }
});

app.get("/api/study-plans/:planId/full", async (req, res) => {
  try { res.json((await query("SELECT * FROM v_study_plan_full WHERE plan_id=$1", [req.params.planId])).rows); }
  catch (err) { res.status(500).json({ message: "Server error" }); }
});

// ============================================================
//  SEMESTERS
// ============================================================
app.post("/api/study-plans/:planId/semesters", async (req, res) => {
  const { term_no, title, sort_order = 1 } = req.body;
  if (!term_no) return res.status(400).json({ message: "ข้อมูลไม่ครบ" });
  try {
    await query("INSERT INTO semesters (study_plan_id,term_no,title,sort_order) VALUES ($1,$2,$3,$4)", [req.params.planId, term_no, title, sort_order]);
    res.json({ message: "เพิ่มภาคเรียนสำเร็จ" });
  } catch (err) { res.status(500).json({ message: "Server error" }); }
});

app.put("/api/semesters/:semesterId", async (req, res) => {
  const { title, sort_order } = req.body;
  try {
    await query("UPDATE semesters SET title=COALESCE($1,title),sort_order=COALESCE($2,sort_order) WHERE id=$3", [title, sort_order, req.params.semesterId]);
    res.json({ message: "อัปเดตภาคเรียนสำเร็จ" });
  } catch (err) { res.status(500).json({ message: "Server error" }); }
});

app.delete("/api/semesters/:semesterId", async (req, res) => {
  try {
    const r = await query("DELETE FROM semesters WHERE id=$1", [req.params.semesterId]);
    if (r.rows[0].affectedRows === 0) return res.status(404).json({ message: "ไม่พบภาคเรียน" });
    res.json({ message: "ลบภาคเรียนสำเร็จ" });
  } catch (err) { res.status(500).json({ message: "Server error" }); }
});

// ============================================================
//  SUBJECTS
// ============================================================
app.get("/api/subjects", async (req, res) => {
  const { query: q = "" } = req.query;
  try {
    res.json((await query("SELECT * FROM subjects WHERE code LIKE $1 OR name_th LIKE $1 OR name_en LIKE $1 ORDER BY code ASC LIMIT 20", [`%${q}%`])).rows);
  } catch (err) { res.status(500).json({ message: "Server error" }); }
});

app.get("/api/subjects/:id", async (req, res) => {
  try {
    const result = await query("SELECT * FROM subjects WHERE id=$1", [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ message: "ไม่พบรายวิชา" });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ message: "Server error" }); }
});

app.post("/api/subjects", async (req, res) => {
  const { code, name_th, name_en, default_credits, default_hour_structure,
          description_th, description_en, outcomes_th, outcomes_en } = req.body;
  if (!code || !name_th || !default_credits) return res.status(400).json({ message: "ข้อมูลไม่ครบ" });
  try {
    await query(
      "INSERT INTO subjects (code,name_th,name_en,default_credits,default_hour_structure,description_th,description_en,outcomes_th,outcomes_en) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
      [code, name_th, name_en||null, default_credits, default_hour_structure||null, description_th||null, description_en||null, outcomes_th||null, outcomes_en||null]
    );
    res.json({ message: "เพิ่มรายวิชาสำเร็จ" });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") return res.status(409).json({ message: "รหัสวิชาซ้ำ" });
    res.status(500).json({ message: "Server error" });
  }
});

app.put("/api/subjects/:id", async (req, res) => {
  const { code, name_th, name_en, default_credits, default_hour_structure,
          description_th, description_en, outcomes_th, outcomes_en } = req.body;
  try {
    const result = await query(
      "UPDATE subjects SET code=COALESCE($1,code),name_th=COALESCE($2,name_th),name_en=COALESCE($3,name_en),default_credits=COALESCE($4,default_credits),default_hour_structure=COALESCE($5,default_hour_structure),description_th=COALESCE($6,description_th),description_en=COALESCE($7,description_en),outcomes_th=COALESCE($8,outcomes_th),outcomes_en=COALESCE($9,outcomes_en) WHERE id=$10",
      [code, name_th, name_en, default_credits, default_hour_structure, description_th, description_en, outcomes_th, outcomes_en, req.params.id]
    );
    if (result.rows[0].affectedRows === 0) return res.status(404).json({ message: "ไม่พบรายวิชา" });
    res.json({ message: "อัปเดตรายวิชาสำเร็จ" });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") return res.status(409).json({ message: "รหัสวิชาซ้ำ" });
    res.status(500).json({ message: "Server error" });
  }
});

app.delete("/api/subjects/:id", async (req, res) => {
  try {
    const result = await query("DELETE FROM subjects WHERE id=$1", [req.params.id]);
    if (result.rows[0].affectedRows === 0) return res.status(404).json({ message: "ไม่พบรายวิชา" });
    res.json({ message: "ลบรายวิชาสำเร็จ" });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ============================================================
//  SEMESTER SUBJECTS
// ============================================================
app.post("/api/semesters/:semesterId/subjects", async (req, res) => {
  const { semesterId } = req.params;
  let { subject_id, code, name_th, name_en, default_credits, default_hour_structure,
        description_th, description_en, outcomes_th, outcomes_en,
        category = "Core", credits, hour_structure, sort_order = 1 } = req.body;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    if (!subject_id) {
      if (!code || !name_th || !default_credits) { await conn.rollback(); return res.status(400).json({ message: "ข้อมูลวิชาไม่ครบ" }); }
      const [created] = await conn.execute(
        "INSERT INTO subjects (code,name_th,name_en,default_credits,default_hour_structure,description_th,description_en,outcomes_th,outcomes_en) VALUES (?,?,?,?,?,?,?,?,?)",
        [code, name_th, name_en||null, default_credits, default_hour_structure||null, description_th||null, description_en||null, outcomes_th||null, outcomes_en||null]
      );
      subject_id = created.insertId;
    }
    await conn.execute("INSERT INTO semester_subjects (semester_id,subject_id,category,credits,hour_structure,sort_order) VALUES (?,?,?,?,?,?)", [semesterId, subject_id, category, credits??null, hour_structure||null, sort_order]);
    await conn.execute(`UPDATE semesters s SET total_credits=(SELECT COALESCE(SUM(COALESCE(ss.credits,sb.default_credits)),0) FROM semester_subjects ss JOIN subjects sb ON sb.id=ss.subject_id WHERE ss.semester_id=s.id) WHERE s.id=?`, [semesterId]);
    await conn.commit();
    res.json({ message: "เพิ่มรายวิชาสำเร็จ" });
  } catch (err) { await conn.rollback(); res.status(500).json({ message: "Server error" }); }
  finally { conn.release(); }
});

app.put("/api/semester-subjects/:id", async (req, res) => {
  const { id } = req.params;
  const { category, credits, hour_structure, sort_order } = req.body;
  try {
    const updated = await query("UPDATE semester_subjects SET category=COALESCE($1,category),credits=$2,hour_structure=$3,sort_order=COALESCE($4,sort_order) WHERE id=$5", [category||null, credits??null, hour_structure||null, sort_order||null, id]);
    if (updated.rows[0].affectedRows === 0) return res.status(404).json({ message: "ไม่พบข้อมูล" });
    const ss = await query("SELECT semester_id FROM semester_subjects WHERE id=$1", [id]);
    if (ss.rows.length) await query(`UPDATE semesters s SET total_credits=(SELECT COALESCE(SUM(COALESCE(ss2.credits,sb.default_credits)),0) FROM semester_subjects ss2 JOIN subjects sb ON sb.id=ss2.subject_id WHERE ss2.semester_id=s.id) WHERE s.id=$1`, [ss.rows[0].semester_id]);
    res.json({ message: "อัปเดตรายวิชาสำเร็จ" });
  } catch (err) { res.status(500).json({ message: "Server error" }); }
});

app.delete("/api/semester-subjects/:id", async (req, res) => {
  try {
    const ss = await query("SELECT semester_id FROM semester_subjects WHERE id=$1", [req.params.id]);
    if (ss.rows.length === 0) return res.status(404).json({ message: "ไม่พบข้อมูล" });
    await query("DELETE FROM semester_subjects WHERE id=$1", [req.params.id]);
    await query(`UPDATE semesters s SET total_credits=(SELECT COALESCE(SUM(COALESCE(ss.credits,sb.default_credits)),0) FROM semester_subjects ss JOIN subjects sb ON sb.id=ss.subject_id WHERE ss.semester_id=s.id) WHERE s.id=$1`, [ss.rows[0].semester_id]);
    res.json({ message: "ลบรายวิชาสำเร็จ" });
  } catch (err) { res.status(500).json({ message: "Server error" }); }
});

// ============================================================
//  PROGRAMS
// ============================================================
app.get("/api/programs", async (req, res) => {
  const { course_id } = req.query;
  try {
    let sql = "SELECT * FROM programs"; const values = [];
    if (course_id) { sql += " WHERE course_id=$1"; values.push(course_id); }
    res.json((await query(sql + " ORDER BY year DESC, code", values)).rows);
  } catch (err) { res.status(500).json({ message: "Server error" }); }
});

app.get("/api/programs/:id", async (req, res) => {
  try {
    const result = await query("SELECT * FROM programs WHERE id=$1", [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ message: "ไม่พบโปรแกรม" });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ message: "Server error" }); }
});

app.post("/api/programs", async (req, res) => {
  const { course_id, code, name_th, name_en, faculty, year } = req.body;
  if (!code || !name_th || !year) return res.status(400).json({ message: "ข้อมูลไม่ครบ" });
  try {
    await query("INSERT INTO programs (course_id,code,name_th,name_en,faculty,year) VALUES ($1,$2,$3,$4,$5,$6)", [course_id||null, code, name_th, name_en||null, faculty||null, year]);
    res.status(201).json({ message: "สร้างโปรแกรมสำเร็จ" });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") return res.status(409).json({ message: "รหัสโปรแกรมซ้ำ" });
    res.status(500).json({ message: "Server error" });
  }
});

app.put("/api/programs/:id", async (req, res) => {
  const { code, name_th, name_en, faculty, year } = req.body;
  try {
    const result = await query("UPDATE programs SET code=COALESCE($1,code),name_th=COALESCE($2,name_th),name_en=COALESCE($3,name_en),faculty=COALESCE($4,faculty),year=COALESCE($5,year),updated_at=now() WHERE id=$6", [code, name_th, name_en, faculty, year, req.params.id]);
    if (result.rows[0].affectedRows === 0) return res.status(404).json({ message: "ไม่พบโปรแกรม" });
    res.json({ message: "อัปเดตสำเร็จ" });
  } catch (err) { res.status(500).json({ message: "Server error" }); }
});

app.delete("/api/programs/:id", async (req, res) => {
  try {
    const r = await query("DELETE FROM programs WHERE id=$1", [req.params.id]);
    if (r.rows[0].affectedRows === 0) return res.status(404).json({ message: "ไม่พบ" });
    res.json({ message: "ลบโปรแกรมสำเร็จ" });
  } catch (err) { res.status(500).json({ message: err.message || "Server error" }); }
});

// ============================================================
//  KAS ITEMS
// ============================================================
app.get("/api/programs/:programId/kas-items", async (req, res) => {
  const { type } = req.query;
  try {
    let sql = "SELECT * FROM kas_items WHERE program_id=$1"; const values = [req.params.programId];
    if (type) { sql += " AND type=$2"; values.push(type); }
    res.json((await query(sql + " ORDER BY type, sort_order, code", values)).rows);
  } catch (err) { res.status(500).json({ message: "Server error" }); }
});

app.post("/api/kas-items", async (req, res) => {
  const { program_id, type, code, label, sort_order = 0 } = req.body;
  if (!program_id || !type || !code || !label) return res.status(400).json({ message: "ข้อมูลไม่ครบ" });
  try {
    const result = await query("INSERT INTO kas_items (program_id,type,code,label,sort_order) VALUES ($1,$2,$3,$4,$5)", [program_id, type, code, label, sort_order]);
    res.status(201).json({ id: result.rows[0].insertId });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") return res.status(409).json({ message: "KAS code ซ้ำในโปรแกรมนี้" });
    res.status(500).json({ message: "Server error" });
  }
});

app.put("/api/kas-items/:id", async (req, res) => {
  const { type, code, label, sort_order } = req.body;
  try {
    const result = await query("UPDATE kas_items SET type=COALESCE($1,type),code=COALESCE($2,code),label=COALESCE($3,label),sort_order=COALESCE($4,sort_order) WHERE id=$5", [type, code, label, sort_order, req.params.id]);
    if (result.rows[0].affectedRows === 0) return res.status(404).json({ message: "ไม่พบ KAS item" });
    res.json({ message: "อัปเดต KAS สำเร็จ" });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") return res.status(409).json({ message: "KAS code ซ้ำ" });
    res.status(500).json({ message: "Server error" });
  }
});

app.delete("/api/kas-items/:id", async (req, res) => {
  try {
    const result = await query("DELETE FROM kas_items WHERE id=$1", [req.params.id]);
    if (result.rows[0].affectedRows === 0) return res.status(404).json({ message: "ไม่พบ KAS item" });
    res.json({ message: "ลบ KAS สำเร็จ" });
  } catch (err) { res.status(500).json({ message: "Server error" }); }
});

// ============================================================
//  PLOs
// ============================================================
app.get("/api/programs/:programId/plos", async (req, res) => {
  try {
    const plos = await query("SELECT * FROM plos WHERE program_id=$1 ORDER BY sort_order, code", [req.params.programId]);
    const ploIds = plos.rows.map(p => p.id);
    let kasMap = {};
    if (ploIds.length > 0) {
      const ph = ploIds.map(() => "?").join(",");
      (await query(`SELECT pk.plo_id, k.code, k.label, k.type FROM plo_kas pk JOIN kas_items k ON k.id=pk.kas_id WHERE pk.plo_id IN (${ph})`, ploIds))
        .rows.forEach(m => { if (!kasMap[m.plo_id]) kasMap[m.plo_id]=[]; kasMap[m.plo_id].push({ code: m.code, label: m.label, type: m.type }); });
    }
    res.json(plos.rows.map(p => ({ ...p, kas: kasMap[p.id]||[] })));
  } catch (err) { res.status(500).json({ message: "Server error" }); }
});

app.post("/api/plos", async (req, res) => {
  const { program_id, code, description, sort_order = 0 } = req.body;
  if (!program_id || !code || !description)
    return res.status(400).json({ message: "ต้องส่ง program_id, code, description" });
  try {
    await query(
      `INSERT INTO plos (program_id, code, description, sort_order)
       VALUES ($1, $2, $3, $4)
       ON DUPLICATE KEY UPDATE
         description = VALUES(description),
         sort_order  = VALUES(sort_order)`,
      [program_id, code, description, sort_order]
    );
    const existing = await query(
      "SELECT id FROM plos WHERE program_id = $1 AND code = $2",
      [program_id, code]
    );
    const id = existing.rows[0]?.id;
    res.status(200).json({ message: "บันทึก PLO สำเร็จ", id });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY")
      return res.status(409).json({ message: "PLO code ซ้ำในโปรแกรมนี้" });
    res.status(500).json({ message: "Server error" });
  }
});

app.put("/api/plos/:id", async (req, res) => {
  const { code, description, sort_order } = req.body;
  try {
    const result = await query("UPDATE plos SET code=COALESCE($1,code),description=COALESCE($2,description),sort_order=COALESCE($3,sort_order),updated_at=now() WHERE id=$4", [code, description, sort_order, req.params.id]);
    if (result.rows[0].affectedRows === 0) return res.status(404).json({ message: "ไม่พบ PLO" });
    res.json({ message: "อัปเดต PLO สำเร็จ" });
  } catch (err) { res.status(500).json({ message: "Server error" }); }
});

app.delete("/api/plos/:id", async (req, res) => {
  try {
    const result = await query("DELETE FROM plos WHERE id=$1", [req.params.id]);
    if (result.rows[0].affectedRows === 0) return res.status(404).json({ message: "ไม่พบ PLO" });
    res.json({ message: "ลบ PLO สำเร็จ" });
  } catch (err) { res.status(500).json({ message: "Server error" }); }
});

// ── Mapping helpers (ใช้ transaction + INSERT IGNORE แทน ON CONFLICT) ─
async function replaceMapping(table, pkCol, pkVal, fkCol, ids) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute(`DELETE FROM ${table} WHERE ${pkCol}=?`, [pkVal]);
    for (const id of ids) {
      await conn.execute(`INSERT IGNORE INTO ${table} (${pkCol},${fkCol}) VALUES (?,?)`, [pkVal, id]);
    }
    await conn.commit();
  } catch (err) { await conn.rollback(); throw err; }
  finally { conn.release(); }
}

app.post("/api/plo-kas", async (req, res) => {
  const { plo_id, kas_ids } = req.body;
  if (!plo_id || !Array.isArray(kas_ids) || kas_ids.length === 0) return res.status(400).json({ message: "ต้องส่ง plo_id และ kas_ids (array)" });
  try { await replaceMapping("plo_kas","plo_id",plo_id,"kas_id",kas_ids); res.json({ message: "บันทึก PLO-KAS สำเร็จ" }); }
  catch (err) { res.status(500).json({ message: "Server error" }); }
});

app.delete("/api/plo-kas", async (req, res) => {
  const { plo_id, kas_id } = req.body;
  if (!plo_id || !kas_id) return res.status(400).json({ message: "ต้องส่ง plo_id และ kas_id" });
  try { await query("DELETE FROM plo_kas WHERE plo_id=$1 AND kas_id=$2", [plo_id, kas_id]); res.json({ message: "ลบ PLO-KAS สำเร็จ" }); }
  catch (err) { res.status(500).json({ message: "Server error" }); }
});

// ============================================================
//  MAJOR GROUPS
// ============================================================
app.get("/api/programs/:programId/major-groups", async (req, res) => {
  try {
    res.json((await query(`SELECT mg.*, m.name_th AS major_name_th, m.name_en AS major_name_en FROM major_groups mg LEFT JOIN majors m ON m.id=mg.major_id WHERE mg.program_id=$1 ORDER BY mg.sort_order, mg.label`, [req.params.programId])).rows);
  } catch (err) { res.status(500).json({ message: "Server error" }); }
});

app.post("/api/major-groups", async (req, res) => {
  const { program_id, major_id, label, icon, sort_order = 0 } = req.body;
  if (!program_id || !label) return res.status(400).json({ message: "ต้องส่ง program_id และ label" });
  try { await query("INSERT INTO major_groups (program_id,major_id,label,icon,sort_order) VALUES ($1,$2,$3,$4,$5)", [program_id, major_id||null, label, icon||null, sort_order]); res.status(201).json({ message: "เพิ่ม Major Group สำเร็จ" }); }
  catch (err) { res.status(500).json({ message: "Server error" }); }
});

app.put("/api/major-groups/:id", async (req, res) => {
  const { major_id, label, icon, sort_order } = req.body;
  try {
    const result = await query("UPDATE major_groups SET major_id=COALESCE($1,major_id),label=COALESCE($2,label),icon=COALESCE($3,icon),sort_order=COALESCE($4,sort_order) WHERE id=$5", [major_id, label, icon, sort_order, req.params.id]);
    if (result.rows[0].affectedRows === 0) return res.status(404).json({ message: "ไม่พบ Major Group" });
    res.json({ message: "อัปเดต Major Group สำเร็จ" });
  } catch (err) { res.status(500).json({ message: "Server error" }); }
});

app.delete("/api/major-groups/:id", async (req, res) => {
  try {
    const result = await query("DELETE FROM major_groups WHERE id=$1", [req.params.id]);
    if (result.rows[0].affectedRows === 0) return res.status(404).json({ message: "ไม่พบ Major Group" });
    res.json({ message: "ลบ Major Group สำเร็จ" });
  } catch (err) { res.status(500).json({ message: "Server error" }); }
});

// ============================================================
//  MLOs
// ============================================================
app.get("/api/major-groups/:groupId/mlos", async (req, res) => {
  try {
    const mlos = await query("SELECT * FROM mlos WHERE major_group_id=$1 ORDER BY sort_order, code", [req.params.groupId]);
    const mloIds = mlos.rows.map(m => m.id);
    let kasMap = {};
    if (mloIds.length > 0) {
      const ph = mloIds.map(() => "?").join(",");
      (await query(`SELECT mk.mlo_id, k.id, k.code, k.label, k.type FROM mlo_kas mk JOIN kas_items k ON k.id=mk.kas_id WHERE mk.mlo_id IN (${ph})`, mloIds))
        .rows.forEach(m => { if (!kasMap[m.mlo_id]) kasMap[m.mlo_id]=[]; kasMap[m.mlo_id].push({ id: m.id, code: m.code, label: m.label, type: m.type }); });
    }
    res.json(mlos.rows.map(m => ({ ...m, kas: kasMap[m.id]||[] })));
  } catch (err) { res.status(500).json({ message: "Server error" }); }
});

app.post("/api/mlos", async (req, res) => {
  const { major_group_id, code, description, sort_order = 0 } = req.body;
  if (!major_group_id || !code || !description) return res.status(400).json({ message: "ต้องส่ง major_group_id, code, description" });
  try { await query("INSERT INTO mlos (major_group_id,code,description,sort_order) VALUES ($1,$2,$3,$4)", [major_group_id, code, description, sort_order]); res.status(201).json({ message: "เพิ่ม MLO สำเร็จ" }); }
  catch (err) { res.status(500).json({ message: "Server error" }); }
});

app.put("/api/mlos/:id", async (req, res) => {
  const { code, description, sort_order } = req.body;
  try {
    const result = await query("UPDATE mlos SET code=COALESCE($1,code),description=COALESCE($2,description),sort_order=COALESCE($3,sort_order),updated_at=now() WHERE id=$4", [code, description, sort_order, req.params.id]);
    if (result.rows[0].affectedRows === 0) return res.status(404).json({ message: "ไม่พบ MLO" });
    res.json({ message: "อัปเดต MLO สำเร็จ" });
  } catch (err) { res.status(500).json({ message: "Server error" }); }
});

app.delete("/api/mlos/:id", async (req, res) => {
  try {
    const result = await query("DELETE FROM mlos WHERE id=$1", [req.params.id]);
    if (result.rows[0].affectedRows === 0) return res.status(404).json({ message: "ไม่พบ MLO" });
    res.json({ message: "ลบ MLO สำเร็จ" });
  } catch (err) { res.status(500).json({ message: "Server error" }); }
});

app.post("/api/mlo-kas", async (req, res) => {
  const { mlo_id, kas_ids } = req.body;
  if (!mlo_id || !Array.isArray(kas_ids)) return res.status(400).json({ message: "ต้องส่ง mlo_id และ kas_ids (array)" });
  try { await replaceMapping("mlo_kas","mlo_id",mlo_id,"kas_id",kas_ids); res.json({ message: "บันทึก MLO-KAS สำเร็จ" }); }
  catch (err) { res.status(500).json({ message: "Server error" }); }
});

app.delete("/api/mlo-kas", async (req, res) => {
  const { mlo_id, kas_id } = req.body;
  if (!mlo_id || !kas_id) return res.status(400).json({ message: "ต้องส่ง mlo_id และ kas_id" });
  try { await query("DELETE FROM mlo_kas WHERE mlo_id=$1 AND kas_id=$2", [mlo_id, kas_id]); res.json({ message: "ลบ MLO-KAS สำเร็จ" }); }
  catch (err) { res.status(500).json({ message: "Server error" }); }
});

// ============================================================
//  CLOs
// ============================================================
app.get("/api/subjects/:subjectId/clos", async (req, res) => {
  try {
    const clos = await query("SELECT * FROM clos WHERE subject_id=$1 ORDER BY seq", [req.params.subjectId]);
    const cloIds = clos.rows.map(c => c.id);
    if (cloIds.length === 0) return res.json([]);
    const ph = cloIds.map(() => "?").join(",");
    const [ploMaps, mloMaps, kasMaps] = await Promise.all([
      query(`SELECT cp.clo_id, p.id, p.code, p.description FROM clo_plo cp JOIN plos p ON p.id=cp.plo_id WHERE cp.clo_id IN (${ph})`, cloIds),
      query(`SELECT cm.clo_id, m.id, m.code, m.description FROM clo_mlo cm JOIN mlos m ON m.id=cm.mlo_id WHERE cm.clo_id IN (${ph})`, cloIds),
      query(`SELECT ck.clo_id, k.id, k.code, k.label, k.type FROM clo_kas ck JOIN kas_items k ON k.id=ck.kas_id WHERE ck.clo_id IN (${ph})`, cloIds)
    ]);
    const buildMap = (rows, key = "clo_id") => rows.reduce((acc, r) => { if (!acc[r[key]]) acc[r[key]]=[]; const { [key]:_, ...rest }=r; acc[r[key]].push(rest); return acc; }, {});
    const ploMap = buildMap(ploMaps.rows), mloMap = buildMap(mloMaps.rows), kasMap = buildMap(kasMaps.rows);
    res.json(clos.rows.map(c => ({ ...c, plos: ploMap[c.id]||[], mlos: mloMap[c.id]||[], kas: kasMap[c.id]||[] })));
  } catch (err) { res.status(500).json({ message: "Server error" }); }
});

app.get("/api/clos/:id", async (req, res) => {
  try {
    const clo = await query("SELECT * FROM clos WHERE id=$1", [req.params.id]);
    if (clo.rows.length === 0) return res.status(404).json({ message: "ไม่พบ CLO" });
    res.json(clo.rows[0]);
  } catch (err) { res.status(500).json({ message: "Server error" }); }
});

app.post("/api/clos", async (req, res) => {
  const { subject_id, seq, description_th, description_en } = req.body;
  if (!subject_id || !seq || !description_th) return res.status(400).json({ message: "ต้องส่ง subject_id, seq, description_th" });
  try { await query("INSERT INTO clos (subject_id,seq,description_th,description_en) VALUES ($1,$2,$3,$4)", [subject_id, seq, description_th, description_en||null]); res.status(201).json({ message: "เพิ่ม CLO สำเร็จ" }); }
  catch (err) {
    if (err.code === "ER_DUP_ENTRY") return res.status(409).json({ message: "seq ซ้ำในวิชานี้" });
    res.status(500).json({ message: "Server error" });
  }
});

app.put("/api/clos/:id", async (req, res) => {
  const { seq, description_th, description_en } = req.body;
  try {
    const result = await query("UPDATE clos SET seq=COALESCE($1,seq),description_th=COALESCE($2,description_th),description_en=COALESCE($3,description_en),updated_at=now() WHERE id=$4", [seq, description_th, description_en, req.params.id]);
    if (result.rows[0].affectedRows === 0) return res.status(404).json({ message: "ไม่พบ CLO" });
    res.json({ message: "อัปเดต CLO สำเร็จ" });
  } catch (err) { res.status(500).json({ message: "Server error" }); }
});

app.delete("/api/clos/:id", async (req, res) => {
  try {
    const result = await query("DELETE FROM clos WHERE id=$1", [req.params.id]);
    if (result.rows[0].affectedRows === 0) return res.status(404).json({ message: "ไม่พบ CLO" });
    res.json({ message: "ลบ CLO สำเร็จ" });
  } catch (err) { res.status(500).json({ message: "Server error" }); }
});

app.post("/api/clo-kas", async (req, res) => {
  const { clo_id, kas_ids } = req.body;
  if (!clo_id || !Array.isArray(kas_ids)) return res.status(400).json({ message: "ต้องส่ง clo_id และ kas_ids (array)" });
  try { await replaceMapping("clo_kas","clo_id",clo_id,"kas_id",kas_ids); res.json({ message: "บันทึก CLO-KAS สำเร็จ" }); }
  catch (err) { res.status(500).json({ message: "Server error" }); }
});

app.delete("/api/clo-kas", async (req, res) => {
  const { clo_id, kas_id } = req.body;
  if (!clo_id || !kas_id) return res.status(400).json({ message: "ต้องส่ง clo_id, kas_id" });
  try { await query("DELETE FROM clo_kas WHERE clo_id=$1 AND kas_id=$2", [clo_id, kas_id]); res.json({ message: "ลบ CLO-KAS สำเร็จ" }); }
  catch (err) { res.status(500).json({ message: "Server error" }); }
});

app.post("/api/clo-plo", async (req, res) => {
  const { clo_id, plo_ids } = req.body;
  if (!clo_id || !Array.isArray(plo_ids)) return res.status(400).json({ message: "ต้องส่ง clo_id และ plo_ids (array)" });
  try { await replaceMapping("clo_plo","clo_id",clo_id,"plo_id",plo_ids); res.json({ message: "บันทึก CLO-PLO สำเร็จ" }); }
  catch (err) { res.status(500).json({ message: "Server error" }); }
});

app.delete("/api/clo-plo", async (req, res) => {
  const { clo_id, plo_id } = req.body;
  if (!clo_id || !plo_id) return res.status(400).json({ message: "ต้องส่ง clo_id, plo_id" });
  try { await query("DELETE FROM clo_plo WHERE clo_id=$1 AND plo_id=$2", [clo_id, plo_id]); res.json({ message: "ลบ CLO-PLO สำเร็จ" }); }
  catch (err) { res.status(500).json({ message: "Server error" }); }
});

app.post("/api/clo-mlo", async (req, res) => {
  const { clo_id, mlo_ids } = req.body;
  if (!clo_id || !Array.isArray(mlo_ids)) return res.status(400).json({ message: "ต้องส่ง clo_id และ mlo_ids (array)" });
  try { await replaceMapping("clo_mlo","clo_id",clo_id,"mlo_id",mlo_ids); res.json({ message: "บันทึก CLO-MLO สำเร็จ" }); }
  catch (err) { res.status(500).json({ message: "Server error" }); }
});

app.delete("/api/clo-mlo", async (req, res) => {
  const { clo_id, mlo_id } = req.body;
  if (!clo_id || !mlo_id) return res.status(400).json({ message: "ต้องส่ง clo_id, mlo_id" });
  try { await query("DELETE FROM clo_mlo WHERE clo_id=$1 AND mlo_id=$2", [clo_id, mlo_id]); res.json({ message: "ลบ CLO-MLO สำเร็จ" }); }
  catch (err) { res.status(500).json({ message: "Server error" }); }
});

// ============================================================
//  ALIGNMENT MATRIX
// ============================================================
app.get("/api/programs/:programId/alignment-rows", async (req, res) => {
  try {
    const rows = await query("SELECT * FROM alignment_rows WHERE program_id=$1 ORDER BY sort_order, group_label", [req.params.programId]);
    const rowIds = rows.rows.map(r => r.id);
    if (rowIds.length === 0) return res.json([]);
    const ph = rowIds.map(() => "?").join(",");
    const [ploChecks, mloChecks] = await Promise.all([
      query(`SELECT apc.alignment_row_id, p.id AS plo_id, p.code AS plo_code, apc.checked FROM alignment_plo_checks apc JOIN plos p ON p.id=apc.plo_id WHERE apc.alignment_row_id IN (${ph})`, rowIds),
      query(`SELECT amc.alignment_row_id, m.id AS mlo_id, m.code AS mlo_code, amc.checked FROM alignment_mlo_checks amc JOIN mlos m ON m.id=amc.mlo_id WHERE amc.alignment_row_id IN (${ph})`, rowIds)
    ]);
    const ploMap = {}, mloMap = {};
    ploChecks.rows.forEach(r => { if (!ploMap[r.alignment_row_id]) ploMap[r.alignment_row_id]=[]; ploMap[r.alignment_row_id].push({ plo_id: r.plo_id, code: r.plo_code, checked: r.checked }); });
    mloChecks.rows.forEach(r => { if (!mloMap[r.alignment_row_id]) mloMap[r.alignment_row_id]=[]; mloMap[r.alignment_row_id].push({ mlo_id: r.mlo_id, code: r.mlo_code, checked: r.checked }); });
    res.json(rows.rows.map(r => ({ ...r, plo_checks: ploMap[r.id]||[], mlo_checks: mloMap[r.id]||[] })));
  } catch (err) { res.status(500).json({ message: "Server error" }); }
});

app.post("/api/alignment-rows", async (req, res) => {
  const { program_id, group_label, title, description, sort_order = 0 } = req.body;
  if (!program_id || !group_label || !title) return res.status(400).json({ message: "ต้องส่ง program_id, group_label, title" });
  try { await query("INSERT INTO alignment_rows (program_id,group_label,title,description,sort_order) VALUES ($1,$2,$3,$4,$5)", [program_id, group_label, title, description||null, sort_order]); res.status(201).json({ message: "เพิ่ม Alignment Row สำเร็จ" }); }
  catch (err) { res.status(500).json({ message: "Server error" }); }
});

app.put("/api/alignment-rows/:id", async (req, res) => {
  const { group_label, title, description, sort_order } = req.body;
  try {
    const result = await query("UPDATE alignment_rows SET group_label=COALESCE($1,group_label),title=COALESCE($2,title),description=COALESCE($3,description),sort_order=COALESCE($4,sort_order) WHERE id=$5", [group_label, title, description, sort_order, req.params.id]);
    if (result.rows[0].affectedRows === 0) return res.status(404).json({ message: "ไม่พบแถว" });
    res.json({ message: "อัปเดตสำเร็จ" });
  } catch (err) { res.status(500).json({ message: "Server error" }); }
});

app.delete("/api/alignment-rows/:id", async (req, res) => {
  try {
    const result = await query("DELETE FROM alignment_rows WHERE id=$1", [req.params.id]);
    if (result.rows[0].affectedRows === 0) return res.status(404).json({ message: "ไม่พบแถว" });
    res.json({ message: "ลบสำเร็จ" });
  } catch (err) { res.status(500).json({ message: "Server error" }); }
});

app.put("/api/alignment-rows/:id/plo-checks", async (req, res) => {
  const { plo_id, checked } = req.body;
  if (!plo_id || checked === undefined) return res.status(400).json({ message: "ต้องส่ง plo_id และ checked (boolean)" });
  try { await query("INSERT INTO alignment_plo_checks (alignment_row_id,plo_id,checked) VALUES ($1,$2,$3) ON DUPLICATE KEY UPDATE checked=VALUES(checked)", [req.params.id, plo_id, checked]); res.json({ message: "บันทึก PLO check สำเร็จ" }); }
  catch (err) { res.status(500).json({ message: "Server error" }); }
});

app.put("/api/alignment-rows/:id/mlo-checks", async (req, res) => {
  const { mlo_id, checked } = req.body;
  if (!mlo_id || checked === undefined) return res.status(400).json({ message: "ต้องส่ง mlo_id และ checked (boolean)" });
  try { await query("INSERT INTO alignment_mlo_checks (alignment_row_id,mlo_id,checked) VALUES ($1,$2,$3) ON DUPLICATE KEY UPDATE checked=VALUES(checked)", [req.params.id, mlo_id, checked]); res.json({ message: "บันทึก MLO check สำเร็จ" }); }
  catch (err) { res.status(500).json({ message: "Server error" }); }
});

// ============================================================
//  PLO SCORES
// ============================================================
app.get("/api/programs/:programId/plo-scores", async (req, res) => {
  const { year, lo_level } = req.query;
  let sql = "SELECT * FROM plo_scores WHERE program_id=$1"; const values = [req.params.programId]; let idx = 2;
  if (year)     { sql += ` AND academic_year=$${idx++}`; values.push(year); }
  if (lo_level) { sql += ` AND lo_level=$${idx++}`;      values.push(lo_level); }
  try { res.json((await query(sql + " ORDER BY lo_level, lo_code, academic_year DESC", values)).rows); }
  catch (err) { res.status(500).json({ message: "Server error" }); }
});

app.get("/api/programs/:programId/plo-score-summary", async (req, res) => {
  const { year } = req.query;
  let sql = "SELECT * FROM v_plo_score_summary WHERE program_id=$1"; const values = [req.params.programId];
  if (year) { sql += " AND academic_year=$2"; values.push(year); }
  try { res.json((await query(sql + " ORDER BY lo_level, lo_code", values)).rows); }
  catch (err) { res.status(500).json({ message: "Server error" }); }
});

app.post("/api/plo-scores", async (req, res) => {
  const { program_id, lo_level, lo_code, lo_description, academic_year, semester_1, semester_2, note } = req.body;
  if (!program_id || !lo_level || !lo_code || !academic_year) return res.status(400).json({ message: "ต้องส่ง program_id, lo_level, lo_code, academic_year" });
  try {
    await query(
      `INSERT INTO plo_scores (program_id,lo_level,lo_code,lo_description,academic_year,semester_1,semester_2,note)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON DUPLICATE KEY UPDATE lo_description=VALUES(lo_description),semester_1=VALUES(semester_1),semester_2=VALUES(semester_2),note=VALUES(note),updated_at=now()`,
      [program_id, lo_level, lo_code, lo_description||null, academic_year, semester_1??null, semester_2??null, note||null]
    );
    res.json({ message: "บันทึก PLO Score สำเร็จ" });
  } catch (err) { res.status(500).json({ message: "Server error" }); }
});

app.put("/api/plo-scores/:id", async (req, res) => {
  const { semester_1, semester_2, note, lo_description } = req.body;
  try {
    const result = await query("UPDATE plo_scores SET semester_1=COALESCE($1,semester_1),semester_2=COALESCE($2,semester_2),note=COALESCE($3,note),lo_description=COALESCE($4,lo_description),updated_at=now() WHERE id=$5", [semester_1, semester_2, note, lo_description, req.params.id]);
    if (result.rows[0].affectedRows === 0) return res.status(404).json({ message: "ไม่พบข้อมูล" });
    res.json({ message: "อัปเดตสำเร็จ" });
  } catch (err) { res.status(500).json({ message: "Server error" }); }
});

app.delete("/api/plo-scores/:id", async (req, res) => {
  try {
    const result = await query("DELETE FROM plo_scores WHERE id=$1", [req.params.id]);
    if (result.rows[0].affectedRows === 0) return res.status(404).json({ message: "ไม่พบข้อมูล" });
    res.json({ message: "ลบ PLO Score สำเร็จ" });
  } catch (err) { res.status(500).json({ message: "Server error" }); }
});

// ============================================================
//  VIEW HELPERS
// ============================================================
app.get("/api/programs/:programId/clo-full", async (req, res) => {
  const { subject_id } = req.query;
  try {
    let sql = `SELECT vcf.* FROM v_clo_full vcf JOIN clos cl ON cl.id=vcf.clo_id JOIN subjects su ON su.id=cl.subject_id JOIN semester_subjects ss ON ss.subject_id=su.id JOIN semesters se ON se.id=ss.semester_id JOIN study_plans sp ON sp.id=se.study_plan_id JOIN programs pr ON pr.course_id=sp.course_id WHERE pr.id=$1`;
    const values = [req.params.programId];
    if (subject_id) { sql += " AND vcf.subject_id=$2"; values.push(subject_id); }
    res.json((await query(sql + " ORDER BY vcf.subject_code, vcf.seq", values)).rows);
  } catch (err) { res.status(500).json({ message: "Server error" }); }
});

// ============================================================
//  STAKEHOLDERS & SURVEYS
// ============================================================
app.get("/api/programs/:programId/stakeholders", async (req, res) => {
  try { res.json((await query("SELECT * FROM stakeholders WHERE program_id=$1 AND is_active=1 ORDER BY sort_order", [req.params.programId])).rows); }
  catch (e) { res.status(500).json({ message: "Server error" }); }
});

app.post("/api/stakeholders", async (req, res) => {
  const { program_id, name_th, name_en, sort_order = 0 } = req.body;
  if (!program_id || !name_th)
    return res.status(400).json({ message: "ต้องส่ง program_id และ name_th" });
  try {
    await pool.execute(
      `INSERT INTO stakeholders (program_id, name_th, name_en, sort_order, is_active)
       VALUES (?, ?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE
         name_en    = VALUES(name_en),
         sort_order = VALUES(sort_order),
         is_active  = 1`,
      [program_id, name_th, name_en || null, sort_order]
    );
    const [[row]] = await pool.execute(
      "SELECT id FROM stakeholders WHERE program_id = ? AND name_th = ? LIMIT 1",
      [program_id, name_th]
    );
    res.status(200).json({ message: "บันทึก Stakeholder สำเร็จ", id: row?.id });
  } catch (e) {
    console.error("stakeholders POST error:", e.message); // ดู error จริง
    res.status(500).json({ message: "Server error: " + e.message });
  }
});

app.get("/api/surveys", async (req, res) => {
  const { program_id, year } = req.query;
  try {
    let sql = "SELECT * FROM stakeholder_surveys WHERE 1=1";
    const vals = [];
    if (program_id) { sql += " AND program_id=?"; vals.push(program_id); }
    if (year)       { sql += " AND academic_year=?"; vals.push(Number(year)); }
    sql += " ORDER BY academic_year DESC, created_at DESC";
    const [rows] = await pool.execute(sql, vals);  // ใช้ pool.execute โดยตรง
    res.json(rows);
  } catch (e) {
    console.error("GET /api/surveys error:", e.message);
    res.status(500).json({ message: "Server error: " + e.message });
  }
});

app.post("/api/surveys", async (req, res) => {
  const { program_id, title, academic_year, survey_date, note } = req.body;
  if (!program_id || !title || !academic_year)
    return res.status(400).json({ message: "ข้อมูลไม่ครบ" });
  try {
    await pool.execute(
      `INSERT INTO stakeholder_surveys (program_id, title, academic_year, survey_date, note)
       VALUES (?, ?, ?, ?, ?)`,
      [program_id, title, Number(academic_year), survey_date || null, note || null]
    );
    // ดึง survey ที่เพิ่งสร้างกลับมา พร้อม id
    const [[row]] = await pool.execute(
      `SELECT * FROM stakeholder_surveys
       WHERE program_id = ? AND title = ? AND academic_year = ?
       ORDER BY created_at DESC LIMIT 1`,
      [program_id, title, Number(academic_year)]
    );
    res.status(201).json({ message: "สร้าง Survey สำเร็จ", survey: row });
  } catch (e) {
    console.error("POST /api/surveys error:", e.message);
    res.status(500).json({ message: "Server error: " + e.message });
  }
});
// วางก่อน app.delete("/api/plos/:id")
app.delete("/api/programs/:programId/plos/all", async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    // ลบ mappings ที่อ้างอิง PLOs ของ program นี้ก่อน
    await conn.execute(
      `DELETE spm FROM stakeholder_plo_mappings spm
       JOIN plos p ON p.id = spm.plo_id
       WHERE p.program_id = ?`,
      [req.params.programId]
    );
    // ลบ PLOs
    await conn.execute(
      "DELETE FROM plos WHERE program_id = ?",
      [req.params.programId]
    );
    await conn.commit();
    res.json({ message: "ล้าง PLOs สำเร็จ" });
  } catch (e) {
    await conn.rollback();
    console.error("DELETE plos/all error:", e.message);
    res.status(500).json({ message: "Server error: " + e.message });
  } finally {
    conn.release();
  }
});

app.get("/api/surveys/:surveyId/matrix", async (req, res) => {
  try { res.json((await query("SELECT * FROM v_stakeholder_plo_matrix WHERE survey_id=$1", [req.params.surveyId])).rows); }
  catch (e) { res.status(500).json({ message: "Server error" }); }
});

app.post("/api/surveys/:surveyId/mappings", async (req, res) => {
  const { surveyId } = req.params;
  const { mappings } = req.body;
  if (!Array.isArray(mappings)) return res.status(400).json({ message: "ต้องส่ง mappings (array)" });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute("DELETE FROM stakeholder_plo_mappings WHERE survey_id=?", [surveyId]);
    const valid = mappings.filter(m => m.level && ["F","M","P"].includes(m.level));
    for (const m of valid) {
      await conn.execute(
        "INSERT INTO stakeholder_plo_mappings (survey_id,stakeholder_id,plo_id,level) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE level=VALUES(level),updated_at=now()",
        [surveyId, m.stakeholder_id, m.plo_id, m.level]
      );
    }
    await conn.commit();
    res.json({ message: `บันทึก ${valid.length} mapping สำเร็จ` });
  } catch (e) { await conn.rollback(); res.status(500).json({ message: "Server error: "+e.message }); }
  finally { conn.release(); }
});

app.put("/api/surveys/:surveyId/mappings/single", async (req, res) => {
  const { surveyId } = req.params;
  const { stakeholder_id, plo_id, level } = req.body;
  if (!stakeholder_id || !plo_id) return res.status(400).json({ message: "ต้องส่ง stakeholder_id และ plo_id" });
  try {
    if (!level || !["F","M","P"].includes(level)) {
      await query("DELETE FROM stakeholder_plo_mappings WHERE survey_id=$1 AND stakeholder_id=$2 AND plo_id=$3", [surveyId, stakeholder_id, plo_id]);
    } else {
      await query("INSERT INTO stakeholder_plo_mappings (survey_id,stakeholder_id,plo_id,level) VALUES ($1,$2,$3,$4) ON DUPLICATE KEY UPDATE level=VALUES(level),updated_at=now()", [surveyId, stakeholder_id, plo_id, level]);
    }
    res.json({ message: "บันทึกสำเร็จ" });
  } catch (e) { res.status(500).json({ message: "Server error" }); }
});

app.get("/api/surveys/:surveyId/summary", async (req, res) => {
  try { res.json((await query("SELECT * FROM v_plo_stakeholder_summary WHERE survey_id=$1", [req.params.surveyId])).rows); }
  catch (e) { res.status(500).json({ message: "Server error" }); }
});

// ============================================================
//  ACHIEVEMENTS
// ============================================================
app.get("/api/achievements", async (req, res) => {
  try { res.json((await query("SELECT * FROM achievements ORDER BY achieve_date DESC, created_at DESC")).rows); }
  catch (err) { res.status(500).json({ message: err.message }); }
});

app.get("/api/achievements/:id", async (req, res) => {
  try {
    const result = await query("SELECT * FROM achievements WHERE id=$1", [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ message: "ไม่พบผลงาน" });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.post("/api/achievements", async (req, res) => {
  const { title, achieve_date, level, students, description, course_id, image_url, attachments, facebook_url } = req.body;
  try {
    await query("INSERT INTO achievements (title,achieve_date,level,students,description,course_id,image_url,attachments,facebook_url) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)", [title||null, achieve_date||null, level||null, students||null, description||null, course_id||null, image_url||null, attachments||null, facebook_url||null]);
    res.status(201).json({ message: "บันทึกผลงานสำเร็จ" });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.put("/api/achievements/:id", async (req, res) => {
  const { title, achieve_date, level, students, description, course_id, image_url, attachments, facebook_url } = req.body;
  try {
    const result = await query("UPDATE achievements SET title=COALESCE($1,title),achieve_date=COALESCE($2,achieve_date),level=COALESCE($3,level),students=COALESCE($4,students),description=COALESCE($5,description),course_id=$6,image_url=COALESCE($7,image_url),attachments=COALESCE($8,attachments),facebook_url=$9,updated_at=now() WHERE id=$10", [title||null, achieve_date||null, level||null, students||null, description||null, course_id||null, image_url||null, attachments||null, facebook_url||null, req.params.id]);
    if (result.rows[0].affectedRows === 0) return res.status(404).json({ message: "ไม่พบผลงาน" });
    res.json({ message: "อัปเดตผลงานสำเร็จ" });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.delete("/api/achievements/:id", async (req, res) => {
  try {
    const result = await query("DELETE FROM achievements WHERE id=$1", [req.params.id]);
    if (result.rows[0].affectedRows === 0) return res.status(404).json({ message: "ไม่พบผลงาน" });
    res.json({ message: "ลบผลงานสำเร็จ" });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ============================================================
//  QA SEED COMPAT ROUTES
// ============================================================
app.get("/api/courses/:id/plos", async (req, res) => {
  try { res.json((await query("SELECT * FROM course_plos WHERE course_id=$1 ORDER BY `order`, code", [req.params.id])).rows); }
  catch (err) { res.status(500).json({ message: err.message }); }
});

app.post("/api/courses/:id/plos", async (req, res) => {
  const { code, order, name_th, name_en, description } = req.body;
  if (!code || !name_th) return res.status(400).json({ message: "ข้อมูลไม่ครบ" });
  try {
    await query("INSERT INTO course_plos (course_id,code,`order`,name_th,name_en,description) VALUES ($1,$2,$3,$4,$5,$6) ON DUPLICATE KEY UPDATE name_th=VALUES(name_th),name_en=VALUES(name_en),description=VALUES(description),updated_at=now()", [req.params.id, code, order||0, name_th, name_en||null, description||null]);
    res.json({ message: "บันทึก PLO สำเร็จ" });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.get("/api/courses/:id/plo-kas", async (req, res) => {
  try { res.json((await query("SELECT * FROM course_plo_kas WHERE course_id=$1 ORDER BY plo_code", [req.params.id])).rows); }
  catch (err) { res.status(500).json({ message: err.message }); }
});

app.post("/api/courses/:id/plo-kas", async (req, res) => {
  const { plo_code, kas_knowledge, kas_attitude, kas_skill } = req.body;
  if (!plo_code) return res.status(400).json({ message: "ต้องส่ง plo_code" });
  try {
    await query("INSERT INTO course_plo_kas (course_id,plo_code,kas_knowledge,kas_attitude,kas_skill) VALUES ($1,$2,$3,$4,$5) ON DUPLICATE KEY UPDATE kas_knowledge=VALUES(kas_knowledge),kas_attitude=VALUES(kas_attitude),kas_skill=VALUES(kas_skill),updated_at=now()", [req.params.id, plo_code, JSON.stringify(kas_knowledge||{}), JSON.stringify(kas_attitude||{}), JSON.stringify(kas_skill||{})]);
    res.json({ message: "บันทึก PLO KAS สำเร็จ" });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.post("/api/courses/:id/majors", async (req, res) => {
  const { code, name_th, name_en } = req.body;
  if (!code || !name_th) return res.status(400).json({ message: "ต้องส่ง code และ name_th" });
  try {
    await query("INSERT INTO course_majors (course_id,code,name_th,name_en) VALUES ($1,$2,$3,$4) ON DUPLICATE KEY UPDATE name_th=VALUES(name_th),name_en=VALUES(name_en)", [req.params.id, code, name_th, name_en||null]);
    res.json({ message: "บันทึก Major สำเร็จ" });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.post("/api/majors/:id/mlos", async (req, res) => {
  const { code, name_th, name_en, kas_knowledge, kas_attitude, kas_skill, course_id } = req.body;
  if (!code || !name_th) return res.status(400).json({ message: "ต้องส่ง code และ name_th" });
  try {
    await query("INSERT INTO course_mlos (major_id,course_id,code,name_th,name_en,kas_knowledge,kas_attitude,kas_skill) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON DUPLICATE KEY UPDATE name_th=VALUES(name_th),name_en=VALUES(name_en),kas_knowledge=VALUES(kas_knowledge),kas_attitude=VALUES(kas_attitude),kas_skill=VALUES(kas_skill)", [req.params.id, course_id||null, code, name_th, name_en||null, JSON.stringify(kas_knowledge||{}), JSON.stringify(kas_attitude||{}), JSON.stringify(kas_skill||{})]);
    res.json({ message: "บันทึก MLO สำเร็จ" });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.get("/api/courses/:id/stakeholder-needs", async (req, res) => {
  try { res.json((await query("SELECT * FROM course_stakeholder_needs WHERE course_id=$1 ORDER BY id", [req.params.id])).rows); }
  catch (err) { res.status(500).json({ message: err.message }); }
});

app.post("/api/courses/:id/stakeholder-needs", async (req, res) => {
  const { group, need, plo_mapping, mlo_mapping } = req.body;
  if (!need) return res.status(400).json({ message: "ต้องส่ง need" });
  try {
    await query("INSERT INTO course_stakeholder_needs (course_id,`group`,need,plo_mapping,mlo_mapping) VALUES ($1,$2,$3,$4,$5)", [req.params.id, group||null, need, JSON.stringify(plo_mapping||[]), JSON.stringify(mlo_mapping||[])]);
    res.json({ message: "บันทึก Stakeholder Need สำเร็จ" });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.get("/api/courses/:id/vision-mission", async (req, res) => {
  try { res.json((await query("SELECT * FROM course_vision_mission WHERE course_id=$1 ORDER BY id", [req.params.id])).rows); }
  catch (err) { res.status(500).json({ message: err.message }); }
});

app.post("/api/courses/:id/vision-mission", async (req, res) => {
  const { type, text } = req.body;
  if (!type || !text) return res.status(400).json({ message: "ต้องส่ง type และ text" });
  try {
    await query("INSERT INTO course_vision_mission (course_id,type,text) VALUES ($1,$2,$3) ON DUPLICATE KEY UPDATE text=VALUES(text)", [req.params.id, type, text]);
    res.json({ message: "บันทึก Vision/Mission สำเร็จ" });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.get("/api/courses/:id/plo-scores", async (req, res) => {
  try { res.json((await query("SELECT * FROM course_plo_scores WHERE course_id=$1 ORDER BY plo_code", [req.params.id])).rows); }
  catch (err) { res.status(500).json({ message: err.message }); }
});

app.post("/api/courses/:id/plo-scores", async (req, res) => {
  const { plo_code, academic_year, semester_1, semester_2, grand_total } = req.body;
  if (!plo_code || !academic_year) return res.status(400).json({ message: "ต้องส่ง plo_code และ academic_year" });
  try {
    await query("INSERT INTO course_plo_scores (course_id,plo_code,academic_year,semester_1,semester_2,grand_total) VALUES ($1,$2,$3,$4,$5,$6) ON DUPLICATE KEY UPDATE semester_1=VALUES(semester_1),semester_2=VALUES(semester_2),grand_total=VALUES(grand_total),updated_at=now()", [req.params.id, plo_code, academic_year, semester_1??null, semester_2??null, grand_total??null]);
    res.json({ message: "บันทึก PLO Score สำเร็จ" });
  } catch (err) { res.status(500).json({ message: err.message }); }
});
// ============================================================
//  PLO/MLO BULK
// ============================================================

app.get("/api/programs/:programId/plo-mlo", async (req, res) => {
  const { programId } = req.params;
  try {
    const plos = (await query(
      "SELECT id, code, description AS skill, sort_order FROM plos WHERE program_id=$1 ORDER BY sort_order, code",
      [programId]
    )).rows;
    const mlos = (await query(
      "SELECT m.id, mg.label AS label_group, m.code, m.description AS skill, m.sort_order FROM mlos m JOIN major_groups mg ON mg.id = m.major_group_id WHERE mg.program_id = $1 ORDER BY mg.sort_order, mg.label, m.sort_order, m.code",
      [programId]
    )).rows;
    const mlosMapped = mlos.map(r => ({ ...r, group: r.label_group }));
    res.json({ programId, PLO: plos, MLO: mlosMapped });
  } catch (e) {
    res.status(500).json({ message: "Server error: " + e.message });
  }
});

app.get("/api/public/programs/:programId/plo-mlo", async (req, res) => {
  const { programId } = req.params;
  try {
    const plos = (await query(
      "SELECT code, description AS skill FROM plos WHERE program_id=$1 ORDER BY sort_order, code",
      [programId]
    )).rows;
    const rawMlos = (await query(
      "SELECT mg.label AS label_group, m.code, m.description AS skill FROM mlos m JOIN major_groups mg ON mg.id = m.major_group_id WHERE mg.program_id = $1 ORDER BY mg.sort_order, mg.label, m.sort_order, m.code",
      [programId]
    )).rows;
    const groupMap = {};
    for (const r of rawMlos) {
      const g = r.label_group || "ทั่วไป";
      if (!groupMap[g]) groupMap[g] = [];
      groupMap[g].push({ code: r.code, skill: r.skill });
    }
    res.json({ programId, PLO: plos, MLO: Object.entries(groupMap).map(([group, items]) => ({ group, items })) });
  } catch (e) {
    res.status(500).json({ message: "Server error: " + e.message });
  }
});

app.put("/api/programs/:programId/plo-mlo", async (req, res) => {
  const { programId } = req.params;
  const { PLO, MLO } = req.body || {};
  if (!Array.isArray(PLO) || !Array.isArray(MLO))
    return res.status(400).json({ message: "ต้องส่ง PLO และ MLO เป็น array" });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await pool.execute("SET FOREIGN_KEY_CHECKS=0");
    await conn.execute("DELETE FROM plos WHERE program_id=?", [programId]);
    await pool.execute("SET FOREIGN_KEY_CHECKS=1");
    let order = 1;
    for (const r of PLO) {
      const code = (r.code||"").trim(), skill = (r.skill||"").trim();
      if (code && skill) await conn.execute(
        "INSERT INTO plos (program_id, code, description, sort_order) VALUES (?,?,?,?)",
        [programId, code, skill, order++]
      );
    }
    await pool.execute("SET FOREIGN_KEY_CHECKS=0");
    await conn.execute(
      "DELETE m FROM mlos m JOIN major_groups mg ON mg.id=m.major_group_id WHERE mg.program_id=?",
      [programId]
    );
    await pool.execute("SET FOREIGN_KEY_CHECKS=1");
    const perGroupOrder = {};
    for (const r of MLO) {
      const label = (r.group||"").trim() || "ทั่วไป";
      const code = (r.code||"").trim(), skill = (r.skill||"").trim();
      if (!code || !skill) continue;
      const [exist] = await conn.execute(
        "SELECT id FROM major_groups WHERE program_id=? AND label=? LIMIT 1", [programId, label]
      );
      let mgId;
      if (exist.length) {
        mgId = exist[0].id;
     } else {
        const newId = require('crypto').randomUUID();
        await conn.execute(
          "INSERT INTO major_groups (id, program_id, label, sort_order) VALUES (?,?,?,?)", [newId, programId, label, 0]
        );
        mgId = newId;
      }
      console.log("mgId:", mgId, "label:", label);
      if (!perGroupOrder[mgId]) perGroupOrder[mgId] = 1;
      await conn.execute(
        "INSERT INTO mlos (major_group_id, code, description, sort_order) VALUES (?,?,?,?)",
        [mgId, code, skill, perGroupOrder[mgId]++]
      );
    }
    await conn.commit();
    res.json({ ok: true, counts: { plo: PLO.length, mlo: MLO.length } });
 } catch (e) {
    await conn.rollback();
    console.error("PLO-MLO PUT error:", e);
    res.status(500).json({ message: "Server error: " + e.message });
  }finally {
    conn.release();
  }
});
app.use('/api/publish', require('./routes/publish')(pool));
app.get("/api/programs/:programId/alignment-matrix/full", async (req, res) => {
  const { programId } = req.params;
  try {
    // PLOs
    const plos = (await query(
      "SELECT id, code, description, sort_order FROM plos WHERE program_id=$1 ORDER BY sort_order, code",
      [programId]
    )).rows;

    // MLOs ผ่าน major_groups → majors → programs
    // เรียงด้วย CAST เพื่อให้ได้ 1.1,1.2,1.3,2.1,2.2... แทน 1.1,2.1,3.1,1.2,2.2...
    const mlosRaw = (await query(
      `SELECT m.id, m.code, m.description, m.sort_order, mg.sort_order AS grp_order
       FROM mlos m
       JOIN major_groups mg ON mg.id = m.major_group_id
       WHERE mg.program_id = $1`,
      [programId]
    )).rows;
    // sort ใน JS: แยก prefix (1) กับ suffix (1) จาก "MLO1.1" → [1, 1]
    const mlos = mlosRaw.slice().sort((a, b) => {
      const parse = c => {
        const m = String(c).replace(/^MLO\s*/i, '').match(/^(\d+)\.?(\d*)$/);
        return m ? [parseInt(m[1]||0), parseInt(m[2]||0)] : [0, 0];
      };
      const [a1,a2] = parse(a.code), [b1,b2] = parse(b.code);
      return a1 !== b1 ? a1 - b1 : a2 - b2;
    });

    // alignment_rows
    const rows = (await query(
      `SELECT id, group_label, title, description, sort_order
       FROM alignment_rows
       WHERE program_id = $1
       ORDER BY sort_order, created_at`,
      [programId]
    )).rows;

    if (!rows.length) return res.json({ plos, mlos, rows: [], checkMap: {} });

    const rowIds = rows.map(r => r.id);
    const ph     = rowIds.map(() => "?").join(",");

    // PLO checks (checked = 1 เท่านั้น)
    const ploChecks = (await query(
      `SELECT alignment_row_id, plo_id
       FROM alignment_plo_checks
       WHERE alignment_row_id IN (${ph}) AND checked = 1`,
      rowIds
    )).rows;

    // MLO checks
    const mloChecks = (await query(
      `SELECT alignment_row_id, mlo_id
       FROM alignment_mlo_checks
       WHERE alignment_row_id IN (${ph}) AND checked = 1`,
      rowIds
    )).rows;

    // checkMap: { row_id: [plo_id, mlo_id, ...] }
    const checkMap = {};
    rows.forEach(r => { checkMap[r.id] = []; });
    ploChecks.forEach(c => { checkMap[c.alignment_row_id]?.push(c.plo_id); });
    mloChecks.forEach(c => { checkMap[c.alignment_row_id]?.push(c.mlo_id); });

    res.json({ plos, mlos, rows, checkMap });
  } catch (err) {
    console.error("alignment-matrix/full error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// PUT /api/programs/:programId/alignment-matrix/rows
// bulk replace alignment_rows (ลบเดิม → insert ใหม่)
// Body: [{ group_label, title, description, sort_order }, ...]
// Returns: { ok, rows: [{id, group_label, title, ...}] }
app.put("/api/programs/:programId/alignment-matrix/rows", async (req, res) => {
  const { programId } = req.params;
  const items = req.body;
  if (!Array.isArray(items)) return res.status(400).json({ message: "body ต้องเป็น array" });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // ลบ checks ก่อน (ป้องกัน FK constraint)
    const [existing] = await conn.execute(
      "SELECT id FROM alignment_rows WHERE program_id = ?", [programId]
    );
    if (existing.length) {
      const ids = existing.map(r => r.id);
      const ph2 = ids.map(() => "?").join(",");
      await conn.execute(`DELETE FROM alignment_plo_checks WHERE alignment_row_id IN (${ph2})`, ids);
      await conn.execute(`DELETE FROM alignment_mlo_checks WHERE alignment_row_id IN (${ph2})`, ids);
    }
    await conn.execute("DELETE FROM alignment_rows WHERE program_id = ?", [programId]);

    // insert ใหม่
    for (let i = 0; i < items.length; i++) {
      const r = items[i];
      await conn.execute(
        "INSERT INTO alignment_rows (program_id, group_label, title, description, sort_order) VALUES (?,?,?,?,?)",
        [
          programId,
          r.group_label || r.group || "",
          r.title       || "",
          r.description || r.desc || "",
          r.sort_order  ?? i,
        ]
      );
    }
    await conn.commit();

    // ดึง rows ที่เพิ่งสร้าง พร้อม UUID
    const newRows = (await query(
      "SELECT id, group_label, title, description, sort_order FROM alignment_rows WHERE program_id=$1 ORDER BY sort_order, created_at",
      [programId]
    )).rows;

    res.json({ ok: true, rows: newRows });
  } catch (err) {
    await conn.rollback();
    console.error("alignment-matrix/rows PUT error:", err);
    res.status(500).json({ message: "Server error: " + err.message });
  } finally {
    conn.release();
  }
});

// PUT /api/programs/:programId/alignment-matrix/checks
// bulk replace checks ทั้งหมดของ program
// Body: {
//   plo: [{ alignment_row_id, plo_id, checked }],
//   mlo: [{ alignment_row_id, mlo_id, checked }]
// }
app.put("/api/programs/:programId/alignment-matrix/checks", async (req, res) => {
  const { programId } = req.params;
  const { plo = [], mlo = [] } = req.body;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [rows] = await conn.execute(
      "SELECT id FROM alignment_rows WHERE program_id = ?", [programId]
    );
    if (!rows.length) {
      await conn.rollback();
      return res.status(400).json({ message: "ไม่พบ alignment_rows — บันทึก rows ก่อน" });
    }
    const validIds = new Set(rows.map(r => r.id));
    const ids      = [...validIds];
    const ph3      = ids.map(() => "?").join(",");

    // ลบเดิม
    await conn.execute(`DELETE FROM alignment_plo_checks WHERE alignment_row_id IN (${ph3})`, ids);
    await conn.execute(`DELETE FROM alignment_mlo_checks WHERE alignment_row_id IN (${ph3})`, ids);

    // insert PLO checks
    const ploVals = plo.filter(c => c.checked && validIds.has(c.alignment_row_id) && c.plo_id);
    for (const c of ploVals) {
      await conn.execute(
        "INSERT INTO alignment_plo_checks (alignment_row_id, plo_id, checked) VALUES (?,?,1)",
        [c.alignment_row_id, c.plo_id]
      );
    }

    // insert MLO checks
    const mloVals = mlo.filter(c => c.checked && validIds.has(c.alignment_row_id) && c.mlo_id);
    for (const c of mloVals) {
      await conn.execute(
        "INSERT INTO alignment_mlo_checks (alignment_row_id, mlo_id, checked) VALUES (?,?,1)",
        [c.alignment_row_id, c.mlo_id]
      );
    }

    await conn.commit();
    res.json({ ok: true, plo: ploVals.length, mlo: mloVals.length });
  } catch (err) {
    await conn.rollback();
    console.error("alignment-matrix/checks PUT error:", err);
    res.status(500).json({ message: "Server error: " + err.message });
  } finally {
    conn.release();
  }
});

// ============================================================
//  STAKEHOLDERS DASHBOARD — ENDPOINTS สำหรับ bba-stake.html
// ============================================================

// ── Publish state (แยกจาก matrix publish) ──────────────────
// ใช้ publish_state id=2 สำหรับ stakeholders dashboard

// GET /api/stakeholders/publish-state
app.get("/api/stakeholders/publish-state", async (req, res) => {
  try {
    // ลองอ่าน row id=2 ก่อน ถ้าไม่มีให้ส่ง unpublished
    const [[row]] = await pool.execute(
      "SELECT published, published_at FROM publish_state WHERE id = 2"
    );
    res.json(row || { published: 0, published_at: null });
  } catch (e) {
    // ถ้า id=2 ยังไม่มีให้ส่งค่า default
    res.json({ published: 0, published_at: null });
  }
});

// POST /api/stakeholders/publish
app.post("/api/stakeholders/publish", async (req, res) => {
  const { course_id } = req.query;
  const now = new Date();
  try {
    await pool.execute(
      `INSERT INTO publish_state (id, published, published_at)
       VALUES (2, 1, ?)
       ON DUPLICATE KEY UPDATE published = 1, published_at = ?`,
      [now, now]
    );
    try {
      await query("INSERT INTO audit_log (action, payload, ip_address) VALUES ($1,$2,$3)",
        ['stakeholders_published', JSON.stringify({ course_id }), req.ip]);
    } catch (_) {}
    res.json({ ok: true, published: true, publishedAt: now });
  } catch (e) {
    res.status(500).json({ message: "Server error: " + e.message });
  }
});

// POST /api/stakeholders/unpublish
app.post("/api/stakeholders/unpublish", async (req, res) => {
  try {
    await pool.execute(
      `INSERT INTO publish_state (id, published, published_at)
       VALUES (2, 0, NULL)
       ON DUPLICATE KEY UPDATE published = 0, published_at = NULL`
    );
    res.json({ ok: true, published: false });
  } catch (e) {
    res.status(500).json({ message: "Server error: " + e.message });
  }
});

// ── Public snapshot endpoint ────────────────────────────────
// GET /api/public/stakeholders-plo-mapping?course_id=19
// ดึงข้อมูลทั้งหมดสำหรับ bba-stake.html ครั้งเดียวจบ
// ใช้ตาราง: plos, stakeholders, stakeholder_surveys, stakeholder_plo_mappings
app.get("/api/public/stakeholders-plo-mapping", async (req, res) => {
  const { course_id, program_id } = req.query;

  try {
    let progId = program_id;

    // ถ้าส่ง course_id มา → หา program_id จาก programs table
    if (!progId && course_id) {
      const [[prog]] = await pool.execute(
        "SELECT id FROM programs WHERE course_id = ? ORDER BY year DESC LIMIT 1",
        [course_id]
      );
      if (!prog) return res.status(404).json({ message: "ไม่พบ Program สำหรับ course_id นี้" });
      progId = prog.id;
    }
    if (!progId) return res.status(400).json({ message: "ต้องส่ง program_id หรือ course_id" });

    // 1) PLOs ของ program
    const [plos] = await pool.execute(
      "SELECT id, code, description, sort_order FROM plos WHERE program_id = ? ORDER BY sort_order, code",
      [progId]
    );

    // 2) Stakeholders ของ program
    const [stakeholders] = await pool.execute(
      "SELECT id, name_th, name_en, sort_order FROM stakeholders WHERE program_id = ? AND is_active = 1 ORDER BY sort_order",
      [progId]
    );

    if (!plos.length || !stakeholders.length) {
      return res.json({
        plos: [], needs: [], groups: [],
        snapshotAt: new Date().toISOString(),
        programId: progId
      });
    }

    // 3) หา survey ล่าสุดของ program
    const [surveys] = await pool.execute(
      "SELECT id, title, academic_year, survey_date FROM stakeholder_surveys WHERE program_id = ? AND is_active = 1 ORDER BY academic_year DESC, created_at DESC LIMIT 1",
      [progId]
    );
    const survey = surveys[0];

    let mappings = [];
    if (survey) {
      // 4) ดึง mappings ของ survey นั้น
      const [maps] = await pool.execute(
        "SELECT stakeholder_id, plo_id, level FROM stakeholder_plo_mappings WHERE survey_id = ?",
        [survey.id]
      );
      mappings = maps;
    }

    // 5) สร้าง plo_mapping array ต่อ stakeholder
    // format ที่ bba-stake.html ต้องการ:
    // needs: [{ group, need, plo_mapping: ["PLO1","PLO2",...] }]
    // โดยแต่ละ stakeholder = 1 "need item"

    // สร้าง map: stakeholderId → Set of plo codes ที่มี mapping
    const shPloMap = {};
    stakeholders.forEach(s => { shPloMap[s.id] = new Set(); });

    const ploById = {};
    plos.forEach(p => { ploById[p.id] = p.code; });

    mappings.forEach(m => {
      if (shPloMap[m.stakeholder_id] && ploById[m.plo_id] && m.level) {
        shPloMap[m.stakeholder_id].add(ploById[m.plo_id]);
      }
    });

    // แปลงเป็น needs array (stakeholder แต่ละตัว = 1 need group)
    // แทนที่ส่วน needs ใน /api/public/stakeholders-plo-mapping
const needs = stakeholders.map(s => {
  const ploLevels = {};  // { "PLO1": "F", "PLO2": "M" }
  mappings
    .filter(m => m.stakeholder_id === s.id)
    .forEach(m => {
      const code = ploById[m.plo_id];
      if (code && m.level) ploLevels[code] = m.level;
    });
  return {
    group:       s.name_th,
    need:        s.name_th,
    need_en:     s.name_en || '',
    plo_mapping: Object.keys(ploLevels),      // array of codes ที่มี mapping
    plo_levels:  ploLevels,                   // { PLO1: "F", PLO2: "M", ... }
  };
});

    // plos format สำหรับ bba-stake.html
    const plosFmt = plos.map(p => ({
      id:      p.id,
      code:    p.code,
      no:      p.sort_order,
      name_th: p.description,
      desc:    p.description,
    }));

    res.json({
      plos:       plosFmt,
      needs,
      groups:     [...new Set(needs.map(n => n.group))],
      survey:     survey ? { id: survey.id, title: survey.title, year: survey.academic_year } : null,
      snapshotAt: survey?.survey_date || new Date().toISOString(),
      programId:  progId,
    });
  } catch (e) {
    console.error("/api/public/stakeholders-plo-mapping error:", e);
    res.status(500).json({ message: "Server error: " + e.message });
  }
});

// ── Custom PLOs สำหรับ Stakeholder Mapping ──────────────────

// GET /api/surveys/:id/custom-plos
app.get("/api/surveys/:id/custom-plos", async (req, res) => {
  try {
    const [rows] = await pool.execute(
      "SELECT * FROM stakeholder_custom_plos WHERE survey_id = ? ORDER BY sort_order, no",
      [req.params.id]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// PUT /api/surveys/:id/custom-plos  (replace all)
app.put("/api/surveys/:id/custom-plos", async (req, res) => {
  const { id } = req.params;
  const { program_id, plos } = req.body;
  if (!Array.isArray(plos)) return res.status(400).json({ message: "plos must be array" });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute("DELETE FROM stakeholder_custom_plos WHERE survey_id = ?", [id]);
    for (let i = 0; i < plos.length; i++) {
      const p = plos[i];
      await conn.execute(
        "INSERT INTO stakeholder_custom_plos (program_id, survey_id, no, code, description, type, sort_order) VALUES (?,?,?,?,?,?,?)",
        [program_id, id, p.no || i+1, p.code || `PLO${i+1}`, p.desc || p.description || '', p.type || 'Specific', i]
      );
    }
    await conn.commit();
    const [rows] = await pool.execute(
      "SELECT * FROM stakeholder_custom_plos WHERE survey_id = ? ORDER BY sort_order", [id]
    );
    res.json({ ok: true, plos: rows });
  } catch (e) {
    await conn.rollback();
    res.status(500).json({ message: e.message });
  } finally { conn.release(); }
});

// POST /api/surveys/:id/mappings-with-custom-plos
// รับ mappings ที่ใช้ custom_plo_id แทน plos table UUID
app.post("/api/surveys/:id/mappings-with-custom-plos", async (req, res) => {
  const { id: surveyId } = req.params;
  const { mappings } = req.body;
  if (!Array.isArray(mappings)) return res.status(400).json({ message: "mappings must be array" });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute("DELETE FROM stakeholder_plo_mappings WHERE survey_id = ?", [surveyId]);
    for (const m of mappings) {
      if (m.level && ['F','M','P'].includes(m.level)) {
        await conn.execute(
          "INSERT INTO stakeholder_plo_mappings (survey_id, stakeholder_id, plo_id, level) VALUES (?,?,?,?)",
          [surveyId, m.stakeholder_id, m.plo_id, m.level]
        );
      }
    }
    await conn.commit();
    res.json({ ok: true, saved: mappings.filter(m=>m.level).length });
  } catch (e) {
    await conn.rollback();
    res.status(500).json({ message: e.message });
  } finally { conn.release(); }
});
// ============================================================
//  STUDENT DATA HUB — เพิ่ม block นี้ลงใน server.js เดิม
//  วางไว้ใต้บรรทัด  app.use('/api/publish', require('./routes/publish')(pool));
//  (ใกล้ท้ายไฟล์ ก่อน catch-all)
// ============================================================
// ── POST /api/admin/students/data
//    admin panel ส่งข้อมูลทั้งหมดมาบันทึก
app.get("/api/bba-students", async (req, res) => {
  try {
    const [[pub]] = await pool.execute(
      "SELECT published FROM bba_publish_state WHERE section = 'students'"
    );
    if (!pub?.published) return res.json({ ok: false, published: false });

    const [intakeRows] = await pool.execute("SELECT * FROM bba_intake ORDER BY year, major_id");
    const intake = {};
    intakeRows.forEach(r => {
      if (!intake[r.major_id]) intake[r.major_id] = [];
      intake[r.major_id].push([r.year, r.plan, r.interviewed, r.confirmed, r.reported, r.no_show]);
    });

    const [trendRows] = await pool.execute("SELECT * FROM bba_trend ORDER BY year");
    const trend = {};
    trendRows.forEach(r => { trend[r.year] = { enrolled: r.enrolled, graduated: r.graduated }; });

    const [statusRows] = await pool.execute("SELECT * FROM bba_status ORDER BY year, id");
    const status = {};
    statusRows.forEach(r => {
      if (!status[r.year]) status[r.year] = [];
      status[r.year].push({ label: r.label, val: r.val, color: r.color });
    });

    const [coopRows]   = await pool.execute("SELECT * FROM bba_coop WHERE type='coop'   ORDER BY year, major_id");
    const [internRows] = await pool.execute("SELECT * FROM bba_coop WHERE type='intern' ORDER BY year, major_id");
    const coopYrs  = [...new Set(coopRows.map(r => r.year))].sort((a,b) => a-b);
    const internYrs= [...new Set(internRows.map(r => r.year))].sort((a,b) => a-b);
    const MJ_KEYS = ['fin','mkt','hrm','lsm','mice','bis'];
    const coop = {}, intern = {};
    MJ_KEYS.forEach(m => {
      coop[m]  = coopYrs.map(y  => { const r = coopRows.find(x => x.year===y && x.major_id===m);  return r ? r.count : 0; });
      intern[m]= internYrs.map(y => { const r = internRows.find(x => x.year===y && x.major_id===m); return r ? r.count : 0; });
    });

    const [top5Rows]    = await pool.execute("SELECT * FROM bba_top5 ORDER BY type, rank_no");
    const [partnerRows] = await pool.execute("SELECT * FROM bba_partners ORDER BY type, id");

    res.json({
      ok: true, published: true,
      intake, trend, status,
      coop, coopYrs, intern, internYrs,
      top5Coop:      top5Rows.filter(r => r.type==='coop').map(r => r.company),
      top5Intern:    top5Rows.filter(r => r.type==='intern').map(r => r.company),
      partnersCoop:  partnerRows.filter(r => r.type==='coop').map(r => r.name),
      partnersIntern:partnerRows.filter(r => r.type==='intern').map(r => r.name),
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});
// ── GET /api/admin/students/data
//    admin panel ดึงข้อมูล RAW ทั้งหมดจาก DB (ไม่สนใจ published state)
app.get("/api/admin/students/data", async (req, res) => {
  try {
    const MJ_KEYS = ['fin','mkt','hrm','lsm','mice','bis'];

    // Intake
    const [intakeRows] = await pool.execute("SELECT * FROM bba_intake ORDER BY year, major_id");
    const intake = {};
    intakeRows.forEach(r => {
      if (!intake[r.major_id]) intake[r.major_id] = [];
      intake[r.major_id].push([r.year, r.plan, r.interviewed, r.confirmed, r.reported, r.no_show]);
    });

    // Trend
    const [trendRows] = await pool.execute("SELECT * FROM bba_trend ORDER BY year");
    const trend = {};
    trendRows.forEach(r => { trend[r.year] = { enrolled: r.enrolled, graduated: r.graduated }; });

    // Status
    const [statusRows] = await pool.execute("SELECT * FROM bba_status ORDER BY year, id");
    const status = {};
    statusRows.forEach(r => {
      if (!status[r.year]) status[r.year] = [];
      status[r.year].push({ label: r.label, val: r.val, color: r.color });
    });

    // Coop / Intern
    const [coopRows]   = await pool.execute("SELECT * FROM bba_coop WHERE type='coop'   ORDER BY year, major_id");
    const [internRows] = await pool.execute("SELECT * FROM bba_coop WHERE type='intern' ORDER BY year, major_id");
    const coopYrs  = [...new Set(coopRows.map(r => r.year))].sort((a,b) => a-b);
    const internYrs= [...new Set(internRows.map(r => r.year))].sort((a,b) => a-b);
    const coop = {}, intern = {};
    MJ_KEYS.forEach(m => {
      coop[m]  = coopYrs.map(y  => { const r = coopRows.find(x  => x.year===y && x.major_id===m); return r ? r.count : 0; });
      intern[m]= internYrs.map(y => { const r = internRows.find(x => x.year===y && x.major_id===m); return r ? r.count : 0; });
    });

    // Top5 / Partners
    const [top5Rows]    = await pool.execute("SELECT * FROM bba_top5 ORDER BY type, rank_no");
    const [partnerRows] = await pool.execute("SELECT * FROM bba_partners ORDER BY type, id");

    res.json({
      ok: true,
      intake, trend, status,
      coop, coopYrs, intern, internYrs,
      top5Coop:      top5Rows.filter(r => r.type==='coop').map(r => r.company),
      top5Intern:    top5Rows.filter(r => r.type==='intern').map(r => r.company),
      partnersCoop:  partnerRows.filter(r => r.type==='coop').map(r => r.name),
      partnersIntern:partnerRows.filter(r => r.type==='intern').map(r => r.name),
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});
app.post("/api/admin/students/data", async (req, res) => {
  const D    = req.body;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const MJ_KEYS = ['fin','mkt','hrm','lsm','mice','bis'];

    // ── Intake ──
    // ── Intake ── เพิ่ม DELETE ก่อน
if (D.intake) {
  await conn.execute("DELETE FROM bba_intake");  // ล้างทั้งหมดก่อน
  for (const mid of MJ_KEYS) {
    for (const r of (D.intake[mid] || [])) {
      await conn.execute(
        `INSERT INTO bba_intake (year, major_id, plan, interviewed, confirmed, reported, no_show)
         VALUES (?,?,?,?,?,?,?)`,
        [r[0], mid, r[1]||0, r[2]||0, r[3]||0, r[4]||0, r[5]||0]
      );
    }
  }
}

    // ── Trend ──
    if (D.trend) {
      await conn.execute("DELETE FROM bba_trend");  
      for (const [yr, v] of Object.entries(D.trend)) {
        await conn.execute(
          `INSERT INTO bba_trend (year, enrolled, graduated) VALUES (?,?,?)
           ON DUPLICATE KEY UPDATE enrolled=VALUES(enrolled), graduated=VALUES(graduated)`,
          [+yr, v.enrolled||0, v.graduated||0]
        );
      }
    }

    // ── Status ──
    if (D.status) {
      await conn.execute("DELETE FROM bba_status"); 
      for (const [yr, arr] of Object.entries(D.status)) {
        for (const s of arr) {
          await conn.execute(
            `INSERT INTO bba_status (year, label, val, color) VALUES (?,?,?,?)
             ON DUPLICATE KEY UPDATE val=VALUES(val), color=VALUES(color)`,
            [+yr, s.label, s.val||0, s.color||'']
          );
        }
      }
    }

    // ── Coop / Intern ──
    // ── Coop / Intern ── แก้ตรงนี้
for (const type of ['coop', 'intern']) {
  const src = type === 'coop' ? D.coop : D.intern;
  const yrs = type === 'coop' ? D.coopYrs : D.internYrs;
  if (!src || !yrs) continue;
  // ลบข้อมูลเก่าทั้งหมดของ type นี้ก่อน แล้วค่อย insert ใหม่
  await conn.execute("DELETE FROM bba_coop WHERE type=?", [type]);

  for (const mid of MJ_KEYS) {
    for (let yi = 0; yi < yrs.length; yi++) {
      const n = (src[mid] || [])[yi] || 0;
      if (n === 0) continue; // ไม่ต้อง insert แถวที่เป็น 0
      await conn.execute(
        `INSERT INTO bba_coop (type, year, major_id, count) VALUES (?,?,?,?)`,
        [type, yrs[yi], mid, n]
      );
    }
  }
}

    // ── Top5 ──
    for (const type of ['coop', 'intern']) {
      const list = type === 'coop' ? D.top5Coop : D.top5Intern;
      if (!list) continue;
      await conn.execute("DELETE FROM bba_top5 WHERE type=?", [type]);
      for (let i = 0; i < list.length; i++) {
        await conn.execute(
          "INSERT INTO bba_top5 (type, rank_no, company) VALUES (?,?,?)",
          [type, i+1, list[i]]
        );
      }
    }

    // ── Partners ──
    for (const type of ['coop', 'intern']) {
      const list = type === 'coop' ? D.partnersCoop : D.partnersIntern;
      if (!list) continue;
      await conn.execute("DELETE FROM bba_partners WHERE type=?", [type]);
      for (const name of list) {
        await conn.execute(
          "INSERT INTO bba_partners (type, name) VALUES (?,?)",
          [type, name]
        );
      }
    }

    await conn.commit();
    res.json({ ok: true, message: "บันทึกสำเร็จ" });

  } catch (err) {
    await conn.rollback();
    console.error("/api/admin/students/data error:", err);
    res.status(500).json({ ok: false, error: err.message });
  } finally {
    conn.release();
  }
});

// ── POST /api/admin/students/publish
//    เปิด/ปิดเผยแพร่ Dashboard
app.post("/api/admin/students/publish", async (req, res) => {
  const { published } = req.body;
  try {
    await pool.execute(
      `INSERT INTO bba_publish_state (section, published, published_at)
       VALUES ('students', ?, ?)
       ON DUPLICATE KEY UPDATE published=VALUES(published), published_at=VALUES(published_at)`,
      [published ? 1 : 0, published ? new Date() : null]
    );
    res.json({ ok: true, published: !!published });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});
// ── POST /api/admin/students/upload-intern-excel
//    รับไฟล์ Excel template_intern_2month แล้วบันทึกลง bba_coop
const multerExcel = multer({ storage: multer.memoryStorage() });
const XLSX = require('xlsx'); // npm install xlsx

// map ชื่อ major ใน Excel → major_id ใน bba_coop
const MAJOR_MAP = {
  fin:  'fin', mkt: 'mkt', hrm: 'hrm',
  lsm:  'lsm', lms: 'lsm',          
  mice: 'mice',
  bis:  'bis',
  // econ, acc, bba → ไม่อยู่ใน MJ_KEYS ข้ามไป
};
const MJ_KEYS = ['fin','mkt','hrm','lsm','mice','bis'
];

app.post('/api/admin/students/upload-intern-excel', multerExcel.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ ok: false, message: 'ไม่พบไฟล์' });
  try {
    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    const ws = wb.Sheets['Intern'];
    if (!ws) return res.status(400).json({ ok: false, message: 'ไม่พบ sheet ชื่อ Intern' });

    const rows = XLSX.utils.sheet_to_json(ws); // [{ ปีการศึกษา, วิชาเอก, จำนวน }]

    const conn = await pool.getConnection();
    let saved = 0, skipped = 0;
    try {
      await conn.beginTransaction();
      await conn.execute("DELETE FROM bba_coop WHERE type='intern'");
      for (const row of rows) {
        const year    = row['ปีการศึกษา'];
        const majorRaw = String(row['วิชาเอก'] || '').toLowerCase().trim();
        const count   = Number(row['จำนวน']) || 0;
        const majorId = MAJOR_MAP[majorRaw];

        if (!year || !majorId) { skipped++; continue; }

 await conn.execute(
  `INSERT INTO bba_coop (type, year, major_id, count) VALUES ('intern', ?, ?, ?)`,
  [year, majorId, count]
);
saved++;
}
      await conn.commit();
      res.json({ ok: true, saved, skipped, message: `นำเข้าสำเร็จ ${saved} แถว (ข้าม ${skipped} แถว)` });
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  } catch (e) {
    console.error('upload-intern-excel error:', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── Catch-all ─────────────────────────────────────────────────
app.get("*", (req, res) => {
  if (!req.path.startsWith("/api")) {
    res.sendFile(path.join(__dirname, "../frontend/login.html"));
  }
});