# Yogasamskruthi — Knowledge Exchange Platform

A place where **Gurujis** teach and **aspirants** learn, across yoga, natural farming, and entrepreneurship — with a real login system and everything saved to a database that the **admin** maintains.

**Stack:** Node.js + Express + EJS · **Neon Postgres** (all data) · runs on Vercel or any Node host.

---

## Run it now (no setup)

```bash
npm install
npm start          # http://localhost:3000
```

With no database configured, it uses a built-in embedded Postgres (stored in `.pgdata/`) so you can try everything immediately. Reset the data any time with `npm run db:reset`.

### Demo accounts
| Role | Email | Password |
|---|---|---|
| Admin | admin@yoga.org | admin123 |
| Guruji | ananda@yoga.org | guruji123 |
| Aspirant | ravi@yoga.org | aspirant123 |
| Guruji (pending — approve in admin) | chetan@yoga.org | guruji123 |

**Change these before real use.**

---

## The login module — how membership works

- **Join as an aspirant** (`/join`): fill name, email, password, intention, target date → account is active immediately, signed in right away.
- **Teach as a Guruji** (`/teach`): register with an optional verification document → account starts **pending**. Sign-in is blocked with a clear message until an admin approves it.
- **Sign in / out** (`/login`, `/logout`): password-checked (bcrypt-hashed), session kept in a signed cookie. After sign-in each person lands on their own dashboard (`/admin`, `/guruji`, `/aspirant`).
- **Admin maintains everyone** (`/admin`): sees every member with their verification document, and can **approve & enable**, **reject**, or **disable** any account. Approving a pending Guruji is what lets them sign in.

Access is role-checked on every dashboard, and inactive accounts can't reach member areas.

---

## What gets saved (database tables)

| Table | Holds |
|---|---|
| `members` | every person — login, role, status, profile, intention, verification document |
| `media` | uploaded images and verification documents (stored as bytes) |
| `posts` | what Gurujis share: image, blog, announcement, calendar event, video |
| `guidelines` | admin-maintained guidance for Gurujis / aspirants |
| `applications` | an aspirant's request to learn from a Guruji (accept/reject + reason) |
| `questions` | aspirant asks, Guruji answers |
| `calls` | scheduled audio/video sessions between two members |
| `messages` | support chat between the admin team and members |
| `releases` | admin-tracked software versions |

The full schema and seed data live in `src/db.js` and are created automatically on first run — nothing to import.

---

## Feature map (all use cases)

**Guruji** — register with verification · share images/calendar/blogs/announcements/videos (5–10 min) · read each aspirant's intention and accept/reject with or without a reason · answer aspirant questions · schedule sessions with fellow Gurujis and accepted aspirants · read Guruji guidelines.

**Aspirant** — register with intention + target date · browse and view Guruji profiles · apply to a Guruji · ask questions once accepted · schedule sessions with accepting Gurujis · read aspirant guidelines.

**Admin** — view all profiles and documents, approve/reject/disable · maintain guidelines for either audience · deploy version releases · chat with any member · schedule sessions with anyone.

---

## Deploy to Vercel + Neon

1. **Create a Neon database** — in Vercel: your project → Storage → Create Database → Neon (or neon.tech). Copy the pooled connection string.
2. **Set environment variables** (Settings → Environment Variables):
   - `DATABASE_URL` = your Neon connection string
   - `SESSION_SECRET` = any long random string
3. **Deploy** — push or `vercel --prod`. No build step. Tables are created and seeded on first request.

**Check it's healthy:** visit `/healthz` (should say "ok: app running") and `/healthz/db` (should confirm the database is reachable, or show the exact error). Node is pinned to 22.x.

To develop locally against Neon instead of the embedded database:
```bash
DATABASE_URL="postgresql://...neon.../neondb?sslmode=require" npm start
```

## Notes for going live
- Image and document uploads are capped at 4 MB (serverless request limit); videos are added as YouTube/Vimeo links.
- Chat is request/response; add WebSockets for live delivery when needed.
- Add email verification, password reset, and rate limiting before opening to the public.
