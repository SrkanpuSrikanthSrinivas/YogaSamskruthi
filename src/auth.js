// ============================================================================
// Login module — registration, sign-in, sign-out, and access control.
//
// Who can sign in, and how their account starts:
//   Aspirant  — self-registers, active immediately, can sign in right away.
//   Guruji    — registers via "Teach as a Guruji", starts PENDING. An admin
//               runs background verification and approves before they sign in.
//   Admin     — seeded; maintains everyone.
// Passwords are bcrypt-hashed. The session stores only the member id, signed
// in a cookie (works on serverless — nothing to keep server-side).
// ============================================================================
const bcrypt = require('bcryptjs');
const db = require('./db');
const { uploadDocument, saveMedia, flash } = require('./helpers');

function mount(app) {
  // ---- Sign in ----
  app.get('/login', (req, res) => res.render('auth/login'));

  app.post('/login', async (req, res, next) => {
    try {
      const email = (req.body.email || '').trim().toLowerCase();
      const m = (await db.query('SELECT * FROM members WHERE email=$1', [email])).rows[0];
      if (!m || !bcrypt.compareSync(req.body.password || '', m.password_hash)) {
        flash(req, 'Email or password is incorrect.');
        return res.redirect('/login');
      }
      if (m.status === 'pending') { flash(req, 'Your Guruji registration is still being verified. You can sign in once the admin approves it.'); return res.redirect('/login'); }
      if (m.status === 'rejected') { flash(req, 'This registration was not approved. Contact the admin team for details.'); return res.redirect('/login'); }
      if (m.status === 'disabled') { flash(req, 'This account has been disabled. Contact the admin team.'); return res.redirect('/login'); }
      req.session.uid = m.id;
      res.redirect('/' + m.role); // /admin, /guruji, /aspirant
    } catch (err) { next(err); }
  });

  app.post('/logout', (req, res) => { req.session = null; res.redirect('/'); });

  // ---- Join as an Aspirant (active immediately) ----
  app.get('/join', (req, res) => res.render('auth/join-aspirant'));
  app.post('/join', async (req, res, next) => {
    try {
      const { name, email, password, intention, target_date } = req.body;
      if (!name || !email || !password || !intention)
        return fail(req, res, '/join', 'Name, email, password and intention are all needed.');
      if (await emailTaken(email)) return fail(req, res, '/join', 'That email is already registered.');
      const id = (await db.query(
        `INSERT INTO members (role,name,email,password_hash,status,intention,target_date)
         VALUES ('aspirant',$1,$2,$3,'active',$4,$5) RETURNING id`,
        [name.trim(), email.trim().toLowerCase(), bcrypt.hashSync(password, 10), intention, target_date || ''])).rows[0].id;
      req.session.uid = id;
      flash(req, 'Welcome to Yogasamskruthi.');
      res.redirect('/aspirant');
    } catch (err) { next(err); }
  });

  // ---- Teach as a Guruji (pending until admin verifies) ----
  app.get('/teach', (req, res) => res.render('auth/join-guruji'));
  app.post('/teach', uploadDocument.single('document'), async (req, res, next) => {
    try {
      const { name, email, password, expertise, bio } = req.body;
      if (!name || !email || !password)
        return fail(req, res, '/teach', 'Name, email and password are all needed.');
      if (await emailTaken(email)) return fail(req, res, '/teach', 'That email is already registered.');
      const id = (await db.query(
        `INSERT INTO members (role,name,email,password_hash,status,expertise,bio)
         VALUES ('guruji',$1,$2,$3,'pending',$4,$5) RETURNING id`,
        [name.trim(), email.trim().toLowerCase(), bcrypt.hashSync(password, 10), expertise || 'yoga', bio || ''])).rows[0].id;
      if (req.file) {
        const docId = await saveMedia(id, 'document', req.file);
        await db.query('UPDATE members SET document_id=$1 WHERE id=$2', [docId, id]);
      }
      flash(req, 'Registration received. Background verification happens before your account is enabled — you can sign in once an admin approves it.');
      res.redirect('/login');
    } catch (err) { next(err); }
  });
}

async function emailTaken(email) {
  return !!(await db.query('SELECT id FROM members WHERE email=$1', [email.trim().toLowerCase()])).rows[0];
}
function fail(req, res, to, msg) { flash(req, msg); return res.redirect(to); }

// ---- Access control middleware ----
function requireAuth(req, res, next) {
  if (!req.session || !req.session.uid) return res.redirect('/login');
  next();
}
function requireRole(role) {
  return (req, res, next) => {
    const u = res.locals.me;
    if (!u) return res.redirect('/login');
    if (u.role !== role) return res.status(403).render('error', { code: 403, message: 'This area is for ' + role + ' accounts.' });
    if (u.status !== 'active') return res.status(403).render('error', { code: 403, message: 'Your account is not active yet.' });
    next();
  };
}

module.exports = { mount, requireAuth, requireRole };
