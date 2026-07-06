const express = require('express');
const cookieSession = require('cookie-session');
const path = require('path');
const db = require('./src/db');
const { embedUrl } = require('./src/helpers');

const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(cookieSession({
  name: 'yoga_sess',
  keys: [process.env.SESSION_SECRET || 'yogasamskruthi-dev-secret-change-me'],
  maxAge: 7 * 24 * 60 * 60 * 1000,
  httpOnly: true,
  sameSite: 'lax',
}));

// Make templates aware of the current user and one-shot flash messages.
app.use(async (req, res, next) => {
  try {
    if (req.session && req.session.userId) {
      const { rows } = await db.query(
        'SELECT id, role, name, email, status FROM users WHERE id=$1', [req.session.userId]);
      res.locals.user = rows[0] || null;
      if (!rows[0]) req.session.userId = null;
    } else {
      res.locals.user = null;
    }
    res.locals.flash = req.session.flash || null;
    if (req.session.flash) req.session.flash = null;
    res.locals.embedUrl = embedUrl;
    // Postgres returns timestamps as Date objects; format safely for either type.
    res.locals.fmt = (v, mode) => {
      if (!v) return '';
      const s = v instanceof Date ? v.toISOString().replace('T', ' ') : String(v);
      return mode === 'datetime' ? s.slice(0, 16) : s.slice(0, 10);
    };
    next();
  } catch (err) { next(err); }
});

// Serve images/documents stored in Postgres.
app.get('/media/:id', async (req, res, next) => {
  try {
    const { rows } = await db.query('SELECT mime, bytes FROM media WHERE id=$1', [req.params.id]);
    if (!rows[0]) return res.status(404).send('Not found');
    res.set('Content-Type', rows[0].mime);
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(Buffer.from(rows[0].bytes));
  } catch (err) { next(err); }
});

app.use('/', require('./src/routes/public'));
app.use('/', require('./src/routes/auth'));
app.use('/guruji', require('./src/routes/guruji'));
app.use('/aspirant', require('./src/routes/aspirant'));
app.use('/admin', require('./src/routes/admin'));
app.use('/', require('./src/routes/shared'));

app.use((req, res) => res.status(404).render('error', { code: 404, message: 'Page not found.' }));
app.use((err, req, res, next) => {
  console.error(err);
  // Missing database configuration is the most common deploy-time failure — say so clearly.
  if (!process.env.DATABASE_URL && process.env.VERCEL) {
    return res.status(500).render('error', {
      code: 500,
      message: 'The database is not configured. Set the DATABASE_URL environment variable in your Vercel project to your Neon connection string, then redeploy.',
    });
  }
  res.status(500).render('error', { code: 500, message: err.message || 'Something went wrong.' });
});

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  db.init().then((kind) => {
    app.listen(PORT, () => console.log(`Yogasamskruthi running at http://localhost:${PORT} (db: ${kind})`));
  });
}

module.exports = app;
