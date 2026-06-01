// =====================================================================
// Form Personal Training v2 — store (state + identity + data accessors)
// The "model" layer between the UI (app.js) and the offline data-layer.
// It hides the difference between a real Supabase session and the
// offline "local-only" account, so view code never branches on it.
// =====================================================================

import { auth, profileApi, isSupabaseConfigured } from "./supabase.js";
import { db, cache, syncAll, newId } from "./data-layer.js";
import { exercises as catalog, exercisesById } from "./exercises.js";

export { isSupabaseConfigured, newId };

// Per-user tables we sync/read through the data-layer (profiles handled below).
export const USER_TABLES = [
  "custom_exercises",
  "plans",
  "plan_days",
  "plan_day_exercises",
  "workouts",
  "workout_sets",
];

const UI_KEY = "form-pt-ui-v2"; // small slice of UI prefs (view, filters)
const LOCAL_USER_KEY = "form-pt-local-user"; // synthetic identity for local mode

// ---------------------------------------------------------------------
// CENTRAL UI STATE (one object, mutated in place, re-rendered by app.js)
// ---------------------------------------------------------------------
export function createUiState() {
  return {
    booted: false,
    session: null, // Supabase session when signed in for real
    localUser: null, // { id, email, display_name } in local-only mode
    profile: null, // profiles row for the current user
    view: "home",
    auth: { mode: "signin", busy: false, notice: "", error: "" },
    onboarding: null, // { step, answers } while the wizard is open
    planChoices: null, // generator output awaiting the user's pick
    builder: null, // working copy while editing a plan by hand
    selectedPlanDayId: null,
    activeWorkout: null,
    restTimer: null, // { startedAt, duration, label }
    libraryFilter: "All",
    librarySearch: "",
    modal: null,
    toast: null,
  };
}

export const state = createUiState();

export function resetUiState() {
  Object.assign(state, createUiState());
}

const PERSIST_KEYS = ["view", "libraryFilter", "librarySearch", "selectedPlanDayId"];

export function saveState() {
  const slice = {};
  for (const k of PERSIST_KEYS) slice[k] = state[k];
  try {
    localStorage.setItem(UI_KEY, JSON.stringify(slice));
  } catch {}
}

export function loadUiPrefs() {
  try {
    const saved = JSON.parse(localStorage.getItem(UI_KEY));
    if (saved) for (const k of PERSIST_KEYS) if (saved[k] !== undefined) state[k] = saved[k];
  } catch {}
}

// ---------------------------------------------------------------------
// IDENTITY (real session OR synthetic local user)
// ---------------------------------------------------------------------
export function getLocalUser() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_USER_KEY));
  } catch {
    return null;
  }
}

export function startLocalSession(displayName) {
  let u = getLocalUser();
  if (!u) u = { id: newId(), email: "you@local.device", display_name: displayName || "Athlete" };
  else if (displayName) u.display_name = displayName;
  localStorage.setItem(LOCAL_USER_KEY, JSON.stringify(u));
  state.localUser = u;
  return u;
}

export function clearLocalUser() {
  localStorage.removeItem(LOCAL_USER_KEY);
  state.localUser = null;
}

export function currentUser() {
  return state.session?.user ?? state.localUser ?? null;
}

export function currentUserId() {
  return currentUser()?.id ?? null;
}

export function isLoggedIn() {
  return !!currentUser();
}

// "Local mode" = no real Supabase session backing the current user.
export function isLocalMode() {
  return !state.session;
}

export function displayName() {
  const u = currentUser();
  return (
    state.profile?.display_name ||
    u?.user_metadata?.display_name ||
    u?.display_name ||
    (u?.email ? u.email.split("@")[0] : "") ||
    "Athlete"
  );
}

