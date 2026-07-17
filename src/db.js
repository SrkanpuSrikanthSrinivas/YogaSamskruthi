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

-- Informational content sections carried over from the old site
-- (YogaAsana, Pranayama, Ayurveda, Trekking, etc). Admin-editable.
CREATE TABLE IF NOT EXISTS pages (
  id SERIAL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  intro TEXT DEFAULT '',
  body TEXT DEFAULT '',
  sort INTEGER NOT NULL DEFAULT 0,
  published BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
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

  // ----- Real people from yogasamskruthi.org -----
  await add({ role: 'admin', name: 'Yogasamskruthi Admin', email: 'yoga.samskruthi@gmail.com', pw: 'admin123', status: 'active' });
  const mani = await add({ role: 'guruji', name: 'Mani Narayan Guruji', email: 'mani@yogasamskruthi.org', pw: 'guruji123', status: 'active', expertise: 'yoga',
    bio: 'Practicing yoga since 1988 (36+ years) and teaching since 1998 (26+ years). Never sold yoga — considers teaching it a service to the Almighty. Specialised in Yoga Asanas, Pranayama, and Meditation techniques derived from Himalayan traditions, guiding aspirants toward their spiritual goals.' });
  const manjunath = await add({ role: 'guruji', name: 'Manjunath M (Trek Leader)', email: 'manjunath@yogasamskruthi.org', pw: 'guruji123', status: 'active', expertise: 'yoga',
    bio: 'Has planned and led treks since childhood across much of India, especially the Himalayan regions. Very active in social work, an inspiration to the community, and does 108 Surya Namaskar every weekend. An advocate by profession.' });
  const ravi = await add({ role: 'aspirant', name: 'Ravi Kumar', email: 'ravi@yogasamskruthi.org', pw: 'aspirant123', status: 'active', intention: 'Build a steady daily pranayama practice and understand the breath.', target: '2026-12-31' });

  // Guru Narasimhamurthy — honoured as an inactive memorial profile (1934–2016)
  const post = (a, p) => q(`INSERT INTO posts (author_id,type,title,body,event_at,video_minutes) VALUES ($1,$2,$3,$4,$5,$6)`,
    [a, p.type, p.title, p.body, p.event_at || '', p.minutes || 0]);
  await post(mani, { type: 'announcement', title: 'Welcome to Yogasamskruthi',
    body: 'Yoga has become an indivisible part of our life with the grace of Guru. This platform is dedicated to our Guru with all respect and devotion. We share the knowledge of Yoga and Trekking activities — may it serve interested friends. Celebrate the practice and experience the bliss in every moment.' });
  await post(mani, { type: 'blog', title: 'Yoga Guru Narasimhamurthy (1934–2016)',
    body: 'Sri A. S. Narasimha Murthy Guruji was a realised yogi. Though he lived a family life, through his penance he attained a very high position in Astanga yoga. He had the blessings of Lord Shiva and was trained by veteran Himalayan yogis. He lived a high-order yogic life and gained many siddhis, but seldom exhibited them, living a simple and innocent life. He never "sold" yoga, considering yoga teaching a service to the Almighty, and taught over 25,000 students across India under the banner of Acharya Sri Adi Shankara Yoga Kendra — helping them with their physical, mental, and spiritual well-being. We are blessed to have been guided by such a great master, and it is our earnest endeavour to preserve his teachings and walk the path he directed.' });

  const guide = (audience, title, body) => q(`INSERT INTO guidelines (audience,title,body) VALUES ($1,$2,$3)`, [audience, title, body]);
  await guide('guruji', 'Guruji conduct guidelines', "1. Verify your knowledge before teaching it.\n2. Respect the aspirant's pace and intention.\n3. Keep sessions within scheduled time.\n4. Never sell yoga — teach it as a service.\n5. Report concerns to the admin team.");
  await guide('aspirant', 'Aspirant guidelines', "1. State your intention honestly.\n2. Attend scheduled sessions on time.\n3. Apply what you learn — knowledge grows by practice.\n4. Treat Gurujis and fellow aspirants with respect.");

  await q(`INSERT INTO applications (aspirant_id,guruji_id,intention,target_date) VALUES ($1,$2,$3,$4)`,
    [ravi, mani, 'Build a steady daily pranayama practice and understand the breath.', '2026-12-31']);
  await q(`INSERT INTO releases (version,notes,status) VALUES ('1.0.0','Migrated from the Google Sites yogasamskruthi.org','deployed')`);

  // ----- Informational pages carried over from the old site -----
  const page = (slug, title, intro, body, sort, published = true) =>
    q(`INSERT INTO pages (slug,title,intro,body,sort,published) VALUES ($1,$2,$3,$4,$5,$6)`, [slug, title, intro, body, sort, published]);

  await page('yogaasana', 'YogaAsana', 'Physical postures — the third limb of Ashtanga Yoga.',
    'Asana practice brings steadiness, reduced illness, and lightness of limb. When the posture becomes steady and comfortable, the practitioner is prepared for pranayama and the deeper limbs of yoga.\n\n(Content to be added — the original page material can be pasted here from the admin panel.)', 1);
  await page('pranayama', 'Pranayama', 'Expansion and control of the life force (prana) through the breath.',
    'Pranayama is the practice of working with the breath to expand and steady the life force. Practised purposefully, it prepares the mind and body for meditation.\n\n(Content to be added from the admin panel.)', 2);
  await page('dhyanam', 'Dhyanam', 'Meditation — the seventh limb of Ashtanga Yoga.',
    'Dhyana is a refined, deeper concentration of the mind, taken up after mastering asana, pranayama, pratyahara, and dharana. It leads the practitioner toward stillness and clarity.\n\n(Content to be added from the admin panel.)', 3);
  await page('mudra-vignanam', 'Mudra-Vignanam', 'The science of mudras — gestures that direct energy in practice.',
    'Mudras are subtle gestures and locks used alongside asana and pranayama to direct the flow of energy within the body.\n\n(Content to be added from the admin panel.)', 4);
  await page('trekking', 'Trekking', 'Prakruthi pravaasa — journeying through nature as practice.',
    'Trekking and hiking (Prakruthi pravaasa) keep the body fit and the mind calm, and have long been part of this community — with treks across much of India, especially the Himalayan regions, led by Manjunath M.\n\n(Trek details and photos to be added from the admin panel.)', 5);
  await page('ayurveda', 'Ayurveda',
    'Shared by Yoga Vismaya Trust (Anantji), yogavismaya.org. Disclaimer: please follow the below at your own risk — we are not responsible for any side effects or for not following the process correctly.',
    [
      'Dosha by age:',
      '• Childhood (up to 14 years): most health problems are due to Kapha.',
      '• Adult (14–60 years): most health problems are due to Pitta.',
      '• Senior citizens (above 60 years): most health problems are due to Vata.',
      '',
      'To reduce tension at home:',
      '1. Go for a morning or evening walk together.',
      '2. Eat food sitting on the ground (helps trigger the muladhara chakra).',
      '3. Always speak with sweet words and love.',
      '4. If a mistake has happened, take ownership without a second thought and resolve the issue.',
      '5. Let the kitchen become the home of medicines.',
      '',
      'To avoid health issues:',
      '1. Replace plastic utensils with mud-pot, iron, or good-quality steel.',
      '2. Use steel or glass water bottles instead of plastic.',
      '3. Replace non-stick tava with iron tava (helps reduce iron deficiency).',
      '4. Use coconut oil or sesame oil (ellu-enne) instead of low-quality refined oils.',
      '5. Use millets instead of polished rice or low-quality packaged wheat.',
      '',
      'Constipation: take 50 ml pure coconut oil with warm water at night before sleep.',
      '',
      'Acidity (caused by Pitta): avoid green chillies; avoid sleeping and waking late; drink water immediately on waking; avoid coffee, tea and sugar; avoid packaged foods and plastic; avoid excess worry, anger, jealousy and sadness; use warm (not hot) water for bathing.',
      '',
      'Asthma: take Tulsi–Pudina kashaya; or powder 2–3 doddapathre leaves + 2 spoons pure honey + 1/4 spoon cooking turmeric + 5 black pepper + 5 lavanga and take morning and evening.',
      '',
      'Note: this is a summary of guidance shared with the community. For the full detail and corrections, contact yoga.samskruthi@gmail.com.',
    ].join('\n'), 6);
  await page('blogs', 'Blogs', 'Writings and reflections from the community.',
    'Blog posts shared by our Gurujis appear across the platform. More long-form writing will be collected here.\n\n(Content to be added from the admin panel.)', 7);
  await page('pravachanas', 'Pravachanas', 'Discourses and talks.',
    'Recorded discourses and spiritual talks.\n\n(Links and recordings to be added from the admin panel.)', 8);
  await page('advisory-services', 'Advisory Services', 'Guidance and advisory offered by the community.',
    'Advisory services offered to aspirants and the wider community.\n\n(Details to be added from the admin panel.)', 9);
  await page('gallery', 'Gallery', 'Photos from practice, treks, and gatherings.',
    'A gallery of images from our sessions, treks, and events.\n\n(Photos to be uploaded from the admin panel — image uploads are supported.)', 10);
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
