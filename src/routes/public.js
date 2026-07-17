const router = require('express').Router();
const db = require('../db');

router.get('/', async (req, res, next) => {
  try {
    const gurus = (await db.query(`SELECT id,name,expertise,bio FROM members WHERE role='guruji' AND status='active' ORDER BY name`)).rows;
    const guides = (await db.query(`SELECT * FROM guidelines ORDER BY audience`)).rows;
    res.render('public/home', { gurus, guides });
  } catch (err) { next(err); }
});

router.get('/gurujis/:id', async (req, res, next) => {
  try {
    const g = (await db.query(`SELECT id,name,expertise,bio FROM members WHERE id=$1 AND role='guruji' AND status='active'`, [req.params.id])).rows[0];
    if (!g) return res.status(404).render('error', { code: 404, message: 'Guruji not found.' });
    const posts = (await db.query(`SELECT * FROM posts WHERE author_id=$1 ORDER BY created_at DESC`, [g.id])).rows;
    res.render('public/guruji', { g, posts });
  } catch (err) { next(err); }
});

router.get('/blog/:id', async (req, res, next) => {
  try {
    const post = (await db.query(`SELECT p.*, m.name AS author FROM posts p JOIN members m ON m.id=p.author_id WHERE p.id=$1`, [req.params.id])).rows[0];
    if (!post) return res.status(404).render('error', { code: 404, message: 'Post not found.' });
    res.render('public/blog', { post });
  } catch (err) { next(err); }
});

router.get('/guidelines', async (req, res, next) => {
  try {
    const guides = (await db.query(`SELECT * FROM guidelines ORDER BY audience`)).rows;
    res.render('public/guidelines', { guides });
  } catch (err) { next(err); }
});

// Informational content sections carried over from the old site.
router.get('/learn/:slug', async (req, res, next) => {
  try {
    const page = (await db.query(`SELECT * FROM pages WHERE slug=$1 AND published=true`, [req.params.slug])).rows[0];
    if (!page) return res.status(404).render('error', { code: 404, message: 'Page not found.' });
    res.render('public/page', { page });
  } catch (err) { next(err); }
});

module.exports = router;
