const router = require('express').Router();
const db = require('../db');
const { requireRole, flash } = require('../helpers');

router.use(requireRole('admin'));

router.get('/', async (req, res, next) => {
  try {
    const pending = (await db.query(`SELECT COUNT(*)::int AS c FROM users WHERE status='pending'`)).rows[0].c;
    const totals = (await db.query(`SELECT
      (SELECT COUNT(*)::int FROM users WHERE role='guruji' AND status='active') AS gurujis,
      (SELECT COUNT(*)::int FROM users WHERE role='aspirant' AND status='active') AS aspirants,
      (SELECT COUNT(*)::int FROM content WHERE status='published') AS published`)).rows[0];
    const release = (await db.query(`SELECT * FROM releases WHERE status='deployed' ORDER BY deployed_at DESC LIMIT 1`)).rows[0];
    res.render('admin/dashboard', { pending, totals, release });
  } catch (err) { next(err); }
});

router.get('/users', async (req, res, next) => {
  try {
    const users = (await db.query(
      `SELECT u.*, m.id AS document_id FROM users u
       LEFT JOIN LATERAL (SELECT id FROM media WHERE owner_id=u.id AND purpose='document' ORDER BY id DESC LIMIT 1) m ON true
       WHERE u.role!='admin'
       ORDER BY CASE u.status WHEN 'pending' THEN 0 ELSE 1 END, u.created_at DESC`)).rows;
    res.render('admin/users', { users });
  } catch (err) { next(err); }
});
router.post('/users/:id/status', async (req, res, next) => {
  try {
    const allowed = ['active', 'rejected', 'disabled'];
    if (!allowed.includes(req.body.status)) { flash(req, 'Invalid status.'); return res.redirect('/admin/users'); }
    await db.query(`UPDATE users SET status=$1, decision_reason=$2 WHERE id=$3 AND role!='admin'`,
      [req.body.status, req.body.reason || '', req.params.id]);
    flash(req, `User ${req.body.status === 'active' ? 'approved and enabled' : req.body.status}.`);
    res.redirect('/admin/users');
  } catch (err) { next(err); }
});

router.get('/guidelines', async (req, res, next) => {
  try {
    const rows = (await db.query(`SELECT * FROM guidelines ORDER BY audience, updated_at DESC`)).rows;
    res.render('admin/guidelines', { rows, editing: null });
  } catch (err) { next(err); }
});
router.get('/guidelines/:id/edit', async (req, res, next) => {
  try {
    const rows = (await db.query(`SELECT * FROM guidelines ORDER BY audience, updated_at DESC`)).rows;
    const editing = (await db.query(`SELECT * FROM guidelines WHERE id=$1`, [req.params.id])).rows[0];
    res.render('admin/guidelines', { rows, editing });
  } catch (err) { next(err); }
});
router.post('/guidelines/save', async (req, res, next) => {
  try {
    const { id, audience, title, body } = req.body;
    if (!title || !body) { flash(req, 'Title and body are required.'); return res.redirect('/admin/guidelines'); }
    if (id) {
      await db.query(
        `UPDATE guidelines SET audience=$1, title=$2, body=$3, version=version+1, status='draft', updated_by=$4, updated_at=now() WHERE id=$5`,
        [audience, title, body, res.locals.user.id, id]);
      flash(req, 'Guideline updated as a new draft version. Publish to make it live.');
    } else {
      await db.query(`INSERT INTO guidelines (audience,title,body,updated_by) VALUES ($1,$2,$3,$4)`,
        [audience, title, body, res.locals.user.id]);
      flash(req, 'Guideline created as draft.');
    }
    res.redirect('/admin/guidelines');
  } catch (err) { next(err); }
});
router.post('/guidelines/:id/publish', async (req, res, next) => {
  try {
    await db.query(`UPDATE guidelines SET status='published', updated_at=now() WHERE id=$1`, [req.params.id]);
    flash(req, 'Guideline published — Gurujis and Aspirants now see this version.');
    res.redirect('/admin/guidelines');
  } catch (err) { next(err); }
});
router.post('/guidelines/:id/unpublish', async (req, res, next) => {
  try {
    await db.query(`UPDATE guidelines SET status='draft', updated_at=now() WHERE id=$1`, [req.params.id]);
    flash(req, 'Guideline unpublished.');
    res.redirect('/admin/guidelines');
  } catch (err) { next(err); }
});

router.get('/releases', async (req, res, next) => {
  try {
    const rows = (await db.query(
      `SELECT r.*, u.name AS deployer FROM releases r LEFT JOIN users u ON u.id=r.deployed_by ORDER BY r.created_at DESC`)).rows;
    res.render('admin/releases', { rows });
  } catch (err) { next(err); }
});
router.post('/releases', async (req, res, next) => {
  try {
    if (!req.body.version) { flash(req, 'Version is required (e.g. 1.1.0).'); return res.redirect('/admin/releases'); }
    await db.query(`INSERT INTO releases (version, notes) VALUES ($1,$2)`, [req.body.version, req.body.notes || '']);
    flash(req, 'Release staged. Deploy when ready.');
    res.redirect('/admin/releases');
  } catch (err) { next(err); }
});
router.post('/releases/:id/deploy', async (req, res, next) => {
  try {
    await db.query(`UPDATE releases SET status='deployed', deployed_by=$1, deployed_at=now() WHERE id=$2`, [res.locals.user.id, req.params.id]);
    flash(req, 'Release marked deployed. Hook this action to your CI/CD pipeline for real deployments.');
    res.redirect('/admin/releases');
  } catch (err) { next(err); }
});
router.post('/releases/:id/rollback', async (req, res, next) => {
  try {
    await db.query(`UPDATE releases SET status='rolled_back' WHERE id=$1`, [req.params.id]);
    flash(req, 'Release rolled back.');
    res.redirect('/admin/releases');
  } catch (err) { next(err); }
});

module.exports = router;
