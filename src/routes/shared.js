const router = require('express').Router();
const db = require('../db');
const { requireAuth, flash, meetingLink } = require('../helpers');

router.use(requireAuth);
const me = (res) => res.locals.user;

async function callableUsers(u) {
  if (u.role === 'admin') {
    return (await db.query(`SELECT id,name,role FROM users WHERE role!='admin' AND status='active' ORDER BY role,name`)).rows;
  }
  if (u.role === 'guruji') {
    const fellows = (await db.query(`SELECT id,name,role FROM users WHERE role='guruji' AND status='active' AND id!=$1`, [u.id])).rows;
    const aspirants = (await db.query(
      `SELECT DISTINCT us.id, us.name, us.role FROM applications a JOIN users us ON us.id=a.aspirant_id
       WHERE a.guruji_id=$1 AND a.status='accepted' AND us.status='active'`, [u.id])).rows;
    return [...fellows, ...aspirants];
  }
  return (await db.query(
    `SELECT DISTINCT us.id, us.name, us.role FROM applications a JOIN users us ON us.id=a.guruji_id
     WHERE a.aspirant_id=$1 AND a.status='accepted' AND us.status='active'`, [u.id])).rows;
}

router.get('/calls', async (req, res, next) => {
  try {
    const u = me(res);
    const calls = (await db.query(
      `SELECT c.*, o.name AS organizer, p.name AS participant FROM calls c
       JOIN users o ON o.id=c.organizer_id JOIN users p ON p.id=c.participant_id
       WHERE c.organizer_id=$1 OR c.participant_id=$1 ORDER BY c.scheduled_at DESC`, [u.id])).rows;
    res.render('calls', { calls, people: await callableUsers(u) });
  } catch (err) { next(err); }
});

router.post('/calls', async (req, res, next) => {
  try {
    const u = me(res);
    const pid = parseInt(req.body.participant_id, 10);
    const allowed = (await callableUsers(u)).some(p => p.id === pid);
    if (!allowed) { flash(req, 'You can only schedule calls with connected members.'); return res.redirect('/calls'); }
    if (!req.body.scheduled_at) { flash(req, 'Pick a date and time.'); return res.redirect('/calls'); }
    await db.query(
      `INSERT INTO calls (organizer_id,participant_id,title,scheduled_at,duration_minutes,meeting_link)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [u.id, pid, req.body.title || 'Knowledge session', req.body.scheduled_at,
       parseInt(req.body.duration_minutes || '30', 10), meetingLink()]);
    flash(req, 'Call scheduled. The meeting link works for both audio and video (Jitsi).');
    res.redirect('/calls');
  } catch (err) { next(err); }
});

router.post('/calls/:id/cancel', async (req, res, next) => {
  try {
    await db.query(`UPDATE calls SET status='cancelled' WHERE id=$1 AND (organizer_id=$2 OR participant_id=$2)`, [req.params.id, me(res).id]);
    flash(req, 'Call cancelled.');
    res.redirect('/calls');
  } catch (err) { next(err); }
});

async function adminThreads(uid) {
  return (await db.query(
    `SELECT us.id, us.name, us.role, MAX(m.created_at) AS last_at
     FROM messages m JOIN users us ON us.id = CASE WHEN m.from_id=$1 THEN m.to_id ELSE m.from_id END
     WHERE m.from_id=$1 OR m.to_id=$1 GROUP BY us.id, us.name, us.role ORDER BY last_at DESC`, [uid])).rows;
}

router.get('/chat', async (req, res, next) => {
  try {
    const u = me(res);
    if (u.role === 'admin') {
      const everyone = (await db.query(`SELECT id,name,role FROM users WHERE role!='admin' AND status='active' ORDER BY role,name`)).rows;
      return res.render('chat', { threads: await adminThreads(u.id), everyone, withUser: null, msgs: [] });
    }
    const admin = (await db.query(`SELECT id FROM users WHERE role='admin' ORDER BY id LIMIT 1`)).rows[0];
    res.redirect('/chat/' + admin.id);
  } catch (err) { next(err); }
});

router.get('/chat/:userId', async (req, res, next) => {
  try {
    const u = me(res);
    const other = (await db.query(`SELECT id,name,role FROM users WHERE id=$1`, [req.params.userId])).rows[0];
    if (!other) return res.status(404).render('error', { code: 404, message: 'User not found.' });
    if (u.role !== 'admin' && other.role !== 'admin')
      return res.status(403).render('error', { code: 403, message: 'Chat is available with the admin team.' });
    const msgs = (await db.query(
      `SELECT m.*, f.name AS from_name FROM messages m JOIN users f ON f.id=m.from_id
       WHERE (m.from_id=$1 AND m.to_id=$2) OR (m.from_id=$2 AND m.to_id=$1) ORDER BY m.created_at`, [u.id, other.id])).rows;
    let threads = [], everyone = [];
    if (u.role === 'admin') {
      threads = await adminThreads(u.id);
      everyone = (await db.query(`SELECT id,name,role FROM users WHERE role!='admin' AND status='active' ORDER BY role,name`)).rows;
    }
    res.render('chat', { threads, everyone, withUser: other, msgs });
  } catch (err) { next(err); }
});

router.post('/chat/:userId', async (req, res, next) => {
  try {
    const u = me(res);
    const other = (await db.query(`SELECT id,role FROM users WHERE id=$1`, [req.params.userId])).rows[0];
    if (!other || (u.role !== 'admin' && other.role !== 'admin'))
      return res.status(403).render('error', { code: 403, message: 'Chat is available with the admin team.' });
    if (req.body.body && req.body.body.trim())
      await db.query(`INSERT INTO messages (from_id,to_id,body) VALUES ($1,$2,$3)`, [u.id, other.id, req.body.body.trim()]);
    res.redirect('/chat/' + other.id);
  } catch (err) { next(err); }
});

module.exports = router;
