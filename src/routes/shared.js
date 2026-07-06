const router = require('express').Router();
const db = require('../db');
const { requireAuth } = require('../auth');
const { flash, meetingLink } = require('../helpers');

router.use(requireAuth);
const me = (res) => res.locals.me;

async function callable(u) {
  if (u.role === 'admin')
    return (await db.query(`SELECT id,name,role FROM members WHERE role!='admin' AND status='active' ORDER BY role,name`)).rows;
  if (u.role === 'guruji') {
    const fellows = (await db.query(`SELECT id,name,role FROM members WHERE role='guruji' AND status='active' AND id!=$1`, [u.id])).rows;
    const asp = (await db.query(`SELECT DISTINCT m.id,m.name,m.role FROM applications a JOIN members m ON m.id=a.aspirant_id WHERE a.guruji_id=$1 AND a.status='accepted' AND m.status='active'`, [u.id])).rows;
    return [...fellows, ...asp];
  }
  return (await db.query(`SELECT DISTINCT m.id,m.name,m.role FROM applications a JOIN members m ON m.id=a.guruji_id WHERE a.aspirant_id=$1 AND a.status='accepted' AND m.status='active'`, [u.id])).rows;
}

router.get('/calls', async (req, res, next) => {
  try {
    const u = me(res);
    const calls = (await db.query(
      `SELECT c.*, o.name AS organizer, p.name AS participant FROM calls c
       JOIN members o ON o.id=c.organizer_id JOIN members p ON p.id=c.participant_id
       WHERE c.organizer_id=$1 OR c.participant_id=$1 ORDER BY c.scheduled_at DESC`, [u.id])).rows;
    res.render('calls', { calls, people: await callable(u) });
  } catch (err) { next(err); }
});

router.post('/calls', async (req, res, next) => {
  try {
    const u = me(res);
    const pid = parseInt(req.body.participant_id, 10);
    if (!(await callable(u)).some(p => p.id === pid)) { flash(req, 'You can only meet connected members.'); return res.redirect('/calls'); }
    if (!req.body.scheduled_at) { flash(req, 'Pick a date and time.'); return res.redirect('/calls'); }
    await db.query(`INSERT INTO calls (organizer_id,participant_id,title,scheduled_at,minutes,link) VALUES ($1,$2,$3,$4,$5,$6)`,
      [u.id, pid, req.body.title || 'Knowledge session', req.body.scheduled_at, parseInt(req.body.minutes || '30', 10), meetingLink()]);
    flash(req, 'Session scheduled — the link works for audio and video.');
    res.redirect('/calls');
  } catch (err) { next(err); }
});

router.post('/calls/:id/cancel', async (req, res, next) => {
  try { await db.query(`UPDATE calls SET status='cancelled' WHERE id=$1 AND (organizer_id=$2 OR participant_id=$2)`, [req.params.id, me(res).id]); flash(req, 'Session cancelled.'); res.redirect('/calls'); }
  catch (err) { next(err); }
});

// Support chat: members talk to the admin team; admin sees all threads.
async function adminThreads(uid) {
  return (await db.query(
    `SELECT mm.id, mm.name, mm.role, MAX(x.created_at) AS last_at
     FROM messages x JOIN members mm ON mm.id = CASE WHEN x.from_id=$1 THEN x.to_id ELSE x.from_id END
     WHERE x.from_id=$1 OR x.to_id=$1 GROUP BY mm.id,mm.name,mm.role ORDER BY last_at DESC`, [uid])).rows;
}

router.get('/chat', async (req, res, next) => {
  try {
    const u = me(res);
    if (u.role === 'admin') {
      const everyone = (await db.query(`SELECT id,name,role FROM members WHERE role!='admin' AND status='active' ORDER BY role,name`)).rows;
      return res.render('chat', { threads: await adminThreads(u.id), everyone, withUser: null, msgs: [] });
    }
    const admin = (await db.query(`SELECT id FROM members WHERE role='admin' ORDER BY id LIMIT 1`)).rows[0];
    res.redirect('/chat/' + admin.id);
  } catch (err) { next(err); }
});

router.get('/chat/:userId', async (req, res, next) => {
  try {
    const u = me(res);
    const other = (await db.query(`SELECT id,name,role FROM members WHERE id=$1`, [req.params.userId])).rows[0];
    if (!other) return res.status(404).render('error', { code: 404, message: 'Member not found.' });
    if (u.role !== 'admin' && other.role !== 'admin') return res.status(403).render('error', { code: 403, message: 'Chat is with the admin team.' });
    const msgs = (await db.query(
      `SELECT x.*, f.name AS from_name FROM messages x JOIN members f ON f.id=x.from_id
       WHERE (x.from_id=$1 AND x.to_id=$2) OR (x.from_id=$2 AND x.to_id=$1) ORDER BY x.created_at`, [u.id, other.id])).rows;
    let threads = [], everyone = [];
    if (u.role === 'admin') {
      threads = await adminThreads(u.id);
      everyone = (await db.query(`SELECT id,name,role FROM members WHERE role!='admin' AND status='active' ORDER BY role,name`)).rows;
    }
    res.render('chat', { threads, everyone, withUser: other, msgs });
  } catch (err) { next(err); }
});

router.post('/chat/:userId', async (req, res, next) => {
  try {
    const u = me(res);
    const other = (await db.query(`SELECT id,role FROM members WHERE id=$1`, [req.params.userId])).rows[0];
    if (!other || (u.role !== 'admin' && other.role !== 'admin')) return res.status(403).render('error', { code: 403, message: 'Chat is with the admin team.' });
    if (req.body.body && req.body.body.trim()) await db.query(`INSERT INTO messages (from_id,to_id,body) VALUES ($1,$2,$3)`, [u.id, other.id, req.body.body.trim()]);
    res.redirect('/chat/' + other.id);
  } catch (err) { next(err); }
});

module.exports = router;
