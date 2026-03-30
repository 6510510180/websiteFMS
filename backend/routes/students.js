/**
 * routes/students.js
 *
 * ใน server.js:
 *   const studentsRouter = require('./routes/students')(pool);
 *   app.use('/api', studentsRouter);
 */

const express = require('express');

const DEFAULT_COLORS = ['#8b5cf6','#60a5fa','#2dd4bf','#fb923c','#34d399','#f472b6','#fbbf24','#ef4444'];
const DEFAULT_ICONS  = ['💰','📣','👥','🚚','💻','🎪','📊','🏛️'];

module.exports = function(pool) {
  const router = express.Router();

  async function q(sql, values = []) {
    const [rows] = await pool.execute(sql, values);
    return Array.isArray(rows) ? rows : [rows];
  }

  /**
   * GET /api/students?program_id=xxx
   * program_id — ต้องส่งมาเพื่อ filter ข้อมูลของหลักสูตรที่ถูกต้อง
   */
  router.get('/students', async (req, res) => {
    const { program_id } = req.query;

    // ถ้าไม่มี program_id → ดึง program แรกที่มีข้อมูล
    let pid = program_id;
    if (!pid) {
      const programs = await q(`SELECT DISTINCT program_id FROM student_stats LIMIT 1`);
      pid = programs[0]?.program_id;
    }
    if (!pid) {
      return res.json({ ok: true, years: [], majors: [], intake: {}, trend: [], coop: {} });
    }

    try {
      const [intakeRows, statusRows, coopRows, majorRows] = await Promise.all([

        // 1) intake — filter ด้วย program_id
        q(`SELECT ss.academic_year, ss.major_id,
                  m.name_th AS major_name, m.name_en AS major_name_en,
                  ss.plan_intake, ss.interviewed, ss.confirmed,
                  ss.reported, ss.no_show_intake,
                  ss.total_enrolled, ss.total_graduated
           FROM student_stats ss
           LEFT JOIN majors m ON m.id = ss.major_id
           WHERE ss.program_id = ?
           ORDER BY ss.academic_year ASC, ss.major_id ASC`, [pid]),

        // 2) status snapshots — filter ด้วย program_id
        q(`SELECT academic_year, currently_enrolled, graduated,
                  no_show, transferred, dropped_out, on_leave
           FROM student_status_snapshots
           WHERE program_id = ?
           ORDER BY academic_year ASC`, [pid]),

        // 3) coop — filter ด้วย program_id
        q(`SELECT cs.academic_year, cs.major_id,
                  cs.coop_count, cs.intern_count
           FROM coop_intern_stats cs
           WHERE cs.program_id = ?
           ORDER BY cs.academic_year ASC, cs.major_id ASC`, [pid]),

        // 4) majors — ดึงเฉพาะสาขาที่มีข้อมูลใน student_stats ของ program นี้
        q(`SELECT DISTINCT m.id, m.name_th, m.name_en
           FROM majors m
           INNER JOIN student_stats ss ON ss.major_id = m.id
           WHERE ss.program_id = ?
           ORDER BY m.id ASC`, [pid]),
      ]);

      /* ── major metadata map ── */
      const majorMap = {};
      majorRows.forEach((m, idx) => {
        majorMap[m.id] = {
          id:      m.id,
          name_th: m.name_th,
          name_en: m.name_en || '',
          short:   m.name_en || m.name_th,
          color:   DEFAULT_COLORS[idx % DEFAULT_COLORS.length],
          icon:    DEFAULT_ICONS[idx % DEFAULT_ICONS.length],
        };
      });

      // เติม major จาก intake (fallback)
      intakeRows.forEach(r => {
        if (r.major_id && !majorMap[r.major_id]) {
          const idx = Object.keys(majorMap).length;
          majorMap[r.major_id] = {
            id:      r.major_id,
            name_th: r.major_name    || `วิชาเอก ${r.major_id}`,
            name_en: r.major_name_en || '',
            short:   r.major_name_en || r.major_name || `M${r.major_id}`,
            color:   DEFAULT_COLORS[idx % DEFAULT_COLORS.length],
            icon:    DEFAULT_ICONS[idx % DEFAULT_ICONS.length],
          };
        }
      });

      /* ── years ── */
      const years = [...new Set(intakeRows.map(r => r.academic_year))].sort((a, b) => b - a);

      /* ── intake by major_id ── */
      const intake = {};
      intakeRows.forEach(r => {
        const mid = r.major_id ?? 0;
        if (!intake[mid]) intake[mid] = [];
        intake[mid].push([
          r.academic_year,
          r.plan_intake     || 0,  // [1]
          r.interviewed     || 0,  // [2]
          r.confirmed       || 0,  // [3]
          r.reported        || 0,  // [4]
          r.no_show_intake  || 0,  // [5]
          r.total_enrolled  || 0,  // [6]
          r.total_graduated || 0,  // [7]
        ]);
      });

      /* ── trend ──
         ใช้ student_status_snapshots ถ้ามี
         fallback → sum จาก student_stats (total_enrolled / total_graduated) แยกรายปี
      */
      const trendMap = {};

      // จาก status snapshots
      statusRows.forEach(r => {
        trendMap[r.academic_year] = {
          year:               r.academic_year,
          currently_enrolled: r.currently_enrolled || 0,
          graduated:          r.graduated           || 0,
          no_show:            r.no_show             || 0,
          transferred:        r.transferred         || 0,
          dropped_out:        r.dropped_out         || 0,
          on_leave:           r.on_leave            || 0,
          enrolled_sum:       0,
          grad_sum:           0,
          from_snapshot:      true,
        };
      });

      // sum total_enrolled / total_graduated จาก intake (fallback + เติม)
      // NOTE: total_enrolled/total_graduated ใน student_stats มักเป็นค่าเดียวกันทุกสาขาของปีนั้น
      //       จึง group by year แล้วเอาค่าสูงสุด (MAX) แทนการ sum เพื่อไม่ให้ซ้ำซ้อน
      const enrolledByYear = {};
      const gradByYear     = {};
      intakeRows.forEach(r => {
        const y = r.academic_year;
        enrolledByYear[y] = Math.max(enrolledByYear[y] || 0, r.total_enrolled  || 0);
        gradByYear[y]     = Math.max(gradByYear[y]     || 0, r.total_graduated || 0);
      });

      // ใส่ใน trendMap
      Object.keys(enrolledByYear).forEach(y => {
        const yr = +y;
        if (!trendMap[yr]) {
          trendMap[yr] = {
            year: yr, currently_enrolled:0, graduated:0, no_show:0,
            transferred:0, dropped_out:0, on_leave:0,
            enrolled_sum:0, grad_sum:0, from_snapshot:false,
          };
        }
        trendMap[yr].enrolled_sum = enrolledByYear[yr];
        trendMap[yr].grad_sum     = gradByYear[yr];

        // ถ้าไม่มี snapshot → ใช้ค่าจาก student_stats แทน
        if (!trendMap[yr].from_snapshot) {
          trendMap[yr].currently_enrolled = enrolledByYear[yr];
          trendMap[yr].graduated          = gradByYear[yr];
        }
      });

      const trend = Object.values(trendMap).sort((a, b) => a.year - b.year);

      /* ── coop by year ── */
      const coopMap = {};
      coopRows.forEach(r => {
        const y = r.academic_year;
        if (!coopMap[y]) coopMap[y] = { coop_total:0, intern_total:0, byMajor:{} };
        coopMap[y].coop_total  += r.coop_count  || 0;
        coopMap[y].intern_total+= r.intern_count || 0;
        if (r.major_id) {
          coopMap[y].byMajor[r.major_id] = {
            coop:  r.coop_count  || 0,
            intern:r.intern_count|| 0,
          };
        }
      });

      res.json({
        ok: true,
        program_id: pid,
        years,
        majors:  Object.values(majorMap).sort((a, b) => a.id - b.id),
        intake,
        trend,
        coop:    coopMap,
      });

    } catch (err) {
      console.error('[GET /api/students]', err.message);
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  /**
   * GET /api/students/programs
   * ดึงรายการ program ทั้งหมดสำหรับ dropdown
   */
  router.get('/students/programs', async (req, res) => {
    try {
      const rows = await q(`
        SELECT p.id, p.code, p.name_th, p.name_en
        FROM programs p
        WHERE EXISTS (SELECT 1 FROM student_stats ss WHERE ss.program_id = p.id)
        ORDER BY p.year DESC, p.code ASC
      `);
      res.json({ ok: true, programs: rows });
    } catch (err) {
      console.error('[GET /api/students/programs]', err.message);
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  return router;
};