// =====================================================================
// Form Personal Training v2 — app shell (vanilla JS, no build step)
// Keeps the v1 architecture: functions return HTML strings, one render(),
// event delegation, a central `state`. Data now flows through store.js /
// the offline-first data-layer instead of a hardcoded program.
// =====================================================================

import { auth, isSupabaseConfigured } from "./supabase.js";
import { migrateV1IfNeeded } from "./data-layer.js";
import {
  state,
  saveState,
  loadUiPrefs,
  resetUiState,
  bootSession,
  loadProfile,
  loadUserData,
  isLoggedIn,
  isLocalMode,
  startLocalSession,
  clearLocalUser,
  currentUser,
  displayName,
  initials,
  getAllExercises,
  getCustomExercises,
  getExerciseById,
  updateProfile,
  upsert,
  remove,
  newId,
  currentUserId,
  getTable,
  getPlans,
  getActivePlan,
  getPlanDays,
  getPlanDayExercises,
  getWorkouts,
  getWorkoutSets,
  getAllSets,
} from "./store.js";
import { MUSCLE_GROUPS, EQUIPMENT_TYPES } from "./exercises.js";
import { renderOnboarding, collectCurrent, buildProfilePatch, seedAnswers, onboardingSteps } from "./onboarding.js";
import { generatePlans, SPLIT_LABELS } from "./plan-generator.js";
import { toKg, fromKg, displayWeight, formatWeight, unitLabel } from "./units.js";
import { estimate1RM, bestE1RMByExercise, detectPRs, totalVolume, weeklyVolumeSeries } from "./training-math.js";

const unitPref = () => state.profile?.unit_preference || "lb";

// Catalog taxonomy used by the custom-exercise form.
const CATEGORIES = ["push", "pull", "legs", "core", "full_body"];
const MOVEMENT_PATTERNS = [
  "horizontal_push",
  "vertical_push",
  "horizontal_pull",
  "vertical_pull",
  "squat",
  "hinge",
  "lunge",
  "isolation",
  "core",
  "carry",
];

