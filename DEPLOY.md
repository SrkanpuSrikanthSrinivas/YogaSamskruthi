# Deploying Yogasamskruthi

## ⚠️ Read this first

A previous deployment at `yoga-samskruthi.vercel.app` was serving a **different application** (HackFest Hub). The URL was named "yoga-samskruthi" but the code behind it belonged to another project. That is why the page was blank, why a `vite build` error appeared, and why the database file looked like a hackathon database.

**This folder is a standalone project.** Keep it completely separate from any other project folder. Do not copy it inside another repository.

---

## Step 1 — Check it works on your machine first

```bash
cd yogasamskruthi
npm install
npm start
```

Open <http://localhost:3000>. You should see the landing page: a dark green hero reading *"Learn yoga the way it was meant to be taught — from a Guru, never sold"*, then statistics, the teaching sections, Guru Narasimhamurthy's story, the Gurujis, how to begin, FAQ, and a footer.

**If you see that page, the code is correct.** Any problem after this point is a deployment setting, not the app.

Sign in and look around with the demo accounts:

| Role | Email | Password |
|---|---|---|
| Admin | yoga.samskruthi@gmail.com | admin123 |
| Guruji | mani@yogasamskruthi.org | guruji123 |
| Aspirant | ravi@yogasamskruthi.org | aspirant123 |

No database setup is needed locally — it creates its own.

---

## Step 2 — Create the Neon database

1. Go to <https://neon.tech> (or in Vercel: **Storage → Create Database → Neon**).
2. Create a project.
3. Copy the **pooled** connection string. It looks like:
   `postgresql://user:pass@ep-xxxx-pooler.region.aws.neon.tech/neondb?sslmode=require`

Keep this handy for Step 4.

---

## Step 3 — Deploy as a NEW Vercel project

Do **not** reuse the old `yoga-samskruthi` project — it is bound to the other application.

### Option A — Vercel CLI (simplest)

```bash
cd yogasamskruthi
vercel
```

When prompted:
- *Set up and deploy?* → **Y**
- *Link to existing project?* → **N**  ← important, choose No
- *Project name?* → e.g. `yogasamskruthi-site`
- *In which directory is your code located?* → `./`  (press Enter)

### Option B — GitHub

1. Create a **brand-new, empty** repository.
2. Upload the contents of this folder to the repository **root** — so that `package.json`, `vercel.json`, `server.js`, `api/`, `views/`, `src/`, and `public/` sit at the top level, not inside a subfolder.
3. In Vercel: **Add New → Project**, import that repository.
4. Framework Preset: **Other**. Build Command: leave **empty**.

---

## Step 4 — Add the two environment variables

Vercel dashboard → your project → **Settings → Environment Variables**:

| Name | Value |
|---|---|
| `DATABASE_URL` | the Neon connection string from Step 2 |
| `SESSION_SECRET` | any long random text, e.g. `a7Kd93mZq2vB8xLpR4tNwYs6` |

Then **redeploy** (Deployments → latest → ⋯ → Redeploy). Environment variables only apply to deployments made after they are added.

---

## Step 5 — Verify

Visit these two URLs on your deployed site, in this order:

1. **`/healthz`** → should print `ok: app running`
   - If this shows a blank page or anything else, Vercel is still serving the wrong project. Recheck Step 3.
2. **`/healthz/db`** → should print `ok: db reachable {"ok":1}`
   - If it shows an error, the message names the exact problem (usually `DATABASE_URL` missing or wrong). Fix it in Step 4 and redeploy.

When both pass, open `/` — the landing page will be there, and the database will create its tables and seed content automatically on first visit.

---

## Step 6 — Secure it before real users

1. Sign in as admin and change the seeded accounts, or delete them.
2. Set a strong, unique `SESSION_SECRET`.
3. Edit the seed block in `src/db.js` if you want different starting content.

---

## Notes

- **Node version** is pinned to 22.x in `package.json` — required.
- **No build step.** If you ever see a build command running (like `vite build`), the wrong project is connected.
- **Uploads** are capped at 4 MB (a serverless request-size limit); videos are added as YouTube/Vimeo links.
- **Admin can edit every informational page** (YogaAsana, Ayurveda, Trekking, etc.) from the admin dashboard under "Website pages".
