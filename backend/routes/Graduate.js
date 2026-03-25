/**
 * routes/graduate.js  (v2 — รองรับ template จาก การทำงาน.xlsx)
 *
 * ใน server.js:
 *   const graduateRouter = require('./routes/graduate')(pool);
 *   app.use('/api', graduateRouter);
 */
const express = require('express');
const path    = require('path');
const fs      = require('fs');

const MAJORS = ['FIN','MKT','HRM','LSM','MICE','BIS'];

// Map ชื่อสาขาในไฟล์ Excel → short key
const MAJOR_MAP = {
  'บธ.บ. วิชาเอกการเงินและการลงทุน':                   'FIN',
  'บธ.บ. วิชาเอกการตลาด':                               'MKT',
  'บธ.บ. วิชาเอกการจัดการทรัพยากรมนุษย์':              'HRM',
  'บธ.บ. วิชาเอกการจัดการโลจิสติกส์และโซ่อุปทาน':     'LSM',
  'บธ.บ. วิชาเอกการจัดการไมซ์':                        'MICE',
  'บธ.บ. วิชาเอกระบบสารสนเทศทางธุรกิจ':               'BIS',
};

// Map ชื่อ metric → DB column
// คอลัมน์ใน template: %ทำงาน | %อาชีพอิสระ | % การได้งานทำ | % เปลี่ยนงาน | %ทำงานตรงสาขา | %ศึกษาต่อ
// index:                0        1               2               3                4               5
// → เราเก็บ: rate_pct = "% การได้งานทำ" (index 2), on_track = "%ทำงานตรงสาขา" (index 4)

module.exports = function(pool) {
  const router = express.Router();

  async function q(sql, values = []) {
    const [rows] = await pool.execute(sql, values);
    return Array.isArray(rows) ? rows : [rows];
  }

  /* ── GET /api/graduate ── */
  router.get('/graduate', async (req, res) => {
    const { program_id, year } = req.query;
    try {
      let sql = `SELECT academic_year, major, employed, total,
                        rate_employed, rate_freelance, rate_total,
                        rate_promoted, rate_on_track, rate_study
                 FROM graduate_employment WHERE 1=1`;
      const vals = [];
      if (program_id) { sql += ' AND program_id = ?'; vals.push(program_id); }
      if (year)       { sql += ' AND academic_year = ?'; vals.push(year); }
      sql += ' ORDER BY academic_year DESC, major ASC';
      res.json({ ok: true, data: await q(sql, vals) });
    } catch(e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  /* ── POST /api/graduate/bulk ── */
  router.post('/graduate/bulk', async (req, res) => {
    const { program_id, items } = req.body;
    if (!program_id || !Array.isArray(items) || !items.length)
      return res.status(400).json({ ok: false, error: 'ต้องส่ง program_id และ items[]' });

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      for (const it of items) {
        const {
          academic_year, major,
          employed=0, total=0,
          rate_employed=null, rate_freelance=null, rate_total=null,
          rate_promoted=null, rate_on_track=null, rate_study=null
        } = it;
        if (!academic_year || !major) continue;

        await conn.execute(
          `INSERT INTO graduate_employment
             (program_id, academic_year, major,
              employed, total,
              rate_employed, rate_freelance, rate_total,
              rate_promoted, rate_on_track, rate_study)
           VALUES (?,?,?,?,?,?,?,?,?,?,?)
           ON DUPLICATE KEY UPDATE
             employed=VALUES(employed), total=VALUES(total),
             rate_employed=VALUES(rate_employed), rate_freelance=VALUES(rate_freelance),
             rate_total=VALUES(rate_total), rate_promoted=VALUES(rate_promoted),
             rate_on_track=VALUES(rate_on_track), rate_study=VALUES(rate_study),
             updated_at=NOW()`,
          [program_id, academic_year, major,
           employed, total,
           rate_employed, rate_freelance, rate_total,
           rate_promoted, rate_on_track, rate_study]
        );
      }
      await conn.commit();
      res.json({ ok: true, saved: items.length });
    } catch(e) {
      await conn.rollback();
      res.status(500).json({ ok: false, error: e.message });
    } finally {
      conn.release();
    }
  });

  /* ── GET /api/graduate/template ── */
  router.get('/graduate/template', (req, res) => {
    // หา template ใน assets/ หรือ root
    const candidates = [
      path.join(__dirname, '../assets/graduate_template_final.xlsx'),
      path.join(__dirname, '../assets/graduate_employment_template.xlsx'),
      path.join(__dirname, '../graduate_template_final.xlsx'),
    ];
    const filePath = candidates.find(p => fs.existsSync(p));
    if (!filePath) return res.status(404).json({ ok:false, error:'ไม่พบไฟล์ template' });
    res.download(filePath, 'graduate_employment_template.xlsx');
  });

  return router;
};