export function initials(name = displayName()) {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "··";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Read the current session on boot (keeps refresh logged in).
export async function bootSession() {
  state.session = null;
  if (isSupabaseConfigured) {
    try {
      state.session = await auth.getSession();
    } catch {
      state.session = null;
    }
  }
  if (!state.session) state.localUser = getLocalUser();
}

// ---------------------------------------------------------------------
// PROFILE (auto-created by trigger on real signup; mirrored in cache)
// ---------------------------------------------------------------------
function defaultProfile(userId, name) {
  return {
    id: userId,
    display_name: name || "",
    unit_preference: "lb", // app shows lb today; onboarding lets the user change
    weekly_workout_goal: 3,
    onboarding_complete: false,
  };
}

export async function loadProfile() {
  const uid = currentUserId();
  if (!uid) {
    state.profile = null;
    return null;
  }
  if (!isLocalMode() && isSupabaseConfigured) {
    try {
      const p = await profileApi.get(uid);
      if (p) {
        state.profile = p;
        cache.upsertRow("profiles", p);
        return p;
      }
    } catch {
      /* fall back to cache */
    }
  }
  let p = cache.getTable("profiles").find((r) => r.id === uid);
  if (!p) {
    p = defaultProfile(uid, currentUser()?.user_metadata?.display_name || currentUser()?.display_name);
    cache.upsertRow("profiles", p);
  }
  state.profile = p;
  return p;
}

export async function updateProfile(patch) {
  const uid = currentUserId();
  if (!uid) return null;
  const next = { ...(state.profile || { id: uid }), ...patch, id: uid };
  state.profile = next;
  cache.upsertRow("profiles", next);
  if (!isLocalMode() && isSupabaseConfigured) {
    try {
      await profileApi.update(uid, patch);
    } catch {
      /* stays in cache; offline */
    }
  }
  return next;
}

// ---------------------------------------------------------------------
// DATA ACCESS (always through the offline-first data-layer)
// ---------------------------------------------------------------------
export function getTable(table) {
  const uid = currentUserId();
  return cache
    .getTable(table)
    .filter((r) => !r.deleted_at && (r.user_id == null || r.user_id === uid));
}

export async function upsert(table, row) {
  const uid = currentUserId();
  const withUser = row.user_id ? row : { ...row, user_id: uid };
  return db.upsert(table, withUser);
}

export async function remove(table, id, opts) {
  return db.remove(table, id, opts);
}

// Pull fresh server data into the cache after login (no-op offline/local).
export async function loadUserData() {
  const uid = currentUserId();
  if (!uid) return;
  if (!isLocalMode() && isSupabaseConfigured) {
    try {
      await syncAll(uid, USER_TABLES);
    } catch {}
  }
}

// ---------------------------------------------------------------------
// EXERCISES (shared catalog + this user's custom exercises)
// ---------------------------------------------------------------------
export function getCustomExercises() {
  return getTable("custom_exercises").map((c) => ({ ...c, custom: true }));
}

export function getAllExercises() {
  return [...catalog.map((e) => ({ ...e, custom: false })), ...getCustomExercises()];
}

export function getExerciseById(id) {
  if (exercisesById[id]) return { ...exercisesById[id], custom: false };
  const custom = getTable("custom_exercises").find((c) => c.id === id);
  return custom ? { ...custom, custom: true } : null;
}

// ---------------------------------------------------------------------
// PLANS (plans -> plan_days -> plan_day_exercises)
// ---------------------------------------------------------------------
export function getPlans() {
  return getTable("plans").sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
}

export function getActivePlan() {
  const plans = getPlans();
  return plans.find((p) => p.is_active) || plans[0] || null;
}

export function getPlanDays(planId) {
  return getTable("plan_days")
    .filter((d) => d.plan_id === planId)
    .sort((a, b) => a.day_order - b.day_order);
}

export function getPlanDayExercises(planDayId) {
  return getTable("plan_day_exercises")
    .filter((e) => e.plan_day_id === planDayId)
    .sort((a, b) => a.position - b.position);
}

// ---------------------------------------------------------------------
// WORKOUTS (sessions + sets)
// ---------------------------------------------------------------------
export function getWorkouts() {
  return getTable("workouts").sort((a, b) =>
    (b.performed_at || "").localeCompare(a.performed_at || ""),
  );
}

export function getWorkoutSets(workoutId) {
  return getTable("workout_sets")
    .filter((s) => s.workout_id === workoutId)
    .sort((a, b) => (a.set_number || 0) - (b.set_number || 0));
}

export function getAllSets() {
  return getTable("workout_sets");
}
