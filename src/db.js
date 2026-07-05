// Database layer — uses Node 22+ built-in node:sqlite (zero native deps).
// Migration path to Neon/Postgres: schema below is ANSI-friendly; swap this
// module for a pg pool and keep the same query surface.
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = process.env.DB_PATH
  || (process.env.VERCEL ? '/tmp/yogasamskruthi.db' : path.join(__dirname, '..', 'yogasamskruthi.db'));
const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode = WAL;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  role TEXT NOT NULL CHECK(role IN ('admin','guruji','aspirant')),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','active','rejected','disabled')),
  bio TEXT DEFAULT '',
  expertise TEXT DEFAULT '',          -- guruji: yoga | farming | entrepreneurship (comma-sep)
  intention TEXT DEFAULT '',          -- aspirant: why they registered
  target_date TEXT DEFAULT '',        -- aspirant: goal date
  document_path TEXT DEFAULT '',      -- guruji: verification document
  decision_reason TEXT DEFAULT '',    -- admin note on approve/reject/disable
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS content (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  author_id INTEGER NOT NULL REFERENCES users(id),
  type TEXT NOT NULL CHECK(type IN ('blog','announcement','event','image','video')),
  title TEXT NOT NULL,
  body TEXT DEFAULT '',
  media_path TEXT DEFAULT '',
  event_date TEXT DEFAULT '',         -- for calendar events
  duration_seconds INTEGER DEFAULT 0, -- for videos (max 600)
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','archived')),
  published_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS guidelines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  audience TEXT NOT NULL CHECK(audience IN ('guruji','aspirant','both')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published')),
  updated_by INTEGER REFERENCES users(id),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  aspirant_id INTEGER NOT NULL REFERENCES users(id),
  guruji_id INTEGER NOT NULL REFERENCES users(id),
  intention TEXT NOT NULL,
  target_date TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','rejected')),
  reason TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  decided_at TEXT
);

CREATE TABLE IF NOT EXISTS questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  aspirant_id INTEGER NOT NULL REFERENCES users(id),
  guruji_id INTEGER NOT NULL REFERENCES users(id),
  question TEXT NOT NULL,
  answer TEXT DEFAULT '',
  answered_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS calls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organizer_id INTEGER NOT NULL REFERENCES users(id),
  participant_id INTEGER NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  scheduled_at TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 30,
  meeting_link TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled','completed','cancelled')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_id INTEGER NOT NULL REFERENCES users(id),
  to_id INTEGER NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS releases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  version TEXT NOT NULL,
  notes TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'staged' CHECK(status IN ('staged','deployed','rolled_back')),
  deployed_by INTEGER REFERENCES users(id),
  deployed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

// ---- Seed (idempotent) ----
const hasAdmin = db.prepare(`SELECT COUNT(*) c FROM users WHERE role='admin'`).get().c;
if (!hasAdmin) {
  const hash = (p) => bcrypt.hashSync(p, 10);
  const insUser = db.prepare(`INSERT INTO users (role,name,email,password_hash,status,bio,expertise,intention,target_date)
    VALUES (?,?,?,?,?,?,?,?,?)`);
  insUser.run('admin', 'Platform Admin', 'admin@yogasamskruthi.org', hash('admin123'), 'active', '', '', '', '');
  const g1 = insUser.run('guruji', 'Guruji Ananda', 'ananda@yogasamskruthi.org', hash('guruji123'), 'active',
    'Three decades of Hatha and Ashtanga practice. Teaches yoga as complete involvement in what we do.', 'yoga', '', '').lastInsertRowid;
  insUser.run('guruji', 'Guruji Bhoomika', 'bhoomika@yogasamskruthi.org', hash('guruji123'), 'pending',
    'Natural farming practitioner — zero-budget methods, soil health, seed saving.', 'farming', '', '');
  const a1 = insUser.run('aspirant', 'Ravi Kumar', 'ravi@example.com', hash('aspirant123'), 'active',
    '', '', 'Learn pranayama fundamentals and build a daily practice', '2026-12-31').lastInsertRowid;

  const insContent = db.prepare(`INSERT INTO content (author_id,type,title,body,status,published_at,event_date)
    VALUES (?,?,?,?,?,?,?)`);
  insContent.run(g1, 'announcement', 'Welcome to Yogasamskruthi',
    'Yoga means getting completely involved in the activities we do — continuously gaining knowledge and applying it. This platform exists to exchange that knowledge between Gurujis and aspirants.', 'published', new Date().toISOString(), '');
  insContent.run(g1, 'blog', 'Why breath comes before posture',
    'Most beginners chase postures. The breath is the actual teacher. In this first article we look at three simple observations you can make before any asana practice...', 'published', new Date().toISOString(), '');
  insContent.run(g1, 'event', 'Morning Sadhana — online circle', 'Open practice circle for accepted aspirants.', 'published', new Date().toISOString(), '2026-07-20 06:00');
  insContent.run(g1, 'blog', 'Draft: notes on the eight limbs', 'Working notes — not ready.', 'draft', null, '');

  const insGuide = db.prepare(`INSERT INTO guidelines (audience,title,body,version,status,updated_by) VALUES (?,?,?,?,?,1)`);
  insGuide.run('guruji', 'Guruji conduct guidelines',
    '1. Verify your knowledge before teaching it.\n2. Respect the aspirant\u2019s pace and intention.\n3. Keep sessions within scheduled time.\n4. Never request payment outside the platform.\n5. Report concerns to the admin team.', 1, 'published');
  insGuide.run('aspirant', 'Aspirant guidelines',
    '1. State your intention honestly when applying.\n2. Attend scheduled calls on time.\n3. Apply what you learn — knowledge grows by practice.\n4. Treat Gurujis and fellow aspirants with respect.', 1, 'published');

  db.prepare(`INSERT INTO releases (version,notes,status,deployed_at) VALUES ('1.0.0','Initial platform release',
    'deployed', datetime('now'))`).run();

  db.prepare(`INSERT INTO applications (aspirant_id,guruji_id,intention,target_date) VALUES (?,?,?,?)`)
    .run(a1, g1, 'Learn pranayama fundamentals and build a daily practice', '2026-12-31');
}

module.exports = db;
