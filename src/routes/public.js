const router = require('express').Router();
const db = require('../db');

router.get('/', (req, res) => {
  const announcements = db.prepare(`SELECT c.*, u.name author FROM content c JOIN users u ON u.id=c.author_id
    WHERE c.type='announcement' AND c.status='published' ORDER BY c.published_at DESC LIMIT 5`).all();
  const blogs = db.prepare(`SELECT c.*, u.name author FROM content c JOIN users u ON u.id=c.author_id
    WHERE c.type='blog' AND c.status='published' ORDER BY c.published_at DESC LIMIT 6`).all();
  const events = db.prepare(`SELECT c.*, u.name author FROM content c JOIN users u ON u.id=c.author_id
    WHERE c.type='event' AND c.status='published' ORDER BY c.event_date ASC LIMIT 6`).all();
  res.render('home', { announcements, blogs, events });
});

router.get('/gurujis', (req, res) => {
  const gurujis = db.prepare(`SELECT id,name,bio,expertise FROM users WHERE role='guruji' AND status='active' ORDER BY name`).all();
  res.render('gurujis', { gurujis });
});

router.get('/gurujis/:id', (req, res) => {
  const g = db.prepare(`SELECT id,name,bio,expertise,created_at FROM users WHERE id=? AND role='guruji' AND status='active'`).get(req.params.id);
  if (!g) return res.status(404).render('error', { code: 404, message: 'Guruji not found.' });
  const content = db.prepare(`SELECT * FROM content WHERE author_id=? AND status='published' ORDER BY published_at DESC`).all(g.id);
  res.render('guruji-profile', { g, content });
});

router.get('/blog/:id', (req, res) => {
  const post = db.prepare(`SELECT c.*, u.name author FROM content c JOIN users u ON u.id=c.author_id
    WHERE c.id=? AND c.status='published'`).get(req.params.id);
  if (!post) return res.status(404).render('error', { code: 404, message: 'Post not found or not published.' });
  res.render('blog-post', { post });
});

router.get('/guidelines', (req, res) => {
  const rows = db.prepare(`SELECT * FROM guidelines WHERE status='published' ORDER BY audience, updated_at DESC`).all();
  res.render('guidelines', { rows, title: 'Guidelines' });
});

module.exports = router;
