const router = require('express').Router();
const db = require('../db');
const { requireRole, flash } = require('../helpers');

router.use(requireRole('aspirant'));
const me = (res) => res.locals.user.id;

router.get('/', (req, res) => {
  const apps = db.prepare(`SELECT a.*, u.name guruji FROM applications a JOIN users u ON u.id=a.guruji_id
    WHERE a.aspirant_id=? ORDER BY a.created_at DESC`).all(me(res));
  const questions = db.prepare(`SELECT q.*, u.name guruji FROM questions q JOIN users u ON u.id=q.guruji_id
    WHERE q.aspirant_id=? ORDER BY q.created_at DESC`).all(me(res));
  const guidelines = db.prepare(`SELECT * FROM guidelines WHERE status='published' AND audience IN ('aspirant','both') ORDER BY updated_at DESC`).all();
  const profile = db.prepare(`SELECT intention, target_date FROM users WHERE id=?`).get(me(res));
  res.render('aspirant/dashboard', { apps, questions, guidelines, profile });
});

// Apply to a Guruji (from the public profile page)
router.post('/apply/:gurujiId', (req, res) => {
  const g = db.prepare(`SELECT id FROM users WHERE id=? AND role='guruji' AND status='active'`).get(req.params.gurujiId);
  if (!g) { flash(req, 'That Guruji is not available.'); return res.redirect('/gurujis'); }
  const dup = db.prepare(`SELECT id FROM applications WHERE aspirant_id=? AND guruji_id=? AND status='pending'`).get(me(res), g.id);
  if (dup) { flash(req, 'You already have a pending application with this Guruji.'); return res.redirect('/aspirant'); }
  db.prepare(`INSERT INTO applications (aspirant_id,guruji_id,intention,target_date) VALUES (?,?,?,?)`)
    .run(me(res), g.id, req.body.intention || '', req.body.target_date || '');
  flash(req, 'Application sent. The Guruji will review your intention and respond.');
  res.redirect('/aspirant');
});

// Ask a question to a Guruji you've been accepted by
router.post('/questions', (req, res) => {
  const gid = parseInt(req.body.guruji_id, 10);
  const accepted = db.prepare(`SELECT id FROM applications WHERE aspirant_id=? AND guruji_id=? AND status='accepted'`).get(me(res), gid);
  if (!accepted) { flash(req, 'You can ask questions after a Guruji accepts your application.'); return res.redirect('/aspirant'); }
  if (!req.body.question) { flash(req, 'Write your question first.'); return res.redirect('/aspirant'); }
  db.prepare(`INSERT INTO questions (aspirant_id,guruji_id,question) VALUES (?,?,?)`).run(me(res), gid, req.body.question);
  flash(req, 'Question sent to the Guruji.');
  res.redirect('/aspirant');
});

module.exports = router;
