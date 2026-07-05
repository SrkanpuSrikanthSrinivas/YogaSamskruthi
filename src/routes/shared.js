const router = require('express').Router();
const db = require('../db');
const { requireAuth, flash, meetingLink } = require('../helpers');

router.use(requireAuth);
const me = (res) => res.locals.user;

// Who can this user schedule a call with?
function callableUsers(u) {
  if (u.role === 'admin') {
    return db.prepare(`SELECT id,name,role FROM users WHERE role!='admin' AND status='active' ORDER BY role,name`).all();
  }
  if (u.role === 'guruji') {
    const fellows = db.prepare(`SELECT id,name,role FROM users WHERE role='guruji' AND status='active' AND id!=?`).all(u.id);
    const aspirants = db.prepare(`SELECT DISTINCT us.id, us.name, us.role FROM applications a
      JOIN users us ON us.id=a.aspirant_id WHERE a.guruji_id=? AND a.status='accepted' AND us.status='active'`).all(u.id);
    return [...fellows, ...aspirants];
  }
  // aspirant: gurujis who accepted them
  return db.prepare(`SELECT DISTINCT us.id, us.name, us.role FROM applications a
    JOIN users us ON us.id=a.guruji_id WHERE a.aspirant_id=? AND a.status='accepted' AND us.status='active'`).all(u.id);
}

router.get('/calls', (req, res) => {
  const u = me(res);
  const calls = db.prepare(`SELECT c.*, o.name organizer, p.name participant FROM calls c
    JOIN users o ON o.id=c.organizer_id JOIN users p ON p.id=c.participant_id
    WHERE c.organizer_id=? OR c.participant_id=? ORDER BY c.scheduled_at DESC`).all(u.id, u.id);
  res.render('calls', { calls, people: callableUsers(u) });
});

router.post('/calls', (req, res) => {
  const u = me(res);
  const pid = parseInt(req.body.participant_id, 10);
  const allowed = callableUsers(u).some(p => p.id === pid);
  if (!allowed) { flash(req, 'You can only schedule calls with connected members.'); return res.redirect('/calls'); }
  if (!req.body.scheduled_at) { flash(req, 'Pick a date and time.'); return res.redirect('/calls'); }
  db.prepare(`INSERT INTO calls (organizer_id,participant_id,title,scheduled_at,duration_minutes,meeting_link)
    VALUES (?,?,?,?,?,?)`)
    .run(u.id, pid, req.body.title || 'Knowledge session', req.body.scheduled_at,
         parseInt(req.body.duration_minutes || '30', 10), meetingLink());
  flash(req, 'Call scheduled. The meeting link works for both audio and video (Jitsi).');
  res.redirect('/calls');
});

router.post('/calls/:id/cancel', (req, res) => {
  db.prepare(`UPDATE calls SET status='cancelled' WHERE id=? AND (organizer_id=? OR participant_id=?)`)
    .run(req.params.id, me(res).id, me(res).id);
  flash(req, 'Call cancelled.');
  res.redirect('/calls');
});

// ---- Chat: admin <-> members (support & instructions) ----
router.get('/chat', (req, res) => {
  const u = me(res);
  if (u.role === 'admin') {
    const threads = db.prepare(`SELECT us.id, us.name, us.role, MAX(m.created_at) last_at
      FROM messages m JOIN users us ON us.id = CASE WHEN m.from_id=? THEN m.to_id ELSE m.from_id END
      WHERE m.from_id=? OR m.to_id=? GROUP BY us.id ORDER BY last_at DESC`).all(u.id, u.id, u.id);
    const everyone = db.prepare(`SELECT id,name,role FROM users WHERE role!='admin' AND status='active' ORDER BY role,name`).all();
    return res.render('chat', { threads, everyone, withUser: null, msgs: [] });
  }
  // members always chat with the admin team (first admin account)
  const admin = db.prepare(`SELECT id,name FROM users WHERE role='admin' ORDER BY id LIMIT 1`).get();
  return res.redirect('/chat/' + admin.id);
});

router.get('/chat/:userId', (req, res) => {
  const u = me(res);
  const other = db.prepare(`SELECT id,name,role FROM users WHERE id=?`).get(req.params.userId);
  if (!other) return res.status(404).render('error', { code: 404, message: 'User not found.' });
  if (u.role !== 'admin' && other.role !== 'admin')
    return res.status(403).render('error', { code: 403, message: 'Chat is available with the admin team.' });
  const msgs = db.prepare(`SELECT m.*, f.name from_name FROM messages m JOIN users f ON f.id=m.from_id
    WHERE (m.from_id=? AND m.to_id=?) OR (m.from_id=? AND m.to_id=?) ORDER BY m.created_at`).all(u.id, other.id, other.id, u.id);
  let threads = [], everyone = [];
  if (u.role === 'admin') {
    threads = db.prepare(`SELECT us.id, us.name, us.role, MAX(m.created_at) last_at
      FROM messages m JOIN users us ON us.id = CASE WHEN m.from_id=? THEN m.to_id ELSE m.from_id END
      WHERE m.from_id=? OR m.to_id=? GROUP BY us.id ORDER BY last_at DESC`).all(u.id, u.id, u.id);
    everyone = db.prepare(`SELECT id,name,role FROM users WHERE role!='admin' AND status='active' ORDER BY role,name`).all();
  }
  res.render('chat', { threads, everyone, withUser: other, msgs });
});

router.post('/chat/:userId', (req, res) => {
  const u = me(res);
  const other = db.prepare(`SELECT id,role FROM users WHERE id=?`).get(req.params.userId);
  if (!other || (u.role !== 'admin' && other.role !== 'admin'))
    return res.status(403).render('error', { code: 403, message: 'Chat is available with the admin team.' });
  if (req.body.body && req.body.body.trim())
    db.prepare(`INSERT INTO messages (from_id,to_id,body) VALUES (?,?,?)`).run(u.id, other.id, req.body.body.trim());
  res.redirect('/chat/' + other.id);
});

module.exports = router;
