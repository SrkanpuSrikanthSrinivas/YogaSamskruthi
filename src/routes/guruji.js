const router = require('express').Router();
const db = require('../db');
const { requireRole } = require('../auth');
const { uploadImage, saveMedia, flash } = require('../helpers');

router.use(requireRole('guruji'));
const meId = (res) => res.locals.me.id;

router.get('/', async (req, res, next) => {
  try {
    const id = meId(res);
    const me = (await db.query(`SELECT * FROM members WHERE id=$1`, [id])).rows[0];
    const posts = (await db.query(`SELECT * FROM posts WHERE author_id=$1 ORDER BY created_at DESC`, [id])).rows;
    const requests = (await db.query(
      `SELECT a.*, m.name, m.intention AS aspirant_intention FROM applications a JOIN members m ON m.id=a.aspirant_id
       WHERE a.guruji_id=$1 ORDER BY CASE a.status WHEN 'pending' THEN 0 ELSE 1 END, a.created_at DESC`, [id])).rows;
    const questions = (await db.query(
      `SELECT q.*, m.name AS aspirant FROM questions q JOIN members m ON m.id=q.aspirant_id
       WHERE q.guruji_id=$1 ORDER BY CASE WHEN q.answer='' THEN 0 ELSE 1 END, q.created_at DESC`, [id])).rows;
    const guides = (await db.query(`SELECT * FROM guidelines WHERE audience IN ('guruji','both') ORDER BY updated_at DESC`)).rows;
    res.render('guruji/dashboard', { me, posts, requests, questions, guides });
  } catch (err) { next(err); }
});

router.post('/posts', uploadImage.single('image'), async (req, res, next) => {
  try {
    const { type, title, body, event_at, video_url, video_minutes } = req.body;
    if (!title || !type) { flash(req, 'Type and title are required.'); return res.redirect('/guruji'); }
    if (type === 'video' && (!video_minutes || video_minutes < 1 || video_minutes > 10)) { flash(req, 'Videos must be 10 minutes or shorter.'); return res.redirect('/guruji'); }
    let imageId = null;
    if (req.file) imageId = await saveMedia(meId(res), 'image', req.file);
    await db.query(
      `INSERT INTO posts (author_id,type,title,body,image_id,video_url,video_minutes,event_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [meId(res), type, title, body || '', imageId, video_url || '', parseInt(video_minutes || '0', 10), event_at || '']);
    flash(req, 'Shared with your aspirants.');
    res.redirect('/guruji');
  } catch (err) { next(err); }
});

router.post('/requests/:id', async (req, res, next) => {
  try {
    const status = req.body.decision === 'accept' ? 'accepted' : 'rejected';
    await db.query(`UPDATE applications SET status=$1, reason=$2, decided_at=now() WHERE id=$3 AND guruji_id=$4`,
      [status, req.body.reason || '', req.params.id, meId(res)]);
    flash(req, status === 'accepted' ? 'Aspirant accepted.' : 'Request rejected.');
    res.redirect('/guruji');
  } catch (err) { next(err); }
});

router.post('/questions/:id', async (req, res, next) => {
  try {
    await db.query(`UPDATE questions SET answer=$1, answered_at=now() WHERE id=$2 AND guruji_id=$3`,
      [req.body.answer || '', req.params.id, meId(res)]);
    flash(req, 'Answer sent.');
    res.redirect('/guruji');
  } catch (err) { next(err); }
});

module.exports = router;
