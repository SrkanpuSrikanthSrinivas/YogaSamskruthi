const router = require('express').Router();
const db = require('../db');
const { requireRole, flash } = require('../helpers');

router.use(requireRole('aspirant'));
const me = (res) => res.locals.user.id;

router.get('/', async (req, res, next) => {
  try {
    const apps = (await db.query(
      `SELECT a.*, u.name AS guruji FROM applications a JOIN users u ON u.id=a.guruji_id
       WHERE a.aspirant_id=$1 ORDER BY a.created_at DESC`, [me(res)])).rows;
    const questions = (await db.query(
      `SELECT q.*, u.name AS guruji FROM questions q JOIN users u ON u.id=q.guruji_id
       WHERE q.aspirant_id=$1 ORDER BY q.created_at DESC`, [me(res)])).rows;
    const guidelines = (await db.query(
      `SELECT * FROM guidelines WHERE status='published' AND audience IN ('aspirant','both') ORDER BY updated_at DESC`)).rows;
    const profile = (await db.query(`SELECT intention, target_date FROM users WHERE id=$1`, [me(res)])).rows[0];
    res.render('aspirant/dashboard', { apps, questions, guidelines, profile });
  } catch (err) { next(err); }
});

router.post('/apply/:gurujiId', async (req, res, next) => {
  try {
    const g = (await db.query(`SELECT id FROM users WHERE id=$1 AND role='guruji' AND status='active'`, [req.params.gurujiId])).rows[0];
    if (!g) { flash(req, 'That Guruji is not available.'); return res.redirect('/gurujis'); }
    const dup = (await db.query(`SELECT id FROM applications WHERE aspirant_id=$1 AND guruji_id=$2 AND status='pending'`, [me(res), g.id])).rows[0];
    if (dup) { flash(req, 'You already have a pending application with this Guruji.'); return res.redirect('/aspirant'); }
    await db.query(`INSERT INTO applications (aspirant_id,guruji_id,intention,target_date) VALUES ($1,$2,$3,$4)`,
      [me(res), g.id, req.body.intention || '', req.body.target_date || '']);
    flash(req, 'Application sent. The Guruji will review your intention and respond.');
    res.redirect('/aspirant');
  } catch (err) { next(err); }
});

router.post('/questions', async (req, res, next) => {
  try {
    const gid = parseInt(req.body.guruji_id, 10);
    const accepted = (await db.query(`SELECT id FROM applications WHERE aspirant_id=$1 AND guruji_id=$2 AND status='accepted'`, [me(res), gid])).rows[0];
    if (!accepted) { flash(req, 'You can ask questions after a Guruji accepts your application.'); return res.redirect('/aspirant'); }
    if (!req.body.question) { flash(req, 'Write your question first.'); return res.redirect('/aspirant'); }
    await db.query(`INSERT INTO questions (aspirant_id,guruji_id,question) VALUES ($1,$2,$3)`, [me(res), gid, req.body.question]);
    flash(req, 'Question sent to the Guruji.');
    res.redirect('/aspirant');
  } catch (err) { next(err); }
});

module.exports = router;
