const router = require('express').Router();
const bcrypt = require('bcryptjs');
const db = require('../db');
const { uploadDocument, saveMedia, flash } = require('../helpers');

router.get('/login', (req, res) => res.render('login'));

router.post('/login', async (req, res, next) => {
  try {
    const u = (await db.query('SELECT * FROM users WHERE email=$1',
      [(req.body.email || '').trim().toLowerCase()])).rows[0];
    if (!u || !bcrypt.compareSync(req.body.password || '', u.password_hash)) {
      flash(req, 'Email or password is incorrect.');
      return res.redirect('/login');
    }
    if (u.status === 'pending') { flash(req, 'Your registration is under review. You can sign in once the admin team verifies it.'); return res.redirect('/login'); }
    if (u.status !== 'active') { flash(req, 'This account is disabled. Contact the admin team.'); return res.redirect('/login'); }
    req.session.userId = u.id;
    res.redirect(u.role === 'admin' ? '/admin' : u.role === 'guruji' ? '/guruji' : '/aspirant');
  } catch (err) { next(err); }
});

router.post('/logout', (req, res) => { req.session = null; res.redirect('/'); });

router.get('/register/guruji', (req, res) => res.render('register-guruji'));
router.post('/register/guruji', uploadDocument.single('document'), async (req, res, next) => {
  try {
    const { name, email, password, bio, expertise } = req.body;
    if (!name || !email || !password) { flash(req, 'Name, email and password are required.'); return res.redirect('/register/guruji'); }
    const exists = (await db.query('SELECT id FROM users WHERE email=$1', [email.trim().toLowerCase()])).rows[0];
    if (exists) { flash(req, 'That email is already registered.'); return res.redirect('/register/guruji'); }
    const { rows } = await db.query(
      `INSERT INTO users (role,name,email,password_hash,status,bio,expertise)
       VALUES ('guruji',$1,$2,$3,'pending',$4,$5) RETURNING id`,
      [name.trim(), email.trim().toLowerCase(), bcrypt.hashSync(password, 10), bio || '', expertise || '']);
    if (req.file) await saveMedia(rows[0].id, 'document', req.file);
    flash(req, 'Registration received. Background verification is done before your account is enabled — you can sign in once approved.');
    res.redirect('/login');
  } catch (err) { next(err); }
});

router.get('/register/aspirant', (req, res) => res.render('register-aspirant'));
router.post('/register/aspirant', async (req, res, next) => {
  try {
    const { name, email, password, intention, target_date } = req.body;
    if (!name || !email || !password || !intention) { flash(req, 'Name, email, password and intention are required.'); return res.redirect('/register/aspirant'); }
    const exists = (await db.query('SELECT id FROM users WHERE email=$1', [email.trim().toLowerCase()])).rows[0];
    if (exists) { flash(req, 'That email is already registered.'); return res.redirect('/register/aspirant'); }
    await db.query(
      `INSERT INTO users (role,name,email,password_hash,status,intention,target_date)
       VALUES ('aspirant',$1,$2,$3,'active',$4,$5)`,
      [name.trim(), email.trim().toLowerCase(), bcrypt.hashSync(password, 10), intention, target_date || '']);
    flash(req, 'Welcome to Yogasamskruthi. Sign in to browse Gurujis and apply.');
    res.redirect('/login');
  } catch (err) { next(err); }
});

module.exports = router;
