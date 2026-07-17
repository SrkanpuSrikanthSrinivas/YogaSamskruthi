const router = require('express').Router();
const db = require('../db');
const { requireRole } = require('../auth');
const { flash } = require('../helpers');

router.use(requireRole('admin'));

router.get('/', async (req, res, next) => {
  try {
    const members = (await db.query(
      `SELECT * FROM members WHERE role!='admin'
       ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END, created_at DESC`)).rows;
    const guides = (await db.query(`SELECT * FROM guidelines ORDER BY audience, updated_at DESC`)).rows;
    const releases = (await db.query(`SELECT * FROM releases ORDER BY created_at DESC`)).rows;
    const pages = (await db.query(`SELECT * FROM pages ORDER BY sort`)).rows;
    const pending = members.filter(m => m.status === 'pending').length;
    res.render('admin/dashboard', { members, guides, releases, pages, pending });
  } catch (err) { next(err); }
});

// Approve / reject / disable a member
router.post('/members/:id', async (req, res, next) => {
  try {
    const allowed = ['active', 'rejected', 'disabled'];
    if (!allowed.includes(req.body.status)) { flash(req, 'Invalid status.'); return res.redirect('/admin'); }
    await db.query(`UPDATE members SET status=$1, admin_note=$2 WHERE id=$3 AND role!='admin'`,
      [req.body.status, req.body.note || '', req.params.id]);
    flash(req, req.body.status === 'active' ? 'Member approved and enabled.' : 'Member ' + req.body.status + '.');
    res.redirect('/admin');
  } catch (err) { next(err); }
});

// Guidelines maintained by admin
router.post('/guidelines', async (req, res, next) => {
  try {
    const { id, audience, title, body } = req.body;
    if (!title || !body) { flash(req, 'Title and body are required.'); return res.redirect('/admin'); }
    if (id) await db.query(`UPDATE guidelines SET audience=$1,title=$2,body=$3,updated_by=$4,updated_at=now() WHERE id=$5`,
      [audience, title, body, res.locals.me.id, id]);
    else await db.query(`INSERT INTO guidelines (audience,title,body,updated_by) VALUES ($1,$2,$3,$4)`,
      [audience, title, body, res.locals.me.id]);
    flash(req, 'Guidelines saved.');
    res.redirect('/admin');
  } catch (err) { next(err); }
});

// Informational pages (YogaAsana, Pranayama, Ayurveda, etc.)
router.post('/pages/:id', async (req, res, next) => {
  try {
    await db.query(`UPDATE pages SET title=$1,intro=$2,body=$3,published=$4,updated_at=now() WHERE id=$5`,
      [req.body.title, req.body.intro || '', req.body.body || '', req.body.published === 'on', req.params.id]);
    flash(req, 'Page “' + req.body.title + '” updated.');
    res.redirect('/admin#pages');
  } catch (err) { next(err); }
});

// Releases
router.post('/releases', async (req, res, next) => {
  try {
    if (!req.body.version) { flash(req, 'Version is required.'); return res.redirect('/admin'); }
    await db.query(`INSERT INTO releases (version,notes,status) VALUES ($1,$2,'deployed')`, [req.body.version, req.body.notes || '']);
    flash(req, 'Release v' + req.body.version + ' deployed.');
    res.redirect('/admin');
  } catch (err) { next(err); }
});

module.exports = router;
