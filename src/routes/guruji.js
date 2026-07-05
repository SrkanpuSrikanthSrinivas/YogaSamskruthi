const router = require('express').Router();
const db = require('../db');
const { requireRole, uploadImage, uploadVideo, flash } = require('../helpers');

router.use(requireRole('guruji'));
const me = (res) => res.locals.user.id;
const MAX_VIDEO_SECONDS = 600; // 5–10 min policy; enforce hard cap at 10

router.get('/', (req, res) => {
  const content = db.prepare(`SELECT * FROM content WHERE author_id=? ORDER BY updated_at DESC`).all(me(res));
  const pendingApps = db.prepare(`SELECT COUNT(*) c FROM applications WHERE guruji_id=? AND status='pending'`).get(me(res)).c;
  const openQuestions = db.prepare(`SELECT COUNT(*) c FROM questions WHERE guruji_id=? AND answer=''`).get(me(res)).c;
  const guidelines = db.prepare(`SELECT * FROM guidelines WHERE status='published' AND audience IN ('guruji','both') ORDER BY updated_at DESC`).all();
  res.render('guruji/dashboard', { content, pendingApps, openQuestions, guidelines });
});

// ---- Content authoring (AEM-style: draft -> published -> archived) ----
router.get('/content/new', (req, res) => res.render('guruji/content-form', { item: null }));
router.get('/content/:id/edit', (req, res) => {
  const item = db.prepare(`SELECT * FROM content WHERE id=? AND author_id=?`).get(req.params.id, me(res));
  if (!item) return res.status(404).render('error', { code: 404, message: 'Content not found.' });
  res.render('guruji/content-form', { item });
});

router.post('/content/save', uploadImage.single('image'), (req, res, next) => {
  // image handled; video handled in a separate route to apply its own limits
  const { id, type, title, body, event_date } = req.body;
  if (!title || !type) { flash(req, 'Type and title are required.'); return res.redirect('/guruji/content/new'); }
  const media = req.file ? '/uploads/images/' + req.file.filename : (req.body.existing_media || '');
  if (id) {
    db.prepare(`UPDATE content SET type=?,title=?,body=?,event_date=?,media_path=?,updated_at=datetime('now')
      WHERE id=? AND author_id=?`).run(type, title, req.body.body || '', event_date || '', media, id, me(res));
  } else {
    db.prepare(`INSERT INTO content (author_id,type,title,body,event_date,media_path) VALUES (?,?,?,?,?,?)`)
      .run(me(res), type, title, req.body.body || '', event_date || '', media);
  }
  flash(req, 'Saved as draft. Publish it when ready.');
  res.redirect('/guruji');
});

router.post('/content/video', uploadVideo.single('video'), (req, res) => {
  const duration = parseInt(req.body.duration_seconds || '0', 10);
  if (!req.file) { flash(req, 'Choose a video file (mp4/webm/mov).'); return res.redirect('/guruji/content/new'); }
  if (!duration || duration > MAX_VIDEO_SECONDS) {
    flash(req, 'Videos must be 10 minutes (600 seconds) or shorter.');
    return res.redirect('/guruji/content/new');
  }
  db.prepare(`INSERT INTO content (author_id,type,title,body,media_path,duration_seconds)
    VALUES (?,?,?,?,?,?)`)
    .run(me(res), 'video', req.body.title || 'Untitled video', req.body.body || '',
         '/uploads/videos/' + req.file.filename, duration);
  flash(req, 'Video saved as draft. Note: production deployments should verify duration server-side with ffprobe.');
  res.redirect('/guruji');
});

router.post('/content/:id/publish', (req, res) => {
  db.prepare(`UPDATE content SET status='published', published_at=datetime('now'), updated_at=datetime('now')
    WHERE id=? AND author_id=?`).run(req.params.id, me(res));
  flash(req, 'Published. It is now visible on the public site.');
  res.redirect('/guruji');
});
router.post('/content/:id/unpublish', (req, res) => {
  db.prepare(`UPDATE content SET status='draft', updated_at=datetime('now') WHERE id=? AND author_id=?`).run(req.params.id, me(res));
  flash(req, 'Unpublished — back to draft.');
  res.redirect('/guruji');
});
router.post('/content/:id/archive', (req, res) => {
  db.prepare(`UPDATE content SET status='archived', updated_at=datetime('now') WHERE id=? AND author_id=?`).run(req.params.id, me(res));
  flash(req, 'Archived.');
  res.redirect('/guruji');
});

// ---- Aspirant applications: view profile + intention, accept/reject with optional reason ----
router.get('/applications', (req, res) => {
  const apps = db.prepare(`SELECT a.*, u.name, u.email, u.bio, u.intention aspirant_intention, u.target_date aspirant_target
    FROM applications a JOIN users u ON u.id=a.aspirant_id
    WHERE a.guruji_id=? ORDER BY CASE a.status WHEN 'pending' THEN 0 ELSE 1 END, a.created_at DESC`).all(me(res));
  res.render('guruji/applications', { apps });
});
router.post('/applications/:id/decide', (req, res) => {
  const status = req.body.decision === 'accept' ? 'accepted' : 'rejected';
  db.prepare(`UPDATE applications SET status=?, reason=?, decided_at=datetime('now') WHERE id=? AND guruji_id=?`)
    .run(status, req.body.reason || '', req.params.id, me(res));
  flash(req, status === 'accepted' ? 'Aspirant accepted.' : 'Application rejected.');
  res.redirect('/guruji/applications');
});

// ---- Q&A ----
router.get('/questions', (req, res) => {
  const rows = db.prepare(`SELECT q.*, u.name aspirant FROM questions q JOIN users u ON u.id=q.aspirant_id
    WHERE q.guruji_id=? ORDER BY CASE WHEN q.answer='' THEN 0 ELSE 1 END, q.created_at DESC`).all(me(res));
  res.render('guruji/questions', { rows });
});
router.post('/questions/:id/answer', (req, res) => {
  db.prepare(`UPDATE questions SET answer=?, answered_at=datetime('now') WHERE id=? AND guruji_id=?`)
    .run(req.body.answer || '', req.params.id, me(res));
  flash(req, 'Answer sent.');
  res.redirect('/guruji/questions');
});

module.exports = router;
