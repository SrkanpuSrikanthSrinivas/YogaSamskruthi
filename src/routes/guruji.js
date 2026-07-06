const router = require('express').Router();
const db = require('../db');
const { requireRole, uploadImage, saveMedia, flash } = require('../helpers');

router.use(requireRole('guruji'));
const me = (res) => res.locals.user.id;

router.get('/', async (req, res, next) => {
  try {
    const content = (await db.query(`SELECT * FROM content WHERE author_id=$1 ORDER BY updated_at DESC`, [me(res)])).rows;
    const pendingApps = (await db.query(`SELECT COUNT(*)::int AS c FROM applications WHERE guruji_id=$1 AND status='pending'`, [me(res)])).rows[0].c;
    const openQuestions = (await db.query(`SELECT COUNT(*)::int AS c FROM questions WHERE guruji_id=$1 AND answer=''`, [me(res)])).rows[0].c;
    const guidelines = (await db.query(`SELECT * FROM guidelines WHERE status='published' AND audience IN ('guruji','both') ORDER BY updated_at DESC`)).rows;
    res.render('guruji/dashboard', { content, pendingApps, openQuestions, guidelines });
  } catch (err) { next(err); }
});

router.get('/content/new', (req, res) => res.render('guruji/content-form', { item: null }));
router.get('/content/:id/edit', async (req, res, next) => {
  try {
    const item = (await db.query(`SELECT * FROM content WHERE id=$1 AND author_id=$2`, [req.params.id, me(res)])).rows[0];
    if (!item) return res.status(404).render('error', { code: 404, message: 'Content not found.' });
    res.render('guruji/content-form', { item });
  } catch (err) { next(err); }
});

// Blog / announcement / event / image  (video handled below via URL)
router.post('/content/save', uploadImage.single('image'), async (req, res, next) => {
  try {
    const { id, type, title, event_date } = req.body;
    if (!title || !type) { flash(req, 'Type and title are required.'); return res.redirect('/guruji/content/new'); }
    let imageId = req.body.existing_image_id || null;
    if (req.file) imageId = await saveMedia(me(res), 'image', req.file);
    if (id) {
      await db.query(
        `UPDATE content SET type=$1,title=$2,body=$3,event_date=$4,image_id=$5,updated_at=now()
         WHERE id=$6 AND author_id=$7`,
        [type, title, req.body.body || '', event_date || '', imageId, id, me(res)]);
    } else {
      await db.query(
        `INSERT INTO content (author_id,type,title,body,event_date,image_id) VALUES ($1,$2,$3,$4,$5,$6)`,
        [me(res), type, title, req.body.body || '', event_date || '', imageId]);
    }
    flash(req, 'Saved as draft. Publish it when ready.');
    res.redirect('/guruji');
  } catch (err) { next(err); }
});

// Video by link (YouTube/Vimeo) — keeps 5–10 min content without uploading large files
router.post('/content/video', async (req, res, next) => {
  try {
    if (!req.body.video_url) { flash(req, 'Paste a YouTube or Vimeo link (max 10 minutes of content).'); return res.redirect('/guruji/content/new'); }
    await db.query(
      `INSERT INTO content (author_id,type,title,body,video_url) VALUES ($1,'video',$2,$3,$4)`,
      [me(res), req.body.title || 'Untitled video', req.body.body || '', req.body.video_url]);
    flash(req, 'Video saved as draft. Keep clips to 5–10 minutes as per the guidelines.');
    res.redirect('/guruji');
  } catch (err) { next(err); }
});

router.post('/content/:id/publish', async (req, res, next) => {
  try {
    await db.query(`UPDATE content SET status='published', published_at=now(), updated_at=now() WHERE id=$1 AND author_id=$2`, [req.params.id, me(res)]);
    flash(req, 'Published. It is now visible on the public site.');
    res.redirect('/guruji');
  } catch (err) { next(err); }
});
router.post('/content/:id/unpublish', async (req, res, next) => {
  try {
    await db.query(`UPDATE content SET status='draft', updated_at=now() WHERE id=$1 AND author_id=$2`, [req.params.id, me(res)]);
    flash(req, 'Unpublished — back to draft.');
    res.redirect('/guruji');
  } catch (err) { next(err); }
});
router.post('/content/:id/archive', async (req, res, next) => {
  try {
    await db.query(`UPDATE content SET status='archived', updated_at=now() WHERE id=$1 AND author_id=$2`, [req.params.id, me(res)]);
    flash(req, 'Archived.');
    res.redirect('/guruji');
  } catch (err) { next(err); }
});

router.get('/applications', async (req, res, next) => {
  try {
    const apps = (await db.query(
      `SELECT a.*, u.name, u.email, u.bio, u.intention AS aspirant_intention, u.target_date AS aspirant_target
       FROM applications a JOIN users u ON u.id=a.aspirant_id
       WHERE a.guruji_id=$1 ORDER BY CASE a.status WHEN 'pending' THEN 0 ELSE 1 END, a.created_at DESC`, [me(res)])).rows;
    res.render('guruji/applications', { apps });
  } catch (err) { next(err); }
});
router.post('/applications/:id/decide', async (req, res, next) => {
  try {
    const status = req.body.decision === 'accept' ? 'accepted' : 'rejected';
    await db.query(`UPDATE applications SET status=$1, reason=$2, decided_at=now() WHERE id=$3 AND guruji_id=$4`,
      [status, req.body.reason || '', req.params.id, me(res)]);
    flash(req, status === 'accepted' ? 'Aspirant accepted.' : 'Application rejected.');
    res.redirect('/guruji/applications');
  } catch (err) { next(err); }
});

router.get('/questions', async (req, res, next) => {
  try {
    const rows = (await db.query(
      `SELECT q.*, u.name AS aspirant FROM questions q JOIN users u ON u.id=q.aspirant_id
       WHERE q.guruji_id=$1 ORDER BY CASE WHEN q.answer='' THEN 0 ELSE 1 END, q.created_at DESC`, [me(res)])).rows;
    res.render('guruji/questions', { rows });
  } catch (err) { next(err); }
});
router.post('/questions/:id/answer', async (req, res, next) => {
  try {
    await db.query(`UPDATE questions SET answer=$1, answered_at=now() WHERE id=$2 AND guruji_id=$3`,
      [req.body.answer || '', req.params.id, me(res)]);
    flash(req, 'Answer sent.');
    res.redirect('/guruji/questions');
  } catch (err) { next(err); }
});

module.exports = router;
