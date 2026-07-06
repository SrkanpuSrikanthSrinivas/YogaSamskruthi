const multer = require('multer');
const crypto = require('crypto');
const db = require('./db');

function flash(req, msg) { req.session.flash = msg; }

// Files are held in memory then written to Postgres as bytea (no disk needed).
// Serverless request bodies cap near 4.5 MB, so keep uploads small.
const memory = multer.memoryStorage();
const uploadImage = multer({ storage: memory, limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter: (r, f, cb) => cb(null, /image\/(png|jpe?g|webp|gif)/.test(f.mimetype)) });
const uploadDocument = multer({ storage: memory, limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter: (r, f, cb) => cb(null, /(pdf|image\/(png|jpe?g))/.test(f.mimetype)) });

async function saveMedia(ownerId, purpose, file) {
  if (!file) return null;
  const { rows } = await db.query(
    `INSERT INTO media (owner_id,purpose,mime,bytes) VALUES ($1,$2,$3,$4) RETURNING id`,
    [ownerId, purpose, file.mimetype, file.buffer]);
  return rows[0].id;
}

function meetingLink() { return 'https://meet.jit.si/yogasamskruthi-' + crypto.randomBytes(5).toString('hex'); }

function embedUrl(url) {
  if (!url) return '';
  try {
    const u = new URL(url);
    if (/youtube\.com$/.test(u.hostname) && u.searchParams.get('v')) return 'https://www.youtube.com/embed/' + u.searchParams.get('v');
    if (u.hostname === 'youtu.be') return 'https://www.youtube.com/embed/' + u.pathname.slice(1);
    if (/vimeo\.com$/.test(u.hostname)) return 'https://player.vimeo.com/video/' + u.pathname.split('/').filter(Boolean).pop();
    return url;
  } catch { return ''; }
}

module.exports = { flash, uploadImage, uploadDocument, saveMedia, meetingLink, embedUrl };