function humanize(value) {
  return String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ---------------------------------------------------------------------
// ICONS (inline SVG, same set as v1)
// ---------------------------------------------------------------------
const icons = {
  activity: '<path d="M4 13h3l2.3-7 4.2 13 2.3-6H20"/>',
  arrowRight: '<path d="M5 12h13"/><path d="m14 7 5 5-5 5"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/>',
  calendar: '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>',
  chart: '<path d="M3 3v18h18"/><path d="m7 16 4-5 4 3 5-7"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  chevronRight: '<path d="m9 18 6-6-6-6"/>',
  chevronLeft: '<path d="m15 18-6-6 6-6"/>',
  circlePlus: '<circle cx="12" cy="12" r="10"/><path d="M8 12h8"/><path d="M12 8v8"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  dumbbell: '<path d="m6.5 6.5 11 11"/><path d="m21 21-1-1"/><path d="m3 3 1 1"/><path d="m18 22 4-4"/><path d="m2 6 4-4"/><path d="m3 10 7-7"/><path d="m14 21 7-7"/>',
  flame: '<path d="M12 22c4 0 7-3 7-7 0-3-1-5-4-8 .2 3-1 4-2 4-2 0-1-4-2-8-4 3-6 7-6 11 0 5 3 8 7 8Z"/><path d="M12 22c-2 0-3.5-1.5-3.5-3.5 0-1.5.6-2.6 2-3.8.1 1.5.7 2.2 1.5 2.2 1 0 1.6-1 1.8-2.5 1.2 1.2 1.7 2.5 1.7 4.1 0 2-1.5 3.5-3.5 3.5Z"/>',
  grid: '<rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/><path d="M12 7v5l4 2"/>',
  home: '<path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/>',
  list: '<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/>',
  medal: '<circle cx="12" cy="8" r="5"/><path d="M8.4 12 7 22l5-3 5 3-1.4-10"/>',
  more: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
  play: '<path d="m7 4 13 8-13 8Z"/>',
  plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/>',
  signout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  trash: '<path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>',
  trophy: '<path d="M8 21h8"/><path d="M12 17v4"/><path d="M7 4h10v5a5 5 0 0 1-10 0Z"/><path d="M7 6H4v1a4 4 0 0 0 4 4"/><path d="M17 6h3v1a4 4 0 0 1-4 4"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  mail: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-10 5L2 7"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
};

const icon = (name) =>
  `<span class="icon"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${icons[name] || ""}</svg></span>`;

// ---------------------------------------------------------------------
// SMALL UTILITIES
// ---------------------------------------------------------------------
function formatDate(dateString, options = {}) {
  return new Intl.DateTimeFormat("en-US", options).format(new Date(dateString));
}

function formatToday() {
  return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" }).format(new Date());
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
}

function compactNumber(value) {
  value = Number(value) || 0;
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 1 : 2).replace(/\.0$/, "")}k`;
  return String(Math.round(value));
}

function formatDuration(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// Read a form field value straight from the DOM (forms are uncontrolled so
// typing never triggers a re-render / focus loss).
function val(id) {
  const el = document.getElementById(id);
  return el ? el.value.trim() : "";
}

// ---------------------------------------------------------------------
// NAVIGATION CONFIG
// ---------------------------------------------------------------------
const navItems = [
  ["home", "home", "Today"],
  ["workout", "dumbbell", "Workout"],
  ["plan", "list", "My Plan"],
  ["progress", "chart", "Progress"],
  ["history", "history", "History"],
  ["library", "book", "Exercises"],
];

const mobileNavItems = navItems.filter(([view]) => ["home", "workout", "plan", "progress", "library"].includes(view));

// ---------------------------------------------------------------------
// SHELL
// ---------------------------------------------------------------------
function sidebar() {
  return `
    <aside class="sidebar">
      <a class="brand" href="#" data-action="navigate" data-view="home" aria-label="Form home">
        <span class="brand-mark">${icon("activity")}</span>
        <span>FORM</span>
      </a>
      <div class="nav-section-label">Menu</div>
      <nav class="side-nav" aria-label="Main navigation">
        ${navItems.map(([view, iconName, label]) => navButton(view, iconName, label)).join("")}
      </nav>
      <div class="sidebar-spacer"></div>
      <div class="nav-section-label">Account</div>
      <nav class="side-nav">
        <button class="nav-item" type="button" data-action="show-settings">
          <span class="nav-icon">${icon("settings")}</span><span>Settings</span>
        </button>
      </nav>
      <div class="sidebar-profile">
        <div class="avatar">${escapeHtml(initials())}</div>
        <div class="profile-copy">
          <div class="profile-name">${escapeHtml(displayName())}</div>
          <div class="profile-subtitle">${isLocalMode() ? "Local mode" : "Synced account"}</div>
        </div>
      </div>
    </aside>`;
}

function navButton(view, iconName, label, mobile = false) {
  const active = state.view === view;
  return `
    <button class="${mobile ? "mobile-nav-item" : "nav-item"} ${active ? "active" : ""}" type="button" data-action="navigate" data-view="${view}"${active ? ' aria-current="page"' : ""}>
      <span class="nav-icon">${icon(iconName)}</span><span>${label}</span>
    </button>`;
}

function mobileNav() {
  return `
    <nav class="mobile-nav" aria-label="Mobile navigation">
      ${mobileNavItems.map(([view, iconName, label]) => navButton(view, iconName, label, true)).join("")}
    </nav>`;
}

function topbar() {
  const names = {
    home: ["Daily overview", "Today"],
    workout: ["Training session", "Workout"],
    plan: ["Your program", "My Plan"],
    progress: ["Training analytics", "Progress"],
    history: ["Workout archive", "History"],
    library: ["Movement reference", "Exercises"],
  };
  const [eyebrow, title] = names[state.view] || names.home;
  return `
    <header class="topbar">
      <div class="topbar-left">
        <div class="topbar-eyebrow">${eyebrow}</div>
        <div class="topbar-title">${title}</div>
      </div>
      <div class="topbar-actions">
        <button class="icon-button" type="button" data-action="show-toast" data-message="You're all caught up." aria-label="Notifications">${icon("bell")}</button>
        <button class="icon-button" type="button" data-action="show-settings" aria-label="Settings">${icon("settings")}</button>
      </div>
    </header>`;
}

function pageHeading(kicker, title, subtitle, action = "") {
  return `
    <div class="page-heading">
      <div>
        <div class="page-kicker">${kicker}</div>
        <h1>${title}</h1>
        <p class="page-subtitle">${subtitle}</p>
      </div>
      ${action}
    </div>`;
}

function statCard(iconName, tone, label, value, change) {
  return `
    <article class="card stat-card">
      <div class="stat-card-top">
        <div class="stat-icon ${tone}">${icon(iconName)}</div>
        <div class="stat-change">${change}</div>
      </div>
      <div class="stat-label">${label}</div>
      <div class="stat-value">${value}</div>
    </article>`;
}

function emptyState(title, copy, action = "") {
  return `
    <div class="empty-state">
      <div class="empty-icon">${icon("search")}</div>
      <h2>${title}</h2>
      <p>${copy}</p>
      ${action}
    </div>`;
}

// ---------------------------------------------------------------------
// AUTH SCREEN
// ---------------------------------------------------------------------
function authView() {
  const a = state.auth;
  const signup = a.mode === "signup";
  return `
    <div class="auth-shell">
      <section class="auth-card card">
        <div class="auth-brand">
          <span class="brand-mark">${icon("activity")}</span>
          <span>FORM</span>
        </div>
        <h1 class="auth-title">${signup ? "Create your account" : "Welcome back"}</h1>
        <p class="auth-sub">Your personal training, planned and tracked.</p>

        ${a.notice ? `<div class="auth-banner ok" role="status">${escapeHtml(a.notice)}</div>` : ""}
        ${a.error ? `<div class="auth-banner err" role="alert">${escapeHtml(a.error)}</div>` : ""}
        ${
          !isSupabaseConfigured
            ? `<div class="auth-banner info">Backend not connected yet — start in <strong>local mode</strong> below. Paste your Supabase keys later to enable accounts &amp; sync.</div>`
            : ""
        }

        <div class="auth-tabs" role="tablist" aria-label="Sign in or sign up">
          <button class="auth-tab ${signup ? "" : "active"}" type="button" role="tab" aria-selected="${!signup}" data-action="auth-tab" data-mode="signin">Sign in</button>
          <button class="auth-tab ${signup ? "active" : ""}" type="button" role="tab" aria-selected="${signup}" data-action="auth-tab" data-mode="signup">Sign up</button>
        </div>

        <form class="auth-form" data-action="auth-submit-form">
          ${
            signup
              ? `<div class="field">
                  <label class="field-label" for="auth-name">Name</label>
                  <input class="text-input" id="auth-name" name="name" type="text" autocomplete="name" placeholder="Your name" />
                </div>`
              : ""
          }
          <div class="field">
            <label class="field-label" for="auth-email">Email</label>
            <input class="text-input" id="auth-email" name="email" type="email" autocomplete="email" placeholder="you@email.com" required />
          </div>
          <div class="field">
            <label class="field-label" for="auth-password">Password</label>
            <input class="text-input" id="auth-password" name="password" type="password" autocomplete="${signup ? "new-password" : "current-password"}" placeholder="••••••••" required />
          </div>
          <button class="primary-button auth-submit" type="submit" ${a.busy ? "disabled" : ""}>
            ${a.busy ? "Working…" : signup ? "Create account" : "Sign in"}
          </button>
        </form>

        <div class="auth-or"><span>or</span></div>
        <button class="secondary-button auth-wide" type="button" data-action="auth-magic" ${a.busy ? "disabled" : ""}>
          ${icon("mail")} Email me a magic link
        </button>
        ${
          !isSupabaseConfigured
            ? `<button class="primary-button auth-wide auth-local" type="button" data-action="auth-local">
                ${icon("play")} Continue in local mode
              </button>`
            : ""
        }
      </section>
    </div>`;
}

async function submitAuth() {
  const email = val("auth-email");
  const password = val("auth-password");
  const name = val("auth-name");
  state.auth.error = "";
  state.auth.notice = "";
  if (!email || !password) {
    state.auth.error = "Enter your email and password.";
    return render();
  }
  if (!isSupabaseConfigured) {
    state.auth.error = "No backend connected. Use “Continue in local mode”, or add your Supabase keys.";
    return render();
  }
  state.auth.busy = true;
  render();
  try {
    if (state.auth.mode === "signup") {
      const { error } = await auth.signUp(email, password, name);
      if (error) throw error;
      state.auth.notice = "Account created. If email confirmation is on, confirm then sign in.";
      state.auth.mode = "signin";
    } else {
      const { error } = await auth.signIn(email, password);
      if (error) throw error;
      // auth.onChange will switch us into the app.
    }
  } catch (e) {
    state.auth.error = e?.message || "Something went wrong.";
  } finally {
    state.auth.busy = false;
    render();
  }
}

async function submitMagic() {
  const email = val("auth-email");
  state.auth.error = "";
  state.auth.notice = "";
  if (!email) {
    state.auth.error = "Enter your email first.";
    return render();
  }
  if (!isSupabaseConfigured) {
    state.auth.error = "No backend connected. Use “Continue in local mode”, or add your Supabase keys.";
    return render();
  }
  state.auth.busy = true;
  render();
  try {
    const { error } = await auth.signInWithMagicLink(email);
    if (error) throw error;
    state.auth.notice = "Magic link sent — check your email.";
  } catch (e) {
    state.auth.error = e?.message || "Could not send the magic link.";
  } finally {
    state.auth.busy = false;
    render();
  }
}

async function continueLocal() {
  const name = val("auth-name") || displayName();
  startLocalSession(name === "Athlete" ? "" : name);
  await loadProfile();
  await loadUserData();
  state.view = "home";
  render();
}

async function signOut() {
  if (!isLocalMode() && isSupabaseConfigured) {
    try {
      await auth.signOut();
    } catch {}
  }
  clearLocalUser();
  resetUiState();
  state.booted = true;
  render();
}

// ---------------------------------------------------------------------
// ONBOARDING
// ---------------------------------------------------------------------
async function onboardingNext() {
  const err = collectCurrent(state);
  if (err) {
    state.onboarding.error = err;
    render();
    return;
  }
  state.onboarding.error = "";
  if (state.onboarding.step >= onboardingSteps.length - 1) {
    await finishOnboarding();
  } else {
    state.onboarding.step += 1;
    render();
  }
}

function onboardingBack() {
  collectCurrent(state); // save partial, ignore validation
  state.onboarding.error = "";
  if (state.onboarding.step > 0) state.onboarding.step -= 1;
  render();
}

function togglePriorityMuscle(muscle) {
  const a = state.onboarding.answers;
  if (!Array.isArray(a.priority_muscles)) a.priority_muscles = [];
  const i = a.priority_muscles.indexOf(muscle);
  if (i >= 0) a.priority_muscles.splice(i, 1);
  else a.priority_muscles.push(muscle);
  render();
}

async function finishOnboarding() {
  const patch = buildProfilePatch(state.onboarding.answers);
  await updateProfile({ ...patch, onboarding_complete: true });
  state.onboarding = null;
  // Offer generated plan options straight away.
  state.planChoices = generatePlans(state.profile, getAllExercises());
  state.view = "plan";
  render();
  showToast("Profile saved. Pick a plan to get started.");
}

// ---------------------------------------------------------------------
// DATA / SESSION HELPERS
// ---------------------------------------------------------------------
function workoutsThisWeek(workouts = getWorkouts()) {
  const boundary = new Date();
  boundary.setHours(0, 0, 0, 0);
  boundary.setDate(boundary.getDate() - 6);
  return workouts.filter((w) => new Date(w.performed_at) >= boundary);
}

function workoutVolumeKg(workoutId) {
  return getWorkoutSets(workoutId).reduce((t, s) => t + (Number(s.weight) || 0) * (Number(s.reps) || 0), 0);
}

function getNextPlanDay(plan, days = getPlanDays(plan.id)) {
  if (!days.length) return null;
  const last = getWorkouts().find((w) => w.plan_id === plan.id && w.plan_day_id);
  if (!last) return days[0];
  const idx = days.findIndex((d) => d.id === last.plan_day_id);
  return idx < 0 ? days[0] : days[(idx + 1) % days.length];
}

function getDurationSeconds(workout = state.activeWorkout) {
  if (!workout) return 0;
  return Math.max(0, Math.floor((Date.now() - workout.startedAt) / 1000));
}

function sessionStats(workout = state.activeWorkout) {
  if (!workout) return { completedSets: 0, totalSets: 0, volume: 0 };
  return workout.exercises.reduce(
    (s, ex) => {
      ex.sets.forEach((set) => {
        s.totalSets += 1;
        if (set.done) {
          s.completedSets += 1;
          s.volume += (Number(set.weight) || 0) * (Number(set.reps) || 0);
        }
      });
      return s;
    },
    { completedSets: 0, totalSets: 0, volume: 0 },
  );
}

// ---------------------------------------------------------------------
// PLAN GENERATION + BUILDER
// ---------------------------------------------------------------------
function generatePlanOptions() {
  if (!state.profile) return;
  state.planChoices = generatePlans(state.profile, getAllExercises());
  state.builder = null;
  state.view = "plan";
  render();
}

async function choosePlan(idx) {
  const v = state.planChoices?.[idx];
  if (!v) return;
  const uid = currentUserId();
  const now = new Date().toISOString();
  for (const p of getPlans()) if (p.is_active) await upsert("plans", { ...p, is_active: false });
  const planId = newId();
  await upsert("plans", {
    id: planId,
    user_id: uid,
    name: `${v.name} · ${SPLIT_LABELS[v.split_type] || ""}`.trim(),
    split_type: v.split_type,
    goal: state.profile?.primary_goal || null,
    days_per_week: v.days_per_week,
    is_active: true,
    created_at: now,
  });
  for (const d of v.days) {
    const dayId = newId();
    await upsert("plan_days", { id: dayId, plan_id: planId, user_id: uid, day_order: d.day_order, name: d.name, created_at: now });
    let pos = 1;
    for (const ex of d.exercises) {
      await upsert("plan_day_exercises", {
        id: newId(),
        plan_day_id: dayId,
        user_id: uid,
        exercise_id: ex.exercise_id,
        custom_exercise_id: ex.custom_exercise_id,
        position: pos++,
        target_sets: ex.target_sets,
        target_reps_low: ex.target_reps_low,
        target_reps_high: ex.target_reps_high,
        target_rest_seconds: ex.target_rest_seconds,
      });
    }
  }
  state.planChoices = null;
  state.selectedPlanDayId = null;
  state.view = "plan";
  render();
  showToast("Plan saved. You're ready to train.");
}

async function switchActivePlan(planId) {
  for (const p of getPlans()) {
    if (p.id === planId && !p.is_active) await upsert("plans", { ...p, is_active: true });
    else if (p.id !== planId && p.is_active) await upsert("plans", { ...p, is_active: false });
  }
  render();
}

function toggleBuilder(planId) {
  state.builder = state.builder === planId ? null : planId;
  render();
}

async function movePde(id, dir) {
  const row = getTable("plan_day_exercises").find((r) => r.id === id);
  if (!row) return;
  const sibs = getPlanDayExercises(row.plan_day_id);
  const i = sibs.findIndex((r) => r.id === id);
  const j = i + dir;
  if (j < 0 || j >= sibs.length) return;
  const a = sibs[i];
  const b = sibs[j];
  await upsert("plan_day_exercises", { ...a, position: b.position });
  await upsert("plan_day_exercises", { ...b, position: a.position });
  render();
}

function askDeletePde(id) {
  const row = getTable("plan_day_exercises").find((r) => r.id === id);
  const ex = row && getExerciseById(row.exercise_id || row.custom_exercise_id);
  state.confirm = {
    title: "Remove exercise?",
    message: `“${ex?.name || "This exercise"}” will be removed from this day.`,
    confirmLabel: "Remove",
    action: "confirm-delete-pde",
    id,
  };
  render();
}

async function confirmDeletePde(id) {
  await remove("plan_day_exercises", id);
  state.confirm = null;
  render();
}

async function updatePdeField(id, field, value) {
  const row = getTable("plan_day_exercises").find((r) => r.id === id);
  if (!row) return;
  await upsert("plan_day_exercises", { ...row, [field]: Math.max(0, Number(value) || 0) });
}

async function applySwap(newExId) {
  const id = state.modal?.pdeId;
  const row = getTable("plan_day_exercises").find((r) => r.id === id);
  if (!row) return;
  const ex = getExerciseById(newExId);
  await upsert("plan_day_exercises", {
    ...row,
    exercise_id: ex?.custom ? null : newExId,
    custom_exercise_id: ex?.custom ? newExId : null,
  });
  state.modal = null;
  render();
}

async function addExerciseToDay(exId) {
  const dayId = state.modal?.dayId;
  if (!dayId) return;
  const ex = getExerciseById(exId);
  const sibs = getPlanDayExercises(dayId);
  const pos = sibs.length ? Math.max(...sibs.map((r) => r.position || 0)) + 1 : 1;
  await upsert("plan_day_exercises", {
    id: newId(),
    plan_day_id: dayId,
    user_id: currentUserId(),
    exercise_id: ex?.custom ? null : exId,
    custom_exercise_id: ex?.custom ? exId : null,
    position: pos,
    target_sets: 3,
    target_reps_low: 8,
    target_reps_high: 12,
    target_rest_seconds: 90,
  });
  state.modal = null;
  render();
}

// ---------------------------------------------------------------------
// WORKOUT SESSION
// ---------------------------------------------------------------------
function startWorkout(dayId) {
  const plan = getActivePlan();
  if (!plan) return;
  const days = getPlanDays(plan.id);
  const day = days.find((d) => d.id === dayId) || days[0];
  if (!day) return;
  const rows = getPlanDayExercises(day.id);
  state.activeWorkout = {
    id: newId(),
    planId: plan.id,
    planDayId: day.id,
    dayName: day.name,
    startedAt: Date.now(),
    exercises: rows.map((r) => {
      const ex = getExerciseById(r.exercise_id || r.custom_exercise_id);
      return {
        exercise_id: r.exercise_id,
        custom_exercise_id: r.custom_exercise_id,
        name: ex?.name || "Exercise",
        muscle: ex?.primary_muscle || "",
        rest: r.target_rest_seconds || 90,
        target: `${r.target_sets}×${r.target_reps_low}-${r.target_reps_high}`,
        sets: Array.from({ length: Math.max(1, r.target_sets || 3) }, () => ({ weight: "", reps: r.target_reps_low || 10, done: false })),
      };
    }),
  };
  state.selectedPlanDayId = day.id;
  state.view = "workout";
  saveState();
  render();
}

function toggleSet(ei, si) {
  const ex = state.activeWorkout.exercises[ei];
  const set = ex.sets[si];
  set.done = !set.done;
  // Marking a set done starts a rest timer seeded from the exercise's target.
  if (set.done) {
    state.restTimer = { startedAt: Date.now(), duration: ex.rest || 90, label: ex.name };
  }
  render();
}

function updateSessionSet(ei, si, field, value) {
  state.activeWorkout.exercises[ei].sets[si][field] = value;
}

function addSessionSet(ei) {
  const sets = state.activeWorkout.exercises[ei].sets;
  const prev = sets[sets.length - 1] || { weight: "", reps: 10 };
  sets.push({ weight: prev.weight, reps: prev.reps, done: false });
  render();
}

async function completeWorkout() {
  const w = state.activeWorkout;
  if (!w) return;
  const uid = currentUserId();
  const performedAt = new Date(w.startedAt).toISOString();
  const duration = getDurationSeconds(w);
  const priorBest = bestE1RMByExercise(getAllSets()); // before this session is saved
  await upsert("workouts", {
    id: w.id,
    user_id: uid,
    plan_id: w.planId,
    plan_day_id: w.planDayId,
    performed_at: performedAt,
    duration_seconds: duration,
    notes: "",
  });
  const newSets = [];
  for (const ex of w.exercises) {
    let n = 1;
    for (const s of ex.sets) {
      if (!s.done) continue;
      const kg = Math.round((toKg(s.weight || 0, unitPref()) || 0) * 100) / 100;
      const row = {
        id: newId(),
        workout_id: w.id,
        user_id: uid,
        exercise_id: ex.exercise_id,
        custom_exercise_id: ex.custom_exercise_id,
        set_number: n++,
        weight: kg,
        reps: Number(s.reps) || 0,
        is_done: true,
        is_warmup: false,
        performed_at: performedAt,
      };
      newSets.push(row);
      await upsert("workout_sets", row);
    }
  }
  const prs = detectPRs(priorBest, newSets);
  const prKeys = Object.keys(prs);
  state.activeWorkout = null;
  state.restTimer = null;
  state.modal = null;
  state.view = "history";
  saveState();
  render();
  if (prKeys.length) {
    const names = prKeys.map((k) => getExerciseById(k)?.name || "a lift").slice(0, 2);
    showToast(`🎉 New PR — ${names.join(", ")}${prKeys.length > 2 ? ` +${prKeys.length - 2} more` : ""}`);
  } else {
    showToast("Workout saved.");
  }
}

// ---------------------------------------------------------------------
// VIEWS  (Phase 1: data-driven shells; plans/logging arrive in later phases)
// ---------------------------------------------------------------------
function homeView() {
  const plan = getActivePlan();
  const heading = pageHeading("Personal training", `Good ${getGreeting()}, ${escapeHtml(displayName())}.`, formatToday());
  if (!plan) {
    return `
      ${heading}
      <section class="hero-card card">
        <div class="hero-content">
          <div class="hero-topline"><span class="live-dot"></span>Let's get set up</div>
          <div class="hero-day">Welcome to Form</div>
          <h2>Build your training plan</h2>
          <div class="hero-meta">
            <span>${icon("target")} Tailored to your goal</span>
            <span>${icon("dumbbell")} 84-exercise library</span>
            <span>${icon("chart")} Real progress tracking</span>
          </div>
          <button class="primary-button light" type="button" data-action="navigate" data-view="plan">${icon("arrowRight")} Set up my plan</button>
        </div>
      </section>`;
  }

  const days = getPlanDays(plan.id);
  const nextDay = getNextPlanDay(plan, days);
  const nextRows = nextDay ? getPlanDayExercises(nextDay.id) : [];
  const workouts = getWorkouts();
  const weekCount = workoutsThisWeek(workouts).length;
  const goal = state.profile?.weekly_workout_goal || 3;
  const recent = workouts.slice(0, 3);
  const heroButton = state.activeWorkout
    ? `<button class="primary-button light" type="button" data-action="navigate" data-view="workout">${icon("play")} Continue workout</button>`
    : `<button class="primary-button light" type="button" data-action="start-workout" data-day-id="${nextDay?.id || ""}">${icon("play")} Start workout</button>`;

  return `
    ${heading}
    <div class="grid home-layout">
      <div class="home-main">
        <section class="hero-card card">
          <div class="hero-content">
            <div class="hero-topline"><span class="live-dot"></span>${state.activeWorkout ? "Workout in progress" : "Up next"}</div>
            <div class="hero-day">${escapeHtml(plan.name)}</div>
            <h2>${escapeHtml(nextDay?.name || "Your session")}</h2>
            <div class="hero-meta">
              <span>${icon("dumbbell")} ${nextRows.length} exercises</span>
              <span>${icon("list")} ${escapeHtml(SPLIT_LABELS[plan.split_type] || plan.split_type)}</span>
            </div>
            ${heroButton}
          </div>
        </section>
        <div class="grid stats-grid">
          ${statCard("flame", "orange", "This week", `${weekCount}/${goal}`, weekCount >= goal ? "Goal met" : `${Math.max(0, goal - weekCount)} to go`)}
          ${statCard("activity", "blue", "Sessions logged", `${workouts.length}`, "All time")}
          ${statCard("trophy", "mint", "Active plan", `${days.length} days`, escapeHtml(SPLIT_LABELS[plan.split_type] || ""))}
        </div>
        <section class="section-block">
          <div class="section-header">
            <h2>Recent activity</h2>
            <button class="text-button" type="button" data-action="navigate" data-view="history">View all</button>
          </div>
          <div class="session-list">${recent.length ? recent.map(sessionRow).join("") : `<div class="card">${emptyState("No sessions yet", "Start your first workout to see it here.", "")}</div>`}</div>
        </section>
      </div>
      <aside class="side-stack">
        <article class="card consistency-card">
          <div class="small-card-title">Goal progress</div>
          <div class="ring-layout">
            <div class="progress-ring" style="--progress: ${Math.min(100, Math.round((weekCount / goal) * 100))}">
              <div class="progress-ring-label">${weekCount}/${goal}</div>
            </div>
            <div class="ring-copy">
              <strong>${Math.max(0, goal - weekCount)} left</strong>
              <span>Complete ${goal} workouts to close your weekly ring.</span>
            </div>
          </div>
        </article>
        <article class="card next-card">
          <div class="small-card-title">Inside this session</div>
          <div class="next-title">${escapeHtml(nextDay?.name || "Session")}</div>
          <div class="next-meta">${nextRows.length} exercises</div>
          <div class="exercise-dots">
            ${nextRows.map((r) => { const ex = getExerciseById(r.exercise_id || r.custom_exercise_id); return `<span class="exercise-dot">${escapeHtml((ex?.name || "?").slice(0, 1))}</span>`; }).join("")}
          </div>
          <button class="soft-button" type="button" data-action="navigate" data-view="plan">View your plan ${icon("arrowRight")}</button>
        </article>
      </aside>
    </div>`;
}

function sessionRow(w) {
  const day = getTable("plan_days").find((d) => d.id === w.plan_day_id);
  const vol = workoutVolumeKg(w.id);
  return `
    <article class="card session-row">
      <div class="session-glyph">${icon("dumbbell")}</div>
      <div class="session-info">
        <div class="row-title">${escapeHtml(day?.name || "Workout")}</div>
        <div class="row-subtitle">${formatDate(w.performed_at, { weekday: "short", month: "short", day: "numeric" })} · ${Math.round((w.duration_seconds || 0) / 60)} min</div>
      </div>
      <div class="row-value">${formatWeight(vol, unitPref(), 0)}</div>
    </article>`;
}

function workoutView() {
  if (state.activeWorkout) return activeWorkoutView();
  return workoutSetupView();
}

function workoutSetupView() {
  const plan = getActivePlan();
  if (!plan) {
    return `
      ${pageHeading("Training session", "Ready when you are.", "Your workouts are built from your active plan.")}
      <section class="card">${emptyState("No active plan", "Generate a plan first, then start a session here.", `<button class="primary-button" type="button" data-action="navigate" data-view="plan">Set up my plan</button>`)}</section>`;
  }
  const days = getPlanDays(plan.id);
  const selectedId = days.find((d) => d.id === state.selectedPlanDayId) ? state.selectedPlanDayId : days[0]?.id;
  const day = days.find((d) => d.id === selectedId);
  const rows = day ? getPlanDayExercises(day.id) : [];
  return `
    ${pageHeading("Training session", "Ready when you are.", "Pick a day from your plan and start logging.")}
    <div class="toolbar">
      <div class="day-selector" role="tablist" aria-label="Plan day">
        ${days
          .map(
            (d) =>
              `<button class="day-pill ${d.id === selectedId ? "active" : ""}" type="button" role="tab" aria-selected="${d.id === selectedId}" data-action="select-plan-day" data-day-id="${d.id}">${escapeHtml(d.name)}</button>`,
          )
          .join("")}
      </div>
    </div>
    <section class="card inactive-workout">
      <div class="inactive-workout-head">
        <div>
          <div class="inactive-day">${escapeHtml(plan.name)}</div>
          <h2>${escapeHtml(day?.name || "Session")}</h2>
          <p class="inactive-workout-copy">${rows.length} exercises · weights logged in ${unitLabel(unitPref())}. Targets come from your plan and are fully editable as you train.</p>
        </div>
        <div><button class="primary-button" type="button" data-action="start-workout" data-day-id="${selectedId}" ${rows.length ? "" : "disabled"}>${icon("play")} Start workout</button></div>
      </div>
      <div class="exercise-preview-list">
        ${rows
          .map((r, i) => {
            const ex = getExerciseById(r.exercise_id || r.custom_exercise_id);
            return `<div class="preview-row">
              <div class="preview-number">${String(i + 1).padStart(2, "0")}</div>
              <div class="row-title">${escapeHtml(ex?.name || "Exercise")}</div>
              <div class="row-subtitle">${r.target_sets} × ${r.target_reps_low}-${r.target_reps_high}</div>
            </div>`;
          })
          .join("")}
      </div>
    </section>`;
}

function activeWorkoutView() {
  const w = state.activeWorkout;
  const stats = sessionStats(w);
  const progress = stats.totalSets ? Math.round((stats.completedSets / stats.totalSets) * 100) : 0;
  return `
    ${pageHeading("Active training", `${escapeHtml(w.dayName)} session`, "Log each working set as you go — it saves when you finish.")}
    <section class="card workout-hero">
      <div class="workout-hero-main">
        <div class="workout-status"><span class="live-dot"></span>Live session</div>
        <div class="workout-title">${escapeHtml(w.dayName)}</div>
        <div class="workout-summary">${stats.completedSets} of ${stats.totalSets} sets · ${stats.volume} ${unitLabel(unitPref())} volume</div>
        <div class="workout-progress-wrap">
          <div class="workout-progress-track"><div class="workout-progress" style="width:${progress}%"></div></div>
          <div class="workout-progress-label">${progress}%</div>
        </div>
      </div>
      <div class="workout-hero-side">
        <div class="timer-box">
          <div class="timer-label">Elapsed</div>
          <div class="timer-text">${formatDuration(getDurationSeconds(w))}</div>
        </div>
        <button class="primary-button" type="button" data-action="finish-workout">${icon("check")} Finish workout</button>
      </div>
    </section>
    ${restTimerBar()}
    <div class="workout-list">
      ${w.exercises.map((ex, i) => exerciseCard(ex, i)).join("")}
    </div>`;
}

function exerciseCard(ex, exerciseIndex) {
  const u = unitLabel(unitPref());
  return `
    <article class="card exercise-card">
      <div class="exercise-card-header">
        <div class="exercise-icon">${icon(ex.muscle === "Core" ? "target" : "dumbbell")}</div>
        <div class="exercise-card-main">
          <div class="exercise-card-title">${escapeHtml(ex.name)}</div>
          <div class="exercise-card-subtitle">Target ${escapeHtml(ex.target)} · ${ex.rest}s rest</div>
        </div>
        <div class="muscle-tag">${escapeHtml(ex.muscle)}</div>
      </div>
      <table class="set-table">
        <thead><tr><th>Set</th><th>Weight (${u})</th><th>Reps</th><th>Done</th></tr></thead>
        <tbody>
          ${ex.sets
            .map(
              (set, setIndex) => `
                <tr>
                  <td><span class="set-number">${String(setIndex + 1).padStart(2, "0")}</span></td>
                  <td><input class="set-input" type="number" min="0" inputmode="decimal" aria-label="${escapeHtml(ex.name)} set ${setIndex + 1} weight" value="${set.weight ?? ""}" data-action="set-input" data-field="weight" data-ex="${exerciseIndex}" data-set="${setIndex}" /></td>
                  <td><input class="set-input" type="number" min="0" inputmode="numeric" aria-label="${escapeHtml(ex.name)} set ${setIndex + 1} reps" value="${set.reps ?? ""}" data-action="set-input" data-field="reps" data-ex="${exerciseIndex}" data-set="${setIndex}" /></td>
                  <td><button class="set-complete ${set.done ? "done" : ""}" type="button" aria-label="${set.done ? "Mark not done" : "Complete"} ${escapeHtml(ex.name)} set ${setIndex + 1}" data-action="toggle-set" data-ex="${exerciseIndex}" data-set="${setIndex}">${icon("check")}</button></td>
                </tr>`,
            )
            .join("")}
        </tbody>
      </table>
      <button class="add-set" type="button" data-action="add-set" data-ex="${exerciseIndex}">+ Add set</button>
    </article>`;
}

function restTimerBar() {
  const rt = state.restTimer;
  if (!rt) return "";
  const remaining = Math.max(0, rt.duration - Math.floor((Date.now() - rt.startedAt) / 1000));
  return `
    <div class="rest-bar" role="status" aria-live="polite">
      <div class="rest-bar-main">
        <span class="rest-bar-label">${icon("clock")} Rest · ${escapeHtml(rt.label)}</span>
        <span class="rest-remaining">${formatDuration(remaining)}</span>
      </div>
      <button class="soft-button" type="button" data-action="skip-rest">Skip</button>
    </div>`;
}

function planView() {
  if (state.planChoices) return planChoicesView();
  const plan = getActivePlan();
  if (!plan) return planEmptyView();
  return planDetailView(plan);
}

function planEmptyView() {
  return `
    ${pageHeading("Your program", "Let's build your plan.", "We'll generate a few options tailored to your goal, schedule, and equipment.")}
    <section class="card plan-generate-card">
      <div class="modal-icon accent">${icon("target")}</div>
      <h2>Generate your plan</h2>
      <p>Based on your answers: ${escapeHtml(humanize(state.profile?.primary_goal || "general"))} · ${escapeHtml(state.profile?.days_per_week || 3)} days/week · ${escapeHtml(humanize(state.profile?.available_equipment || "full_gym"))}.</p>
      <button class="primary-button" type="button" data-action="generate-plans">${icon("activity")} Generate plan options</button>
    </section>`;
}

function planChoicesView() {
  return `
    ${pageHeading("Choose your plan", "Pick the one that fits.", "Each is built from your goal and equipment. You can fine-tune it after.", `<button class="secondary-button" type="button" data-action="cancel-choices">Cancel</button>`)}
    <div class="grid plan-choice-grid">
      ${state.planChoices.map((v, i) => planOptionCard(v, i)).join("")}
    </div>`;
}

function planOptionCard(v, idx) {
  const topMuscles = Object.entries(v.weeklySets)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([m, s]) => `${m} ${s}`)
    .join(" · ");
  return `
    <article class="card plan-option">
      <div class="plan-option-head">
        <div>
          <div class="plan-option-name">${escapeHtml(v.name)}</div>
          <div class="plan-option-split">${escapeHtml(SPLIT_LABELS[v.split_type] || v.split_type)} · ${v.days_per_week} days</div>
        </div>
        <div class="plan-option-count">${v.totalExercises}<span>moves</span></div>
      </div>
      <p class="plan-option-desc">${escapeHtml(v.description)}</p>
      <div class="plan-option-days">
        ${v.days
          .map(
            (d) =>
              `<div class="plan-option-day"><strong>${escapeHtml(d.name)}</strong><span>${d.exercises
                .slice(0, 4)
                .map((e) => escapeHtml(e.name))
                .join(", ")}${d.exercises.length > 4 ? "…" : ""}</span></div>`,
          )
          .join("")}
      </div>
      <div class="plan-option-foot">${escapeHtml(topMuscles)} sets/wk</div>
      <button class="primary-button plan-option-pick" type="button" data-action="choose-plan" data-idx="${idx}">${icon("check")} Use this plan</button>
    </article>`;
}

function planDetailView(plan) {
  const editing = state.builder === plan.id;
  const plans = getPlans();
  const days = getPlanDays(plan.id);
  const switcher =
    plans.length > 1
      ? `<label class="plan-switch"><span class="field-label">Active plan</span>
          <select class="select-input" data-action="switch-plan">
            ${plans.map((p) => `<option value="${p.id}" ${p.id === plan.id ? "selected" : ""}>${escapeHtml(p.name)}</option>`).join("")}
          </select></label>`
      : "";
  const actions = `
    <div class="plan-detail-actions">
      <button class="${editing ? "primary-button" : "secondary-button"}" type="button" data-action="toggle-builder" data-id="${plan.id}">${editing ? icon("check") + " Done editing" : icon("settings") + " Edit plan"}</button>
      <button class="secondary-button" type="button" data-action="generate-plans">${icon("activity")} New plan</button>
    </div>`;
  return `
    ${pageHeading("Your program", escapeHtml(plan.name), `${escapeHtml(SPLIT_LABELS[plan.split_type] || plan.split_type)} · ${days.length}-day split`, actions)}
    ${switcher}
    <div class="grid plan-day-grid ${editing ? "is-editing" : ""}">
      ${days.map((d) => planDayCard(d, editing)).join("")}
    </div>`;
}

function planDayCard(day, editing) {
  const rows = getPlanDayExercises(day.id);
  return `
    <article class="card plan-day">
      <div class="plan-day-head">
        <h3>${escapeHtml(day.name)}</h3>
        <span class="plan-day-focus">${rows.length} exercise${rows.length === 1 ? "" : "s"}</span>
      </div>
      <div class="plan-exercises">
        ${rows.length ? rows.map((r, i) => pdeRow(r, i, rows.length, editing)).join("") : `<p class="plan-empty-day">No exercises yet.</p>`}
      </div>
      ${
        editing
          ? `<button class="add-set" type="button" data-action="add-to-day" data-day-id="${day.id}">+ Add exercise</button>`
          : `<button class="text-button" type="button" data-action="start-workout" data-day-id="${day.id}">Start this day ${icon("arrowRight")}</button>`
      }
    </article>`;
}

function pdeRow(r, index, count, editing) {
  const ex = getExerciseById(r.exercise_id || r.custom_exercise_id);
  const name = ex?.name || "Exercise";
  const muscle = ex?.primary_muscle || "";
  if (!editing) {
    return `
      <div class="plan-exercise">
        <div>
          <div class="plan-exercise-name">${escapeHtml(name)}</div>
          <div class="plan-exercise-group">${escapeHtml(muscle)} · ${r.target_sets}×${r.target_reps_low}-${r.target_reps_high} · ${r.target_rest_seconds}s rest</div>
        </div>
      </div>`;
  }
  return `
    <div class="pde-edit">
      <div class="pde-edit-top">
        <div class="plan-exercise-name">${escapeHtml(name)} <span class="pde-muscle">${escapeHtml(muscle)}</span></div>
        <div class="pde-tools">
          <button class="card-delete" type="button" data-action="pde-move" data-id="${r.id}" data-dir="-1" ${index === 0 ? "disabled" : ""} aria-label="Move up">${icon("chevronLeft")}</button>
          <button class="card-delete" type="button" data-action="pde-move" data-id="${r.id}" data-dir="1" ${index === count - 1 ? "disabled" : ""} aria-label="Move down">${icon("chevronRight")}</button>
          <button class="card-delete" type="button" data-action="swap-pde" data-id="${r.id}" aria-label="Swap exercise">${icon("activity")}</button>
          <button class="card-delete" type="button" data-action="ask-delete-pde" data-id="${r.id}" aria-label="Remove">${icon("trash")}</button>
        </div>
      </div>
      <div class="pde-fields">
        <label>Sets<input class="set-input" type="number" min="1" value="${r.target_sets}" data-action="pde-input" data-id="${r.id}" data-field="target_sets" /></label>
        <label>Rep low<input class="set-input" type="number" min="1" value="${r.target_reps_low}" data-action="pde-input" data-id="${r.id}" data-field="target_reps_low" /></label>
        <label>Rep high<input class="set-input" type="number" min="1" value="${r.target_reps_high}" data-action="pde-input" data-id="${r.id}" data-field="target_reps_high" /></label>
        <label>Rest s<input class="set-input" type="number" min="0" step="5" value="${r.target_rest_seconds}" data-action="pde-input" data-id="${r.id}" data-field="target_rest_seconds" /></label>
      </div>
    </div>`;
}

function progressView() {
  const sets = getAllSets();
  const workouts = getWorkouts();
  if (!workouts.length) {
    return `
      ${pageHeading("Training analytics", "Progress, made visible.", "Charts and PRs appear here once you log workouts.")}
      <section class="card">${emptyState("No data yet", "Complete a workout and your volume and PRs will show up here.", "")}</section>`;
  }
  const u = unitPref();
  const totalVolKg = totalVolume(sets);
  const avgDur = Math.round(workouts.reduce((t, w) => t + (w.duration_seconds || 0), 0) / workouts.length / 60);
  const series = weeklyVolumeSeries(sets, 8);
  const best = bestE1RMByExercise(sets);
  const prs = Object.entries(best)
    .map(([key, v]) => ({ key, ...v, name: getExerciseById(key)?.name || "Exercise" }))
    .sort((a, b) => b.e1rm - a.e1rm)
    .slice(0, 6);
  return `
    ${pageHeading("Training analytics", "Progress, made visible.", "Your logged workouts, translated into useful signals.")}
    <div class="grid progress-layout">
      <div class="progress-main">
        <div class="grid metric-strip">
          ${metricCard("Total volume", formatWeight(totalVolKg, u, 0))}
          ${metricCard("Workouts", String(workouts.length))}
          ${metricCard("Avg. session", `${avgDur || 0} min`)}
        </div>
        ${volumeChart(series, u)}
      </div>
      <aside class="progress-side">
        <article class="card mini-card">
          <div class="small-card-title">Personal records</div>
          <div class="records-list">
            ${prs.length ? prs.map((p) => recordRow(p, u)).join("") : `<p class="plan-empty-day">Log sets to see PRs.</p>`}
          </div>
        </article>
      </aside>
    </div>`;
}

function metricCard(label, value, foot = "") {
  return `
    <article class="card metric-card">
      <div class="metric-label">${label}</div>
      <div class="metric-value">${value}</div>
      ${foot ? `<div class="metric-foot">${foot}</div>` : ""}
    </article>`;
}

function recordRow(pr, u) {
  return `
    <div class="record-row">
      <div class="record-glyph">${icon("trophy")}</div>
      <div class="session-info">
        <div class="row-title">${escapeHtml(pr.name)}</div>
        <div class="row-subtitle">Best: ${formatWeight(pr.weight, u, 0)} × ${pr.reps}</div>
      </div>
      <div class="row-value">${formatWeight(pr.e1rm, u, 0)}<span class="record-1rm">est. 1RM</span></div>
    </div>`;
}

function volumeChart(series, u) {
  const vals = series.map((b) => Math.round(fromKg(b.volume, u)));
  const labels = series.map((b) => `${b.start.getMonth() + 1}/${b.start.getDate()}`);
  const width = 760;
  const height = 210;
  const padX = 28;
  const padY = 22;
  const n = vals.length;
  const max = Math.max(...vals, 1) * 1.12;
  const chartH = height - padY * 2;
  const chartW = width - padX * 2;
  const points = vals.map((v, i) => ({
    x: padX + (chartW / Math.max(1, n - 1)) * i,
    y: height - padY - (v / max) * chartH,
  }));
  const line = points.map((p) => `${p.x},${p.y}`).join(" ");
  const area = `${padX},${height - padY} ${line} ${width - padX},${height - padY}`;
  return `
    <article class="card chart-card">
      <div class="chart-header">
        <div><h2>Training volume</h2><div class="chart-subtitle">Last ${n} weeks · ${unitLabel(u)}</div></div>
        <div class="chart-legend">● Volume</div>
      </div>
      <svg class="line-chart" role="img" aria-label="Weekly training volume trend" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
        <defs><linearGradient id="chartGradient" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#2069e0" stop-opacity=".23"/><stop offset="100%" stop-color="#2069e0" stop-opacity="0"/></linearGradient></defs>
        ${[0, 1, 2, 3].map((i) => `<line class="chart-grid" x1="${padX}" x2="${width - padX}" y1="${padY + (chartH / 3) * i}" y2="${padY + (chartH / 3) * i}" />`).join("")}
        <polygon class="chart-area" points="${area}" />
        <polyline class="chart-line" points="${line}" />
        ${points.map((p) => `<circle class="chart-point" cx="${p.x}" cy="${p.y}" r="4" />`).join("")}
        ${labels.map((l, i) => `<text class="chart-label" x="${points[i].x}" y="${height - 4}" text-anchor="middle">${l}</text>`).join("")}
      </svg>
    </article>`;
}

function historyView() {
  const workouts = getWorkouts();
  return `
    ${pageHeading("Workout archive", "Your completed sessions.", "Review the volume, time, and exercises behind your progress.")}
    <div class="history-list">
      ${workouts.length ? workouts.map(historyCard).join("") : `<section class="card">${emptyState("No workouts yet", "Finish your first training session and it'll appear here.", "")}</section>`}
    </div>`;
}

function historyCard(w) {
  const day = getTable("plan_days").find((d) => d.id === w.plan_day_id);
  const sets = getWorkoutSets(w.id);
  const vol = sets.reduce((t, s) => t + (Number(s.weight) || 0) * (Number(s.reps) || 0), 0);
  const exNames = [...new Set(sets.map((s) => getExerciseById(s.exercise_id || s.custom_exercise_id)?.name).filter(Boolean))];
  const legacy = w.notes && w.notes.startsWith("Imported from v1");
  return `
    <article class="card history-card">
      <div class="history-date">${formatDate(w.performed_at, { weekday: "long", month: "long", day: "numeric" })}</div>
      <h3>${escapeHtml(day?.name || "Workout")}${legacy ? ` <span class="custom-badge">v1</span>` : ""}</h3>
      <div class="history-meta">
        <span><strong>${Math.round((w.duration_seconds || 0) / 60)}</strong> min</span>
        <span><strong>${sets.length}</strong> sets</span>
        <span><strong>${formatWeight(vol, unitPref(), 0)}</strong> volume</span>
      </div>
      <div class="history-exercises">${legacy ? escapeHtml(w.notes) : escapeHtml(exNames.join(" · ")) || "No sets logged"}</div>
    </article>`;
}

function libraryView() {
  const filters = ["All", ...MUSCLE_GROUPS];
  const search = state.librarySearch.toLowerCase().trim();
  const all = getAllExercises();
  const filtered = all.filter((ex) => {
    const matchesFilter = state.libraryFilter === "All" || ex.primary_muscle === state.libraryFilter;
    const matchesSearch =
      !search || `${ex.name} ${ex.primary_muscle} ${ex.equipment}`.toLowerCase().includes(search);
    return matchesFilter && matchesSearch;
  });
  return `
    ${pageHeading(
      "Exercise library",
      "Know every movement.",
      `Browse the ${all.length} movements available for your plans.`,
    )}
    <div class="library-toolbar">
      <label class="search">
        ${icon("search")}
        <input class="search-input" type="search" placeholder="Search exercises" value="${escapeHtml(state.librarySearch)}" data-action="library-search" aria-label="Search exercises" />
      </label>
      <button class="secondary-button" type="button" data-action="add-exercise">${icon("plus")} Add exercise</button>
    </div>
    <div class="filter-row">
      ${filters
        .map(
          (filter) =>
            `<button class="filter-pill ${state.libraryFilter === filter ? "active" : ""}" type="button" data-action="library-filter" data-filter="${escapeHtml(filter)}" aria-pressed="${state.libraryFilter === filter}">${escapeHtml(filter)}</button>`,
        )
        .join("")}
    </div>
    ${
      filtered.length
        ? `<div class="grid library-grid">${filtered.map(libraryCard).join("")}</div>`
        : `<div class="card">${emptyState("No exercises found", "Try a different movement name or muscle group.", "")}</div>`
    }`;
}

function libraryCard(ex) {
  return `
    <article class="card library-card">
      <div class="library-card-top">
        <div class="exercise-icon">${icon(ex.primary_muscle === "Core" ? "target" : "dumbbell")}</div>
        ${
          ex.custom
            ? `<button class="card-delete" type="button" data-action="ask-delete-custom" data-id="${ex.id}" aria-label="Delete ${escapeHtml(ex.name)}">${icon("trash")}</button>`
            : ""
        }
      </div>
      <h3>${escapeHtml(ex.name)}${ex.custom ? ` <span class="custom-badge">Custom</span>` : ""}</h3>
      <div class="library-card-meta"><span>${escapeHtml(ex.primary_muscle)}</span><span>${escapeHtml(ex.equipment)}</span></div>
    </article>`;
}

// ---------------------------------------------------------------------
// MODALS
// ---------------------------------------------------------------------
function modal() {
  if (!state.modal) return "";
  if (state.modal === "settings") return settingsModal();
  if (state.modal === "custom") return customExerciseModal();
  if (state.modal === "finish") return finishModal();
  if (typeof state.modal === "object") {
    if (state.modal.type === "swap") return swapModal();
    if (state.modal.type === "pick") return pickModal();
  }
  return "";
}

function finishModal() {
  const stats = sessionStats();
  return `
    <div class="modal-wrap" data-action="close-modal">
      <section class="modal" role="dialog" aria-modal="true" aria-labelledby="finish-title">
        <div class="modal-icon">${icon("trophy")}</div>
        <h2 id="finish-title">Finish this workout?</h2>
        <p>Your completed sets will be saved to your history.</p>
        <div class="modal-summary">
          <div class="modal-stat"><span>Time</span><strong>${formatDuration(getDurationSeconds())}</strong></div>
          <div class="modal-stat"><span>Sets</span><strong>${stats.completedSets}/${stats.totalSets}</strong></div>
          <div class="modal-stat"><span>Volume</span><strong>${stats.volume} ${unitLabel(unitPref())}</strong></div>
        </div>
        <div class="modal-actions">
          <button class="secondary-button" type="button" data-action="close-modal">Keep training</button>
          <button class="primary-button" type="button" data-action="complete-workout">${icon("check")} Save workout</button>
        </div>
      </section>
    </div>`;
}

function swapModal() {
  const row = getTable("plan_day_exercises").find((r) => r.id === state.modal.pdeId);
  const current = row && getExerciseById(row.exercise_id || row.custom_exercise_id);
  const muscle = current?.primary_muscle;
  const pattern = current?.movement_pattern;
  let alts = getAllExercises().filter((e) => e.id !== current?.id && e.primary_muscle === muscle);
  alts.sort((a, b) => (b.movement_pattern === pattern ? 1 : 0) - (a.movement_pattern === pattern ? 1 : 0));
  alts = alts.slice(0, 14);
  return `
    <div class="modal-wrap" data-action="close-modal">
      <section class="modal modal-form" role="dialog" aria-modal="true" aria-labelledby="swap-title">
        <div class="modal-icon accent">${icon("activity")}</div>
        <h2 id="swap-title">Swap exercise</h2>
        <p>Same-muscle alternatives for ${escapeHtml(current?.name || "this movement")}.</p>
        <div class="modal-body pick-list">
          ${
            alts.length
              ? alts
                  .map(
                    (e) =>
                      `<button class="pick-item" type="button" data-action="apply-swap" data-id="${e.id}"><span>${escapeHtml(e.name)}</span><span class="pick-meta">${escapeHtml(e.primary_muscle)} · ${escapeHtml(e.equipment)}</span></button>`,
                  )
                  .join("")
              : "<p>No alternatives found.</p>"
          }
        </div>
        <div class="modal-actions"><button class="secondary-button" type="button" data-action="close-modal">Cancel</button></div>
      </section>
    </div>`;
}

function pickModal() {
  const q = (state.modal.search || "").toLowerCase().trim();
  let list = getAllExercises();
  if (q) list = list.filter((e) => `${e.name} ${e.primary_muscle} ${e.equipment}`.toLowerCase().includes(q));
  list = list.slice(0, 40);
  return `
    <div class="modal-wrap" data-action="close-modal">
      <section class="modal modal-form" role="dialog" aria-modal="true" aria-labelledby="pick-title">
        <div class="modal-icon accent">${icon("plus")}</div>
        <h2 id="pick-title">Add an exercise</h2>
        <label class="search pick-search">${icon("search")}<input class="search-input" id="pick-search" type="search" placeholder="Search exercises" value="${escapeHtml(state.modal.search || "")}" data-action="pick-search" aria-label="Search exercises" /></label>
        <div class="modal-body pick-list">
          ${list
            .map(
              (e) =>
                `<button class="pick-item" type="button" data-action="add-day-exercise" data-id="${e.id}"><span>${escapeHtml(e.name)}${e.custom ? ' <span class="custom-badge">Custom</span>' : ""}</span><span class="pick-meta">${escapeHtml(e.primary_muscle)} · ${escapeHtml(e.equipment)}</span></button>`,
            )
            .join("")}
        </div>
        <div class="modal-actions"><button class="secondary-button" type="button" data-action="close-modal">Cancel</button></div>
      </section>
    </div>`;
}

function customExerciseModal() {
  const opts = (list, labeler = (x) => x) =>
    list.map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(labeler(v))}</option>`).join("");
  return `
    <div class="modal-wrap" data-action="close-modal">
      <section class="modal modal-form" role="dialog" aria-modal="true" aria-labelledby="custom-title">
        <div class="modal-icon accent">${icon("circlePlus")}</div>
        <h2 id="custom-title">Add a custom exercise</h2>
        <p>It joins your library and plan builder alongside the 84 catalog movements.</p>
        <form class="modal-body" data-action="custom-submit-form">
          <div class="field">
            <label class="field-label" for="ce-name">Name</label>
            <input class="text-input" id="ce-name" type="text" placeholder="e.g. Landmine Press" required />
          </div>
          <div class="form-grid-2">
            <div class="field"><label class="field-label" for="ce-muscle">Primary muscle</label><select class="select-input" id="ce-muscle">${opts(MUSCLE_GROUPS)}</select></div>
            <div class="field"><label class="field-label" for="ce-equipment">Equipment</label><select class="select-input" id="ce-equipment">${opts(EQUIPMENT_TYPES, humanize)}</select></div>
            <div class="field"><label class="field-label" for="ce-category">Category</label><select class="select-input" id="ce-category">${opts(CATEGORIES, humanize)}</select></div>
            <div class="field"><label class="field-label" for="ce-pattern">Movement</label><select class="select-input" id="ce-pattern">${opts(MOVEMENT_PATTERNS, humanize)}</select></div>
            <div class="field"><label class="field-label" for="ce-compound">Type</label><select class="select-input" id="ce-compound"><option value="true">Compound</option><option value="false">Isolation</option></select></div>
          </div>
        </form>
        <div class="modal-actions">
          <button class="secondary-button" type="button" data-action="close-modal">Cancel</button>
          <button class="primary-button" type="button" data-action="create-custom-exercise">${icon("check")} Save exercise</button>
        </div>
      </section>
    </div>`;
}

