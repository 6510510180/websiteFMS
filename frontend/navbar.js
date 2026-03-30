/**
 * navbar.js — Global Navbar + Search
 * ใส่ <script src="navbar.js"></script> ในทุกหน้า (ก่อน </body>)
 * และลบ <header> เดิมออก
 */

/* ══════════════════════════════════════════
   SEARCH INDEX — เพิ่ม/แก้หน้าที่นี่
══════════════════════════════════════════ */
const SEARCH_INDEX = [
  // หน้าหลัก
  { label: 'หน้าหลัก',                     url: 'bba-qa.html',             section: 'หน้าหลัก',              keywords: ['หน้าหลัก','home','qa','หลักสูตร'] },

  // ผลลัพธ์การเรียนรู้
  { label: 'ผลลัพธ์การเรียนรู้ (PLO)',      url: 'bba-plo.html',            section: 'ผลลัพธ์การเรียนรู้',    keywords: ['plo','mlo','ผลลัพธ์','learning outcome','ทักษะ'] },
  { label: 'จัดการ PLO/MLO',               url: 'plo.html',                section: 'ผลลัพธ์การเรียนรู้',    keywords: ['plo','mlo','จัดการ','เพิ่ม','แก้ไข'] },
  { label: 'Alignment Matrix',             url: 'matrix.html',             section: 'ผลลัพธ์การเรียนรู้',    keywords: ['matrix','alignment','mapping','plo'] },
  { label: 'คะแนนผลลัพธ์ PLO',             url: 'score-plo.html',          section: 'ผลลัพธ์การเรียนรู้',    keywords: ['คะแนน','score','plo','ผลการเรียน'] },
  { label: 'KAS (Knowledge/Attitude/Skill)', url: 'kas.html',              section: 'ผลลัพธ์การเรียนรู้',    keywords: ['kas','knowledge','attitude','skill','ความรู้','เจตคติ'] },

  // ผู้มีส่วนร่วม
  { label: 'ผู้มีส่วนร่วมในหลักสูตร',       url: 'bba-stake.html',          section: 'ผู้มีส่วนร่วม',         keywords: ['stakeholder','ผู้มีส่วนร่วม','ผู้ใช้บัณฑิต','อาจารย์'] },

  // ข้อมูลนักศึกษา
  { label: 'ข้อมูลนักศึกษา',                url: 'bba-students.html',       section: 'ข้อมูลนักศึกษา',        keywords: ['นักศึกษา','student','ทะเบียน','enrollment'] },

  // ผลงานและความสำเร็จ
  { label: 'ผลงานนักศึกษา',                 url: 'achievements.html',       section: 'ผลงานและความสำเร็จ',   keywords: ['ผลงาน','รางวัล','achievement','award','competition'] },
  { label: 'การได้งานทำของบัณฑิต',           url: 'Graduate-dashboard.html', section: 'ผลงานและความสำเร็จ',   keywords: ['บัณฑิต','งาน','graduate','employment','อาชีพ','ตลาดแรงงาน'] },
  { label: 'อัตราการได้งานทำ',              url: 'Graduate-dashboard.html', section: 'ผลงานและความสำเร็จ',   keywords: ['rate','อัตรา','employed','ได้งาน','freelance'] },
];

/* ══════════════════════════════════════════
   NAV LINKS CONFIG
══════════════════════════════════════════ */
const NAV_LINKS = [
  { label: 'หน้าหลัก',              href: 'bba-qa.html' },
  { label: 'ผลลัพธ์การเรียนรู้',    href: 'bba-plo.html' },
  { label: 'ผู้มีส่วนร่วมในหลักสูตร', href: 'bba-stake.html' },
  { label: 'ข้อมูลนักศึกษา',        href: 'bba-students.html' },
  { label: 'ผลงานและความสำเร็จ',    href: 'achievements.html' },
];

