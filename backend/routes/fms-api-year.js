// ============================================================
//  fms-api-year.js  —  Multi-Year API Routes
//  เพิ่มไฟล์นี้เข้า Express app ด้วย:
//    const yearRoutes = require('./fms-api-year');
//    app.use('/api', yearRoutes);
// ============================================================
const express = require('express');
const router  = express.Router();

// ── helper: db query (ปรับให้ตรงกับ pool ที่ใช้อยู่) ──────
// สมมติใช้ mysql2/promise pool ชื่อ `db`
// ถ้าใช้ชื่ออื่นให้เปลี่ยนตรงนี้
let db;
try { db = require('./db'); }
catch(_) { db = null; } {
  // fallback สำหรับ test
  db = { query: async () => [[],[]] };
}

const q = (sql, params) => db.query(sql, params);

// ── ฟังก์ชัน validate year ────────────────────────────────
function validYear(year) {
  const n = parseInt(year);
  return Number.isInteger(n) && n >= 2500 && n <= 2700 ? n : null;
}

// ─────────────────────────────────────────────────────────────
//  1. GET /api/academic-years
//     ดึงรายการปีการศึกษาทั้งหมด
// ─────────────────────────────────────────────────────────────
router.get('/academic-years', async (req, res) => {
  try {
    const [rows] = await q(
      'SELECT year, label, is_active FROM academic_years ORDER BY year DESC'
    );
    res.json({ years: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────
//  2. POST /api/academic-years
//     เพิ่มปีการศึกษาใหม่
// ─────────────────────────────────────────────────────────────
router.post('/academic-years', async (req, res) => {
  const { year, label } = req.body;
  const y = validYear(year);
  if (!y) return res.status(400).json({ error: 'year ไม่ถูกต้อง' });
  try {
    await q(
      'INSERT IGNORE INTO academic_years (year, label) VALUES (?, ?)',
      [y, label || `ปีการศึกษา ${y}`]
    );
    res.json({ year: y, label: label || `ปีการศึกษา ${y}` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────
//  3. GET /api/programs/:programId/plo-mlo?year=2567
//     ดึง PLO + MLO ตามปี
// ─────────────────────────────────────────────────────────────
router.get('/programs/:programId/plo-mlo', async (req, res) => {
  const { programId } = req.params;
  const year = validYear(req.query.year) || 2567;

  try {
    // PLO
    const [plos] = await q(
      `SELECT id, code, description AS skill, sort_order
       FROM plos
       WHERE program_id = ? AND academic_year = ?
       ORDER BY sort_order, id`,
      [programId, year]
    );

    // MLO (join major_groups เพื่อได้ group label)
    const [mlos] = await q(
      `SELECT m.id, mg.label AS \`group\`, m.code,
              m.description AS skill, m.sort_order
       FROM mlos m
       JOIN major_groups mg ON mg.id = m.major_group_id
       WHERE mg.program_id = ? AND m.academic_year = ?
       ORDER BY mg.sort_order, m.sort_order, m.id`,
      [programId, year]
    );

    res.json({ year, PLO: plos, MLO: mlos });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────
//  4. PUT /api/programs/:programId/plo-mlo?year=2567
//     บันทึก PLO + MLO (bulk upsert ตามปี)
//     Body: { PLO: [{code, skill}], MLO: [{group, code, skill}] }
// ─────────────────────────────────────────────────────────────
router.put('/programs/:programId/plo-mlo', async (req, res) => {
  const { programId } = req.params;
  const year = validYear(req.query.year || req.body.year) || 2567;
  const { PLO = [], MLO = [] } = req.body;

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // ── PLO: ลบของปีนั้นแล้ว insert ใหม่ ──────────────────
    await conn.query(
      'DELETE FROM plos WHERE program_id = ? AND academic_year = ?',
      [programId, year]
    );
    for (let i = 0; i < PLO.length; i++) {
      const { code, skill } = PLO[i];
      await conn.query(
        `INSERT INTO plos (program_id, academic_year, code, description, sort_order)
         VALUES (?, ?, ?, ?, ?)`,
        [programId, year, code, skill || '', i + 1]
      );
    }

    // ── MLO: จัดการ major_groups + mlos ──────────────────
    // groupby group label
    const groupMap = {};
    MLO.forEach((m, idx) => {
      const g = m.group || 'MLO ทั้งหมด';
      if (!groupMap[g]) groupMap[g] = [];
      groupMap[g].push({ ...m, idx });
    });

    // ลบ mlos ของปีนั้น (major_groups ไม่ลบ เพราะอาจแชร์กันหลายปี)
    // แต่เพิ่ม academic_year ใน mlos แทน
    await conn.query(
      `DELETE m FROM mlos m
       JOIN major_groups mg ON mg.id = m.group_id
       WHERE mg.program_id = ? AND m.academic_year = ?`,
      [programId, year]
    );

    let gOrder = 1;
    for (const [groupLabel, items] of Object.entries(groupMap)) {
      // หา/สร้าง major_group (ไม่ขึ้นกับปี)
      const [[existG]] = await conn.query(
        'SELECT id FROM major_groups WHERE program_id = ? AND label = ? LIMIT 1',
        [programId, groupLabel]
      );
      let groupId;
      if (existG) {
        groupId = existG.id;
      } else {
        const [ins] = await conn.query(
          'INSERT INTO major_groups (program_id, label, sort_order) VALUES (?, ?, ?)',
          [programId, groupLabel, gOrder]
        );
        groupId = ins.insertId;
      }
      gOrder++;

      // insert mlos พร้อม academic_year
      for (let j = 0; j < items.length; j++) {
        const { code, skill } = items[j];
        await conn.query(
          `INSERT INTO mlos (major_group_id, academic_year, code, description, sort_order)
           VALUES (?, ?, ?, ?, ?)`,
          [groupId, year, code, skill || '', j + 1]
        );
      }
    }

    await conn.commit();
    res.json({ ok: true, year, ploCount: PLO.length, mloCount: MLO.length });
  } catch (e) {
    await conn.rollback();
    res.status(500).json({ error: e.message });
  } finally {
    conn.release();
  }
});

// ─────────────────────────────────────────────────────────────
//  5. GET /api/programs/:programId/matrix?year=2567
//     ดึงข้อมูล Alignment Matrix ตามปี
// ─────────────────────────────────────────────────────────────
router.get('/programs/:programId/matrix', async (req, res) => {
  const { programId } = req.params;
  const year = validYear(req.query.year) || 2567;

  try {
    // rows
    const [rows] = await q(
      `SELECT id, group_label, title, description, sort_order
       FROM matrix_rows
       WHERE program_id = ? AND academic_year = ?
       ORDER BY sort_order, id`,
      [programId, year]
    );

    // checks
    const [checks] = await q(
      `SELECT mc.row_id, mc.col_type, mc.col_id, mc.checked
       FROM matrix_checks mc
       JOIN matrix_rows mr ON mr.id = mc.row_id
       WHERE mr.program_id = ? AND mr.academic_year = ?`,
      [programId, year]
    );

    // plos + mlos ของปีนั้น
    const [plos] = await q(
      'SELECT id, code FROM plos WHERE program_id = ? AND academic_year = ? ORDER BY sort_order',
      [programId, year]
    );
    const [mlos] = await q(
      `SELECT m.id, m.code FROM mlos m
       JOIN major_groups mg ON mg.id = m.group_id
       WHERE mg.program_id = ? AND m.academic_year = ?
       ORDER BY mg.sort_order, m.sort_order`,
      [programId, year]
    );

    // checkMap: { rowId: [colId, ...] }
    const checkMap = {};
    checks.forEach(c => {
      if (c.checked) {
        if (!checkMap[c.row_id]) checkMap[c.row_id] = [];
        checkMap[c.row_id].push(c.col_id);
      }
    });

    res.json({ year, plos, mlos, rows, checkMap });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────
//  6. PUT /api/programs/:programId/matrix/rows?year=2567
//     บันทึก matrix rows ทั้งหมดตามปี
// ─────────────────────────────────────────────────────────────
router.put('/programs/:programId/matrix/rows', async (req, res) => {
  const { programId } = req.params;
  const year = validYear(req.query.year || req.body.year) || 2567;
  const { rows = [] } = req.body;

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // ลบ checks ของ rows ที่จะ reset
    await conn.query(
      `DELETE mc FROM matrix_checks mc
       JOIN matrix_rows mr ON mr.id = mc.row_id
       WHERE mr.program_id = ? AND mr.academic_year = ?`,
      [programId, year]
    );
    await conn.query(
      'DELETE FROM matrix_rows WHERE program_id = ? AND academic_year = ?',
      [programId, year]
    );

    const savedRows = [];
    for (let i = 0; i < rows.length; i++) {
      const { group_label, title, description } = rows[i];
      const [ins] = await conn.query(
        `INSERT INTO matrix_rows (program_id, academic_year, group_label, title, description, sort_order)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [programId, year, group_label || '', title || '', description || '', i + 1]
      );
      savedRows.push({ id: ins.insertId, group_label, title, description });
    }

    await conn.commit();
    res.json({ ok: true, year, rows: savedRows });
  } catch (e) {
    await conn.rollback();
    res.status(500).json({ error: e.message });
  } finally {
    conn.release();
  }
});

// ─────────────────────────────────────────────────────────────
//  7. POST /api/matrix/toggle-check
//     Toggle checkbox ใน matrix (ใช้งาน real-time)
// ─────────────────────────────────────────────────────────────
router.post('/matrix/toggle-check', async (req, res) => {
  const { row_id, col_type, col_id, checked } = req.body;
  try {
    await q(
      `INSERT INTO matrix_checks (row_id, col_type, col_id, checked)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE checked = VALUES(checked)`,
      [row_id, col_type, col_id, checked ? 1 : 0]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────
//  8. GET  /api/plo/scores?year=2567&program_id=xxx
//  9. PUT  /api/plo/scores   (body: {year, program_id, data})
// ─────────────────────────────────────────────────────────────
router.get('/plo/scores', async (req, res) => {
  const { program_id, year } = req.query;
  const y = validYear(year) || 2567;
  try {
    const [[row]] = await q(
      'SELECT score_data, updated_at FROM plo_scores WHERE program_id = ? AND academic_year = ?',
      [program_id, y]
    );
    if (!row) return res.json({ success: true, year: y, data: [] });
    const data = JSON.parse(row.score_data || '[]');
    res.json({ success: true, year: y, data, updatedAt: row.updated_at });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.put('/plo/scores', async (req, res) => {
  const { year, program_id, data = [] } = req.body;
  const y = validYear(year) || 2567;
  try {
    await q(
      `INSERT INTO plo_scores (program_id, academic_year, score_data)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE score_data = VALUES(score_data), updated_at = NOW()`,
      [program_id, y, JSON.stringify(data)]
    );
    res.json({ success: true, year: y, count: data.length });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ─────────────────────────────────────────────────────────────
//  10. GET /api/plo/available-years?program_id=xxx
//      ดึงปีที่มีข้อมูล PLO Score อยู่
// ─────────────────────────────────────────────────────────────
router.get('/plo/available-years', async (req, res) => {
  const { program_id } = req.query;
  try {
    const [rows] = await q(
      `SELECT DISTINCT academic_year AS year
       FROM plo_scores
       WHERE program_id = ?
       ORDER BY academic_year DESC`,
      [program_id]
    );
    // fallback: ถ้าไม่มีเลย ให้ส่งปีปัจจุบัน + ปีก่อน
    if (!rows.length) {
      const now = new Date().getFullYear() + 543;
      return res.json({ years: [now, now - 1, now - 2] });
    }
    res.json({ years: rows.map(r => r.year) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────
//  11. GET  /api/programs/:programId/kas-mappings?year=2567
//  12. POST /api/programs/:programId/kas-mappings?year=2567
//      body: { ploKas: {code: {K:[],A:[],S:[]}}, mloKas: {...} }
// ─────────────────────────────────────────────────────────────
router.get('/programs/:programId/kas-mappings', async (req, res) => {
  const { programId } = req.params;
  const year = validYear(req.query.year) || 2567;
  try {
    const [rows] = await q(
      `SELECT lo_type, lo_code, kas_type, kas_codes
       FROM kas_mappings
       WHERE program_id = ? AND academic_year = ?`,
      [programId, year]
    );
    const ploKas = {}, mloKas = {};
    rows.forEach(r => {
      const target = r.lo_type === 'PLO' ? ploKas : mloKas;
      if (!target[r.lo_code]) target[r.lo_code] = { K: [], A: [], S: [] };
      target[r.lo_code][r.kas_type] = r.kas_codes ? r.kas_codes.split(',') : [];
    });
    res.json({ year, ploKas, mloKas });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/programs/:programId/kas-mappings', async (req, res) => {
  const { programId } = req.params;
  const year = validYear(req.query.year || req.body.year) || 2567;
  const { ploKas = {}, mloKas = {} } = req.body;

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(
      'DELETE FROM kas_mappings WHERE program_id = ? AND academic_year = ?',
      [programId, year]
    );

    const insertAll = async (loType, kasObj) => {
      for (const [loCode, kas] of Object.entries(kasObj)) {
        for (const kasType of ['K', 'A', 'S']) {
          const codes = (kas[kasType] || []).join(',');
          if (!codes) continue;
          await conn.query(
            `INSERT INTO kas_mappings
               (program_id, academic_year, lo_type, lo_code, kas_type, kas_codes)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [programId, year, loType, loCode, kasType, codes]
          );
        }
      }
    };

    await insertAll('PLO', ploKas);
    await insertAll('MLO', mloKas);

    await conn.commit();
    res.json({ ok: true, year });
  } catch (e) {
    await conn.rollback();
    res.status(500).json({ error: e.message });
  } finally {
    conn.release();
  }
});

// ─────────────────────────────────────────────────────────────
//  13. GET /api/programs/:programId/years-summary
//      สรุปว่ามีข้อมูลปีอะไรบ้างในแต่ละ module
// ─────────────────────────────────────────────────────────────
router.get('/programs/:programId/years-summary', async (req, res) => {
  const { programId } = req.params;
  try {
    const [[ploYears]] = await q(
      `SELECT GROUP_CONCAT(DISTINCT academic_year ORDER BY academic_year DESC) AS years
       FROM plos WHERE program_id = ?`, [programId]
    );
    const [[matrixYears]] = await q(
      `SELECT GROUP_CONCAT(DISTINCT academic_year ORDER BY academic_year DESC) AS years
       FROM matrix_rows WHERE program_id = ?`, [programId]
    );
    const [[scoreYears]] = await q(
      `SELECT GROUP_CONCAT(DISTINCT academic_year ORDER BY academic_year DESC) AS years
       FROM plo_scores WHERE program_id = ?`, [programId]
    );
    res.json({
      plo:    ploYears.years    ? ploYears.years.split(',').map(Number)    : [],
      matrix: matrixYears.years ? matrixYears.years.split(',').map(Number) : [],
      score:  scoreYears.years  ? scoreYears.years.split(',').map(Number)  : [],
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
