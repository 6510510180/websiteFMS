/**
 * subjects-router.js
 * Express Router — CRUD API for major_subjects
 *
 * Usage (in your main app.js / server.js):
 *   const subjectsRouter = require('./subjects-router');
 *   app.use('/api', subjectsRouter);
 *
 * Requires: npm install mysql2
 */

const express = require('express');
const router  = express.Router();
const mysql   = require('mysql2/promise');

const pool = mysql.createPool({
  host    : process.env.DB_HOST || 'localhost',
  port    : process.env.DB_PORT || 3306,
  user    : process.env.DB_USER || 'root',
  password: process.env.DB_PASS || '',
  database: process.env.DB_NAME || 'fms_db',
  charset : 'utf8mb4',
  waitForConnections: true,
  connectionLimit   : 10,
});

const ok  = (res, data, status = 200) => res.status(status).json({ success: true,  data });
const err = (res, msg,  status = 500) => res.status(status).json({ success: false, message: msg });

// ════════════════════════════════════════════════════════════
//  MAJORS — GET only (จัดการผ่าน existing system)
// ════════════════════════════════════════════════════════════

// GET /api/majors?course_id=5
router.get('/majors', async (req, res) => {
  try {
    const { course_id } = req.query;
    let sql  = 'SELECT id, course_id, name_th, name_en, hero_image FROM majors WHERE 1=1';
    const args = [];
    if (course_id) { sql += ' AND course_id = ?'; args.push(course_id); }
    sql += ' ORDER BY id';
    const [rows] = await pool.query(sql, args);
    ok(res, rows);
  } catch (e) { err(res, e.message); }
});

// ════════════════════════════════════════════════════════════
//  MAJOR_SUBJECTS — CRUD
// ════════════════════════════════════════════════════════════

// GET /api/major-subjects?major_id=15&type=required
router.get('/major-subjects', async (req, res) => {
  try {
    const { major_id, type, course_id } = req.query;
    let sql = `
      SELECT ms.*, m.name_th AS major_name, m.course_id
      FROM major_subjects ms
      JOIN majors m ON m.id = ms.major_id
      WHERE ms.is_active = 1
    `;
    const args = [];
    if (course_id) { sql += ' AND m.course_id = ?';    args.push(course_id); }
    if (major_id)  { sql += ' AND ms.major_id = ?';    args.push(major_id); }
    if (type)      { sql += ' AND ms.subject_type = ?'; args.push(type); }
    sql += ' ORDER BY ms.subject_type DESC, ms.sort_order, ms.id';
    const [rows] = await pool.query(sql, args);
    ok(res, rows);
  } catch (e) { err(res, e.message); }
});

// GET /api/major-subjects/:id
router.get('/major-subjects/:id', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT ms.*, m.name_th AS major_name
       FROM major_subjects ms
       JOIN majors m ON m.id = ms.major_id
       WHERE ms.id = ?`,
      [req.params.id]
    );
    if (!rows.length) return err(res, 'Not found', 404);
    ok(res, rows[0]);
  } catch (e) { err(res, e.message); }
});

// POST /api/major-subjects
router.post('/major-subjects', async (req, res) => {
  const { major_id, subject_code, name_th, name_en,
          credits, credit_detail, subject_type, special_note, sort_order } = req.body;

  if (!major_id || !subject_code || !name_th)
    return err(res, 'major_id, subject_code และ name_th จำเป็นต้องมี', 400);
  if (!['required','elective'].includes(subject_type))
    return err(res, 'subject_type ต้องเป็น required หรือ elective', 400);

  try {
    const [result] = await pool.query(
      `INSERT INTO major_subjects
        (major_id, subject_code, name_th, name_en, credits, credit_detail, subject_type, special_note, sort_order)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [major_id, subject_code, name_th, name_en||'',
       credits||'3', credit_detail||'', subject_type, special_note||'', sort_order||0]
    );
    const [rows] = await pool.query('SELECT * FROM major_subjects WHERE id = ?', [result.insertId]);
    ok(res, rows[0], 201);
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY')
      return err(res, `รหัสวิชา "${subject_code}" มีอยู่แล้วในสาขานี้`, 409);
    err(res, e.message);
  }
});

// PUT /api/major-subjects/:id
router.put('/major-subjects/:id', async (req, res) => {
  const { major_id, subject_code, name_th, name_en,
          credits, credit_detail, subject_type, special_note, sort_order, is_active } = req.body;

  if (subject_type && !['required','elective'].includes(subject_type))
    return err(res, 'subject_type ต้องเป็น required หรือ elective', 400);

  try {
    await pool.query(
      `UPDATE major_subjects SET
        major_id      = COALESCE(?, major_id),
        subject_code  = COALESCE(?, subject_code),
        name_th       = COALESCE(?, name_th),
        name_en       = COALESCE(?, name_en),
        credits       = COALESCE(?, credits),
        credit_detail = COALESCE(?, credit_detail),
        subject_type  = COALESCE(?, subject_type),
        special_note  = COALESCE(?, special_note),
        sort_order    = COALESCE(?, sort_order),
        is_active     = COALESCE(?, is_active)
       WHERE id = ?`,
      [major_id, subject_code, name_th, name_en, credits,
       credit_detail, subject_type, special_note, sort_order, is_active, req.params.id]
    );
    const [rows] = await pool.query('SELECT * FROM major_subjects WHERE id = ?', [req.params.id]);
    if (!rows.length) return err(res, 'Not found', 404);
    ok(res, rows[0]);
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY')
      return err(res, 'รหัสวิชานี้ซ้ำในสาขาเดิม', 409);
    err(res, e.message);
  }
});

// DELETE /api/major-subjects/:id  (soft delete)
router.delete('/major-subjects/:id', async (req, res) => {
  try {
    const [chk] = await pool.query('SELECT id FROM major_subjects WHERE id = ?', [req.params.id]);
    if (!chk.length) return err(res, 'Not found', 404);
    await pool.query('UPDATE major_subjects SET is_active = 0 WHERE id = ?', [req.params.id]);
    ok(res, { id: Number(req.params.id), deleted: true });
  } catch (e) { err(res, e.message); }
});

module.exports = router;