const express = require('express');
const cookieSession = require('cookie-session');
const path = require('path');
const db = require('./src/db');
const auth = require('./src/auth');
const { embedUrl } = require('./src/helpers');

const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(cookieSession({
  name: 'yoga',
  keys: [process.env.SESSION_SECRET || 'yoga-dev-secret-change-me'],
  maxAge: 7 * 24 * 3600 * 1000, httpOnly: true, sameSite: 'lax',
}));

// Diagnostics (no DB) — confirm the app runs and the database is reachable.
app.get('/healthz', (req, res) => res.type('text').send('ok: app running'));
app.get('/healthz/db', async (req, res) => {
  try { const r = await db.query('SELECT 1 AS ok'); res.type('text').send('ok: db reachable ' + JSON.stringify(r.rows[0])); }
  catch (e) { res.status(500).type('text').send('DB ERROR: ' + (e.message || e)); }
});

// Load the signed-in member for every view.
app.use(async (req, res, next) => {
  try {
    res.locals.me = null;
    if (req.session && req.session.uid) {
      const { rows } = await db.query('SELECT id,role,name,email,status FROM members WHERE id=$1', [req.session.uid]);
      if (rows[0]) res.locals.me = rows[0]; else req.session.uid = null;
    }
    res.locals.flash = req.session && req.session.flash || null;
    if (req.session && req.session.flash) req.session.flash = null;
    res.locals.embedUrl = embedUrl;
    res.locals.fmt = (v, mode) => { if (!v) return ''; const s = v instanceof Date ? v.toISOString().replace('T', ' ') : String(v); return mode === 'datetime' ? s.slice(0, 16) : s.slice(0, 10); };
    next();
  } catch (err) { next(err); }
});

// Serve images / documents stored in the database.
app.get('/media/:id', async (req, res, next) => {
  try {
    const { rows } = await db.query('SELECT mime,bytes FROM media WHERE id=$1', [req.params.id]);
    if (!rows[0]) return res.status(404).send('Not found');
    res.set('Content-Type', rows[0].mime).set('Cache-Control', 'public, max-age=86400').send(Buffer.from(rows[0].bytes));
  } catch (err) { next(err); }
});

auth.mount(app);
app.use('/', require('./src/routes/public'));
app.use('/guruji', require('./src/routes/guruji'));
app.use('/aspirant', require('./src/routes/aspirant'));
app.use('/admin', require('./src/routes/admin'));
app.use('/', require('./src/routes/shared'));

app.use((req, res) => res.status(404).render('error', { code: 404, message: 'Page not found.' }));
app.use((err, req, res, next) => {
  console.error(err);
  const message = (!process.env.DATABASE_URL && process.env.VERCEL)
    ? 'The database is not configured. Set DATABASE_URL in Vercel to your Neon connection string, then redeploy.'
    : (err && err.message) || 'Something went wrong.';
  res.status(500).render('error', { code: 500, message }, (e, html) => e ? res.type('text').send('Error: ' + message) : res.send(html));
});

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  db.init().then(k => app.listen(PORT, () => console.log(`Yogasamskruthi on http://localhost:${PORT} (db: ${k})`)));
}
module.exports = app;