/* ══════════════════════════════════════════
   INJECT CSS
══════════════════════════════════════════ */
(function injectCSS() {
  const style = document.createElement('style');
  style.textContent = `
    /* ── reset topbar ── */
    .global-topbar {
      width: 100%; height: 64px;
      background: #fff;
      border-bottom: 1px solid rgba(0,0,0,.10);
      display: flex; align-items: center;
      padding: 0 40px; gap: 16px;
      position: sticky; top: 0; z-index: 500;
      box-shadow: 0 1px 4px rgba(0,0,0,.06);
      font-family: 'Sarabun',sans-serif;
      box-sizing: border-box;
    }
    .global-topbar * { box-sizing: border-box; }

    /* logo */
    .gtb-logo { display:flex; align-items:center; gap:10px; text-decoration:none; flex-shrink:0; }
    .gtb-logo img { height: 38px; }

    /* nav */
    .gtb-nav { display:flex; align-items:center; gap:2px; margin-left:28px; flex:1; flex-wrap:nowrap; }
    .gtb-nav a {
      padding: 8px 14px; border-radius: 8px;
      font-size: 13.5px; font-weight: 600;
      color: #64748b; text-decoration: none;
      transition: background .15s, color .15s;
      white-space: nowrap;
    }
    .gtb-nav a:hover { background: #f3eeff; color: #7F13EC; }
    .gtb-nav a.gtb-active {
      color: #7F13EC;
      border-bottom: 2px solid #7F13EC;
      border-radius: 0;
      padding-bottom: 6px;
    }

    /* search wrapper */
    .gtb-search-wrap {
      margin-left: auto;
      position: relative;
      flex-shrink: 0;
    }
    .gtb-search-box {
      display: flex; align-items: center; gap: 8px;
      background: #f7f4fc;
      border: 1.5px solid rgba(127,19,236,.15);
      border-radius: 10px;
      padding: 0 14px;
      height: 38px;
      width: 220px;
      transition: border-color .18s, box-shadow .18s, width .25s;
    }
    .gtb-search-box:focus-within {
      border-color: #7F13EC;
      box-shadow: 0 0 0 3px rgba(127,19,236,.09);
      width: 280px;
      background: #fff;
    }
    .gtb-search-icon { width:15px; height:15px; fill:#9d8ec4; flex-shrink:0; }
    .gtb-search-input {
      border: none; background: transparent; outline: none;
      font-family:'Sarabun',sans-serif;font-size:14px;font-weight:600;
      font-size: 13px; color: #21111c; width: 100%;
    }
    .gtb-search-input::placeholder { color: #b0a0c8; }
    .gtb-search-clear {
      background: none; border: none; cursor: pointer;
      color: #b0a0c8; font-size: 16px; line-height:1;
      padding: 0; display:none; flex-shrink:0;
      transition: color .15s;
    }
    .gtb-search-clear:hover { color: #7F13EC; }
    .gtb-search-clear.show { display: block; }

    /* dropdown */
    .gtb-dropdown {
      position: absolute; top: calc(100% + 8px); right: 0;
      width: 360px;
      background: #fff;
      border: 1.5px solid rgba(127,19,236,.15);
      border-radius: 14px;
      box-shadow: 0 12px 40px rgba(127,19,236,.14);
      overflow: hidden;
      display: none;
      z-index: 9999;
    }
    .gtb-dropdown.open { display: block; animation: gtbSlideIn .15s ease; }
    @keyframes gtbSlideIn {
      from { opacity:0; transform:translateY(-6px); }
      to   { opacity:1; transform:translateY(0); }
    }

    .gtb-dd-header {
      padding: 10px 16px 8px;
      font-size: 10px; font-weight: 700;
      color: #9d8ec4; letter-spacing: .8px;
      text-transform: uppercase;
      border-bottom: 1px solid #f3eeff;
    }
    .gtb-dd-empty {
      padding: 28px 16px;
      text-align: center;
      font-size: 13px; color: #b0a0c8;
    }

    .gtb-dd-item {
      display: flex; align-items: center; gap: 12px;
      padding: 10px 16px;
      text-decoration: none;
      transition: background .12s;
      cursor: pointer;
    }
    .gtb-dd-item:hover, .gtb-dd-item.gtb-focused {
      background: #f3eeff;
    }
    .gtb-dd-icon {
      width: 32px; height: 32px; border-radius: 8px;
      background: #ede7f3;
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
    }
    .gtb-dd-icon svg { width:15px; height:15px; fill:#7F13EC; }
    .gtb-dd-text { flex:1; min-width:0; }
    .gtb-dd-label {
      font-size: 13.5px; font-weight: 600; color: #21111c;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .gtb-dd-label mark {
      background: rgba(127,19,236,.15);
      color: #7F13EC;
      border-radius: 3px;
      padding: 0 2px;
    }
    .gtb-dd-section {
      font-size: 11px; color: #9d8ec4; margin-top: 1px;
    }
    .gtb-dd-arrow { color: #c4b5d8; font-size: 16px; }

    /* section divider */
    .gtb-dd-divider {
      padding: 6px 16px 4px;
      font-size: 10px; font-weight: 700;
      color: #c4b5d8; letter-spacing: .6px; text-transform: uppercase;
      background: #faf8ff;
      border-top: 1px solid #f3eeff;
    }
  `;
  document.head.appendChild(style);
})();

