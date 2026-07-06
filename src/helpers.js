const multer = require('multer');
const crypto = require('crypto');
const db = require('./db');

function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) return res.redirect('/login');
  next();
}

function requireRole(role) {
  return (req, res, next) => {
    const u = res.locals.user;
    if (!u) return res.redirect('/login');
    if (u.role !== role)
      return res.status(403).render('error', { code: 403, message: 'You do not have access to this area.' });
    if (u.status !== 'active')
      return res.status(403).render('error', { code: 403, message: 'Your account is not active yet. The admin team reviews registrations before enabling access.' });
    next();
  };
}

function flash(req, msg) { req.session.flash = msg; }

// Files are held in memory then written to Postgres as bytea — nothing touches disk.
// Vercel serverless functions cap request bodies near 4.5 MB, so keep uploads small.
const memory = multer.memoryStorage();
const uploadImage = multer({
  storage: memory,
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter: (req, f, cb) => cb(null, /image\/(png|jpe?g|webp|gif)/.test(f.mimetype)),
});
const uploadDocument = multer({
  storage: memory,
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter: (req, f, cb) => cb(null, /(pdf|image\/(png|jpe?g))/.test(f.mimetype)),
});

async function saveMedia(ownerId, purpose, file) {
  if (!file) return null;
  const { rows } = await db.query(
    `INSERT INTO media (owner_id, purpose, mime, bytes) VALUES ($1,$2,$3,$4) RETURNING id`,
    [ownerId, purpose, file.mimetype, file.buffer]
  );
  return rows[0].id;
}

function meetingLink() {
  return 'https://meet.jit.si/yogasamskruthi-' + crypto.randomBytes(6).toString('hex');
}

// Normalize a YouTube/Vimeo URL to an embeddable form for the video player.
function embedUrl(url) {
  if (!url) return '';
  try {
    const u = new URL(url);
    if (/youtube\.com$/.test(u.hostname) && u.searchParams.get('v'))
      return 'https://www.youtube.com/embed/' + u.searchParams.get('v');
    if (u.hostname === 'youtu.be')
      return 'https://www.youtube.com/embed/' + u.pathname.slice(1);
    if (/vimeo\.com$/.test(u.hostname))
      return 'https://player.vimeo.com/video/' + u.pathname.split('/').filter(Boolean).pop();
    return url;
  } catch { return ''; }
}

module.exports = {
  requireAuth, requireRole, flash,
  uploadImage, uploadDocument, saveMedia,
  meetingLink, embedUrl,
};
