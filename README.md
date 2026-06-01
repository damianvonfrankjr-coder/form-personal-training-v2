# Form — Personal Training (v2)

A dependency-free, no-build personal workout app. Vanilla JS ES modules loaded
straight from `index.html`; Supabase (Postgres + Auth) as the backend, accessed
directly from the browser. Works **offline-first** and runs in a **local-only
mode** until you connect Supabase.

## What v2 adds over v1
- **Accounts** — email/password + magic-link sign-in (Supabase Auth), or a
  local-only mode that needs no backend.
- **84-exercise catalog** + your own **custom exercises**.
- **Onboarding** that captures your goal, experience, schedule, and equipment.
- **Plan generator** — 2–3 tailored options (split chosen from days/week;
  exercises filtered by equipment; sets/reps/rest from your goal) plus a manual
  **plan builder** (add / remove / reorder / swap / edit targets).
- **Real logging** — workouts and per-set data; **History**, **volume charts**,
  and **PRs (estimated 1RM)** all computed from what you log.
- **Rest timer**, **New-PR toasts**, kg/lb units, and a one-time import of your
  v1 history.

## Run locally
No build step. Serve the folder with any static server, e.g.:

```
python3 -m http.server 4173    # then open http://127.0.0.1:4173
```

Opening `index.html` over `file://` will not work (ES modules need `http`).
Until you add Supabase keys (below), the app runs in **local mode** — pick
“Continue in local mode” on the sign-in screen.

## Connect Supabase (enables real accounts + cross-device sync)
1. Create a project at supabase.com.
2. In the SQL editor, run **`schema.sql`**, then **`seed_exercises.sql`**.
3. In **`supabase.js`**, replace `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`
   (Project Settings → API; the publishable/anon key is safe in client code —
   Row Level Security protects the data).
4. **Auth → URL Configuration**: add your site URL(s) to the redirect allow-list
   (e.g. `http://127.0.0.1:4173` and your deployed URL) so magic links work.
5. Reload. Sign-in, accounts, and sync now activate automatically; your first
   login imports any v1 history.

## Deploy
It’s a static site — deploy the folder to any static host (Vercel, Netlify,
GitHub Pages). It will run in local mode until step 3 above is done and the
deployed URL is added in step 4. The dev server and spec/build files are
excluded from deploys via `.vercelignore`.

## Files
| File | Purpose |
| --- | --- |
| `index.html` / `styles.css` | shell + design system |
| `app.js` | UI orchestration (state, render, events) |
| `store.js` | identity + profile + offline data accessors |
| `data-layer.js` | offline cache + outbox sync + v1 migration |
| `supabase.js` | Supabase client + auth/profile helpers |
| `exercises.js` | 84-exercise catalog |
| `onboarding.js` | onboarding wizard |
| `plan-generator.js` | rule-based plan generator |
| `training-math.js` | 1RM (Epley/Brzycki), PRs, weekly volume |
| `units.js` | kg/lb conversion |
| `schema.sql` / `seed_exercises.sql` | run these in Supabase |
