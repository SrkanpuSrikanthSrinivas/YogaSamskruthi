const multer = require('multer');
const path = require('path');
const crypto = require('crypto');

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.redirect('/login');
  next();
}

function requireRole(role) {
  return (req, res, next) => {
    if (!res.locals.user) return res.redirect('/login');
    if (res.locals.user.role !== role)
      return res.status(403).render('error', { code: 403, message: 'You do not have access to this area.' });
    if (res.locals.user.status !== 'active')
      return res.status(403).render('error', { code: 403, message: 'Your account is not active yet. The admin team reviews registrations before enabling access.' });
    next();
  };
}

function flash(req, msg) { req.session.flash = msg; }

function storageFor(folder) {
  const base = process.env.VERCEL ? '/tmp/uploads' : path.join(__dirname, '..', 'uploads');
  const dest = path.join(base, folder);
  require('fs').mkdirSync(dest, { recursive: true });
  return multer.diskStorage({
    destination: dest,
    filename: (req, file, cb) => {
      const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      cb(null, Date.now() + '-' + crypto.randomBytes(4).toString('hex') + '-' + safe);
    }
  });
}

const uploadImage = multer({
  storage: storageFor('images'),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, f, cb) => cb(null, /image\/(png|jpe?g|webp|gif)/.test(f.mimetype))
});
const uploadVideo = multer({
  storage: storageFor('videos'),
  limits: { fileSize: 300 * 1024 * 1024 }, // ~10 min at reasonable bitrate; verify duration server-side with ffprobe in prod
  fileFilter: (req, f, cb) => cb(null, /video\/(mp4|webm|quicktime)/.test(f.mimetype))
});
const uploadDocument = multer({
  storage: storageFor('documents'),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, f, cb) => cb(null, /(pdf|image\/(png|jpe?g))/.test(f.mimetype))
});

function meetingLink() {
  return 'https://meet.jit.si/yogasamskruthi-' + crypto.randomBytes(6).toString('hex');
}

module.exports = { requireAuth, requireRole, flash, uploadImage, uploadVideo, uploadDocument, meetingLink };
