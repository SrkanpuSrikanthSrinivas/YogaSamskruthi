const router = require('express').Router();
const db = require('../db');
const { requireRole } = require('../auth');
const { flash } = require('../helpers');

router.use(requireRole('aspirant'));
const meId = (res) => res.locals.me.id;

router.get('/', async (req, res, next) => {
  try {
    const id = meId(res);
    const me = (await db.query(`SELECT * FROM members WHERE id=$1`, [id])).rows[0];
    const gurus = (await db.query(`SELECT id,name,expertise,bio FROM members WHERE role='guruji' AND status='active' ORDER BY name`)).rows;
    const apps = (await db.query(
      `SELECT a.*, m.name AS guruji FROM applications a JOIN members m ON m.id=a.guruji_id
       WHERE a.aspirant_id=$1 ORDER BY a.created_at DESC`, [id])).rows;
    const accepted = apps.filter(a => a.status === 'accepted');
    const questions = (await db.query(
      `SELECT q.*, m.name AS guruji FROM questions q JOIN members m ON m.id=q.guruji_id
       WHERE q.aspirant_id=$1 ORDER BY q.created_at DESC`, [id])).rows;
    const guides = (await db.query(`SELECT * FROM guidelines WHERE audience IN ('aspirant','both') ORDER BY updated_at DESC`)).rows;
    res.render('aspirant/dashboard', { me, gurus, apps, accepted, questions, guides });
  } catch (err) { next(err); }
});

router.post('/intention', async (req, res, next) => {
  try {
    await db.query(`UPDATE members SET intention=$1, target_date=$2 WHERE id=$3`,
      [req.body.intention || '', req.body.target_date || '', meId(res)]);
    flash(req, 'Your intention is updated.');
    res.redirect('/aspirant');
  } catch (err) { next(err); }
});

router.post('/apply/:gurujiId', async (req, res, next) => {
  try {
    const g = (await db.query(`SELECT id FROM members WHERE id=$1 AND role='guruji' AND status='active'`, [req.params.gurujiId])).rows[0];
    if (!g) { flash(req, 'That Guruji is not available.'); return res.redirect('/aspirant'); }
    const dup = (await db.query(`SELECT id FROM applications WHERE aspirant_id=$1 AND guruji_id=$2 AND status='pending'`, [meId(res), g.id])).rows[0];
    if (dup) { flash(req, 'You already have a pending application with this Guruji.'); return res.redirect('/aspirant'); }
    await db.query(`INSERT INTO applications (aspirant_id,guruji_id,intention,target_date) VALUES ($1,$2,$3,$4)`,
      [meId(res), g.id, req.body.intention || '', req.body.target_date || '']);
    flash(req, 'Application sent. The Guruji will review your intention and respond.');
    res.redirect('/aspirant');
  } catch (err) { next(err); }
});

router.post('/ask', async (req, res, next) => {
  try {
    const gid = parseInt(req.body.guruji_id, 10);
    const ok = (await db.query(`SELECT id FROM applications WHERE aspirant_id=$1 AND guruji_id=$2 AND status='accepted'`, [meId(res), gid])).rows[0];
    if (!ok) { flash(req, 'You can ask questions once a Guruji accepts you.'); return res.redirect('/aspirant'); }
    if (!req.body.question) { flash(req, 'Write your question first.'); return res.redirect('/aspirant'); }
    await db.query(`INSERT INTO questions (aspirant_id,guruji_id,question) VALUES ($1,$2,$3)`, [meId(res), gid, req.body.question]);
    flash(req, 'Question sent to the Guruji.');
    res.redirect('/aspirant');
  } catch (err) { next(err); }
});

module.exports = router;
