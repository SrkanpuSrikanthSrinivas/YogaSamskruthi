const router = require('express').Router();
const bcrypt = require('bcryptjs');
const db = require('../db');
const { uploadDocument, flash } = require('../helpers');

router.get('/login', (req, res) => res.render('login'));

router.post('/login', (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE email=?').get((req.body.email || '').trim().toLowerCase());
  if (!u || !bcrypt.compareSync(req.body.password || '', u.password_hash)) {
    flash(req, 'Email or password is incorrect.');
    return res.redirect('/login');
  }
  if (u.status === 'pending') { flash(req, 'Your registration is under review. You will be able to sign in once the admin team verifies it.'); return res.redirect('/login'); }
  if (u.status !== 'active') { flash(req, 'This account is disabled. Contact the admin team.'); return res.redirect('/login'); }
  req.session.userId = u.id;
  res.redirect(u.role === 'admin' ? '/admin' : u.role === 'guruji' ? '/guruji' : '/aspirant');
});

router.post('/logout', (req, res) => req.session.destroy(() => res.redirect('/')));

// Guruji registration — pending until admin background verification
router.get('/register/guruji', (req, res) => res.render('register-guruji'));
router.post('/register/guruji', uploadDocument.single('document'), (req, res) => {
  const { name, email, password, bio, expertise } = req.body;
  if (!name || !email || !password) { flash(req, 'Name, email and password are required.'); return res.redirect('/register/guruji'); }
  try {
    db.prepare(`INSERT INTO users (role,name,email,password_hash,status,bio,expertise,document_path)
      VALUES ('guruji',?,?,?,'pending',?,?,?)`)
      .run(name.trim(), email.trim().toLowerCase(), bcrypt.hashSync(password, 10),
           bio || '', expertise || '', req.file ? '/uploads/documents/' + req.file.filename : '');
    flash(req, 'Registration received. Background verification is done before your account is enabled — you will be able to sign in once approved.');
  } catch (e) { flash(req, 'That email is already registered.'); return res.redirect('/register/guruji'); }
  res.redirect('/login');
});

// Aspirant registration — intention + target date required
router.get('/register/aspirant', (req, res) => res.render('register-aspirant'));
router.post('/register/aspirant', (req, res) => {
  const { name, email, password, intention, target_date } = req.body;
  if (!name || !email || !password || !intention) { flash(req, 'Name, email, password and intention are required.'); return res.redirect('/register/aspirant'); }
  try {
    db.prepare(`INSERT INTO users (role,name,email,password_hash,status,intention,target_date)
      VALUES ('aspirant',?,?,?,'active',?,?)`)
      .run(name.trim(), email.trim().toLowerCase(), bcrypt.hashSync(password, 10), intention, target_date || '');
    flash(req, 'Welcome to Yogasamskruthi. Sign in to browse Gurujis and apply.');
  } catch (e) { flash(req, 'That email is already registered.'); return res.redirect('/register/aspirant'); }
  res.redirect('/login');
});

module.exports = router;
