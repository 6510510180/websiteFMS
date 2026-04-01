/**
 * fms-year-selector.js
 * ─────────────────────────────────────────────────────
 * Shared utility สำหรับ Year Selector ที่ใช้ร่วมกันทุกหน้า
 * ใส่ <script src="fms-year-selector.js"></script> ก่อน script หลัก
 * ─────────────────────────────────────────────────────
 */

window.FmsYear = (function () {

  const STORAGE_KEY = 'fms_selected_year';
  const API_BASE    = '';                    // ปรับให้ตรงกับ server

  // ── State ────────────────────────────────────────────
  let _currentYear  = null;
  let _availYears   = [];
  let _onChangeCbs  = [];

  // ── Public API ───────────────────────────────────────

  /** โหลดปีที่มีอยู่จาก API แล้ว render selector */
  async function init(containerId, options = {}) {
    const {
      programId      = '00000000-0000-0000-0000-000000000001',
      module         = 'all',          // 'plo' | 'matrix' | 'score' | 'all'
      defaultYear    = null,
      showAddButton  = true,
      onYearChange   = null,
    } = options;

    if (onYearChange) _onChangeCbs.push(onYearChange);

    // โหลดปีจาก API
    _availYears = await fetchYears(programId, module);

    // ดึงปีที่เคยเลือกจาก localStorage หรือ defaultYear
    const saved = localStorage.getItem(STORAGE_KEY);
    _currentYear = defaultYear
      || (saved && _availYears.includes(parseInt(saved)) ? parseInt(saved) : null)
      || _availYears[0]
      || (new Date().getFullYear() + 543);

    // render
    const el = document.getElementById(containerId);
    if (el) renderSelector(el, showAddButton);

    return _currentYear;
  }

  /** ดึงปีปัจจุบันที่เลือก */
  function getYear() { return _currentYear; }

  /** set ปีโดยตรง (programmatic) */
  function setYear(year) {
    const y = parseInt(year);
    if (!y) return;
    _currentYear = y;
    localStorage.setItem(STORAGE_KEY, y);
    _onChangeCbs.forEach(cb => cb(y));
    _syncSelects(y);
  }

  /** ลงทะเบียน callback เมื่อ year เปลี่ยน */
  function onChange(cb) { _onChangeCbs.push(cb); }

  // ── Internal ─────────────────────────────────────────

  async function fetchYears(programId, module) {
    try {
      let url;
      if (module === 'score') {
        url = `${API_BASE}/api/plo/available-years?program_id=${programId}`;
        const r = await fetch(url);
        const d = await r.json();
        return (d.years || []).map(Number);
      } else {
        url = `${API_BASE}/api/academic-years`;
        const r = await fetch(url);
        const d = await r.json();
        return (d.years || []).filter(y => y.is_active).map(y => y.year);
      }
    } catch (_) {
      // fallback
      const now = new Date().getFullYear() + 543;
      return [now, now - 1, now - 2];
    }
  }

  function renderSelector(container, showAddButton) {
    container.innerHTML = `
      <div class="fms-year-wrap" style="display:flex;align-items:center;gap:8px;">
        <label style="font-size:12px;font-weight:700;color:#64748b;white-space:nowrap;">ปีการศึกษา:</label>
        <select id="fms-year-sel"
          style="padding:6px 28px 6px 10px;border:1.5px solid #c4b5fd;border-radius:9px;
                 font-family:inherit;font-size:13px;font-weight:700;color:#5b21b6;
                 background:#faf5ff url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%237c3aed'/%3E%3C/svg%3E\") no-repeat right 8px center;
                 -webkit-appearance:none;cursor:pointer;outline:none;
                 transition:border-color .15s,box-shadow .15s;"
          onchange="window.FmsYear.setYear(this.value)"
          onfocus="this.style.borderColor='#7c3aed';this.style.boxShadow='0 0 0 3px rgba(124,58,237,.12)'"
          onblur="this.style.borderColor='#c4b5fd';this.style.boxShadow='none'">
          ${_availYears.map(y =>
            `<option value="${y}" ${y === _currentYear ? 'selected' : ''}>${y}</option>`
          ).join('')}
        </select>
        ${showAddButton ? `
          <button id="fms-add-year-btn"
            style="width:30px;height:30px;border-radius:8px;border:1.5px solid #c4b5fd;
                   background:#faf5ff;color:#7c3aed;font-size:16px;cursor:pointer;
                   display:flex;align-items:center;justify-content:center;transition:.15s;"
            title="เพิ่มปีการศึกษาใหม่"
            onclick="window.FmsYear.openAddYear()"
            onmouseover="this.style.background='#ede9fe'"
            onmouseout="this.style.background='#faf5ff'">+</button>
        ` : ''}
      </div>
    `;
  }

  function _syncSelects(year) {
    // sync ทุก select ที่มี id=fms-year-sel บนหน้า
    document.querySelectorAll('#fms-year-sel').forEach(s => { s.value = year; });
  }

  // ── Add Year Dialog ───────────────────────────────────
  function openAddYear() {
    const existing = document.getElementById('fms-add-year-dialog');
    if (existing) existing.remove();

    const dialog = document.createElement('div');
    dialog.id = 'fms-add-year-dialog';
    dialog.style.cssText = `
      position:fixed;inset:0;background:rgba(0,0,0,.45);backdrop-filter:blur(3px);
      z-index:9999;display:flex;align-items:center;justify-content:center;
    `;
    dialog.innerHTML = `
      <div style="background:#fff;border-radius:16px;padding:28px 32px;width:360px;
                  box-shadow:0 20px 60px rgba(0,0,0,.2);font-family:inherit;">
        <div style="font-size:16pxฆ;font-weight:800;color:#1a0f2e;margin-bottom:6px;">
          📅 เพิ่มปีการศึกษาใหม่
        </div>
        <div style="font-size:12px;color:#64748b;margin-bottom:18px;">
          ข้อมูลปีเดิมจะยังคงอยู่ครบถ้วน
        </div>
        <label style="font-size:11.5px;font-weight:700;color:#64748b;display:block;margin-bottom:6px;">
          ปีการศึกษา (พ.ศ.)
        </label>
        <input id="fms-new-year-inp" type="number" min="2560" max="2700"
          value="${_currentYear + 1}"
          style="width:100%;padding:10px 14px;border:1.5px solid #c4b5fd;border-radius:10px;
                 font-family:inherit;font-size:15px;font-weight:700;color:#5b21b6;
                 outline:none;margin-bottom:8px;"
          onfocus="this.style.borderColor='#7c3aed';this.style.boxShadow='0 0 0 3px rgba(124,58,237,.12)'"
          onblur="this.style.borderColor='#c4b5fd';this.style.boxShadow='none'"
          onkeydown="if(event.key==='Enter') document.getElementById('fms-confirm-add-year').click()">
        <div style="font-size:11.5px;color:#94a3b8;margin-bottom:20px;">
          ตัวอย่าง: 2567, 2568, 2571
        </div>
        <div style="display:flex;gap:10px;justify-content:flex-end;">
          <button onclick="document.getElementById('fms-add-year-dialog').remove()"
            style="padding:9px 20px;border:1.5px solid #e2e8f0;background:#fff;border-radius:9px;
                   font-family:inherit;font-size:13px;font-weight:700;color:#64748b;cursor:pointer;">
            ยกเลิก
          </button>
          <button id="fms-confirm-add-year"
            onclick="window.FmsYear._confirmAddYear()"
            style="padding:9px 22px;border:none;background:#7c3aed;color:#fff;border-radius:9px;
                   font-family:inherit;font-size:13px;font-weight:700;cursor:pointer;
                   box-shadow:0 4px 12px rgba(124,58,237,.3);">
            เพิ่มปีนี้
          </button>
        </div>
      </div>
    `;
    dialog.addEventListener('click', e => { if (e.target === dialog) dialog.remove(); });
    document.body.appendChild(dialog);
    setTimeout(() => document.getElementById('fms-new-year-inp')?.focus(), 100);
  }

  async function _confirmAddYear() {
    const inp = document.getElementById('fms-new-year-inp');
    const newYear = parseInt(inp?.value);
    if (!newYear || newYear < 2560 || newYear > 2700) {
      inp && (inp.style.borderColor = '#ef4444');
      return;
    }
    if (_availYears.includes(newYear)) {
      setYear(newYear);
      document.getElementById('fms-add-year-dialog')?.remove();
      return;
    }
    try {
      await fetch(`${API_BASE}/api/academic-years`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year: newYear, label: `ปีการศึกษา ${newYear}` }),
      });
      _availYears = [newYear, ..._availYears].sort((a, b) => b - a);
      document.getElementById('fms-add-year-dialog')?.remove();

      // re-render selector ถ้ามี container
      const sel = document.getElementById('fms-year-sel');
      if (sel) {
        _availYears.forEach(y => {
          if (!sel.querySelector(`option[value="${y}"]`)) {
            const opt = document.createElement('option');
            opt.value = y; opt.textContent = y;
            sel.insertBefore(opt, sel.firstChild);
          }
        });
      }
      setYear(newYear);
      _showToast(`✓ เพิ่มปีการศึกษา ${newYear} สำเร็จ`);
    } catch (e) {
      _showToast('❌ เพิ่มปีไม่สำเร็จ: ' + e.message, '#ef4444');
    }
  }

  function _showToast(msg, color = '#22c55e') {
    // ใช้ toast ที่มีอยู่บนหน้าถ้ามี
    const dot = document.getElementById('toast-dot') || document.getElementById('tdot') || document.getElementById('toastDot');
    const msgEl = document.getElementById('toast-msg') || document.getElementById('tmsg') || document.getElementById('toastMsg');
    const toastEl = document.getElementById('toast');
    if (dot && msgEl && toastEl) {
      dot.style.background = color;
      msgEl.textContent = msg;
      toastEl.classList.add('show');
      setTimeout(() => toastEl.classList.remove('show'), 3000);
    } else {
      console.log(msg);
    }
  }

  // ── Copy data to new year ─────────────────────────────
  /**
   * copyYearData(fromYear, toYear, programId)
   * คัดลอกข้อมูล PLO/MLO จากปีเก่าไปปีใหม่ (เพื่อใช้เป็นฐาน)
   */
  async function copyYearData(fromYear, toYear, programId) {
    try {
      const res = await fetch(
        `${API_BASE}/api/programs/${programId}/plo-mlo?year=${fromYear}`
      );
      const data = await res.json();
      await fetch(
        `${API_BASE}/api/programs/${programId}/plo-mlo?year=${toYear}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ PLO: data.PLO, MLO: data.MLO, year: toYear }),
        }
      );
      return true;
    } catch (_) { return false; }
  }

  return {
    init,
    getYear,
    setYear,
    onChange,
    openAddYear,
    copyYearData,
    _confirmAddYear,
  };

})();
