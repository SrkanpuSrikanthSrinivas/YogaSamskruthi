# Yogasamskruthi — Knowledge Exchange Platform

**Yoga** — complete involvement in what we do, continuously gaining knowledge and applying it. Yogasamskruthi is a platform for exchanging knowledge between **Gurujis** and **aspirants** across yoga practice, farming practices, and entrepreneur practices.

Content is authored AEM-style: **draft → published → archived**. Only published content appears on the public site. Admins verify members, manage guidelines as versioned publications, and track releases.

**Stack:** Node.js + Express + EJS · **Neon Postgres** (single source of truth for all data, including uploaded media) · deploys to **Vercel** serverless.

---

## Deploy to Vercel + Neon (production)

### 1. Create the Neon database
- In the Vercel dashboard: your project → **Storage** → **Create Database** → **Neon** (or sign up at neon.tech and create a project).
- Copy the **pooled** connection string. It looks like:
  `postgresql://user:pass@ep-xxx-pooler.region.aws.neon.tech/neondb?sslmode=require`

### 2. Set environment variables in Vercel
Project → **Settings → Environment Variables**:

| Name | Value |
|---|---|
| `DATABASE_URL` | your Neon pooled connection string |
| `SESSION_SECRET` | any long random string |

(If you created the Neon store through Vercel's Storage tab, `DATABASE_URL` is injected automatically — just confirm it's present.)

### 3. Deploy
- Push the repo (or run `vercel --prod`). No build step — `vercel.json` sets `framework: null` and routes all traffic into the Express function.
- On the first request, the app creates all tables and seeds demo data automatically. No manual migration needed.
- **Node version:** pinned to 22.x via `package.json` engines.

Visit the deployment URL — the seeded homepage loads, and everything reads and writes to Neon.

### Seed accounts
| Role | Email | Password |
|---|---|---|
| Admin | admin@yogasamskruthi.org | admin123 |
| Guruji (active) | ananda@yogasamskruthi.org | guruji123 |
| Guruji (pending — approve at /admin/users) | bhoomika@yogasamskruthi.org | guruji123 |
| Aspirant | ravi@example.com | aspirant123 |

**Change these before real use.**

---

## Run locally (zero setup)

```bash
npm install
npm start          # → http://localhost:3000
```

With no `DATABASE_URL` set, the app uses an **embedded Postgres** (pglite) in `.pgdata/` — real Postgres semantics, nothing to install. To develop against your actual Neon DB locally:

```bash
DATABASE_URL="postgresql://...neon.../neondb?sslmode=require" npm start
```

Reset local data: `npm run db:reset`.

---

## Architecture

```
api/index.js              Vercel serverless entry (exports the Express app)
vercel.json               framework:null + rewrite all routes → the function
server.js                 Express app: cookie sessions, media route, error handling
src/db.js                 Async query layer — Neon in prod, pglite locally; schema + seed
src/helpers.js            Role guards, in-memory uploads → Postgres bytea, Jitsi + embed URLs
src/routes/
  public.js               Home, guruji directory/profiles, blog, published guidelines
  auth.js                 Login/logout, guruji + aspirant registration
  guruji.js               Content authoring/publishing, applications, Q&A
  aspirant.js             Apply, ask questions
  admin.js                Member verification, guidelines CMS, releases
  shared.js               Calls (permission-gated) + admin chat
views/                    EJS templates
public/css/style.css      Design system
```

### Key serverless-aware decisions
- **Everything lives in Neon.** Users, content, guidelines, applications, Q&A, calls, messages, releases — plus uploaded images and verification documents stored as `bytea` in the `media` table and served via `/media/:id`. No filesystem dependency (Vercel doesn't provide one).
- **Cookie-based sessions** (`cookie-session`, signed with `SESSION_SECRET`) — nothing stored server-side, so they survive stateless function invocations.
- **Videos are links, not uploads.** Vercel caps request bodies near 4.5 MB, so 5–10 minute videos can't upload through the function. Gurujis paste a YouTube/Vimeo URL that embeds on their profile — faster for viewers, within limits. Image/document uploads are capped at 4 MB for the same reason.
- **Auto-migration + seed** run once on first DB access, idempotently.

---

## Use-case coverage

**Guruji:** register with verification document (→ pending until admin approves) · author images/calendar/blogs/announcements with draft→publish workflow · add videos by link (5–10 min) · schedule calls with fellow Gurujis and accepted aspirants · review aspirant profile + intention, accept/reject with or without reason · answer aspirant questions · read Guruji guidelines.

**Aspirant:** register with intention + target date · browse verified Guruji profiles · apply to a Guruji · schedule calls with accepting Gurujis · read Aspirant guidelines.

**Admin:** view all profiles + verification documents, approve/reject/disable · guidelines CMS (versioned draft→publish) · release management (stage/deploy/rollback) · chat with any member · schedule calls with any member.

---

## Hardening roadmap
- **In-platform video / larger media:** add Vercel Blob or S3/R2 with client-side direct upload (bypasses the 4.5 MB function limit).
- **Real-time chat:** current chat is request/response; move to WebSockets (a separate always-on service, since Vercel functions are short-lived) or a hosted realtime provider.
- **Auth:** email verification, password reset, CSRF tokens, rate limiting.
- **Embedded video calls:** Jitsi links work standalone; embed via the Jitsi iFrame API, Daily, or LiveKit for in-app calling.
- **Notifications:** email members (e.g. Brevo) on application decisions, answered questions, call invites.
- **Deploy action → CI/CD:** wire `/admin/releases/:id/deploy` to a real pipeline trigger.
