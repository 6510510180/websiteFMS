/**
 * api-client.js  — Student Data Hub
 * วางไฟล์นี้ไว้กับ admin panel แล้วเพิ่ม:
 *   <script src="api-client.js"></script>  ก่อน </body>
 *
 * ใช้ server.js เดิม (fms-backend) port 3000
 * ไม่ต้องมี ADMIN_KEY เพราะอยู่ใน network เดียวกัน
 */

const API_BASE = '';   // ← เปลี่ยนเป็น IP/domain จริงถ้า admin อยู่คนละเครื่องกับ server

async function apiPost(path, body) {
  const res = await fetch(API_BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'API error');
  return json;
}

/* ════════════ OVERRIDE: doPubConfirm ════════════ */
window.doPubConfirm = async function () {
  if (!_pendingPub) return;
  const { section, willPublish } = _pendingPub;

  document.getElementById('pub-confirm-overlay').classList.remove('open');
  _pendingPub = null;

  const toggle = document.getElementById('pub-toggle-' + section);
  if (toggle) toggle.checked = willPublish;

  try {
    if (willPublish) {
      toast('⏳ กำลังบันทึกข้อมูลไปยัง server...');

      // ส่งข้อมูลทั้งหมดไป server ก่อน
      await apiPost('/api/admin/students/data', {
        intake:         DB.intake,
        trend:          DB.trend,
        status:         DB.status,
        coop:           DB.coop,
        coopYrs:        DB.coopYrs,
        intern:         DB.intern,
        internYrs:      DB.internYrs,
        top5Coop:       DB.top5Coop      || [],
        top5Intern:     DB.top5Intern    || [],
        partnersCoop:   DB.partnersCoop  || [],
        partnersIntern: DB.partnersIntern|| [],
      });
    }

    // เปลี่ยนสถานะเผยแพร่
    await apiPost('/api/admin/students/publish', { published: willPublish });

    // อัปเดต UI
    if (!pubState[section]) pubState[section] = {};
    pubState[section].published   = willPublish;
    pubState[section].publishedAt = willPublish ? new Date().toISOString() : null;
    updatePubBar(section);

    toast(
      willPublish
        ? '✓ เผยแพร่สำเร็จ · ข้อมูลบันทึกลง server แล้ว'
        : '✓ ปิดเผยแพร่แล้ว',
      willPublish ? '#22c55e' : '#f59e0b'
    );

  } catch (err) {
    if (toggle) toggle.checked = !willPublish;
    toast('❌ ' + err.message, '#ef4444');
    console.error(err);
  }
};
