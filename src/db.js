// ============================================================================
// Yogasamskruthi — database layer
// Production: Neon serverless Postgres (set DATABASE_URL).
// Local dev:  embedded pglite (real Postgres, no install) at ./.pgdata.
// Same query(text, params) -> { rows } contract for both.
// ============================================================================
const bcrypt = require('bcryptjs');

let _query = null;
let _ready = null;

function backend() {
  if (process.env.DATABASE_URL) {
    const { neon } = require('@neondatabase/serverless');
    const sql = neon(process.env.DATABASE_URL);
    return {
      kind: 'neon',
      query: async (text, params) => {
        const r = await sql.query(text, params || []);
        return Array.isArray(r) ? { rows: r } : r;
      },
    };
  }
  const { PGlite } = require('@electric-sql/pglite');
  const path = require('path');
  const dir = process.env.VERCEL ? '/tmp/pgdata' : path.join(__dirname, '..', '.pgdata');
  const db = new PGlite(dir);
  return { kind: 'pglite', query: (text, params) => db.query(text, params || []) };
}

// ---- Schema -----------------------------------------------------------------
// members ...... every person: admin, guruji, aspirant. Holds login + profile.
// media ........ uploaded images / verification documents, stored as bytes.
// posts ........ what a guruji shares: image, blog, announcement, event, video.
// guidelines ... admin-maintained guidance shown to gurujis and/or aspirants.
// applications . an aspirant requesting to learn from a guruji.
// questions .... aspirant asks, guruji answers.
// calls ........ scheduled audio/video sessions between two members.
// messages ..... support chat between admin and a member.
// releases ..... admin-tracked software versions.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS members (
  id SERIAL PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('admin','guruji','aspirant')),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','rejected','disabled')),
  expertise TEXT DEFAULT '',        -- guruji: yoga | farming | entrepreneurship
  bio TEXT DEFAULT '',
  intention TEXT DEFAULT '',        -- aspirant: why they joined
  target_date TEXT DEFAULT '',      -- aspirant: goal date
  document_id INTEGER,              -- guruji: verification document (media.id)
  admin_note TEXT DEFAULT '',       -- admin's reason on approve/reject/disable
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS media (
  id SERIAL PRIMARY KEY,
  owner_id INTEGER NOT NULL REFERENCES members(id),
  purpose TEXT NOT NULL CHECK (purpose IN ('image','document')),
  mime TEXT NOT NULL,
  bytes BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS posts (
  id SERIAL PRIMARY KEY,
  author_id INTEGER NOT NULL REFERENCES members(id),
  type TEXT NOT NULL CHECK (type IN ('image','blog','announcement','event','video')),
  title TEXT NOT NULL,
  body TEXT DEFAULT '',
  image_id INTEGER REFERENCES media(id),
  video_url TEXT DEFAULT '',
  video_minutes INTEGER DEFAULT 0,
  event_at TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS guidelines (
  id SERIAL PRIMARY KEY,
  audience TEXT NOT NULL CHECK (audience IN ('guruji','aspirant','both')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  updated_by INTEGER REFERENCES members(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS applications (
  id SERIAL PRIMARY KEY,
  aspirant_id INTEGER NOT NULL REFERENCES members(id),
  guruji_id INTEGER NOT NULL REFERENCES members(id),
  intention TEXT NOT NULL,
  target_date TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected')),
  reason TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS questions (
  id SERIAL PRIMARY KEY,
  aspirant_id INTEGER NOT NULL REFERENCES members(id),
  guruji_id INTEGER NOT NULL REFERENCES members(id),
  question TEXT NOT NULL,
  answer TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  answered_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS calls (
  id SERIAL PRIMARY KEY,
  organizer_id INTEGER NOT NULL REFERENCES members(id),
  participant_id INTEGER NOT NULL REFERENCES members(id),
  title TEXT NOT NULL,
  scheduled_at TEXT NOT NULL,
  minutes INTEGER NOT NULL DEFAULT 30,
  link TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS messages (
  id SERIAL PRIMARY KEY,
  from_id INTEGER NOT NULL REFERENCES members(id),
  to_id INTEGER NOT NULL REFERENCES members(id),
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS releases (
  id SERIAL PRIMARY KEY,
  version TEXT NOT NULL,
  notes TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'staged' CHECK (status IN ('staged','deployed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
`;

async function seed(q) {
  const { rows } = await q(`SELECT COUNT(*)::int AS c FROM members WHERE role='admin'`);
  if (rows[0].c > 0) return;
  const h = (p) => bcrypt.hashSync(p, 10);
  const add = async (m) => (await q(
    `INSERT INTO members (role,name,email,password_hash,status,expertise,bio,intention,target_date)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
    [m.role, m.name, m.email, h(m.pw), m.status, m.expertise || '', m.bio || '', m.intention || '', m.target || '']
  )).rows[0].id;

  await add({ role: 'admin', name: 'Platform Admin', email: 'admin@yoga.org', pw: 'admin123', status: 'active' });
  const ananda = await add({ role: 'guruji', name: 'Guruji Ananda', email: 'ananda@yoga.org', pw: 'guruji123', status: 'active', expertise: 'yoga', bio: 'Three decades of Hatha and Ashtanga. Teaches yoga as complete involvement in what we do.' });
  const bhoomika = await add({ role: 'guruji', name: 'Guruji Bhoomika', email: 'bhoomika@yoga.org', pw: 'guruji123', status: 'active', expertise: 'farming', bio: 'Natural, zero-budget farming — soil health, seed saving, water wisdom.' });
  await add({ role: 'guruji', name: 'Guruji Chetan', email: 'chetan@yoga.org', pw: 'guruji123', status: 'pending', expertise: 'entrepreneurship', bio: 'Bootstrapped three village enterprises. Mentors first-time founders.' });
  const ravi = await add({ role: 'aspirant', name: 'Ravi Kumar', email: 'ravi@yoga.org', pw: 'aspirant123', status: 'active', intention: 'Build a steady daily pranayama practice and understand the breath.', target: '2026-12-31' });
  const meera = await add({ role: 'aspirant', name: 'Meera S', email: 'meera@yoga.org', pw: 'aspirant123', status: 'active', intention: 'Start a small terrace kitchen-garden using natural methods.', target: '2026-09-30' });

  const post = (a, p) => q(`INSERT INTO posts (author_id,type,title,body,event_at,video_minutes) VALUES ($1,$2,$3,$4,$5,$6)`,
    [a, p.type, p.title, p.body, p.event_at || '', p.minutes || 0]);
  await post(ananda, { type: 'announcement', title: 'Welcome to Yogasamskruthi', body: 'Yoga means complete involvement in what we do — gaining knowledge and applying it. This is a place to exchange that.' });
  await post(ananda, { type: 'blog', title: 'Why breath comes before posture', body: 'Most beginners chase postures. The breath is the real teacher. Three observations to make before any asana.' });
  await post(ananda, { type: 'event', title: 'Morning Sadhana — online circle', body: 'Open practice circle for accepted aspirants.', event_at: '2026-07-20 06:00' });
  await post(ananda, { type: 'video', title: 'Three-part breath, explained', body: 'A short walkthrough of dirga pranayama.', minutes: 7 });
  await post(bhoomika, { type: 'blog', title: 'Reading your soil by hand', body: 'Before any seed, learn what your soil is telling you through texture, smell, and colour.' });

  const guide = (audience, title, body) => q(`INSERT INTO guidelines (audience,title,body) VALUES ($1,$2,$3)`, [audience, title, body]);
  await guide('guruji', 'Guruji conduct guidelines', "1. Verify your knowledge before teaching it.\n2. Respect the aspirant's pace and intention.\n3. Keep sessions within scheduled time.\n4. Never request payment outside the platform.\n5. Report concerns to the admin team.");
  await guide('aspirant', 'Aspirant guidelines', "1. State your intention honestly.\n2. Attend scheduled sessions on time.\n3. Apply what you learn — knowledge grows by practice.\n4. Treat Gurujis and fellow aspirants with respect.");

  await q(`INSERT INTO applications (aspirant_id,guruji_id,intention,target_date) VALUES ($1,$2,$3,$4)`,
    [ravi, ananda, 'Build a steady daily pranayama practice and understand the breath.', '2026-12-31']);
  await q(`INSERT INTO applications (aspirant_id,guruji_id,intention,target_date,status,reason,decided_at) VALUES ($1,$2,$3,$4,'accepted',$5,now())`,
    [meera, bhoomika, 'Start a small terrace kitchen-garden using natural methods.', '2026-09-30', 'Glad to guide you — start this season.']);
  await q(`INSERT INTO questions (aspirant_id,guruji_id,question) VALUES ($1,$2,$3)`,
    [meera, bhoomika, 'How often should I water raised beds in summer?']);
  await q(`INSERT INTO messages (from_id,to_id,body) VALUES ($1,$2,$3)`, [ravi, 1, 'Namaste — how do I change my target date?']);
  await q(`INSERT INTO messages (from_id,to_id,body) VALUES ($1,$2,$3)`, [1, ravi, 'Welcome Ravi! You can update it any time from your dashboard.']);
  await q(`INSERT INTO releases (version,notes,status) VALUES ('1.0.0','Initial platform release','deployed')`);
}

function init() {
  if (_ready) return _ready;
  _ready = (async () => {
    const b = backend();
    _query = b.query;
    for (const stmt of SCHEMA.split(';').map(s => s.trim()).filter(Boolean)) await _query(stmt);
    try { await seed(_query); }
    catch (e) { if (!/duplicate key|unique/i.test(e.message || '')) throw e; }
    return b.kind;
  })();
  return _ready;
}

async function query(text, params) { await init(); return _query(text, params); }

module.exports = { query, init };