function confirmModal() {
  const c = state.confirm;
  return `
    <div class="modal-wrap" data-action="close-confirm">
      <section class="modal" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
        <div class="modal-icon danger">${icon("trash")}</div>
        <h2 id="confirm-title">${escapeHtml(c.title)}</h2>
        <p>${escapeHtml(c.message)}</p>
        <div class="modal-actions">
          <button class="secondary-button" type="button" data-action="close-confirm">Cancel</button>
          <button class="danger-button" type="button" data-action="${c.action}" ${c.id ? `data-id="${escapeHtml(c.id)}"` : ""}>${escapeHtml(c.confirmLabel || "Confirm")}</button>
        </div>
      </section>
    </div>`;
}

async function createCustomExercise() {
  const name = val("ce-name");
  if (!name) {
    showToast("Give your exercise a name.");
    return;
  }
  await upsert("custom_exercises", {
    id: newId(),
    name,
    primary_muscle: document.getElementById("ce-muscle").value,
    category: document.getElementById("ce-category").value,
    equipment: document.getElementById("ce-equipment").value,
    movement_pattern: document.getElementById("ce-pattern").value,
    is_compound: document.getElementById("ce-compound").value === "true",
    created_at: new Date().toISOString(),
  });
  state.modal = null;
  render();
  showToast(`Added “${name}”.`);
}

