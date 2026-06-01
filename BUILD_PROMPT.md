# Build Prompt — Form Personal Training v2

> Paste everything below into your AI coding assistant (Claude Code, Cursor, etc.)
> and attach the files listed under "Files I'm giving you."

---

## Who you are / what we're doing

You are helping me upgrade my personal workout-tracker web app, **Form Personal Training**, from v1 to v2. v1 works and looks great. Your job is to add real functionality **without changing the look and feel**.

**Hard constraints — do not violate these:**
- **Stay vanilla JS. No framework, no build step.** It must keep running by opening `index.html` (or serving the folder with a static server). No React, no bundler, no npm install step. Load any dependency from a CDN as an ES module.
- **Preserve the existing visual design exactly.** The premium, Apple-like aesthetic in `styles.css` (colors, spacing, fonts, cards, blur, rounded corners, the blue hero, the dark "next" card) is the whole point. Reuse the existing CSS variables and component classes. New screens must look like they were always part of this app. Do not restyle, re-theme, or "modernize" anything that already exists.
- **Backend is Supabase** (Postgres + Auth), accessed directly from the browser with the supabase-js v2 client over CDN. The schema and a client module are provided.
- **The app must still work offline.** Use the provided offline-first data layer (local cache + write-through + outbox sync), not raw network calls everywhere.

## What v1 is today (the files I'm giving you)

- `index.html`, `app.js`, `styles.css`, `README.md` — the current app. It's a single-user tracker with a hardcoded 5-day rotation ("DJ"), an exercise library derived from that rotation, a workout logger, a progress page with **hardcoded** chart/PR data, and history. State lives in `localStorage` under `form-personal-training-v1` and the whole UI is re-rendered by a `render()` function reacting to a `state` object. **Match this architecture** (plain functions returning HTML strings, event delegation, a central `state` object, `saveState()`/`render()`), don't rewrite it in a new style.

## New files I'm giving you (use these — don't reinvent them)

- `SPEC.md` (the research report) — the **authoritative reference** for all the how/why: Supabase setup details, the full schema rationale, evidence-based training numbers (volume landmarks, rep ranges, 1RM formulas), the plan-generation logic, and the onboarding flow. **Read it before building.** When in doubt, follow SPEC.md.
- `schema.sql` — complete Postgres schema + Row Level Security + the signup trigger. I will run this in Supabase myself.
- `seed_exercises.sql` — seeds the shared exercise catalog (84 exercises). I will run this after `schema.sql`.
- `exercises.js` — the **same** 84-exercise catalog as a JS module (`exercises`, `exercisesById`, `MUSCLE_GROUPS`, `EQUIPMENT_TYPES`). This is the app's source of truth for the library and plan builder.
- `supabase.js` — the Supabase client plus `auth` and `profileApi` helpers (signUp, signIn, magic link, signOut, session handling). It has placeholder URL/key constants — leave them as placeholders; I'll paste in my real values.
- `data-layer.js` — offline-first persistence: `db.upsert/remove/pull`, `cache`, `syncAll`, `flushOutbox`, and `migrateV1IfNeeded`. Route all reads/writes through this.

## What to build (in this order)

Work in phases. After each phase, tell me what changed and how to test it. Keep each change small and reviewable.

**Phase 1 — Auth shell.** Add a logged-out screen (styled with the existing CSS) offering email/password **and** magic-link sign-in/sign-up, using `supabase.js`. Wire `auth.onChange()` so the app shows the auth screen when logged out and the normal app when logged in. A page refresh must keep the user logged in. The current sidebar profile ("DJ") and avatar should reflect the logged-in user's `display_name`, with a working Sign Out in Settings.

**Phase 2 — Refactor the catalog (do before plans).** Make `exercises.js` the source of truth. The Exercises/library view and everywhere that needs an exercise should read from it, **not** derive the library from the hardcoded program. Keep the existing library UI (search + muscle filter pills + cards) but drive it off the new, larger catalog. Add the ability to create **custom exercises** (stored via `data-layer`), shown alongside catalog ones.

**Phase 3 — Onboarding questionnaire.** First-time users (profile `onboarding_complete = false`) get a multi-step wizard (one question per step, progress indicator, Back button), following the question list and UX notes in SPEC.md §5. It writes profile fields (name, units kg/lb, bodyweight/height, optional age/sex, weekly goal) and the generator inputs (goal, experience, days/week, equipment, priority muscles) via `profileApi`/`data-layer`. Returning users skip it.

**Phase 4 — Plan generator + plan builder.**
- Implement the rule-based generator from SPEC.md §4 (split chosen from days/week + experience; exercises selected from the catalog filtered by available equipment; sets/reps/rest from the goal; volume guided by the landmark table). Present **2–3 plan options** for the user to pick from, then save the chosen one as their active plan (`plans` → `plan_days` → `plan_day_exercises`).
- Add a **plan builder** so users can also build/edit a plan by hand from the full catalog: add, remove, reorder (update `position`), and **swap** an exercise (suggest same-muscle / same-movement alternatives), and edit target sets/reps/rest inline. Keep the existing "My Plan" visual style.
- Users can have multiple plans; one is active. The Today/Home and Workout views should use the **active plan** instead of the hardcoded rotation.

**Phase 5 — Real logging, PRs, charts, rest timer.**
- Logging a workout writes a `workouts` row and `workout_sets` rows via `data-layer`. History reads from real data.
- Replace the hardcoded progress chart and the hardcoded "Personal records" with values **computed from logged sets**: weekly volume over time, and PRs / estimated 1RM using the Epley and Brzycki formulas in SPEC.md §6.1. Show a "New PR" toast when one is beaten.
- Add a **rest timer** that starts when a set is marked done, seeded from that exercise's `target_rest_seconds`, using `Date.now()` deltas (accurate when backgrounded). Reuse the existing toast/timer styling.

**Phase 6 — Units, migration, polish.**
- Honor the profile `unit_preference`: store all weights in **kg** internally, convert at display/entry only (SPEC.md §6.4).
- On first login, call `migrateV1IfNeeded()` so my existing local history is imported, and show a small confirmation.
- Accessibility pass per SPEC.md §6.7 (labels on inputs, `fieldset`/`legend` for the questionnaire radios, keyboard operability, `aria-live` for timer/PR announcements). Confirm destructive deletes.

## Definition of done (acceptance criteria)

- App still opens with no build step and works offline; data syncs when back online.
- A brand-new user can sign up, complete onboarding, get 2–3 generated plan options, pick one, and start training — with no hardcoded "DJ" data anywhere.
- A 3-day beginner gets full-body ×3; a 4-day user gets upper/lower; a 5–6 day user gets PPL/PPLUL (per SPEC.md §4.3). Equipment choice filters exercise selection.
- Charts and PRs reflect real logged sets, not constants.
- Two different accounts cannot see each other's data (RLS verified).
- Every new screen visually matches the existing design system.

## Notes / boundaries

- Leave the `SUPABASE_URL` / key constants in `supabase.js` as placeholders. **Do not invent credentials.** I will create the Supabase project and paste in my own values.
- Don't add analytics, tracking, or third-party services beyond Supabase + the existing Google Fonts.
- If something in SPEC.md and this prompt seems to conflict, ask me rather than guessing. Prefer small, well-explained commits over a giant rewrite.
