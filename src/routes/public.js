const router = require('express').Router();
const db = require('../db');

router.get('/', async (req, res, next) => {
  try {
    const announcements = (await db.query(
      `SELECT c.*, u.name AS author FROM content c JOIN users u ON u.id=c.author_id
       WHERE c.type='announcement' AND c.status='published' ORDER BY c.published_at DESC LIMIT 5`)).rows;
    const blogs = (await db.query(
      `SELECT c.*, u.name AS author FROM content c JOIN users u ON u.id=c.author_id
       WHERE c.type='blog' AND c.status='published' ORDER BY c.published_at DESC LIMIT 6`)).rows;
    const events = (await db.query(
      `SELECT c.*, u.name AS author FROM content c JOIN users u ON u.id=c.author_id
       WHERE c.type='event' AND c.status='published' ORDER BY c.event_date ASC LIMIT 6`)).rows;
    res.render('home', { announcements, blogs, events });
  } catch (err) { next(err); }
});

router.get('/gurujis', async (req, res, next) => {
  try {
    const gurujis = (await db.query(
      `SELECT id,name,bio,expertise FROM users WHERE role='guruji' AND status='active' ORDER BY name`)).rows;
    res.render('gurujis', { gurujis });
  } catch (err) { next(err); }
});

router.get('/gurujis/:id', async (req, res, next) => {
  try {
    const g = (await db.query(
      `SELECT id,name,bio,expertise,created_at FROM users WHERE id=$1 AND role='guruji' AND status='active'`,
      [req.params.id])).rows[0];
    if (!g) return res.status(404).render('error', { code: 404, message: 'Guruji not found.' });
    const content = (await db.query(
      `SELECT * FROM content WHERE author_id=$1 AND status='published' ORDER BY published_at DESC`, [g.id])).rows;
    res.render('guruji-profile', { g, content });
  } catch (err) { next(err); }
});

router.get('/blog/:id', async (req, res, next) => {
  try {
    const post = (await db.query(
      `SELECT c.*, u.name AS author FROM content c JOIN users u ON u.id=c.author_id
       WHERE c.id=$1 AND c.status='published'`, [req.params.id])).rows[0];
    if (!post) return res.status(404).render('error', { code: 404, message: 'Post not found or not published.' });
    res.render('blog-post', { post });
  } catch (err) { next(err); }
});

router.get('/guidelines', async (req, res, next) => {
  try {
    const rows = (await db.query(
      `SELECT * FROM guidelines WHERE status='published' ORDER BY audience, updated_at DESC`)).rows;
    res.render('guidelines', { rows });
  } catch (err) { next(err); }
});

module.exports = router;
