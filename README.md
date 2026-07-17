# Yogasamskruthi — the new yogasamskruthi.org

The replacement for the old Google Sites site, rebuilt as a real application: it keeps all the **informational content** (the About/Guru pages, Ayurveda, YogaAsana, Pranayama, Dhyanam, Trekking, Gallery, and the rest) **and** adds a platform where **Gurujis** teach and **aspirants** learn, with a real login system and everything saved to a database the **admin** maintains.

## Content carried over from the old site
- **The three teachers** are seeded as real profiles: Mani Narayan Guruji and Trek Leader Manjunath M as Gurujis, and a memorial blog post honouring **Yoga Guru Narasimhamurthy (1934–2016)**.
- **All ten sections** from the old menu are live as editable pages under `/learn/...` — YogaAsana, Pranayama, Dhyanam, Mudra-Vignanam, Trekking, Ayurveda, Blogs, Pravachanas, Advisory Services, Gallery.
- The **full Ayurveda page** (the detailed guidance shared by Yoga Vismaya Trust) is migrated verbatim in summary form.
- Admin edits every page from the dashboard — text goes live immediately; pages can be published or hidden.

**What you still need to add by hand:** the photographs. The old site's images are on Google's servers behind expiring links that can't be re-hosted automatically — re-upload them through the app (image uploads are supported) or paste stable links. The text of a few thinner sub-pages (e.g. Pranayama, Mudra-Vignanam) came through as short stubs; paste the original wording into the admin page editor to complete them.

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
| Admin | yoga.samskruthi@gmail.com | admin123 |
| Guruji | mani@yogasamskruthi.org | guruji123 |
| Aspirant | ravi@yogasamskruthi.org | aspirant123 |

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
