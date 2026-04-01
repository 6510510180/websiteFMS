/**
 * search-index.js
 * Static search index สำหรับ FMS PSU BBA Website
 * รวมเนื้อหาจากทุกหน้าที่ไม่ได้มาจาก API
 *
 * วิธีใช้: โหลดไฟล์นี้ใน search.html ก่อน script หลัก
 *   <script src="search-index.js"></script>
 */

window.STATIC_SEARCH_INDEX = [

  /* ── bba-home.html ──────────────────────────────────────── */
  {
    id: "home-hero",
    type: "page",
    title: "หน้าหลัก คณะวิทยาการจัดการ มหาวิทยาลัยสงขลานครินทร์",
    body: "ยินดีต้อนรับสู่คณะวิทยาการจัดการ มหาวิทยาลัยสงขลานครินทร์ ปริญญาตรี บริหารธุรกิจ",
    keywords: ["หน้าหลัก", "คณะวิทยาการจัดการ", "มอ", "PSU", "สงขลานครินทร์", "ปริญญาตรี", "FMS"],
    icon: "🏠",
    badge: "หน้าหลัก",
    badgeClass: "badge-page",
    href: "bba-home.html",
  },
  {
    id: "home-plan",
    type: "page",
    title: "แผนการศึกษา",
    body: "แผนการศึกษาหลักสูตรบริหารธุรกิจ ตารางภาคเรียน ปีการศึกษา",
    keywords: ["แผนการศึกษา", "ตาราง", "ภาคเรียน", "ปีการศึกษา", "plan", "semester"],
    icon: "📅",
    badge: "หน้าหลัก",
    badgeClass: "badge-page",
    href: "plans.html",
  },
  {
    id: "home-student",
    type: "page",
    title: "ข้อมูลนักศึกษา",
    body: "ข้อมูลทั่วไปที่นักศึกษาควรรู้ นักศึกษาหลักสูตรบริหารธุรกิจ",
    keywords: ["นักศึกษา", "student", "ข้อมูลนักศึกษา"],
    icon: "👥",
    badge: "หน้าหลัก",
    badgeClass: "badge-page",
    href: "student.html",
  },
  {
    id: "home-search",
    type: "page",
    title: "ค้นหาข้อมูลภายในระบบ",
    body: "ค้นหาหลักสูตร วิชาเอก แผนการศึกษา ข้อมูลนักศึกษา",
    keywords: ["ค้นหา", "search", "ระบบ"],
    icon: "🔍",
    badge: "หน้าหลัก",
    badgeClass: "badge-page",
    href: "search.html",
  },
  {
    id: "home-footer-contact",
    type: "info",
    title: "ติดต่อคณะวิทยาการจัดการ",
    body: "fms@psu.ac.th โทร +66-7428-7815 15 ถนนกาญจนวณิชย์ อำเภอหาดใหญ่ จังหวัดสงขลา 90112",
    keywords: ["ติดต่อ", "อีเมล", "โทรศัพท์", "ที่อยู่", "หาดใหญ่", "สงขลา", "fms", "contact"],
    icon: "📞",
    badge: "ข้อมูลทั่วไป",
    badgeClass: "badge-info",
    href: "bba-home.html",
  },

  /* ── bba-qa.html ─────────────────────────────────────────── */
  {
    id: "qa-home",
    type: "qa",
    title: "QA Dashboard — เมนูจัดการคุณภาพหลักสูตร",
    body: "เข้าถึงข้อมูลสำคัญและเครื่องมือในการประเมินคุณภาพการศึกษา",
    keywords: ["QA", "คุณภาพ", "ประเมิน", "หลักสูตร", "quality", "dashboard"],
    icon: "✅",
    badge: "QA",
    badgeClass: "badge-qa",
    href: "bba-qa.html",
  },
  {
    id: "qa-plo",
    type: "qa",
    title: "ผลลัพธ์การเรียนรู้ — PLO / MLO / KAS",
    body: "PLO MLO KAS คะแนนผลลัพธ์การเรียนรู้ Program Learning Outcomes ผลลัพธ์การเรียนรู้ระดับหลักสูตร",
    keywords: ["PLO", "MLO", "KAS", "ผลลัพธ์การเรียนรู้", "learning outcomes", "คะแนน"],
    icon: "📊",
    badge: "QA",
    badgeClass: "badge-qa",
    href: "bba-plo.html",
  },
  {
    id: "qa-stakeholder",
    type: "qa",
    title: "ผู้มีส่วนได้ส่วนเสียในหลักสูตร (Stakeholder)",
    body: "รวบรวมข้อมูลจากผู้มีส่วนได้ส่วนเสียในหลักสูตรเพื่อการปรับปรุงหลักสูตร stakeholder ผู้ใช้บัณฑิต นักศึกษา ศิษย์เก่า",
    keywords: ["stakeholder", "ผู้มีส่วนร่วม", "ผู้ใช้บัณฑิต", "นายจ้าง", "ศิษย์เก่า", "alumni"],
    icon: "💬",
    badge: "QA",
    badgeClass: "badge-qa",
    href: "bba-stake.html",
  },
  {
    id: "qa-student-data",
    type: "qa",
    title: "ข้อมูลนักศึกษา (QA) — สถิติการตรวจสอบ",
    body: "วิเคราะห์สถิติการตรวจสอบ อัตราการสำเร็จ แนวโน้มการศึกษา graduation rate retention",
    keywords: ["สถิติ", "อัตราสำเร็จ", "graduation", "retention", "analytics", "ข้อมูลนักศึกษา"],
    icon: "📈",
    badge: "QA",
    badgeClass: "badge-qa",
    href: "bba-students.html",
  },
  {
    id: "qa-achievements",
    type: "qa",
    title: "ผลงานและความสำเร็จ — รางวัลนักศึกษา",
    body: "บันทึกรางวัลนักศึกษา สถิติได้รับตำแหน่งงาน ผลงาน ความสำเร็จ achievements awards employment",
    keywords: ["รางวัล", "ผลงาน", "ความสำเร็จ", "งาน", "employment", "achievements", "awards"],
    icon: "🏆",
    badge: "QA",
    badgeClass: "badge-qa",
    href: "achievements.html",
  },

  /* ── student.html ────────────────────────────────────────── */
  {
    id: "student-hero",
    type: "student",
    title: "หน้านักศึกษา — Bachelor of Business Administration",
    body: "ข้อมูลนักศึกษา BBA ปริญญาตรีบริหารธุรกิจ คณะวิทยาการจัดการ มหาวิทยาลัยสงขลานครินทร์ ระบบทวิภาค 4 ปี",
    keywords: ["นักศึกษา", "BBA", "บริหารธุรกิจ", "ปริญญาตรี", "4 ปี", "ทวิภาค", "student guide"],
    icon: "🎓",
    badge: "นักศึกษา",
    badgeClass: "badge-student",
    href: "student.html",
  },
  {
    id: "student-structure",
    type: "student",
    title: "โครงสร้างหมวดวิชา — หลักสูตรบริหารธุรกิจ",
    body: "โครงสร้างหมวดวิชา หมวดวิชาศึกษาทั่วไป General Education หมวดวิชาเลือกเสรี Free Elective หมวดวิชาเฉพาะ Specific Courses",
    keywords: ["โครงสร้าง", "หมวดวิชา", "ศึกษาทั่วไป", "เลือกเสรี", "วิชาเฉพาะ", "general education", "free elective"],
    icon: "🗂️",
    badge: "นักศึกษา",
    badgeClass: "badge-student",
    href: "student.html",
  },
  {
    id: "student-gened",
    type: "student",
    title: "หมวดวิชาศึกษาทั่วไป (General Education)",
    body: "รายวิชาเลือกหมวดวิชาศึกษาทั่วไปมหาวิทยาลัยสงขลานครินทร์ ผ่านคณะกรรมการพัฒนาหมวดวิชาศึกษาทั่วไป กรอบมาตรฐานคุณวุฒิ",
    keywords: ["ศึกษาทั่วไป", "general education", "gened", "วิชาเลือก", "มอ. หาดใหญ่"],
    icon: "🌐",
    badge: "นักศึกษา",
    badgeClass: "badge-student",
    href: "student.html",
  },
  {
    id: "student-free-elective",
    type: "student",
    title: "หมวดวิชาเลือกเสรี (Free Elective)",
    body: "นักศึกษาสามารถเลือกเรียนรายวิชาใดก็ได้ในมหาวิทยาลัยสงขลานครินทร์หรือมหาวิทยาลัยอื่นทั้งในและต่างประเทศ โดยความเห็นชอบของหลักสูตร",
    keywords: ["เลือกเสรี", "free elective", "วิชาเลือก", "ต่างประเทศ", "exchange"],
    icon: "📖",
    badge: "นักศึกษา",
    badgeClass: "badge-student",
    href: "student.html",
  },
  {
    id: "student-core",
    type: "student",
    title: "วิชาแกน — รายวิชาพื้นฐานสำหรับทุกวิชาเอก",
    body: "วิชาแกน รายวิชาพื้นฐานสำคัญที่นักศึกษาทุกวิชาเอกต้องเรียน core subjects ความรู้และทักษะร่วมกัน",
    keywords: ["วิชาแกน", "core", "พื้นฐาน", "บังคับ", "ทุกวิชาเอก"],
    icon: "🧱",
    badge: "นักศึกษา",
    badgeClass: "badge-student",
    href: "student.html",
  },
  {
    id: "student-required",
    type: "student",
    title: "วิชาบังคับ — ต้องผ่านเพื่อสำเร็จการศึกษา",
    body: "วิชาบังคับ รายวิชาที่นักศึกษาทุกคนต้องลงทะเบียนเรียนและสอบให้ผ่านตามเกณฑ์จึงจะสำเร็จการศึกษาได้ required subjects",
    keywords: ["วิชาบังคับ", "required", "สำเร็จการศึกษา", "เงื่อนไขจบ"],
    icon: "🔒",
    badge: "นักศึกษา",
    badgeClass: "badge-student",
    href: "student.html",
  },
  {
    id: "student-elective",
    type: "student",
    title: "วิชาเลือก — เลือกตามความสนใจ",
    body: "วิชาเลือก รายวิชาที่เปิดโอกาสให้ผู้เรียนได้เลือกตามความสนใจ ความถนัด หรือขยายความรู้เพิ่มเติมจากวิชาบังคับ elective subjects",
    keywords: ["วิชาเลือก", "elective", "ความสนใจ", "ความถนัด"],
    icon: "🎛️",
    badge: "นักศึกษา",
    badgeClass: "badge-student",
    href: "student.html",
  },
  {
    id: "student-minor",
    type: "student",
    title: "วิชาโท — เลือกเรียน 15 หน่วยกิต",
    body: "วิชาโท เลือกจากกลุ่มวิชาใดวิชาหนึ่ง 15 หน่วยกิต เปิดสอนโดยวิชาเอกบริหารธุรกิจหรือสาขาการบัญชี minor subjects",
    keywords: ["วิชาโท", "minor", "15 หน่วยกิต", "การบัญชี", "บริหารธุรกิจ"],
    icon: "🔀",
    badge: "นักศึกษา",
    badgeClass: "badge-student",
    href: "student.html",
  },
  {
    id: "student-professional",
    type: "student",
    title: "วิชาชีพ — 3 รายวิชา",
    body: "วิชาชีพ ประกอบด้วย 3 วิชา professional courses สหกิจศึกษา ฝึกงาน",
    keywords: ["วิชาชีพ", "professional", "สหกิจ", "ฝึกงาน", "internship"],
    icon: "💼",
    badge: "นักศึกษา",
    badgeClass: "badge-student",
    href: "student.html",
  },
  {
    id: "student-majors-subjects",
    type: "student",
    title: "รายวิชาตามวิชาเอก — การเงิน การตลาด ทรัพยากร โลจิสติก สารสนเทศ ไมซ์",
    body: "รายวิชาตามวิชาเอก การเงิน FIN การตลาด MKT ทรัพยากรมนุษย์ HRM โลจิสติก LSM สารสนเทศ BIS ไมซ์ MICE วิชาบังคับ วิชาเลือก วิชาโท",
    keywords: ["รายวิชา", "วิชาเอก", "การเงิน", "การตลาด", "ทรัพยากรมนุษย์", "HRM", "โลจิสติก", "สารสนเทศ", "ไมซ์", "MICE", "FIN", "MKT", "LSM", "BIS", "subjects"],
    icon: "📚",
    badge: "นักศึกษา",
    badgeClass: "badge-student",
    href: "student.html",
  },
];

/**
 * searchStaticIndex(query)
 * ค้นหาใน static index โดย match กับ title, body และ keywords
 * คืน array ของผลลัพธ์ที่ตรงกัน พร้อม score
 */
window.searchStaticIndex = function(query) {
  if (!query || !query.trim()) return [];
  const q = query.trim().toLowerCase();
  const results = [];

  for (const item of window.STATIC_SEARCH_INDEX) {
    let score = 0;

    const titleLow = (item.title || '').toLowerCase();
    const bodyLow  = (item.body  || '').toLowerCase();
    const kwHit    = (item.keywords || []).some(k => k.toLowerCase().includes(q) || q.includes(k.toLowerCase()));

    if (titleLow.includes(q))  score += 10;
    if (bodyLow.includes(q))   score += 5;
    if (kwHit)                 score += 8;

    // partial keyword match
    const words = q.split(/\s+/);
    for (const w of words) {
      if (w.length < 2) continue;
      if (titleLow.includes(w)) score += 3;
      if (bodyLow.includes(w))  score += 1;
      if ((item.keywords || []).some(k => k.toLowerCase().includes(w))) score += 2;
    }

    if (score > 0) results.push({ ...item, _score: score });
  }

  results.sort((a, b) => b._score - a._score);
  return results;
};