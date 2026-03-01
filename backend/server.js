// ============================================================
//  server.js  —  FMS Backend
// ============================================================

const express = require("express");
const { Pool } = require("pg");
const cors    = require("cors");
const path = require("path");
const bcrypt = require("bcrypt");

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ───────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ── Database ─────────────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production"
    ? { rejectUnauthorized: false }
    : false,
});

// ── Health check ─────────────────────────────────────────────
app.get("/health", (req, res) => res.json({ status: "ok" }));  // ← เปลี่ยน / เป็น /health ด้วย

// ── Auth ─────────────────────────────────────────────────────
app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: "กรุณากรอกอีเมลและรหัสผ่าน" });
  }
  try {
    const result = await pool.query(
      "SELECT * FROM users WHERE email = $1",
      [email]
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ message: "อีเมลหรือรหัสผ่านไม่ถูกต้อง" });
    }
    const user = result.rows[0];

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ message: "อีเมลหรือรหัสผ่านไม่ถูกต้อง" });
    }

    const { password_hash: _, ...safeUser } = user;
    res.json({ message: "เข้าสู่ระบบสำเร็จ", user: safeUser });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Server error" });
  }
});
// ============================================================
//  [1] PLOs — CRUD + KAS mapping
// ============================================================

// POST /api/plos
// body: { program_id, code, description, sort_order }
app.post("/api/plos", async (req, res) => {
  const { program_id, code, description, sort_order = 0 } = req.body;
  if (!program_id || !code || !description) {
    return res.status(400).json({ message: "ข้อมูลไม่ครบ (program_id, code, description)" });
  }
  try {
    const result = await pool.query(
      `INSERT INTO plos (program_id, code, description, sort_order)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [program_id, code, description, sort_order]
    );
    res.status(201).json({ message: "เพิ่ม PLO สำเร็จ", plo: result.rows[0] });
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ message: "PLO code ซ้ำในโปรแกรมนี้" });
    console.error("Create PLO error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// PUT /api/plos/:id
// body: { code, description, sort_order }
app.put("/api/plos/:id", async (req, res) => {
  const { id } = req.params;
  const { code, description, sort_order } = req.body;
  try {
    const result = await pool.query(
      `UPDATE plos SET
         code        = COALESCE($1, code),
         description = COALESCE($2, description),
         sort_order  = COALESCE($3, sort_order),
         updated_at  = now()
       WHERE id = $4
       RETURNING *`,
      [code, description, sort_order, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: "ไม่พบ PLO" });
    res.json({ message: "อัปเดต PLO สำเร็จ", plo: result.rows[0] });
  } catch (err) {
    console.error("Update PLO error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// DELETE /api/plos/:id
app.delete("/api/plos/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query("DELETE FROM plos WHERE id = $1 RETURNING *", [id]);
    if (result.rows.length === 0) return res.status(404).json({ message: "ไม่พบ PLO" });
    res.json({ message: "ลบ PLO สำเร็จ" });
  } catch (err) {
    console.error("Delete PLO error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// POST /api/plo-kas  — map PLO กับ KAS หลายตัวพร้อมกัน
// body: { plo_id, kas_ids: ["uuid1", "uuid2", ...] }
app.post("/api/plo-kas", async (req, res) => {
  const { plo_id, kas_ids } = req.body;
  if (!plo_id || !Array.isArray(kas_ids) || kas_ids.length === 0) {
    return res.status(400).json({ message: "ต้องส่ง plo_id และ kas_ids (array)" });
  }
  try {
    await pool.query("DELETE FROM plo_kas WHERE plo_id = $1", [plo_id]);
    const values = kas_ids.map((_, i) => `($1, $${i + 2})`).join(", ");
    await pool.query(
      `INSERT INTO plo_kas (plo_id, kas_id) VALUES ${values} ON CONFLICT DO NOTHING`,
      [plo_id, ...kas_ids]
    );
    res.json({ message: "บันทึก PLO-KAS สำเร็จ" });
  } catch (err) {
    console.error("PLO-KAS mapping error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// DELETE /api/plo-kas  — ลบ mapping รายคู่
// body: { plo_id, kas_id }
app.delete("/api/plo-kas", async (req, res) => {
  const { plo_id, kas_id } = req.body;
  if (!plo_id || !kas_id) return res.status(400).json({ message: "ต้องส่ง plo_id และ kas_id" });
  try {
    await pool.query("DELETE FROM plo_kas WHERE plo_id = $1 AND kas_id = $2", [plo_id, kas_id]);
    res.json({ message: "ลบ PLO-KAS สำเร็จ" });
  } catch (err) {
    console.error("Delete PLO-KAS error:", err);
    res.status(500).json({ message: "Server error" });
  }
});


// ============================================================
//  [2] KAS Items — PUT / DELETE
// ============================================================

// PUT /api/kas-items/:id
// body: { type, code, label, sort_order }
app.put("/api/kas-items/:id", async (req, res) => {
  const { id } = req.params;
  const { type, code, label, sort_order } = req.body;
  try {
    const result = await pool.query(
      `UPDATE kas_items SET
         type       = COALESCE($1, type),
         code       = COALESCE($2, code),
         label      = COALESCE($3, label),
         sort_order = COALESCE($4, sort_order)
       WHERE id = $5
       RETURNING *`,
      [type, code, label, sort_order, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: "ไม่พบ KAS item" });
    res.json({ message: "อัปเดต KAS สำเร็จ", item: result.rows[0] });
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ message: "KAS code ซ้ำ" });
    console.error("Update KAS error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// DELETE /api/kas-items/:id
app.delete("/api/kas-items/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query("DELETE FROM kas_items WHERE id = $1 RETURNING *", [id]);
    if (result.rows.length === 0) return res.status(404).json({ message: "ไม่พบ KAS item" });
    res.json({ message: "ลบ KAS สำเร็จ" });
  } catch (err) {
    console.error("Delete KAS error:", err);
    res.status(500).json({ message: "Server error" });
  }
});


// ============================================================
//  [3] Major Groups — CRUD
// ============================================================

// GET /api/programs/:programId/major-groups
app.get("/api/programs/:programId/major-groups", async (req, res) => {
  const { programId } = req.params;
  try {
    const result = await pool.query(
      `SELECT mg.*, m.name_th AS major_name_th, m.name_en AS major_name_en
       FROM major_groups mg
       LEFT JOIN majors m ON m.id = mg.major_id
       WHERE mg.program_id = $1
       ORDER BY mg.sort_order, mg.label`,
      [programId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Get major groups error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// POST /api/major-groups
// body: { program_id, major_id, label, icon, sort_order }
app.post("/api/major-groups", async (req, res) => {
  const { program_id, major_id, label, icon, sort_order = 0 } = req.body;
  if (!program_id || !label) {
    return res.status(400).json({ message: "ต้องส่ง program_id และ label" });
  }
  try {
    const result = await pool.query(
      `INSERT INTO major_groups (program_id, major_id, label, icon, sort_order)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [program_id, major_id || null, label, icon || null, sort_order]
    );
    res.status(201).json({ message: "เพิ่ม Major Group สำเร็จ", group: result.rows[0] });
  } catch (err) {
    console.error("Create major group error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// PUT /api/major-groups/:id
// body: { major_id, label, icon, sort_order }
app.put("/api/major-groups/:id", async (req, res) => {
  const { id } = req.params;
  const { major_id, label, icon, sort_order } = req.body;
  try {
    const result = await pool.query(
      `UPDATE major_groups SET
         major_id   = COALESCE($1, major_id),
         label      = COALESCE($2, label),
         icon       = COALESCE($3, icon),
         sort_order = COALESCE($4, sort_order)
       WHERE id = $5
       RETURNING *`,
      [major_id, label, icon, sort_order, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: "ไม่พบ Major Group" });
    res.json({ message: "อัปเดต Major Group สำเร็จ", group: result.rows[0] });
  } catch (err) {
    console.error("Update major group error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// DELETE /api/major-groups/:id
app.delete("/api/major-groups/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query("DELETE FROM major_groups WHERE id = $1 RETURNING *", [id]);
    if (result.rows.length === 0) return res.status(404).json({ message: "ไม่พบ Major Group" });
    res.json({ message: "ลบ Major Group สำเร็จ" });
  } catch (err) {
    console.error("Delete major group error:", err);
    res.status(500).json({ message: "Server error" });
  }
});


// ============================================================
//  [4] MLOs — CRUD + KAS mapping
// ============================================================

// GET /api/major-groups/:groupId/mlos
app.get("/api/major-groups/:groupId/mlos", async (req, res) => {
  const { groupId } = req.params;
  try {
    const mlos = await pool.query(
      `SELECT * FROM mlos WHERE major_group_id = $1 ORDER BY sort_order, code`,
      [groupId]
    );

    const mloIds = mlos.rows.map(m => m.id);
    let kasMap = {};
    if (mloIds.length > 0) {
      const mappings = await pool.query(
        `SELECT mk.mlo_id, k.id, k.code, k.label, k.type
         FROM mlo_kas mk
         JOIN kas_items k ON k.id = mk.kas_id
         WHERE mk.mlo_id = ANY($1::uuid[])`,
        [mloIds]
      );
      mappings.rows.forEach(m => {
        if (!kasMap[m.mlo_id]) kasMap[m.mlo_id] = [];
        kasMap[m.mlo_id].push({ id: m.id, code: m.code, label: m.label, type: m.type });
      });
    }

    const result = mlos.rows.map(m => ({ ...m, kas: kasMap[m.id] || [] }));
    res.json(result);
  } catch (err) {
    console.error("Get MLOs error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// POST /api/mlos
// body: { major_group_id, code, description, sort_order }
app.post("/api/mlos", async (req, res) => {
  const { major_group_id, code, description, sort_order = 0 } = req.body;
  if (!major_group_id || !code || !description) {
    return res.status(400).json({ message: "ต้องส่ง major_group_id, code, description" });
  }
  try {
    const result = await pool.query(
      `INSERT INTO mlos (major_group_id, code, description, sort_order)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [major_group_id, code, description, sort_order]
    );
    res.status(201).json({ message: "เพิ่ม MLO สำเร็จ", mlo: result.rows[0] });
  } catch (err) {
    console.error("Create MLO error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// PUT /api/mlos/:id
// body: { code, description, sort_order }
app.put("/api/mlos/:id", async (req, res) => {
  const { id } = req.params;
  const { code, description, sort_order } = req.body;
  try {
    const result = await pool.query(
      `UPDATE mlos SET
         code        = COALESCE($1, code),
         description = COALESCE($2, description),
         sort_order  = COALESCE($3, sort_order),
         updated_at  = now()
       WHERE id = $4
       RETURNING *`,
      [code, description, sort_order, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: "ไม่พบ MLO" });
    res.json({ message: "อัปเดต MLO สำเร็จ", mlo: result.rows[0] });
  } catch (err) {
    console.error("Update MLO error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// DELETE /api/mlos/:id
app.delete("/api/mlos/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query("DELETE FROM mlos WHERE id = $1 RETURNING *", [id]);
    if (result.rows.length === 0) return res.status(404).json({ message: "ไม่พบ MLO" });
    res.json({ message: "ลบ MLO สำเร็จ" });
  } catch (err) {
    console.error("Delete MLO error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// POST /api/mlo-kas  — map MLO กับ KAS หลายตัวพร้อมกัน (replace all)
// body: { mlo_id, kas_ids: ["uuid1", ...] }
app.post("/api/mlo-kas", async (req, res) => {
  const { mlo_id, kas_ids } = req.body;
  if (!mlo_id || !Array.isArray(kas_ids)) {
    return res.status(400).json({ message: "ต้องส่ง mlo_id และ kas_ids (array)" });
  }
  try {
    await pool.query("DELETE FROM mlo_kas WHERE mlo_id = $1", [mlo_id]);
    if (kas_ids.length > 0) {
      const values = kas_ids.map((_, i) => `($1, $${i + 2})`).join(", ");
      await pool.query(
        `INSERT INTO mlo_kas (mlo_id, kas_id) VALUES ${values} ON CONFLICT DO NOTHING`,
        [mlo_id, ...kas_ids]
      );
    }
    res.json({ message: "บันทึก MLO-KAS สำเร็จ" });
  } catch (err) {
    console.error("MLO-KAS mapping error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// DELETE /api/mlo-kas  — ลบ mapping รายคู่
// body: { mlo_id, kas_id }
app.delete("/api/mlo-kas", async (req, res) => {
  const { mlo_id, kas_id } = req.body;
  if (!mlo_id || !kas_id) return res.status(400).json({ message: "ต้องส่ง mlo_id และ kas_id" });
  try {
    await pool.query("DELETE FROM mlo_kas WHERE mlo_id = $1 AND kas_id = $2", [mlo_id, kas_id]);
    res.json({ message: "ลบ MLO-KAS สำเร็จ" });
  } catch (err) {
    console.error("Delete MLO-KAS error:", err);
    res.status(500).json({ message: "Server error" });
  }
});


// ============================================================
//  [5] CLOs — CRUD + KAS/PLO/MLO mapping
// ============================================================

// GET /api/subjects/:subjectId/clos  (พร้อม mapping ทั้งหมด)
app.get("/api/subjects/:subjectId/clos", async (req, res) => {
  const { subjectId } = req.params;
  try {
    const clos = await pool.query(
      `SELECT * FROM clos WHERE subject_id = $1 ORDER BY seq`,
      [subjectId]
    );

    const cloIds = clos.rows.map(c => c.id);
    if (cloIds.length === 0) return res.json([]);

    const [ploMaps, mloMaps, kasMaps] = await Promise.all([
      pool.query(
        `SELECT cp.clo_id, p.id, p.code, p.description
         FROM clo_plo cp JOIN plos p ON p.id = cp.plo_id
         WHERE cp.clo_id = ANY($1::uuid[])`,
        [cloIds]
      ),
      pool.query(
        `SELECT cm.clo_id, m.id, m.code, m.description
         FROM clo_mlo cm JOIN mlos m ON m.id = cm.mlo_id
         WHERE cm.clo_id = ANY($1::uuid[])`,
        [cloIds]
      ),
      pool.query(
        `SELECT ck.clo_id, k.id, k.code, k.label, k.type
         FROM clo_kas ck JOIN kas_items k ON k.id = ck.kas_id
         WHERE ck.clo_id = ANY($1::uuid[])`,
        [cloIds]
      )
    ]);

    const buildMap = (rows, key = "clo_id") =>
      rows.reduce((acc, r) => {
        if (!acc[r[key]]) acc[r[key]] = [];
        const { [key]: _, ...rest } = r;
        acc[r[key]].push(rest);
        return acc;
      }, {});

    const ploMap = buildMap(ploMaps.rows);
    const mloMap = buildMap(mloMaps.rows);
    const kasMap = buildMap(kasMaps.rows);

    const result = clos.rows.map(c => ({
      ...c,
      plos: ploMap[c.id] || [],
      mlos: mloMap[c.id] || [],
      kas:  kasMap[c.id]  || []
    }));

    res.json(result);
  } catch (err) {
    console.error("Get CLOs error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// GET /api/clos/:id
app.get("/api/clos/:id", async (req, res) => {
  try {
    const clo = await pool.query("SELECT * FROM clos WHERE id = $1", [req.params.id]);
    if (clo.rows.length === 0) return res.status(404).json({ message: "ไม่พบ CLO" });
    res.json(clo.rows[0]);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// POST /api/clos
// body: { subject_id, seq, description_th, description_en }
app.post("/api/clos", async (req, res) => {
  const { subject_id, seq, description_th, description_en } = req.body;
  if (!subject_id || !seq || !description_th) {
    return res.status(400).json({ message: "ต้องส่ง subject_id, seq, description_th" });
  }
  try {
    const result = await pool.query(
      `INSERT INTO clos (subject_id, seq, description_th, description_en)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [subject_id, seq, description_th, description_en || null]
    );
    res.status(201).json({ message: "เพิ่ม CLO สำเร็จ", clo: result.rows[0] });
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ message: "seq ซ้ำในวิชานี้" });
    console.error("Create CLO error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// PUT /api/clos/:id
// body: { seq, description_th, description_en }
app.put("/api/clos/:id", async (req, res) => {
  const { id } = req.params;
  const { seq, description_th, description_en } = req.body;
  try {
    const result = await pool.query(
      `UPDATE clos SET
         seq            = COALESCE($1, seq),
         description_th = COALESCE($2, description_th),
         description_en = COALESCE($3, description_en),
         updated_at     = now()
       WHERE id = $4
       RETURNING *`,
      [seq, description_th, description_en, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: "ไม่พบ CLO" });
    res.json({ message: "อัปเดต CLO สำเร็จ", clo: result.rows[0] });
  } catch (err) {
    console.error("Update CLO error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// DELETE /api/clos/:id
app.delete("/api/clos/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query("DELETE FROM clos WHERE id = $1 RETURNING *", [id]);
    if (result.rows.length === 0) return res.status(404).json({ message: "ไม่พบ CLO" });
    res.json({ message: "ลบ CLO สำเร็จ" });
  } catch (err) {
    console.error("Delete CLO error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// POST /api/clo-kas  body: { clo_id, kas_ids: ["uuid", ...] }  (replace all)
app.post("/api/clo-kas", async (req, res) => {
  const { clo_id, kas_ids } = req.body;
  if (!clo_id || !Array.isArray(kas_ids)) {
    return res.status(400).json({ message: "ต้องส่ง clo_id และ kas_ids (array)" });
  }
  try {
    await pool.query("DELETE FROM clo_kas WHERE clo_id = $1", [clo_id]);
    if (kas_ids.length > 0) {
      const values = kas_ids.map((_, i) => `($1, $${i + 2})`).join(", ");
      await pool.query(
        `INSERT INTO clo_kas (clo_id, kas_id) VALUES ${values} ON CONFLICT DO NOTHING`,
        [clo_id, ...kas_ids]
      );
    }
    res.json({ message: "บันทึก CLO-KAS สำเร็จ" });
  } catch (err) {
    console.error("CLO-KAS error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// DELETE /api/clo-kas  body: { clo_id, kas_id }
app.delete("/api/clo-kas", async (req, res) => {
  const { clo_id, kas_id } = req.body;
  if (!clo_id || !kas_id) return res.status(400).json({ message: "ต้องส่ง clo_id, kas_id" });
  try {
    await pool.query("DELETE FROM clo_kas WHERE clo_id = $1 AND kas_id = $2", [clo_id, kas_id]);
    res.json({ message: "ลบ CLO-KAS สำเร็จ" });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// POST /api/clo-plo  body: { clo_id, plo_ids: ["uuid", ...] }  (replace all)
app.post("/api/clo-plo", async (req, res) => {
  const { clo_id, plo_ids } = req.body;
  if (!clo_id || !Array.isArray(plo_ids)) {
    return res.status(400).json({ message: "ต้องส่ง clo_id และ plo_ids (array)" });
  }
  try {
    await pool.query("DELETE FROM clo_plo WHERE clo_id = $1", [clo_id]);
    if (plo_ids.length > 0) {
      const values = plo_ids.map((_, i) => `($1, $${i + 2})`).join(", ");
      await pool.query(
        `INSERT INTO clo_plo (clo_id, plo_id) VALUES ${values} ON CONFLICT DO NOTHING`,
        [clo_id, ...plo_ids]
      );
    }
    res.json({ message: "บันทึก CLO-PLO สำเร็จ" });
  } catch (err) {
    console.error("CLO-PLO error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// DELETE /api/clo-plo  body: { clo_id, plo_id }
app.delete("/api/clo-plo", async (req, res) => {
  const { clo_id, plo_id } = req.body;
  if (!clo_id || !plo_id) return res.status(400).json({ message: "ต้องส่ง clo_id, plo_id" });
  try {
    await pool.query("DELETE FROM clo_plo WHERE clo_id = $1 AND plo_id = $2", [clo_id, plo_id]);
    res.json({ message: "ลบ CLO-PLO สำเร็จ" });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// POST /api/clo-mlo  body: { clo_id, mlo_ids: ["uuid", ...] }  (replace all)
app.post("/api/clo-mlo", async (req, res) => {
  const { clo_id, mlo_ids } = req.body;
  if (!clo_id || !Array.isArray(mlo_ids)) {
    return res.status(400).json({ message: "ต้องส่ง clo_id และ mlo_ids (array)" });
  }
  try {
    await pool.query("DELETE FROM clo_mlo WHERE clo_id = $1", [clo_id]);
    if (mlo_ids.length > 0) {
      const values = mlo_ids.map((_, i) => `($1, $${i + 2})`).join(", ");
      await pool.query(
        `INSERT INTO clo_mlo (clo_id, mlo_id) VALUES ${values} ON CONFLICT DO NOTHING`,
        [clo_id, ...mlo_ids]
      );
    }
    res.json({ message: "บันทึก CLO-MLO สำเร็จ" });
  } catch (err) {
    console.error("CLO-MLO error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// DELETE /api/clo-mlo  body: { clo_id, mlo_id }
app.delete("/api/clo-mlo", async (req, res) => {
  const { clo_id, mlo_id } = req.body;
  if (!clo_id || !mlo_id) return res.status(400).json({ message: "ต้องส่ง clo_id, mlo_id" });
  try {
    await pool.query("DELETE FROM clo_mlo WHERE clo_id = $1 AND mlo_id = $2", [clo_id, mlo_id]);
    res.json({ message: "ลบ CLO-MLO สำเร็จ" });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});


// ============================================================
//  [6] Alignment Matrix
// ============================================================

// GET /api/programs/:programId/alignment-rows
app.get("/api/programs/:programId/alignment-rows", async (req, res) => {
  const { programId } = req.params;
  try {
    const rows = await pool.query(
      `SELECT * FROM alignment_rows WHERE program_id = $1 ORDER BY sort_order, group_label`,
      [programId]
    );

    const rowIds = rows.rows.map(r => r.id);
    if (rowIds.length === 0) return res.json([]);

    const [ploChecks, mloChecks] = await Promise.all([
      pool.query(
        `SELECT apc.alignment_row_id, p.id AS plo_id, p.code AS plo_code, apc.checked
         FROM alignment_plo_checks apc
         JOIN plos p ON p.id = apc.plo_id
         WHERE apc.alignment_row_id = ANY($1::uuid[])`,
        [rowIds]
      ),
      pool.query(
        `SELECT amc.alignment_row_id, m.id AS mlo_id, m.code AS mlo_code, amc.checked
         FROM alignment_mlo_checks amc
         JOIN mlos m ON m.id = amc.mlo_id
         WHERE amc.alignment_row_id = ANY($1::uuid[])`,
        [rowIds]
      )
    ]);

    const ploMap = {};
    ploChecks.rows.forEach(r => {
      if (!ploMap[r.alignment_row_id]) ploMap[r.alignment_row_id] = [];
      ploMap[r.alignment_row_id].push({ plo_id: r.plo_id, code: r.plo_code, checked: r.checked });
    });

    const mloMap = {};
    mloChecks.rows.forEach(r => {
      if (!mloMap[r.alignment_row_id]) mloMap[r.alignment_row_id] = [];
      mloMap[r.alignment_row_id].push({ mlo_id: r.mlo_id, code: r.mlo_code, checked: r.checked });
    });

    const result = rows.rows.map(r => ({
      ...r,
      plo_checks: ploMap[r.id] || [],
      mlo_checks: mloMap[r.id] || []
    }));

    res.json(result);
  } catch (err) {
    console.error("Get alignment rows error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// POST /api/alignment-rows
// body: { program_id, group_label, title, description, sort_order }
app.post("/api/alignment-rows", async (req, res) => {
  const { program_id, group_label, title, description, sort_order = 0 } = req.body;
  if (!program_id || !group_label || !title) {
    return res.status(400).json({ message: "ต้องส่ง program_id, group_label, title" });
  }
  try {
    const result = await pool.query(
      `INSERT INTO alignment_rows (program_id, group_label, title, description, sort_order)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [program_id, group_label, title, description || null, sort_order]
    );
    res.status(201).json({ message: "เพิ่ม Alignment Row สำเร็จ", row: result.rows[0] });
  } catch (err) {
    console.error("Create alignment row error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// PUT /api/alignment-rows/:id
// body: { group_label, title, description, sort_order }
app.put("/api/alignment-rows/:id", async (req, res) => {
  const { id } = req.params;
  const { group_label, title, description, sort_order } = req.body;
  try {
    const result = await pool.query(
      `UPDATE alignment_rows SET
         group_label = COALESCE($1, group_label),
         title       = COALESCE($2, title),
         description = COALESCE($3, description),
         sort_order  = COALESCE($4, sort_order)
       WHERE id = $5
       RETURNING *`,
      [group_label, title, description, sort_order, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: "ไม่พบแถว" });
    res.json({ message: "อัปเดตสำเร็จ", row: result.rows[0] });
  } catch (err) {
    console.error("Update alignment row error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// DELETE /api/alignment-rows/:id
app.delete("/api/alignment-rows/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query("DELETE FROM alignment_rows WHERE id = $1 RETURNING *", [id]);
    if (result.rows.length === 0) return res.status(404).json({ message: "ไม่พบแถว" });
    res.json({ message: "ลบสำเร็จ" });
  } catch (err) {
    console.error("Delete alignment row error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// PUT /api/alignment-rows/:id/plo-checks
// body: { plo_id, checked }
app.put("/api/alignment-rows/:id/plo-checks", async (req, res) => {
  const { id } = req.params;
  const { plo_id, checked } = req.body;
  if (!plo_id || checked === undefined) {
    return res.status(400).json({ message: "ต้องส่ง plo_id และ checked (boolean)" });
  }
  try {
    await pool.query(
      `INSERT INTO alignment_plo_checks (alignment_row_id, plo_id, checked)
       VALUES ($1, $2, $3)
       ON CONFLICT (alignment_row_id, plo_id) DO UPDATE SET checked = EXCLUDED.checked`,
      [id, plo_id, checked]
    );
    res.json({ message: "บันทึก PLO check สำเร็จ" });
  } catch (err) {
    console.error("PLO check error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// PUT /api/alignment-rows/:id/mlo-checks
// body: { mlo_id, checked }
app.put("/api/alignment-rows/:id/mlo-checks", async (req, res) => {
  const { id } = req.params;
  const { mlo_id, checked } = req.body;
  if (!mlo_id || checked === undefined) {
    return res.status(400).json({ message: "ต้องส่ง mlo_id และ checked (boolean)" });
  }
  try {
    await pool.query(
      `INSERT INTO alignment_mlo_checks (alignment_row_id, mlo_id, checked)
       VALUES ($1, $2, $3)
       ON CONFLICT (alignment_row_id, mlo_id) DO UPDATE SET checked = EXCLUDED.checked`,
      [id, mlo_id, checked]
    );
    res.json({ message: "บันทึก MLO check สำเร็จ" });
  } catch (err) {
    console.error("MLO check error:", err);
    res.status(500).json({ message: "Server error" });
  }
});


// ============================================================
//  [7] PLO Scores
// ============================================================

// GET /api/programs/:programId/plo-scores?year=2567&lo_level=PLO
app.get("/api/programs/:programId/plo-scores", async (req, res) => {
  const { programId } = req.params;
  const { year, lo_level } = req.query;

  let where = "WHERE program_id = $1";
  const values = [programId];
  let idx = 2;

  if (year)     { where += ` AND academic_year = $${idx++}`; values.push(year); }
  if (lo_level) { where += ` AND lo_level = $${idx++}`;      values.push(lo_level); }

  try {
    const result = await pool.query(
      `SELECT * FROM plo_scores ${where} ORDER BY lo_level, lo_code, academic_year DESC`,
      values
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Get PLO scores error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// GET /api/programs/:programId/plo-score-summary?year=2567
app.get("/api/programs/:programId/plo-score-summary", async (req, res) => {
  const { programId } = req.params;
  const { year } = req.query;

  let where = "WHERE program_id = $1";
  const values = [programId];
  if (year) { where += " AND academic_year = $2"; values.push(year); }

  try {
    const result = await pool.query(
      `SELECT * FROM v_plo_score_summary ${where} ORDER BY lo_level, lo_code`,
      values
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Get PLO score summary error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// POST /api/plo-scores  — upsert
// body: { program_id, lo_level, lo_code, lo_description, academic_year, semester_1, semester_2, note }
app.post("/api/plo-scores", async (req, res) => {
  const {
    program_id, lo_level, lo_code, lo_description,
    academic_year, semester_1, semester_2, note
  } = req.body;

  if (!program_id || !lo_level || !lo_code || !academic_year) {
    return res.status(400).json({ message: "ต้องส่ง program_id, lo_level, lo_code, academic_year" });
  }

  try {
    const result = await pool.query(
      `INSERT INTO plo_scores
         (program_id, lo_level, lo_code, lo_description, academic_year, semester_1, semester_2, note)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (program_id, lo_code, academic_year)
       DO UPDATE SET
         lo_description = EXCLUDED.lo_description,
         semester_1     = EXCLUDED.semester_1,
         semester_2     = EXCLUDED.semester_2,
         note           = EXCLUDED.note,
         updated_at     = now()
       RETURNING *`,
      [
        program_id, lo_level, lo_code, lo_description || null,
        academic_year,
        semester_1 !== undefined ? semester_1 : null,
        semester_2 !== undefined ? semester_2 : null,
        note || null
      ]
    );
    res.json({ message: "บันทึก PLO Score สำเร็จ", score: result.rows[0] });
  } catch (err) {
    console.error("Upsert PLO score error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// PUT /api/plo-scores/:id
// body: { semester_1, semester_2, note, lo_description }
app.put("/api/plo-scores/:id", async (req, res) => {
  const { id } = req.params;
  const { semester_1, semester_2, note, lo_description } = req.body;
  try {
    const result = await pool.query(
      `UPDATE plo_scores SET
         semester_1     = COALESCE($1, semester_1),
         semester_2     = COALESCE($2, semester_2),
         note           = COALESCE($3, note),
         lo_description = COALESCE($4, lo_description),
         updated_at     = now()
       WHERE id = $5
       RETURNING *`,
      [semester_1, semester_2, note, lo_description, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: "ไม่พบข้อมูล" });
    res.json({ message: "อัปเดตสำเร็จ", score: result.rows[0] });
  } catch (err) {
    console.error("Update PLO score error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// DELETE /api/plo-scores/:id
app.delete("/api/plo-scores/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query("DELETE FROM plo_scores WHERE id = $1 RETURNING *", [id]);
    if (result.rows.length === 0) return res.status(404).json({ message: "ไม่พบข้อมูล" });
    res.json({ message: "ลบ PLO Score สำเร็จ" });
  } catch (err) {
    console.error("Delete PLO score error:", err);
    res.status(500).json({ message: "Server error" });
  }
});


// ============================================================
//  [8] Subjects — GET / PUT / DELETE
// ============================================================

// GET /api/subjects/:id
app.get("/api/subjects/:id", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM subjects WHERE id = $1", [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ message: "ไม่พบรายวิชา" });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// PUT /api/subjects/:id
app.put("/api/subjects/:id", async (req, res) => {
  const { id } = req.params;
  const {
    code, name_th, name_en,
    default_credits, default_hour_structure,
    description_th, description_en,
    outcomes_th, outcomes_en
  } = req.body;

  try {
    const result = await pool.query(
      `UPDATE subjects SET
         code                   = COALESCE($1,  code),
         name_th                = COALESCE($2,  name_th),
         name_en                = COALESCE($3,  name_en),
         default_credits        = COALESCE($4,  default_credits),
         default_hour_structure = COALESCE($5,  default_hour_structure),
         description_th         = COALESCE($6,  description_th),
         description_en         = COALESCE($7,  description_en),
         outcomes_th            = COALESCE($8,  outcomes_th),
         outcomes_en            = COALESCE($9,  outcomes_en)
       WHERE id = $10
       RETURNING *`,
      [
        code, name_th, name_en, default_credits, default_hour_structure,
        description_th, description_en, outcomes_th, outcomes_en, id
      ]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: "ไม่พบรายวิชา" });
    res.json({ message: "อัปเดตรายวิชาสำเร็จ", subject: result.rows[0] });
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ message: "รหัสวิชาซ้ำ" });
    console.error("Update subject error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// DELETE /api/subjects/:id
app.delete("/api/subjects/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query("DELETE FROM subjects WHERE id = $1 RETURNING *", [id]);
    if (result.rows.length === 0) return res.status(404).json({ message: "ไม่พบรายวิชา" });
    res.json({ message: "ลบรายวิชาสำเร็จ" });
  } catch (err) {
    console.error("Delete subject error:", err);
    res.status(500).json({ message: err.message });
  }
});


// ============================================================
//  [9] View Helpers
// ============================================================

// GET /api/programs/:programId/clo-full?subject_id=xxx
app.get("/api/programs/:programId/clo-full", async (req, res) => {
  const { subject_id } = req.query;
  try {
    let query = `
      SELECT vcf.*
      FROM v_clo_full vcf
      JOIN clos cl ON cl.id = vcf.clo_id
      JOIN subjects su ON su.id = cl.subject_id
      JOIN semester_subjects ss ON ss.subject_id = su.id
      JOIN semesters se ON se.id = ss.semester_id
      JOIN study_plans sp ON sp.id = se.study_plan_id
      JOIN programs pr ON pr.course_id = sp.course_id
      WHERE pr.id = $1
    `;
    const values = [req.params.programId];
    if (subject_id) { query += " AND vcf.subject_id = $2"; values.push(subject_id); }
    query += " ORDER BY vcf.subject_code, vcf.seq";

    const result = await pool.query(query, values);
    res.json(result.rows);
  } catch (err) {
    console.error("CLO full error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// GET /api/study-plans/:planId/full
app.get("/api/study-plans/:planId/full", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM v_study_plan_full WHERE plan_id = $1`,
      [req.params.planId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Study plan full error:", err);
    res.status(500).json({ message: "Server error" });
  }
});


// ============================================================
//  [10] Stakeholders & Surveys
// ============================================================

// GET /api/programs/:programId/stakeholders
app.get("/api/programs/:programId/stakeholders", async (req, res) => {
  try {
    const r = await pool.query(
      "SELECT * FROM stakeholders WHERE program_id=$1 AND is_active=true ORDER BY sort_order",
      [req.params.programId]
    );
    res.json(r.rows);
  } catch (e) { res.status(500).json({ message: "Server error" }); }
});

// POST /api/stakeholders
// body: { program_id, name_th, name_en, sort_order }
app.post("/api/stakeholders", async (req, res) => {
  const { program_id, name_th, name_en, sort_order = 0 } = req.body;
  if (!program_id || !name_th) return res.status(400).json({ message: "ต้องส่ง program_id และ name_th" });
  try {
    const r = await pool.query(
      "INSERT INTO stakeholders (program_id,name_th,name_en,sort_order) VALUES($1,$2,$3,$4) RETURNING *",
      [program_id, name_th, name_en || null, sort_order]
    );
    res.status(201).json({ message: "เพิ่ม Stakeholder สำเร็จ", stakeholder: r.rows[0] });
  } catch (e) {
    if (e.code === "23505") return res.status(409).json({ message: "ชื่อ Stakeholder ซ้ำ" });
    res.status(500).json({ message: "Server error" });
  }
});

// DELETE /api/stakeholders/:id  (soft delete)
app.delete("/api/stakeholders/:id", async (req, res) => {
  try {
    await pool.query("UPDATE stakeholders SET is_active=false WHERE id=$1", [req.params.id]);
    res.json({ message: "ลบ Stakeholder แล้ว" });
  } catch (e) { res.status(500).json({ message: "Server error" }); }
});

// GET /api/surveys?program_id=&year=
app.get("/api/surveys", async (req, res) => {
  const { program_id, year } = req.query;
  let where = "WHERE 1=1", vals = [];
  if (program_id) { where += " AND program_id=$" + (vals.length + 1); vals.push(program_id); }
  if (year)       { where += " AND academic_year=$" + (vals.length + 1); vals.push(year); }
  try {
    const r = await pool.query(
      `SELECT * FROM stakeholder_surveys ${where} ORDER BY academic_year DESC,created_at DESC`,
      vals
    );
    res.json(r.rows);
  } catch (e) { res.status(500).json({ message: "Server error" }); }
});

// POST /api/surveys
// body: { program_id, title, academic_year, survey_date, note }
app.post("/api/surveys", async (req, res) => {
  const { program_id, title, academic_year, survey_date, note } = req.body;
  if (!program_id || !title || !academic_year) return res.status(400).json({ message: "ข้อมูลไม่ครบ" });
  try {
    const r = await pool.query(
      "INSERT INTO stakeholder_surveys (program_id,title,academic_year,survey_date,note) VALUES($1,$2,$3,$4,$5) RETURNING *",
      [program_id, title, academic_year, survey_date || null, note || null]
    );
    res.status(201).json({ message: "สร้าง Survey สำเร็จ", survey: r.rows[0] });
  } catch (e) { res.status(500).json({ message: "Server error" }); }
});

// GET /api/surveys/:surveyId/matrix
app.get("/api/surveys/:surveyId/matrix", async (req, res) => {
  try {
    const r = await pool.query(
      "SELECT * FROM v_stakeholder_plo_matrix WHERE survey_id=$1",
      [req.params.surveyId]
    );
    res.json(r.rows);
  } catch (e) { res.status(500).json({ message: "Server error" }); }
});

// POST /api/surveys/:surveyId/mappings  (replace all)
// body: { mappings: [{stakeholder_id, plo_id, level}] }
app.post("/api/surveys/:surveyId/mappings", async (req, res) => {
  const { surveyId } = req.params;
  const { mappings } = req.body;
  if (!Array.isArray(mappings)) return res.status(400).json({ message: "ต้องส่ง mappings (array)" });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM stakeholder_plo_mappings WHERE survey_id=$1", [surveyId]);
    const valid = mappings.filter(m => m.level && ["F", "M", "P"].includes(m.level));
    if (valid.length > 0) {
      const vals = valid.map((_, i) => `($1,$${i * 3 + 2},$${i * 3 + 3},$${i * 3 + 4})`).join(",");
      const params = [surveyId, ...valid.flatMap(m => [m.stakeholder_id, m.plo_id, m.level])];
      await client.query(
        `INSERT INTO stakeholder_plo_mappings (survey_id,stakeholder_id,plo_id,level) VALUES ${vals}
         ON CONFLICT (survey_id,stakeholder_id,plo_id) DO UPDATE SET level=EXCLUDED.level,updated_at=now()`,
        params
      );
    }
    await client.query("COMMIT");
    res.json({ message: `บันทึก ${valid.length} mapping สำเร็จ` });
  } catch (e) {
    await client.query("ROLLBACK");
    res.status(500).json({ message: "Server error: " + e.message });
  } finally { client.release(); }
});

// PUT /api/surveys/:surveyId/mappings/single  (upsert รายคู่)
// body: { stakeholder_id, plo_id, level }
app.put("/api/surveys/:surveyId/mappings/single", async (req, res) => {
  const { surveyId } = req.params;
  const { stakeholder_id, plo_id, level } = req.body;
  if (!stakeholder_id || !plo_id) return res.status(400).json({ message: "ต้องส่ง stakeholder_id และ plo_id" });
  try {
    if (!level || !["F", "M", "P"].includes(level)) {
      await pool.query(
        "DELETE FROM stakeholder_plo_mappings WHERE survey_id=$1 AND stakeholder_id=$2 AND plo_id=$3",
        [surveyId, stakeholder_id, plo_id]
      );
    } else {
      await pool.query(
        `INSERT INTO stakeholder_plo_mappings (survey_id,stakeholder_id,plo_id,level)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (survey_id,stakeholder_id,plo_id) DO UPDATE SET level=EXCLUDED.level,updated_at=now()`,
        [surveyId, stakeholder_id, plo_id, level]
      );
    }
    res.json({ message: "บันทึกสำเร็จ" });
  } catch (e) { res.status(500).json({ message: "Server error" }); }
});

// GET /api/surveys/:surveyId/summary
app.get("/api/surveys/:surveyId/summary", async (req, res) => {
  try {
    const r = await pool.query(
      "SELECT * FROM v_plo_stakeholder_summary WHERE survey_id=$1",
      [req.params.surveyId]
    );
    res.json(r.rows);
  } catch (e) { res.status(500).json({ message: "Server error" }); }
});

// POST /api/surveys/:surveyId/import-excel
// body: { stakeholders:["ชื่อ1",...], rows:[{plo_no, type, ชื่อ1:"F", ...}] }
app.post("/api/surveys/:surveyId/import-excel", async (req, res) => {
  const { surveyId } = req.params;
  const { stakeholders: skNames, rows } = req.body;
  if (!Array.isArray(skNames) || !Array.isArray(rows))
    return res.status(400).json({ message: "ข้อมูลไม่ถูกต้อง" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const sv = await client.query("SELECT program_id FROM stakeholder_surveys WHERE id=$1", [surveyId]);
    if (!sv.rows.length) throw new Error("ไม่พบ survey");
    const programId = sv.rows[0].program_id;

    // Upsert stakeholders
    const skMap = {};
    for (const name of skNames) {
      const r = await client.query(
        `INSERT INTO stakeholders (program_id,name_th) VALUES ($1,$2)
         ON CONFLICT (program_id,name_th) DO UPDATE SET is_active=true
         RETURNING id`,
        [programId, name]
      );
      skMap[name] = r.rows[0].id;
    }

    // PLO map
    const ploR = await client.query("SELECT id,code FROM plos WHERE program_id=$1", [programId]);
    const ploMap = {};
    ploR.rows.forEach(r => { ploMap[r.code] = r.id; });

    await client.query("DELETE FROM stakeholder_plo_mappings WHERE survey_id=$1", [surveyId]);

    const inserts = [];
    rows.forEach((row, ri) => {
      const ploCode = `PLO${row["plo_no"] || row["no"] || (ri + 1)}`;
      const ploId = ploMap[ploCode];
      if (!ploId) return;
      skNames.forEach(sk => {
        const level = String(row[sk] || "").trim().toUpperCase();
        if (["F", "M", "P"].includes(level)) {
          inserts.push([surveyId, skMap[sk], ploId, level]);
        }
      });
    });

    if (inserts.length > 0) {
      const vals = inserts.map((_, i) => `($${i * 4 + 1},$${i * 4 + 2},$${i * 4 + 3},$${i * 4 + 4})`).join(",");
      await client.query(
        `INSERT INTO stakeholder_plo_mappings (survey_id,stakeholder_id,plo_id,level) VALUES ${vals}
         ON CONFLICT DO NOTHING`,
        inserts.flat()
      );
    }

    await client.query("COMMIT");
    res.json({ message: `นำเข้าสำเร็จ: ${inserts.length} mapping`, count: inserts.length });
  } catch (e) {
    await client.query("ROLLBACK");
    res.status(500).json({ message: "Server error: " + e.message });
  } finally { client.release(); }
});

// Serve frontend static files
// ✅ ถูก — ชี้ไปที่ frontend/dist ที่ build แล้ว
// Root Directory ว่าง → __dirname = /opt/render/project/src/backend
app.use(express.static(path.join(__dirname, "../frontend")));

app.get("*", (req, res) => {
  if (!req.path.startsWith("/api")) {
    res.sendFile(path.join(__dirname, "../frontend/login.html"));
  }
});
// ============================================================
//  Start Server
// ============================================================
app.listen(PORT, () => {
  console.log(`🚀 FMS backend listening on port ${PORT}`);
});