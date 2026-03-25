// ===================================================
// routes/plo-scores.js
// วางไฟล์นี้ไว้ที่: backend/routes/plo-scores.js
// ===================================================

const express = require('express');
const router  = express.Router();

module.exports = (pool) => {

    // ── helpers ──────────────────────────────────
    function avg(arr) {
        const v = arr.filter(x => x !== null && x !== undefined && !isNaN(Number(x)));
        return v.length ? v.reduce((s, x) => s + Number(x), 0) / v.length : null;
    }

    // ─────────────────────────────────────────────
    // GET /api/plo/scores?year=2567&program_id=...
    // แปลง plo_scores rows → DATA array พร้อม hierarchy
    // สำหรับ score.html และ score-plo.html
    // ─────────────────────────────────────────────
    router.get('/scores', async (req, res) => {
        const year       = req.query.year       || '2567';
        const program_id = req.query.program_id || '00000000-0000-0000-0000-000000000001';

        try {
            const [rows] = await pool.query(`
                SELECT dept_name, group_name, lo_level, lo_code, lo_description,
                       semester_1, semester_2, note, sort_order
                FROM plo_scores
                WHERE academic_year = ? AND program_id = ?
                ORDER BY sort_order ASC, created_at ASC
            `, [year, program_id]);

            if (!rows.length) {
                return res.json({ success: true, year, data: [] });
            }

            const data = buildHierarchy(rows);
            res.json({ success: true, year, data });

        } catch (err) {
            console.error('[PLO] GET /scores error:', err);
            res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาด: ' + err.message });
        }
    });

    // ─────────────────────────────────────────────
    // buildHierarchy: แปลง flat rows → DATA array
    // รองรับทั้งข้อมูลเก่า (note ว่าง) และข้อมูลใหม่
    // ─────────────────────────────────────────────
    function buildHierarchy(rows) {
        const META = ['subtotal','depttotal','grand','section','group','dept'];
        const isMeta = r => META.includes((r.note||'').toLowerCase());

        const metaRows = rows.filter(r => isMeta(r));
        const dataRows = rows.filter(r => !isMeta(r));

        // ── ข้อมูลใหม่ที่มี note metadata ──
        if (metaRows.length) {
            const result = [];
            const all = [...rows].sort((a,b) => a.sort_order - b.sort_order);
            for (const r of all) {
                const note = (r.note||'').toLowerCase();
                if (note === 'dept') {
                    result.push({ type:'dept', label: r.lo_code||r.lo_description||'' });
                } else if (note === 'group') {
                    result.push({ type:'group', label: r.lo_code||r.lo_description||'' });
                } else if (note === 'section') {
                    result.push({ type:'section', label: r.lo_code||r.lo_description||'' });
                } else if (note === 'subtotal') {
                    const s1 = r.semester_1!==null ? parseFloat(r.semester_1) : null;
                    const s2 = r.semester_2!==null ? parseFloat(r.semester_2) : null;
                    result.push({ type:'subtotal', label: r.lo_code||r.lo_description||'',
                        refGroup: r.group_name||'', sem1:s1, sem2:s2,
                        grand: avg([s1,s2].filter(x=>x!==null)) });
                } else if (note === 'depttotal') {
                    const s1 = r.semester_1!==null ? parseFloat(r.semester_1) : null;
                    const s2 = r.semester_2!==null ? parseFloat(r.semester_2) : null;
                    result.push({ type:'deptTotal', label: r.lo_code||r.lo_description||'',
                        sem1:s1, sem2:s2, grand: avg([s1,s2].filter(x=>x!==null)) });
                } else if (note === 'grand') {
                    const s1 = r.semester_1!==null ? parseFloat(r.semester_1) : null;
                    const s2 = r.semester_2!==null ? parseFloat(r.semester_2) : null;
                    result.push({ type:'grand', label: r.lo_code||r.lo_description||'Grand Total',
                        sem1:s1, sem2:s2, grand: avg([s1,s2].filter(x=>x!==null)) });
                } else {
                    result.push({
                        type: 'row',
                        level: r.lo_level||'PLO',
                        code:  r.lo_code||'',
                        desc:  r.lo_description||'',
                        group: r.group_name||'',
                        dept:  r.dept_name||'',
                        sem1:  r.semester_1!==null ? parseFloat(r.semester_1) : null,
                        sem2:  r.semester_2!==null ? parseFloat(r.semester_2) : null
                    });
                }
            }
            return result;
        }

        // ── ข้อมูลเก่า (note ว่าง) → สร้าง hierarchy อัตโนมัติ ──
        const result = [];
        const depts  = [...new Set(dataRows.map(r => r.dept_name).filter(Boolean))];

        // ถ้าไม่มี dept_name เลย (ข้อมูลเก่ามากๆ) → ใช้ level grouping แบบเดิม
        if (!depts.length) {
            let lastLevel = null;
            dataRows.forEach(r => {
                if (r.lo_level !== lastLevel) {
                    lastLevel = r.lo_level;
                    const label = r.lo_level === 'PLO'
                        ? 'ผลลัพธ์การเรียนรู้ระดับหลักสูตร (PLO)'
                        : r.lo_level === 'MLO'
                            ? 'ผลลัพธ์การเรียนรู้ระดับวิชาเอก (MLO)'
                            : r.lo_level;
                    result.push({ type:'section', label });
                }
                result.push({
                    type: 'row', level: r.lo_level||'PLO',
                    code: r.lo_code||'', desc: r.lo_description||'',
                    group: '', dept: '',
                    sem1: r.semester_1!==null ? parseFloat(r.semester_1) : null,
                    sem2: r.semester_2!==null ? parseFloat(r.semester_2) : null
                });
            });
            const hasPLO = dataRows.some(r => r.lo_level==='PLO');
            const hasMLO = dataRows.some(r => r.lo_level==='MLO');
            const ploRows = dataRows.filter(r => r.lo_level==='PLO');
            const mloRows = dataRows.filter(r => r.lo_level==='MLO');
            if (hasPLO) {
                const s1=avg(ploRows.map(r=>r.semester_1!==null?parseFloat(r.semester_1):null).filter(x=>x!==null));
                const s2=avg(ploRows.map(r=>r.semester_2!==null?parseFloat(r.semester_2):null).filter(x=>x!==null));
                result.push({ type:'subtotal', label:'รวม PLO', sem1:s1, sem2:s2, grand:avg([s1,s2].filter(x=>x!==null)) });
            }
            if (hasMLO) {
                const s1=avg(mloRows.map(r=>r.semester_1!==null?parseFloat(r.semester_1):null).filter(x=>x!==null));
                const s2=avg(mloRows.map(r=>r.semester_2!==null?parseFloat(r.semester_2):null).filter(x=>x!==null));
                result.push({ type:'subtotal', label:'รวม MLO', sem1:s1, sem2:s2, grand:avg([s1,s2].filter(x=>x!==null)) });
            }
            const as1=avg(dataRows.map(r=>r.semester_1!==null?parseFloat(r.semester_1):null).filter(x=>x!==null));
            const as2=avg(dataRows.map(r=>r.semester_2!==null?parseFloat(r.semester_2):null).filter(x=>x!==null));
            result.push({ type:'grand', label:'Grand Total', sem1:as1, sem2:as2, grand:avg([as1,as2].filter(x=>x!==null)) });
            return result;
        }

        // มี dept_name → สร้าง hierarchy ครบ
        depts.forEach(dept => {
            result.push({ type:'dept', label:dept });
            const dRows  = dataRows.filter(r => r.dept_name===dept);
            const groups = [...new Set(dRows.map(r => r.group_name).filter(Boolean))];

            groups.forEach(group => {
                result.push({ type:'group', label:group });
                const gRows = dRows.filter(r => r.group_name===group);
                const plo   = gRows.filter(r => r.lo_level==='PLO' && r.lo_code && r.lo_code.includes('('));
                const mlo   = gRows.filter(r => r.lo_level==='MLO');
                const dom   = gRows.filter(r => !plo.includes(r) && !mlo.includes(r));

                if (plo.length) {
                    result.push({ type:'section', label:'ผลลัพธ์การเรียนรู้ระดับหลักสูตร (PLO)' });
                    plo.forEach(r => result.push({
                        type:'row', level:'PLO', code:r.lo_code, desc:r.lo_description,
                        group, dept,
                        sem1: r.semester_1!==null?parseFloat(r.semester_1):null,
                        sem2: r.semester_2!==null?parseFloat(r.semester_2):null
                    }));
                }
                if (mlo.length) {
                    result.push({ type:'section', label:'ผลลัพธ์การเรียนรู้ระดับวิชาเอก (MLO)' });
                    mlo.forEach(r => result.push({
                        type:'row', level:'MLO', code:r.lo_code, desc:r.lo_description,
                        group, dept,
                        sem1: r.semester_1!==null?parseFloat(r.semester_1):null,
                        sem2: r.semester_2!==null?parseFloat(r.semester_2):null
                    }));
                }
                if (dom.length) {
                    const ploSum  = dom.find(r => r.lo_code==='PLO');
                    const domRest = dom.filter(r => r.lo_code!=='PLO');
                    if (ploSum) {
                        result.push({ type:'section', label:'สรุป PLO รวม' });
                        result.push({ type:'row', level:'PLO', code:'PLO', desc:'คะแนนรวม PLO', group, dept,
                            sem1: ploSum.semester_1!==null?parseFloat(ploSum.semester_1):null,
                            sem2: ploSum.semester_2!==null?parseFloat(ploSum.semester_2):null });
                    }
                    if (domRest.length) {
                        result.push({ type:'section', label:'คะแนนรายด้าน' });
                        domRest.forEach(r => result.push({ type:'row', level:r.lo_level, code:'', desc:r.lo_description,
                            group, dept,
                            sem1: r.semester_1!==null?parseFloat(r.semester_1):null,
                            sem2: r.semester_2!==null?parseFloat(r.semester_2):null }));
                    }
                }
                // subtotal
                const ploSumRow = dom.find(r => r.lo_code==='PLO');
                let ts1, ts2;
                if (ploSumRow) {
                    ts1=ploSumRow.semester_1!==null?parseFloat(ploSumRow.semester_1):null;
                    ts2=ploSumRow.semester_2!==null?parseFloat(ploSumRow.semester_2):null;
                } else if (dom.length) {
                    ts1=avg(dom.map(r=>r.semester_1!==null?parseFloat(r.semester_1):null).filter(x=>x!==null));
                    ts2=avg(dom.map(r=>r.semester_2!==null?parseFloat(r.semester_2):null).filter(x=>x!==null));
                } else {
                    ts1=avg([...plo,...mlo].map(r=>r.semester_1!==null?parseFloat(r.semester_1):null).filter(x=>x!==null));
                    ts2=avg([...plo,...mlo].map(r=>r.semester_2!==null?parseFloat(r.semester_2):null).filter(x=>x!==null));
                }
                result.push({ type:'subtotal', label:`${group} Total`, refGroup:group,
                    sem1:ts1, sem2:ts2, grand:avg([ts1,ts2].filter(x=>x!==null)) });
            });

            // deptTotal
            const subs = result.filter(r => r.type==='subtotal');
            const ds1  = subs.length===1 ? subs[0].sem1 : avg(subs.map(r=>r.sem1).filter(x=>x!==null));
            const ds2  = subs.length===1 ? subs[0].sem2 : avg(subs.map(r=>r.sem2).filter(x=>x!==null));
            result.push({ type:'deptTotal', label:`${dept} Total`,
                sem1:ds1, sem2:ds2, grand:avg([ds1,ds2].filter(x=>x!==null)) });
        });

        // grand
        const dt = result.find(r => r.type==='deptTotal');
        result.push({ type:'grand', label:'Grand Total',
            sem1:dt?.sem1??null, sem2:dt?.sem2??null, grand:dt?.grand??null });

        return result;
    }

    // ─────────────────────────────────────────────
    // PUT /api/plo/scores  (เหมือนเดิม)
    // ─────────────────────────────────────────────
    router.put('/scores', async (req, res) => {
        const { year = '2567', program_id = '00000000-0000-0000-0000-000000000001', data } = req.body;

        if (!Array.isArray(data) || !data.length)
            return res.status(400).json({ success: false, message: 'ไม่มีข้อมูลที่จะบันทึก' });

        const rows = data.filter(r => r.type === 'row');
        if (!rows.length)
            return res.status(400).json({ success: false, message: 'ไม่พบข้อมูล row' });

        const conn = await pool.getConnection();
        try {
            await conn.beginTransaction();
            for (const item of rows) {
                const sem1 = (item.sem1 !== null && item.sem1 !== undefined && item.sem1 !== '')
                    ? parseFloat(item.sem1) : null;
                const sem2 = (item.sem2 !== null && item.sem2 !== undefined && item.sem2 !== '')
                    ? parseFloat(item.sem2) : null;

                if (item.id) {
                    await conn.query(`
                        UPDATE plo_scores
                        SET semester_1=?, semester_2=?, updated_at=CURRENT_TIMESTAMP
                        WHERE id=? AND program_id=? AND academic_year=?
                    `, [sem1, sem2, item.id, program_id, year]);
                } else {
                    const lo_level = item.level || (item.code?.startsWith('(') ? 'PLO' : 'MLO');
                    await conn.query(`
                        INSERT INTO plo_scores
                            (program_id, dept_name, group_name, lo_level, lo_code,
                             lo_description, academic_year, semester_1, semester_2, note)
                        VALUES (?,?,?,?,?,?,?,?,?,?)
                        ON DUPLICATE KEY UPDATE
                            semester_1=VALUES(semester_1), semester_2=VALUES(semester_2),
                            updated_at=CURRENT_TIMESTAMP
                    `, [program_id, item.dept||null, item.group||null,
                        lo_level, item.code||'', item.desc||'',
                        year, sem1, sem2, item.note||'']);
                }
            }
            await conn.commit();
            res.json({ success: true, message: `บันทึก ${rows.length} รายการสำเร็จ` });
        } catch (err) {
            await conn.rollback();
            console.error('[PLO] PUT /scores error:', err);
            res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาด: ' + err.message });
        } finally {
            conn.release();
        }
    });

    // ─────────────────────────────────────────────
    // PUT /api/plo/scores/import  (เหมือนเดิม)
    // ─────────────────────────────────────────────
    router.put('/scores/import', async (req, res) => {
        const { year = '2567', program_id, rows } = req.body;
        if (!program_id) return res.status(400).json({ success: false, message: 'ต้องส่ง program_id' });
        if (!Array.isArray(rows) || !rows.length)
            return res.status(400).json({ success: false, message: 'ไม่มีข้อมูล rows' });

        const conn = await pool.getConnection();
        try {
            await conn.beginTransaction();
            await conn.query(
                'DELETE FROM plo_scores WHERE program_id=? AND academic_year=?',
                [program_id, year]
            );
            for (let i = 0; i < rows.length; i++) {
                const r    = rows[i];
                const sem1 = r.semester_1 !== '' && r.semester_1 != null ? parseFloat(r.semester_1) : null;
                const sem2 = r.semester_2 !== '' && r.semester_2 != null ? parseFloat(r.semester_2) : null;
                const lo_level = ['PLO','MLO'].includes(r.lo_level) ? r.lo_level : 'PLO';
                await conn.query(`
                    INSERT INTO plo_scores
                        (program_id, dept_name, group_name, lo_level, lo_code,
                         lo_description, academic_year, semester_1, semester_2, note, sort_order)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?)
                `, [program_id, r.dept_name||null, r.group_name||null,
                    lo_level, r.lo_code||'', r.lo_description||'',
                    year, sem1, sem2, r.note||'', i]);
            }
            await conn.commit();
            res.json({ success: true, message: `นำเข้า ${rows.length} รายการสำเร็จ` });
        } catch (err) {
            await conn.rollback();
            console.error('[PLO] import error:', err);
            res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาด: ' + err.message });
        } finally {
            conn.release();
        }
    });

    // ─────────────────────────────────────────────
    // PATCH /api/plo/scores/:id  (เหมือนเดิม)
    // ─────────────────────────────────────────────
    router.patch('/scores/:id', async (req, res) => {
        const { id }                     = req.params;
        const { semester_1, semester_2 } = req.body;
        try {
            const [result] = await pool.query(`
                UPDATE plo_scores
                SET semester_1=?, semester_2=?, updated_at=CURRENT_TIMESTAMP
                WHERE id=?
            `, [semester_1??null, semester_2??null, id]);

            if (result.affectedRows === 0)
                return res.status(404).json({ success: false, message: `ไม่พบ id: ${id}` });
            res.json({ success: true, message: `อัปเดต id ${id} สำเร็จ` });
        } catch (err) {
            console.error('[PLO] PATCH error:', err);
            res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาด: ' + err.message });
        }
    });

    // ─────────────────────────────────────────────
    // GET /api/plo/available-years  (เหมือนเดิม)
    // ─────────────────────────────────────────────
    router.get('/available-years', async (req, res) => {
        const program_id = req.query.program_id || '00000000-0000-0000-0000-000000000001';
        try {
            const [rows] = await pool.query(`
                SELECT DISTINCT academic_year
                FROM plo_scores
                WHERE program_id=?
                ORDER BY academic_year DESC
            `, [program_id]);
            let years = rows.map(r => r.academic_year);
            if (!years.length) {
                const now = new Date().getFullYear() + 543;
                for (let y = now; y >= now-4; y--) years.push(y);
            }
            res.json({ success: true, years });
        } catch (err) {
            console.error('[PLO] GET /available-years error:', err);
            res.status(500).json({ success: false, message: err.message });
        }
    });

    return router;
};