// routes/publish.js
const router = require('express').Router();

module.exports = function(pool) {
  // pgToMysql helper (เหมือนใน server.js เดิม)
  function pgToMysql(sql) {
    return sql.replace(/\$\d+/g, '?');
  }
  async function query(sql, values = []) {
    const [rows] = await pool.execute(pgToMysql(sql), values);
    return { rows: Array.isArray(rows) ? rows : [rows] };
  }

  // GET /api/publish
  router.get('/', async (req, res) => {
    try {
      const result = await query('SELECT published, published_at FROM publish_state WHERE id = 1');
      res.json(result.rows[0] || { published: 0, published_at: null });
    } catch (e) {
      res.status(500).json({ message: 'Server error' });
    }
  });

  // PUT /api/publish
  router.put('/', async (req, res) => {
    const { published, program_id } = req.body;
    if (typeof published !== 'boolean' && published !== 0 && published !== 1)
      return res.status(400).json({ message: 'published must be boolean' });
    const on  = published ? 1 : 0;
    const now = published ? new Date() : null;
    try {
      await query(
        'UPDATE publish_state SET published = $1, published_at = $2 WHERE id = 1',
        [on, now]
      );
      try {
        await query(
          'INSERT INTO audit_log (action, payload, ip_address) VALUES ($1, $2, $3)',
          [published ? 'matrix_published' : 'matrix_unpublished',
           JSON.stringify({ program_id }), req.ip]
        );
      } catch (_) {}
      res.json({ ok: true, published: !!on, published_at: now });
    } catch (e) {
      res.status(500).json({ message: 'Server error' });
    }
  });

  return router;
};