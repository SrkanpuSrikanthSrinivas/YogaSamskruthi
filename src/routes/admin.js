const router = require('express').Router();
const db = require('../db');
const { requireRole, flash } = require('../helpers');

router.use(requireRole('admin'));

router.get('/', (req, res) => {
  const pending = db.prepare(`SELECT COUNT(*) c FROM users WHERE status='pending'`).get().c;
  const totals = db.prepare(`SELECT
    (SELECT COUNT(*) FROM users WHERE role='guruji' AND status='active') gurujis,
    (SELECT COUNT(*) FROM users WHERE role='aspirant' AND status='active') aspirants,
    (SELECT COUNT(*) FROM content WHERE status='published') published`).get();
  const release = db.prepare(`SELECT * FROM releases WHERE status='deployed' ORDER BY deployed_at DESC LIMIT 1`).get();
  res.render('admin/dashboard', { pending, totals, release });
});

// ---- User verification & lifecycle ----
router.get('/users', (req, res) => {
  const users = db.prepare(`SELECT * FROM users WHERE role!='admin'
    ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END, created_at DESC`).all();
  res.render('admin/users', { users });
});
router.post('/users/:id/status', (req, res) => {
  const allowed = ['active', 'rejected', 'disabled'];
  if (!allowed.includes(req.body.status)) { flash(req, 'Invalid status.'); return res.redirect('/admin/users'); }
  db.prepare(`UPDATE users SET status=?, decision_reason=? WHERE id=? AND role!='admin'`)
    .run(req.body.status, req.body.reason || '', req.params.id);
  flash(req, `User ${req.body.status === 'active' ? 'approved and enabled' : req.body.status}.`);
  res.redirect('/admin/users');
});

// ---- Guidelines CMS (versioned, draft -> publish) ----
router.get('/guidelines', (req, res) => {
  const rows = db.prepare(`SELECT * FROM guidelines ORDER BY audience, updated_at DESC`).all();
  res.render('admin/guidelines', { rows, editing: null });
});
router.get('/guidelines/:id/edit', (req, res) => {
  const rows = db.prepare(`SELECT * FROM guidelines ORDER BY audience, updated_at DESC`).all();
  const editing = db.prepare(`SELECT * FROM guidelines WHERE id=?`).get(req.params.id);
  res.render('admin/guidelines', { rows, editing });
});
router.post('/guidelines/save', (req, res) => {
  const { id, audience, title, body } = req.body;
  if (!title || !body) { flash(req, 'Title and body are required.'); return res.redirect('/admin/guidelines'); }
  if (id) {
    db.prepare(`UPDATE guidelines SET audience=?, title=?, body=?, version=version+1, status='draft',
      updated_by=?, updated_at=datetime('now') WHERE id=?`)
      .run(audience, title, body, res.locals.user.id, id);
    flash(req, 'Guideline updated as a new draft version. Publish to make it live.');
  } else {
    db.prepare(`INSERT INTO guidelines (audience,title,body,updated_by) VALUES (?,?,?,?)`)
      .run(audience, title, body, res.locals.user.id);
    flash(req, 'Guideline created as draft.');
  }
  res.redirect('/admin/guidelines');
});
router.post('/guidelines/:id/publish', (req, res) => {
  db.prepare(`UPDATE guidelines SET status='published', updated_at=datetime('now') WHERE id=?`).run(req.params.id);
  flash(req, 'Guideline published — Gurujis and Aspirants now see this version.');
  res.redirect('/admin/guidelines');
});
router.post('/guidelines/:id/unpublish', (req, res) => {
  db.prepare(`UPDATE guidelines SET status='draft', updated_at=datetime('now') WHERE id=?`).run(req.params.id);
  flash(req, 'Guideline unpublished.');
  res.redirect('/admin/guidelines');
});

// ---- Releases: stage and deploy platform versions ----
router.get('/releases', (req, res) => {
  const rows = db.prepare(`SELECT r.*, u.name deployer FROM releases r LEFT JOIN users u ON u.id=r.deployed_by
    ORDER BY r.created_at DESC`).all();
  res.render('admin/releases', { rows });
});
router.post('/releases', (req, res) => {
  if (!req.body.version) { flash(req, 'Version is required (e.g. 1.1.0).'); return res.redirect('/admin/releases'); }
  db.prepare(`INSERT INTO releases (version, notes) VALUES (?,?)`).run(req.body.version, req.body.notes || '');
  flash(req, 'Release staged. Deploy when ready.');
  res.redirect('/admin/releases');
});
router.post('/releases/:id/deploy', (req, res) => {
  db.prepare(`UPDATE releases SET status='deployed', deployed_by=?, deployed_at=datetime('now') WHERE id=?`)
    .run(res.locals.user.id, req.params.id);
  flash(req, 'Release marked deployed. Hook this action to your CI/CD pipeline (e.g. GitLab trigger) for real deployments.');
  res.redirect('/admin/releases');
});
router.post('/releases/:id/rollback', (req, res) => {
  db.prepare(`UPDATE releases SET status='rolled_back' WHERE id=?`).run(req.params.id);
  flash(req, 'Release rolled back.');
  res.redirect('/admin/releases');
});

module.exports = router;
