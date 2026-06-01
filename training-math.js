// =====================================================================
// Form Personal Training v2 — training math (pure, no DOM)
// 1RM estimates, PR detection, and weekly-volume series. All weights are
// in kg (the app's internal unit); callers convert for display.
// (Formulas per SPEC.md §6.1: Epley and Brzycki.)
// =====================================================================

export function epley(weight, reps) {
  const w = Number(weight) || 0;
  const r = Number(reps) || 0;
  if (w <= 0 || r <= 0) return 0;
  if (r === 1) return w;
  return w * (1 + r / 30);
}

export function brzycki(weight, reps) {
  const w = Number(weight) || 0;
  const r = Number(reps) || 0;
  if (w <= 0 || r <= 0) return 0;
  if (r === 1) return w;
  if (r >= 37) return w; // formula degenerates at/above 37 reps
  return (w * 36) / (37 - r);
}

// Best estimate of a one-rep max from a single set (max of the two models).
export function estimate1RM(weight, reps) {
  return Math.max(epley(weight, reps), brzycki(weight, reps));
}

const keyOf = (s) => s.exercise_id || s.custom_exercise_id || null;

// Best estimated 1RM per exercise across a set of logged sets.
// Returns { [exerciseKey]: { e1rm, weight, reps } }.
export function bestE1RMByExercise(sets) {
  const best = {};
  for (const s of sets) {
    const key = keyOf(s);
    if (!key) continue;
    const e = estimate1RM(s.weight, s.reps);
    if (e <= 0) continue;
    if (!best[key] || e > best[key].e1rm) {
      best[key] = { e1rm: e, weight: Number(s.weight) || 0, reps: Number(s.reps) || 0 };
    }
  }
  return best;
}

// Given prior bests and a batch of new sets, return the exercise keys whose
// estimated 1RM was beaten, with the new best for each.
export function detectPRs(priorBest, newSets) {
  const prs = {};
  for (const s of newSets) {
    const key = keyOf(s);
    if (!key) continue;
    const e = estimate1RM(s.weight, s.reps);
    if (e <= 0) continue;
    const prior = priorBest[key]?.e1rm || 0;
    if (e > prior && (!prs[key] || e > prs[key].e1rm)) {
      prs[key] = { e1rm: e, weight: Number(s.weight) || 0, reps: Number(s.reps) || 0, prior };
    }
  }
  return prs;
}

// Total volume (kg·reps) across sets.
export function totalVolume(sets) {
  return sets.reduce((t, s) => t + (Number(s.weight) || 0) * (Number(s.reps) || 0), 0);
}

function startOfWeek(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const dow = (x.getDay() + 6) % 7; // Monday = 0
  x.setDate(x.getDate() - dow);
  return x;
}

// Weekly volume buckets for the last `weeks` weeks (oldest first).
// Each set must carry performed_at. Returns [{ start: Date, volume }].
export function weeklyVolumeSeries(sets, weeks = 8, nowMs = Date.now()) {
  const thisWeek = startOfWeek(new Date(nowMs));
  const buckets = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const ws = new Date(thisWeek);
    ws.setDate(ws.getDate() - i * 7);
    buckets.push({ start: ws, volume: 0 });
  }
  for (const s of sets) {
    if (!s.performed_at) continue;
    const ws = startOfWeek(new Date(s.performed_at)).getTime();
    const b = buckets.find((x) => x.start.getTime() === ws);
    if (b) b.volume += (Number(s.weight) || 0) * (Number(s.reps) || 0);
  }
  return buckets;
}
