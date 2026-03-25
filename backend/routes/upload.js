// routes/upload.js
const express = require('express');
const multer  = require('multer');
const cloudinary = require('cloudinary').v2;
const { Readable } = require('stream');

const router = express.Router();

// ── Cloudinary config ─────────────────────────────────────
cloudinary.config({
  cloud_name : process.env.CLOUDINARY_CLOUD_NAME,
  api_key    : process.env.CLOUDINARY_API_KEY,
  api_secret : process.env.CLOUDINARY_API_SECRET,
});

// ── Multer (เก็บใน memory ไม่บันทึกลง disk) ──────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits : { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('ไฟล์ต้องเป็นรูปภาพเท่านั้น'));
  },
});

// ── POST /api/upload/image ────────────────────────────────
router.post('/image', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'ไม่พบไฟล์รูปภาพ' });
    }

    // แปลง buffer → stream แล้วส่งไป Cloudinary
    const url = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder        : 'fms-psu',   // folder ใน Cloudinary (แก้ได้)
          resource_type : 'image',
          format        : 'webp',       // แปลงเป็น webp อัตโนมัติ
          quality       : 'auto:good',
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result.secure_url);
        }
      );
      Readable.from(req.file.buffer).pipe(stream);
    });

    return res.json({ success: true, url });

  } catch (err) {
    console.error('[upload] error:', err);
    return res.status(500).json({ success: false, message: err.message || 'อัปโหลดไม่สำเร็จ' });
  }
});

module.exports = router;
