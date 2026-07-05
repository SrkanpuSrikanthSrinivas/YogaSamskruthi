const express = require('express');
const session = require('express-session');
const path = require('path');
const db = require('./src/db');

const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
const uploadsRoot = process.env.VERCEL ? '/tmp/uploads' : path.join(__dirname, 'uploads');
app.use('/uploads', express.static(uploadsRoot));
app.use(session({
  secret: process.env.SESSION_SECRET || 'yogasamskruthi-dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax' }
}));

// expose current user + flash to all views
app.use((req, res, next) => {
  res.locals.user = req.session.userId
    ? db.prepare('SELECT id,role,name,email,status FROM users WHERE id=?').get(req.session.userId)
    : null;
  res.locals.flash = req.session.flash || null;
  delete req.session.flash;
  next();
});

app.use('/', require('./src/routes/public'));
app.use('/', require('./src/routes/auth'));
app.use('/guruji', require('./src/routes/guruji'));
app.use('/aspirant', require('./src/routes/aspirant'));
app.use('/admin', require('./src/routes/admin'));
app.use('/', require('./src/routes/shared')); // calls + chat, all roles

app.use((req, res) => res.status(404).render('error', { code: 404, message: 'Page not found.' }));
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render('error', { code: 500, message: err.message || 'Something went wrong.' });
});

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`Yogasamskruthi running at http://localhost:${PORT}`));
}
module.exports = app;