/* ══════════════════════════════════════════
   BUILD NAVBAR
══════════════════════════════════════════ */
(function buildNavbar() {
  const currentPage = location.pathname.split('/').pop() || 'index.html';

  // Remove old navbar/header if any
  document.querySelectorAll('.navbar, header.navbar').forEach(el => el.remove());

  const header = document.createElement('header');
  header.className = 'global-topbar';

  // Logo
  const logo = `<a class="gtb-logo" href="bba-qa.html">
    <img src="logo-fms.png" alt="FMS Logo">
  </a>`;

  // Nav links
  const navLinks = NAV_LINKS.map(link => {
    const PLO_PAGES = ['bba-plo.html', 'score.html', 'bba-matrix1.html', 'kas1.html', 'plo.html', 'matrix.html', 'score-plo.html', 'kas.html'];

const isActive = currentPage === link.href ||
  (link.href === 'achievements.html' && currentPage === 'Graduate-dashboard.html') ||
  (link.href === 'bba-plo.html' && PLO_PAGES.includes(currentPage));
    return `<a href="${link.href}" class="${isActive ? 'gtb-active' : ''}">${link.label}</a>`;
  }).join('');

  // Search
  const search = `
    <div class="gtb-search-wrap" id="gtbSearchWrap">
      <div class="gtb-search-box">
        <svg class="gtb-search-icon" viewBox="0 0 20 20">
          <path fill-rule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clip-rule="evenodd"/>
        </svg>
        <input class="gtb-search-input" id="gtbSearchInput"
          type="text" placeholder="ค้นหาข้อมูลหลักสูตร..."
          autocomplete="off" spellcheck="false">
        <button class="gtb-search-clear" id="gtbSearchClear" title="ล้าง">✕</button>
      </div>
      <div class="gtb-dropdown" id="gtbDropdown"></div>
    </div>`;

  header.innerHTML = logo +
    `<nav class="gtb-nav">${navLinks}</nav>` +
    search;

  // Insert before first child of body
  document.body.insertBefore(header, document.body.firstChild);

  initSearch();
})();

/* ══════════════════════════════════════════
   SEARCH LOGIC
══════════════════════════════════════════ */
function initSearch() {
  const input    = document.getElementById('gtbSearchInput');
  const dropdown = document.getElementById('gtbDropdown');
  const clearBtn = document.getElementById('gtbSearchClear');

  let focusIndex = -1;
  let currentResults = [];

  /* ── search function ── */
  function doSearch(query) {
    const q = query.trim().toLowerCase();
    clearBtn.classList.toggle('show', q.length > 0);

    if (!q) { closeDropdown(); return; }

    const results = SEARCH_INDEX.filter(item => {
      return item.label.toLowerCase().includes(q) ||
             item.section.toLowerCase().includes(q) ||
             item.keywords.some(k => k.toLowerCase().includes(q));
    });

    currentResults = results;
    focusIndex = -1;
    renderDropdown(results, q);
  }

  /* ── highlight match ── */
  function highlight(text, query) {
    if (!query) return text;
    const re = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return text.replace(re, '<mark>$1</mark>');
  }

  /* ── render ── */
  function renderDropdown(results, query) {
    if (!results.length) {
      dropdown.innerHTML = `
        <div class="gtb-dd-header">ผลการค้นหา</div>
        <div class="gtb-dd-empty">
          ไม่พบ "<strong>${query}</strong>"
        </div>`;
      dropdown.classList.add('open');
      return;
    }

    // Group by section
    const grouped = {};
    results.forEach(r => {
      if (!grouped[r.section]) grouped[r.section] = [];
      grouped[r.section].push(r);
    });

    let html = `<div class="gtb-dd-header">พบ ${results.length} ผลลัพธ์</div>`;
    let idx = 0;
    Object.entries(grouped).forEach(([section, items]) => {
      html += `<div class="gtb-dd-divider">${section}</div>`;
      items.forEach(item => {
        html += `
          <a class="gtb-dd-item" href="${item.url}" data-idx="${idx}">
            <div class="gtb-dd-icon">
              <svg viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clip-rule="evenodd"/>
              </svg>
            </div>
            <div class="gtb-dd-text">
              <div class="gtb-dd-label">${highlight(item.label, query)}</div>
              <div class="gtb-dd-section">${item.section}</div>
            </div>
            <span class="gtb-dd-arrow">›</span>
          </a>`;
        idx++;
      });
    });

    dropdown.innerHTML = html;
    dropdown.classList.add('open');
  }

  function closeDropdown() {
    dropdown.classList.remove('open');
    focusIndex = -1;
  }

  /* ── keyboard nav ── */
  input.addEventListener('keydown', e => {
    const items = dropdown.querySelectorAll('.gtb-dd-item');
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      focusIndex = Math.min(focusIndex + 1, items.length - 1);
      updateFocus(items);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      focusIndex = Math.max(focusIndex - 1, -1);
      updateFocus(items);
    } else if (e.key === 'Enter') {
      if (focusIndex >= 0 && items[focusIndex]) {
        items[focusIndex].click();
      } else if (currentResults.length === 1) {
        window.location.href = currentResults[0].url;
      }
    } else if (e.key === 'Escape') {
      closeDropdown();
      input.blur();
    }
  });

  function updateFocus(items) {
    items.forEach((el, i) => el.classList.toggle('gtb-focused', i === focusIndex));
    if (focusIndex >= 0 && items[focusIndex]) {
      items[focusIndex].scrollIntoView({ block: 'nearest' });
    }
  }

  /* ── events ── */
  input.addEventListener('input', e => doSearch(e.target.value));
  input.addEventListener('focus', () => { if (input.value.trim()) doSearch(input.value); });

  clearBtn.addEventListener('click', () => {
    input.value = '';
    clearBtn.classList.remove('show');
    closeDropdown();
    input.focus();
  });

  // Close on outside click
  document.addEventListener('click', e => {
    if (!document.getElementById('gtbSearchWrap').contains(e.target)) {
      closeDropdown();
    }
  });
}