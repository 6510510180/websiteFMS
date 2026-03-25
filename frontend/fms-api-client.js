/**
 * fms-api-client.js  v3
 * ─────────────────────────────────────────────────────────────
 * ใช้ endpoints ที่มีอยู่ใน server.js เดิม + 3 endpoints ใหม่
 * ไม่ต้องใช้ X-API-Key เพราะ server ใช้ CORS เป็น security
 *
 * วิธีใช้:
 *   <script src="fms-api-client.js"></script>
 *   FmsApi.setConfig({ baseUrl: 'http://localhost:3000', programId: 'xxx' });
 * ─────────────────────────────────────────────────────────────
 */
const FmsApi = (() => {
  let _baseUrl   = '';
  let _programId = '';

  // ── Config ───────────────────────────────────────────────
  function setConfig({ baseUrl, programId }) {
    _baseUrl   = (baseUrl || '').replace(/\/$/, '');
    _programId = programId || '';
  }
  function setProgramId(id) { _programId = id; }

  // ── Core fetch ───────────────────────────────────────────
  async function req(method, path, body) {
    const res = await fetch(_baseUrl + path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body != null ? JSON.stringify(body) : undefined,
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || json.error || `HTTP ${res.status}`);
    return json;
  }

  const pid = (id) => id || _programId;

  // ── Health ────────────────────────────────────────────────
  // server.js มี GET /health และ GET /api/test
  const health = () => req('GET', '/health');

  // ── Programs ─────────────────────────────────────────────
  // GET /api/programs  (มีใน server.js)
  const getPrograms = (course_id) =>
    req('GET', `/api/programs${course_id ? `?course_id=${course_id}` : ''}`);

  // GET /api/programs/:id  (มีใน server.js)
  const getProgram = (id) =>
    req('GET', `/api/programs/${pid(id)}`);

  // ── PLO / MLO ─────────────────────────────────────────────
  // GET /api/programs/:programId/plo-mlo  (มีใน server.js)
  // ส่งกลับ { programId, PLO: [{id,code,skill}], MLO: [{id,code,skill,group}] }
  const getPloMlo = (programId) =>
    req('GET', `/api/programs/${pid(programId)}/plo-mlo`);

  // ── Alignment Matrix — Full load ─────────────────────────
  // GET /api/programs/:programId/alignment-matrix/full  (endpoints ใหม่)
  // ส่งกลับ { plos, mlos, rows, checkMap }
  const getMatrixFull = (programId) =>
    req('GET', `/api/programs/${pid(programId)}/alignment-matrix/full`);

  // ── Alignment Matrix — Rows ──────────────────────────────
  // PUT /api/programs/:programId/alignment-matrix/rows  (endpoints ใหม่)
  // Body: [{ group_label, title, description, sort_order }]
  // Returns: { ok, rows: [{id, group_label, title, ...}] }
  const saveRows = (items, programId) =>
    req('PUT', `/api/programs/${pid(programId)}/alignment-matrix/rows`, items);

  // ── Alignment Matrix — Checks (bulk) ─────────────────────
  // PUT /api/programs/:programId/alignment-matrix/checks  (endpoints ใหม่)
  // Body: { plo: [...], mlo: [...] }
  const saveChecks = (payload, programId) =>
    req('PUT', `/api/programs/${pid(programId)}/alignment-matrix/checks`, payload);

  /**
   * สร้าง payload สำหรับ saveChecks
   * rows  : array ของ { id (UUID), checks: [0,1,...] }
   * plos  : array ของ { id (UUID) } เรียงตามลำดับ (จาก getPloMlo หรือ getMatrixFull)
   * mlos  : array ของ { id (UUID) }
   */
  function buildChecksPayload(rows, plos, mlos) {
    const plo = [], mlo = [];
    rows.forEach(row => {
      if (!row.checks) return;
      plos.forEach((p, pi) => {
        if (row.checks[pi]) {
          plo.push({ alignment_row_id: row.id, plo_id: p.id, checked: 1 });
        }
      });
      mlos.forEach((m, mi) => {
        if (row.checks[plos.length + mi]) {
          mlo.push({ alignment_row_id: row.id, mlo_id: m.id, checked: 1 });
        }
      });
    });
    return { plo, mlo };
  }

  // ── Single-cell toggle ────────────────────────────────────
  // ใช้ endpoint เดิมที่มีใน server.js:
  //   PUT /api/alignment-rows/:id/plo-checks  { plo_id, checked }
  //   PUT /api/alignment-rows/:id/mlo-checks  { mlo_id, checked }
  const toggleCheck = (alignment_row_id, type, col_id, checked) => {
    const body = type === 'plo'
      ? { plo_id: col_id, checked: !!checked }
      : { mlo_id: col_id, checked: !!checked };
    const endpoint = type === 'plo' ? 'plo-checks' : 'mlo-checks';
    return req('PUT', `/api/alignment-rows/${alignment_row_id}/${endpoint}`, body);
  };

  // ── Publish state ─────────────────────────────────────────
  // ใช้ตาราง publish_state (จาก schema.sql ที่สร้างไว้)
  // GET /api/publish?program_id=xxx
  // PUT /api/publish  { published, program_id }
  const getPublish = (programId) =>
    req('GET', `/api/publish?program_id=${pid(programId)}`);
  const setPublish = (published, programId) =>
    req('PUT', '/api/publish', { published, program_id: pid(programId) });

  return {
    setConfig, setProgramId,
    health,
    getPrograms, getProgram,
    getPloMlo,
    getMatrixFull,
    saveRows, saveChecks, buildChecksPayload,
    toggleCheck,
    getPublish, setPublish,
  };
})();
