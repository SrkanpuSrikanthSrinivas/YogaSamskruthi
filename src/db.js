// Database layer for Yogasamskruthi.
// Production: Neon serverless Postgres (set DATABASE_URL).
// Local dev: embedded pglite (real Postgres in WASM, zero setup) at ./.pgdata.
// Both expose the same query(text, params) -> { rows } contract.
const bcrypt = require('bcryptjs');

let _query = null;      // (text, params) => Promise<{ rows }>
let _ready = null;      // promise resolving once schema + seed are done

function backend() {
  if (process.env.DATABASE_URL) {
    const { Pool } = require('@neondatabase/serverless');
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    return {
      kind: 'neon',
      query: (text, params) => pool.query(text, params),
    };
  }
  const { PGlite } = require('@electric-sql/pglite');
  const path = require('path');
  const dir = process.env.VERCEL ? '/tmp/pgdata' : path.join(__dirname, '..', '.pgdata');
  const db = new PGlite(dir);
  return {
    kind: 'pglite',
    query: (text, params) => db.query(text, params || []),
  };
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('admin','guruji','aspirant')),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','rejected','disabled')),
  bio TEXT DEFAULT '',
  expertise TEXT DEFAULT '',
  intention TEXT DEFAULT '',
  target_date TEXT DEFAULT '',
  decision_reason TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS media (
  id SERIAL PRIMARY KEY,
  owner_id INTEGER NOT NULL REFERENCES users(id),
  purpose TEXT NOT NULL CHECK (purpose IN ('image','document')),
  mime TEXT NOT NULL,
  bytes BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS content (
  id SERIAL PRIMARY KEY,
  author_id INTEGER NOT NULL REFERENCES users(id),
  type TEXT NOT NULL CHECK (type IN ('blog','announcement','event','image','video')),
  title TEXT NOT NULL,
  body TEXT DEFAULT '',
  image_id INTEGER REFERENCES media(id),
  video_url TEXT DEFAULT '',
  event_date TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS guidelines (
  id SERIAL PRIMARY KEY,
  audience TEXT NOT NULL CHECK (audience IN ('guruji','aspirant','both')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  updated_by INTEGER REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS applications (
  id SERIAL PRIMARY KEY,
  aspirant_id INTEGER NOT NULL REFERENCES users(id),
  guruji_id INTEGER NOT NULL REFERENCES users(id),
  intention TEXT NOT NULL,
  target_date TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected')),
  reason TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS questions (
  id SERIAL PRIMARY KEY,
  aspirant_id INTEGER NOT NULL REFERENCES users(id),
  guruji_id INTEGER NOT NULL REFERENCES users(id),
  question TEXT NOT NULL,
  answer TEXT DEFAULT '',
  answered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS calls (
  id SERIAL PRIMARY KEY,
  organizer_id INTEGER NOT NULL REFERENCES users(id),
  participant_id INTEGER NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  scheduled_at TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 30,
  meeting_link TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','completed','cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS messages (
  id SERIAL PRIMARY KEY,
  from_id INTEGER NOT NULL REFERENCES users(id),
  to_id INTEGER NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS releases (
  id SERIAL PRIMARY KEY,
  version TEXT NOT NULL,
  notes TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'staged' CHECK (status IN ('staged','deployed','rolled_back')),
  deployed_by INTEGER REFERENCES users(id),
  deployed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
`;

async function seed(q) {
  const { rows } = await q(`SELECT COUNT(*)::int AS c FROM users WHERE role='admin'`);
  if (rows[0].c > 0) return;
  const h = (p) => bcrypt.hashSync(p, 10);
  const ins = async (u) => (await q(
    `INSERT INTO users (role,name,email,password_hash,status,bio,expertise,intention,target_date)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
    [u.role, u.name, u.email, h(u.pw), u.status, u.bio || '', u.expertise || '', u.intention || '', u.target || '']
  )).rows[0].id;

  await ins({ role: 'admin', name: 'Platform Admin', email: 'admin@yogasamskruthi.org', pw: 'admin123', status: 'active' });
  const g1 = await ins({ role: 'guruji', name: 'Guruji Ananda', email: 'ananda@yogasamskruthi.org', pw: 'guruji123', status: 'active',
    bio: 'Three decades of Hatha and Ashtanga practice. Teaches yoga as complete involvement in what we do.', expertise: 'yoga' });
  await ins({ role: 'guruji', name: 'Guruji Bhoomika', email: 'bhoomika@yogasamskruthi.org', pw: 'guruji123', status: 'pending',
    bio: 'Natural farming practitioner — zero-budget methods, soil health, seed saving.', expertise: 'farming' });
  const a1 = await ins({ role: 'aspirant', name: 'Ravi Kumar', email: 'ravi@example.com', pw: 'aspirant123', status: 'active',
    intention: 'Learn pranayama fundamentals and build a daily practice', target: '2026-12-31' });

  const insC = (c) => q(
    `INSERT INTO content (author_id,type,title,body,status,published_at,event_date,video_url)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [g1, c.type, c.title, c.body, c.status, c.status === 'published' ? new Date().toISOString() : null, c.event_date || '', c.video_url || '']);
  await insC({ type: 'announcement', title: 'Welcome to Yogasamskruthi',
    body: 'Yoga means getting completely involved in the activities we do — continuously gaining knowledge and applying it. This platform exists to exchange that knowledge between Gurujis and aspirants.', status: 'published' });
  await insC({ type: 'blog', title: 'Why breath comes before posture',
    body: 'Most beginners chase postures. The breath is the actual teacher. In this first article we look at three simple observations you can make before any asana practice, and why the exhale sets the tempo for everything that follows.', status: 'published' });
  await insC({ type: 'event', title: 'Morning Sadhana — online circle',
    body: 'Open practice circle for accepted aspirants.', status: 'published', event_date: '2026-07-20 06:00' });
  await insC({ type: 'video', title: 'Three-part breath, explained', body: 'A short walkthrough of dirga pranayama.',
    status: 'published', video_url: 'https://www.youtube.com/watch?v=inpok4MKVLM' });
  await insC({ type: 'blog', title: 'Draft: notes on the eight limbs', body: 'Working notes — not ready.', status: 'draft' });

  const insG = (audience, title, body) => q(
    `INSERT INTO guidelines (audience,title,body,status,version) VALUES ($1,$2,$3,'published',1)`, [audience, title, body]);
  await insG('guruji', 'Guruji conduct guidelines',
    '1. Verify your knowledge before teaching it.\n2. Respect the aspirant\u2019s pace and intention.\n3. Keep sessions within scheduled time.\n4. Never request payment outside the platform.\n5. Report concerns to the admin team.');
  await insG('aspirant', 'Aspirant guidelines',
    '1. State your intention honestly when applying.\n2. Attend scheduled calls on time.\n3. Apply what you learn — knowledge grows by practice.\n4. Treat Gurujis and fellow aspirants with respect.');

  await q(`INSERT INTO releases (version,notes,status,deployed_at) VALUES ('1.0.0','Initial platform release','deployed', now())`);
  await q(`INSERT INTO applications (aspirant_id,guruji_id,intention,target_date) VALUES ($1,$2,$3,$4)`,
    [a1, g1, 'Learn pranayama fundamentals and build a daily practice', '2026-12-31']);
}

function init() {
  if (_ready) return _ready;
  _ready = (async () => {
    const b = backend();
    _query = b.query;
    for (const stmt of SCHEMA.split(';').map(s => s.trim()).filter(Boolean)) {
      await _query(stmt);
    }
    await seed(_query);
    return b.kind;
  })();
  return _ready;
}

async function query(text, params) {
  await init();
  return _query(text, params);
}

module.exports = { query, init };