function askDeleteCustom(id) {
  const ex = getCustomExercises().find((c) => c.id === id);
  state.confirm = {
    title: "Delete this exercise?",
    message: `“${ex?.name || "This exercise"}” will be removed from your library.`,
    confirmLabel: "Delete",
    action: "confirm-delete-custom",
    id,
  };
  render();
}

async function confirmDeleteCustom(id) {
  await remove("custom_exercises", id);
  state.confirm = null;
  render();
  showToast("Exercise deleted.");
}

function settingsModal() {
  const user = currentUser();
  return `
    <div class="modal-wrap" data-action="close-modal">
      <section class="modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <div class="modal-icon">${icon("settings")}</div>
        <h2 id="settings-title">Settings</h2>
        <div class="settings-rows">
          <div class="settings-row"><span>Signed in as</span><strong>${escapeHtml(user?.email || displayName())}</strong></div>
          <div class="settings-row"><span>Mode</span><strong>${isLocalMode() ? "Local (this device)" : "Synced account"}</strong></div>
        </div>
        ${
          isLocalMode()
            ? `<p class="settings-note">You're in local mode — data is saved in this browser only. Connect Supabase to enable accounts and cross-device sync.</p>`
            : ""
        }
        <div class="modal-actions">
          <button class="danger-button" type="button" data-action="reset-data">${icon("trash")} Reset local data</button>
          <button class="secondary-button" type="button" data-action="sign-out">${icon("signout")} Sign out</button>
        </div>
        <button class="text-button modal-close" type="button" data-action="close-modal">Close</button>
      </section>
    </div>`;
}

// ---------------------------------------------------------------------
// RENDER (with auth gating)
// ---------------------------------------------------------------------
const views = {
  home: homeView,
  workout: workoutView,
  plan: planView,
  progress: progressView,
  history: historyView,
  library: libraryView,
};

function render() {
  const app = document.getElementById("app");
  if (!state.booted) return;

  if (!isLoggedIn()) {
    app.innerHTML = authView();
    return;
  }

  // First-time users complete onboarding before reaching the app.
  if (state.profile && state.profile.onboarding_complete === false) {
    if (!state.onboarding) {
      state.onboarding = { step: 0, answers: seedAnswers(state.profile) };
    }
    app.innerHTML = renderOnboarding(state);
    return;
  }

  app.innerHTML = `
    <div class="app-shell">
      ${sidebar()}
      <main class="main-shell">
        ${topbar()}
        <div class="content">${(views[state.view] || homeView)()}</div>
      </main>
      ${mobileNav()}
      ${modal()}
      ${state.confirm ? confirmModal() : ""}
      ${state.toast ? `<div class="toast" role="status" aria-live="polite">${escapeHtml(state.toast)}</div>` : ""}
    </div>`;
}

// ---------------------------------------------------------------------
// TOAST
// ---------------------------------------------------------------------
let toastTimeout;
function showToast(message) {
  state.toast = message;
  render();
  window.clearTimeout(toastTimeout);
  toastTimeout = window.setTimeout(() => {
    state.toast = null;
    render();
  }, 2600);
}

// ---------------------------------------------------------------------
// RESET LOCAL DATA
// ---------------------------------------------------------------------
async function resetLocalData() {
  for (const key of ["form-pt-cache-v2", "form-pt-outbox-v2", "form-pt-ui-v2"]) {
    localStorage.removeItem(key);
  }
  resetUiState();
  state.booted = true;
  // keep the current identity; rebuild an empty profile + data
  await loadProfile();
  await loadUserData();
  state.modal = null;
  render();
  showToast("Local data reset.");
}

// ---------------------------------------------------------------------
// EVENT DELEGATION
// ---------------------------------------------------------------------
document.addEventListener("click", async (event) => {
  const trigger = event.target.closest("[data-action]");
  if (!trigger) return;
  const { action } = trigger.dataset;

  switch (action) {
    case "navigate":
      event.preventDefault();
      state.view = trigger.dataset.view;
      saveState();
      render();
      break;
    case "show-settings":
      state.modal = "settings";
      render();
      break;
    case "close-modal":
      if (event.target === trigger || trigger.matches("button")) {
        state.modal = null;
        render();
      }
      break;
    case "close-confirm":
      if (event.target === trigger || trigger.matches("button")) {
        state.confirm = null;
        render();
      }
      break;
    case "add-exercise":
      state.modal = "custom";
      render();
      break;
    case "create-custom-exercise":
      await createCustomExercise();
      break;
    case "ask-delete-custom":
      askDeleteCustom(trigger.dataset.id);
      break;
    case "confirm-delete-custom":
      await confirmDeleteCustom(trigger.dataset.id);
      break;
    case "onboarding-next":
      event.preventDefault();
      await onboardingNext();
      break;
    case "onboarding-back":
      onboardingBack();
      break;
    case "onboarding-toggle-muscle":
      togglePriorityMuscle(trigger.dataset.muscle);
      break;
    case "show-toast":
      showToast(trigger.dataset.message);
      break;
    case "library-filter":
      state.libraryFilter = trigger.dataset.filter;
      saveState();
      render();
      break;
    case "auth-tab":
      state.auth.mode = trigger.dataset.mode;
      state.auth.error = "";
      state.auth.notice = "";
      render();
      break;
    case "auth-magic":
      await submitMagic();
      break;
    case "auth-local":
      await continueLocal();
      break;
    case "sign-out":
      await signOut();
      break;
    case "reset-data":
      state.confirm = {
        title: "Reset local data?",
        message: "This clears your plans, workouts, and settings on this device and can't be undone.",
        confirmLabel: "Reset",
        action: "confirm-reset",
      };
      render();
      break;
    case "confirm-reset":
      state.confirm = null;
      await resetLocalData();
      break;
    case "generate-plans":
      generatePlanOptions();
      break;
    case "cancel-choices":
      state.planChoices = null;
      render();
      break;
    case "choose-plan":
      await choosePlan(Number(trigger.dataset.idx));
      break;
    case "toggle-builder":
      toggleBuilder(trigger.dataset.id);
      break;
    case "pde-move":
      await movePde(trigger.dataset.id, Number(trigger.dataset.dir));
      break;
    case "ask-delete-pde":
      askDeletePde(trigger.dataset.id);
      break;
    case "confirm-delete-pde":
      await confirmDeletePde(trigger.dataset.id);
      break;
    case "swap-pde":
      state.modal = { type: "swap", pdeId: trigger.dataset.id };
      render();
      break;
    case "apply-swap":
      await applySwap(trigger.dataset.id);
      break;
    case "add-to-day":
      state.modal = { type: "pick", dayId: trigger.dataset.dayId, search: "" };
      render();
      break;
    case "add-day-exercise":
      await addExerciseToDay(trigger.dataset.id);
      break;
    case "select-plan-day":
      state.selectedPlanDayId = trigger.dataset.dayId;
      saveState();
      render();
      break;
    case "start-workout":
      if (trigger.dataset.dayId) startWorkout(trigger.dataset.dayId);
      break;
    case "toggle-set":
      toggleSet(Number(trigger.dataset.ex), Number(trigger.dataset.set));
      break;
    case "add-set":
      addSessionSet(Number(trigger.dataset.ex));
      break;
    case "finish-workout":
      state.modal = "finish";
      render();
      break;
    case "complete-workout":
      await completeWorkout();
      break;
    case "skip-rest":
      state.restTimer = null;
      render();
      break;
  }
});

// change events: plan switcher + inline plan-edit fields (persist on commit)
document.addEventListener("change", (event) => {
  const el = event.target.closest("[data-action]");
  if (!el) return;
  if (el.dataset.action === "switch-plan") switchActivePlan(el.value);
  if (el.dataset.action === "pde-input") updatePdeField(el.dataset.id, el.dataset.field, el.value);
});

// Submit the auth form on Enter.
document.addEventListener("submit", async (event) => {
  if (event.target.closest("[data-action='auth-submit-form']")) {
    event.preventDefault();
    await submitAuth();
    return;
  }
  if (event.target.closest("[data-action='custom-submit-form']")) {
    event.preventDefault();
    await createCustomExercise();
    return;
  }
  if (event.target.closest("[data-action='onboarding-submit-form']")) {
    event.preventDefault();
    await onboardingNext();
  }
});

document.addEventListener("input", (event) => {
  const { action } = event.target.dataset;
  if (action === "library-search") {
    state.librarySearch = event.target.value;
    saveState();
    render();
    refocus(".search-input");
  }
  if (action === "set-input") {
    // live, no re-render (avoids focus loss); progress refreshes on toggle/finish
    updateSessionSet(Number(event.target.dataset.ex), Number(event.target.dataset.set), event.target.dataset.field, event.target.value);
  }
  if (action === "pick-search" && typeof state.modal === "object") {
    state.modal.search = event.target.value;
    render();
    refocus("#pick-search");
  }
});

function refocus(selector) {
  const el = document.querySelector(selector);
  if (el) {
    el.focus();
    if (typeof el.value === "string") el.setSelectionRange(el.value.length, el.value.length);
  }
}

// Escape closes any open dialog (keyboard operability).
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (state.confirm) {
    state.confirm = null;
    render();
  } else if (state.modal) {
    state.modal = null;
    render();
  }
});

// ---------------------------------------------------------------------
// BOOT
// ---------------------------------------------------------------------
// One-time import of v1 localStorage history into the current account.
async function runMigration() {
  try {
    const r = await migrateV1IfNeeded(currentUserId());
    if (r?.migrated) {
      await loadUserData();
      return r.count || 0;
    }
  } catch {}
  return 0;
}

async function boot() {
  loadUiPrefs();
  await bootSession();
  let migrated = 0;
  if (isLoggedIn()) {
    await loadProfile();
    await loadUserData();
    migrated = await runMigration();
  }
  state.booted = true;
  render();
  if (migrated) showToast(`Imported ${migrated} workout${migrated === 1 ? "" : "s"} from v1.`);

  if (isSupabaseConfigured) {
    auth.onChange(async (session) => {
      state.session = session;
      if (session) {
        await loadProfile();
        await loadUserData();
        const c = await runMigration();
        state.view = state.view || "home";
        render();
        if (c) showToast(`Imported ${c} workout${c === 1 ? "" : "s"} from v1.`);
      } else {
        state.profile = null;
        render();
      }
    });
  }
}

// 1s tick: live elapsed timer + rest countdown (both use Date.now() deltas,
// so they stay accurate even when the tab is backgrounded).
window.setInterval(() => {
  if (state.activeWorkout) {
    const t = document.querySelector(".timer-text");
    if (t) t.textContent = formatDuration(getDurationSeconds());
  }
  if (state.restTimer) {
    const remaining = Math.max(0, state.restTimer.duration - Math.floor((Date.now() - state.restTimer.startedAt) / 1000));
    const el = document.querySelector(".rest-remaining");
    if (el) el.textContent = formatDuration(remaining);
    if (remaining <= 0) {
      state.restTimer = null;
      render();
    }
  }
}, 1000);

boot();
