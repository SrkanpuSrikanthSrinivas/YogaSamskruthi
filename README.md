# Yogasamskruthi — Knowledge Exchange Platform

**Yoga** — complete involvement in the activities we do, with continuous gaining and applying of knowledge. Yogasamskruthi connects Gurujis and aspirants across yoga practice, farming practices, and entrepreneur practices.

Built as an AEM-style authoring system: content is authored as **draft**, then **published** to the public site, and can be **unpublished** or **archived** — with the admin console acting as the author/verification layer.

## Quick start

Requires **Node.js 22+** (uses the built-in `node:sqlite` — zero native dependencies).

```bash
npm install
node server.js
# → http://localhost:3000
```

The database (`yogasamskruthi.db`) is created and seeded automatically on first run.

### Seed accounts

| Role | Email | Password | Notes |
|---|---|---|---|
| Admin | admin@yogasamskruthi.org | admin123 | Full console |
| Guruji (active) | ananda@yogasamskruthi.org | guruji123 | Has published content + one pending application |
| Guruji (pending) | bhoomika@yogasamskruthi.org | guruji123 | Awaiting admin verification — approve from /admin/users |
| Aspirant | ravi@example.com | aspirant123 | Has one pending application to Guruji Ananda |

## Use-case coverage

**Guruji**
1. Register with document upload → account is `pending` until admin background verification (`/register/guruji`)
2. Login and author images, calendar events, blogs, announcements with draft→publish→archive workflow (`/guruji`)
3. Upload videos with a hard 10-minute cap — duration auto-detected in the browser and validated server-side
4. Schedule audio/video calls with fellow Gurujis (`/calls`, Jitsi link auto-generated)
5. Schedule calls with accepted aspirants (same page — the participant list is permission-filtered)
6. View aspirant profile + intention on each application; accept/reject with or without a reason (`/guruji/applications`)
7. See and answer aspirant queries (`/guruji/questions`)
8. Published Guruji guidelines shown on the dashboard

**Aspirant**
1. Register with intention + target date (`/register/aspirant`)
2. Browse verified Guruji profiles with expertise tags (`/gurujis`)
3. Apply to the right Guruji with a per-application intention (from the profile page)
4. Schedule calls with Gurujis who accepted them (`/calls`)
5. Published Aspirant guidelines shown on the dashboard

**Admin**
1. View all Guruji/Aspirant profiles + verification documents; approve, reject, or disable with a note (`/admin/users`)
2. Guidelines CMS: create/edit as draft, publish (auto version bump), unpublish (`/admin/guidelines`)
3. Release management: stage a version with notes, deploy, roll back (`/admin/releases`) — wire the Deploy action to a CI/CD trigger (e.g. GitLab pipeline token) for real deployments
4. Chat with any Guruji or Aspirant; members reach the admin team via the same Chat page
5. Schedule audio/video calls with any active member (`/calls`)

## Architecture

```
server.js                 Express app, sessions, static + uploads
src/db.js                 Schema + idempotent seed (node:sqlite)
src/helpers.js            Auth middleware, multer upload configs, Jitsi link generator
src/routes/public.js      Home, guruji directory/profiles, blog, published guidelines
src/routes/auth.js        Login/logout, guruji + aspirant registration
src/routes/guruji.js      Content authoring/publishing, applications, Q&A
src/routes/aspirant.js    Apply, ask questions
src/routes/admin.js       Member verification, guidelines CMS, releases
src/routes/shared.js      Calls + chat (permission rules per role)
views/                    EJS templates (partials/header|footer shared shell)
public/css/style.css      Design system (leaf/haldi/indigo palette)
uploads/                  images/ videos/ documents/
```

## Production hardening roadmap

- **Database**: swap `src/db.js` for a `pg` pool against Neon Postgres — the schema is ANSI-compatible; move `datetime('now')` → `now()`
- **Video duration**: the browser reports duration and the server enforces ≤ 600 s, but a hostile client can lie — verify with `ffprobe` after upload
- **Media storage**: move `uploads/` to S3/R2 with signed URLs; add virus scanning on verification documents
- **Calls**: Jitsi meet links work out of the box (audio + video, no account needed); for embedded calls use Jitsi iFrame API, Daily, or LiveKit
- **Chat**: currently request/response; upgrade to WebSocket (socket.io) or SSE for live delivery
- **Auth**: add CSRF tokens (csurf), rate limiting, email verification, password reset
- **Deploy action**: POST to a GitLab pipeline trigger from `/admin/releases/:id/deploy` for true one-click upgrades
- **Notifications**: email (Brevo) on application decisions, answers, and call invites
