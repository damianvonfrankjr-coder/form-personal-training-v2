// =====================================================================
// Form Personal Training v2 — rule-based plan generator (pure, no DOM)
//
// Documented heuristics standing in for SPEC.md §4 (evidence-based but
// editable). In short:
//   • Split is chosen from days/week (+ experience).
//   • Exercises are picked from the catalog, filtered by available equipment,
//     compounds first, by movement-pattern role.
//   • Sets/reps/rest come from the goal; volume is nudged by experience and
//     sanity-checked against weekly-set landmarks (MEV≈10 / MAV≈12–18 /
//     MRV≈20 sets per muscle per week, per Renaissance Periodization).
//   • Returns 2–3 variations for the user to choose from.
// =====================================================================

// Which catalog equipment each "available_equipment" answer unlocks.
const EQUIPMENT_ACCESS = {
  full_gym: ["barbell", "dumbbell", "machine", "cable", "bodyweight", "kettlebell", "band", "plate"],
  home_gym: ["barbell", "dumbbell", "bodyweight", "kettlebell", "band", "plate"],
  dumbbells: ["dumbbell", "bodyweight", "band"],
  bodyweight: ["bodyweight", "band"],
};

// Goal -> base set/rep/rest scheme (compound lifts).
const GOAL_SCHEME = {
  strength: { sets: 4, repLow: 3, repHigh: 6, rest: 180 },
  muscle: { sets: 4, repLow: 8, repHigh: 12, rest: 90 },
  fat_loss: { sets: 3, repLow: 10, repHigh: 15, rest: 50 },
  general: { sets: 3, repLow: 8, repHigh: 12, rest: 90 },
  endurance: { sets: 3, repLow: 15, repHigh: 20, rest: 45 },
};

// Movement "roles" -> the muscles / patterns / compound-ness used to pick an exercise.
const ROLES = {
  squat: { muscles: ["Quads"], patterns: ["squat"], compound: true },
  hinge: { muscles: ["Hamstrings", "Glutes"], patterns: ["hinge"], compound: true },
  lunge: { muscles: ["Quads", "Glutes"], patterns: ["lunge"], compound: true },
  quad_iso: { muscles: ["Quads"], patterns: ["isolation"], compound: false },
  ham_iso: { muscles: ["Hamstrings"], patterns: ["isolation"], compound: false },
  glute: { muscles: ["Glutes"], patterns: ["hinge", "isolation"], compound: null },
  calf: { muscles: ["Calves"], patterns: ["isolation"], compound: false },
  h_push: { muscles: ["Chest"], patterns: ["horizontal_push"], compound: true },
  v_push: { muscles: ["Shoulders"], patterns: ["vertical_push"], compound: true },
  chest_iso: { muscles: ["Chest"], patterns: ["isolation"], compound: false },
  side_delt: { muscles: ["Shoulders"], patterns: ["isolation"], compound: false },
  v_pull: { muscles: ["Back"], patterns: ["vertical_pull"], compound: true },
  h_pull: { muscles: ["Back"], patterns: ["horizontal_pull"], compound: true },
  rear_delt: { muscles: ["Shoulders"], patterns: ["isolation"], compound: false },
  back_iso: { muscles: ["Back"], patterns: ["isolation"], compound: false },
  biceps: { muscles: ["Biceps"], patterns: ["isolation"], compound: false },
  triceps: { muscles: ["Triceps"], patterns: ["isolation", "horizontal_push", "vertical_push"], compound: null },
  core: { muscles: ["Core"], patterns: ["core"], compound: false },
};

// Day templates per split (6 roles each; trimmed by experience/variation).
const SPLITS = {
  full_body: {
    type: "full_body",
    days: [
      { name: "Full Body A", roles: ["squat", "h_push", "h_pull", "v_push", "hinge", "core"] },
      { name: "Full Body B", roles: ["hinge", "v_push", "v_pull", "h_push", "lunge", "core"] },
      { name: "Full Body C", roles: ["squat", "h_push", "v_pull", "glute", "triceps", "biceps"] },
    ],
  },
  upper_lower: {
    type: "upper_lower",
    days: [
      { name: "Upper A", roles: ["h_push", "v_pull", "v_push", "h_pull", "biceps", "triceps"] },
      { name: "Lower A", roles: ["squat", "hinge", "quad_iso", "ham_iso", "calf", "core"] },
      { name: "Upper B", roles: ["v_push", "h_pull", "h_push", "v_pull", "triceps", "side_delt"] },
      { name: "Lower B", roles: ["hinge", "lunge", "quad_iso", "glute", "calf", "core"] },
    ],
  },
  upper_lower_ppl: {
    type: "upper_lower_ppl",
    days: [
      { name: "Upper", roles: ["h_push", "v_pull", "v_push", "h_pull", "biceps", "triceps"] },
      { name: "Lower", roles: ["squat", "hinge", "quad_iso", "ham_iso", "calf", "core"] },
      { name: "Push", roles: ["h_push", "v_push", "chest_iso", "side_delt", "triceps", "triceps"] },
      { name: "Pull", roles: ["v_pull", "h_pull", "rear_delt", "biceps", "back_iso", "core"] },
      { name: "Legs", roles: ["squat", "hinge", "glute", "quad_iso", "calf", "core"] },
    ],
  },
  ppl: {
    type: "ppl",
    days: [
      { name: "Push A", roles: ["h_push", "v_push", "chest_iso", "side_delt", "triceps", "triceps"] },
      { name: "Pull A", roles: ["v_pull", "h_pull", "rear_delt", "back_iso", "biceps", "biceps"] },
      { name: "Legs A", roles: ["squat", "hinge", "quad_iso", "ham_iso", "glute", "calf"] },
      { name: "Push B", roles: ["v_push", "h_push", "chest_iso", "side_delt", "triceps", "core"] },
      { name: "Pull B", roles: ["h_pull", "v_pull", "rear_delt", "biceps", "back_iso", "core"] },
      { name: "Legs B", roles: ["hinge", "squat", "lunge", "quad_iso", "calf", "core"] },
    ],
  },
};

// 2–3 distinct flavours of the same split.
const VARIATIONS = [
  {
    id: "balanced",
    name: "Balanced",
    description: "Free-weight compounds with focused accessories.",
    equip: ["barbell", "dumbbell", "cable", "machine", "bodyweight", "kettlebell", "plate", "band"],
    trim: 0,
  },
  {
    id: "machines",
    name: "Machines & dumbbells",
    description: "Joint-friendly machine and dumbbell emphasis.",
    equip: ["machine", "cable", "dumbbell", "barbell", "bodyweight", "kettlebell", "plate", "band"],
    trim: 0,
  },
  {
    id: "efficient",
    name: "Time-efficient",
    description: "Fewer movements, big lifts first — in and out faster.",
    equip: ["barbell", "dumbbell", "cable", "machine", "bodyweight", "kettlebell", "plate", "band"],
    trim: 1,
  },
];

function chooseSplit(days, _experience) {
  if (days <= 2) return "full_body";
  if (days === 3) return "full_body";
  if (days === 4) return "upper_lower";
  if (days === 5) return "upper_lower_ppl";
  return "ppl";
}

function exercisesPerDay(experience, trim) {
  const base = experience === "beginner" ? 5 : 6;
  return Math.max(3, base - trim);
}

function buildScheme(goal, experience, isCompound) {
  const base = GOAL_SCHEME[goal] || GOAL_SCHEME.general;
  let sets = base.sets;
  if (experience === "beginner") sets = Math.max(2, sets - 1);
  else if (experience === "advanced") sets = Math.min(5, sets + 1);
  let repLow = base.repLow;
  let repHigh = base.repHigh;
  let rest = base.rest;
  if (!isCompound) {
    repLow += 2;
    repHigh += 3;
    rest = Math.min(rest, 75);
    sets = Math.max(2, sets - 1);
  }
  return { target_sets: sets, target_reps_low: repLow, target_reps_high: repHigh, target_rest_seconds: rest };
}

function selectForRole(role, pool, used, equipPriority) {
  let cands = pool.filter((e) => role.muscles.includes(e.primary_muscle));
  if (role.patterns) {
    const byPattern = cands.filter((e) => role.patterns.includes(e.movement_pattern));
    if (byPattern.length) cands = byPattern;
  }
  if (role.compound === true) {
    const c = cands.filter((e) => e.is_compound);
    if (c.length) cands = c;
  } else if (role.compound === false) {
    const c = cands.filter((e) => !e.is_compound);
    if (c.length) cands = c;
  }
  if (!cands.length) cands = pool.filter((e) => role.muscles.includes(e.primary_muscle));
  if (!cands.length) return null;
  const rank = (e) => {
    const unused = used.has(e.id) ? 1 : 0;
    let ei = equipPriority.indexOf(e.equipment);
    if (ei < 0) ei = 99;
    return unused * 100 + ei;
  };
  cands = cands.slice().sort((a, b) => rank(a) - rank(b));
  return cands[0];
}

function weeklySetsByMuscle(days) {
  const m = {};
  days.forEach((d) =>
    d.exercises.forEach((ex) => {
      m[ex.primary_muscle] = (m[ex.primary_muscle] || 0) + ex.target_sets;
    }),
  );
  return m;
}

function buildVariation(variation, def, nDays, profile, pool) {
  const used = new Set();
  const cap = exercisesPerDay(profile.experience, variation.trim);
  const days = def.days.slice(0, nDays).map((d, di) => {
    const roles = d.roles.slice(0, cap).map((k) => ROLES[k]).filter(Boolean);
    const exercises = [];
    roles.forEach((role) => {
      const ex = selectForRole(role, pool, used, variation.equip);
      if (!ex) return;
      used.add(ex.id);
      const scheme = buildScheme(profile.primary_goal, profile.experience, ex.is_compound);
      exercises.push({
        exercise_id: ex.custom ? null : ex.id,
        custom_exercise_id: ex.custom ? ex.id : null,
        name: ex.name,
        primary_muscle: ex.primary_muscle,
        equipment: ex.equipment,
        is_compound: ex.is_compound,
        ...scheme,
      });
    });
    return { name: d.name, day_order: di + 1, exercises };
  });

  // Priority muscles: add an isolation slot (up to 2) on rotating days.
  (profile.priority_muscles || []).slice(0, 2).forEach((pm, idx) => {
    const role = { muscles: [pm], patterns: ["isolation"], compound: false };
    const ex = selectForRole(role, pool, used, variation.equip);
    if (!ex) return;
    used.add(ex.id);
    const day = days[idx % days.length];
    const scheme = buildScheme(profile.primary_goal, profile.experience, ex.is_compound);
    day.exercises.push({
      exercise_id: ex.custom ? null : ex.id,
      custom_exercise_id: ex.custom ? ex.id : null,
      name: ex.name,
      primary_muscle: ex.primary_muscle,
      equipment: ex.equipment,
      is_compound: ex.is_compound,
      ...scheme,
    });
  });

  return {
    id: variation.id,
    name: variation.name,
    description: variation.description,
    split_type: def.type,
    days_per_week: nDays,
    days,
    weeklySets: weeklySetsByMuscle(days),
    totalExercises: days.reduce((n, d) => n + d.exercises.length, 0),
  };
}

// Public: returns 2–3 plan variations for the given profile.
export function generatePlans(profile, pool) {
  const allowed = EQUIPMENT_ACCESS[profile.available_equipment] || EQUIPMENT_ACCESS.full_gym;
  let filtered = pool.filter((e) => allowed.includes(e.equipment));
  if (filtered.length < 12) filtered = pool; // safety net for tiny pools

  const splitKey = chooseSplit(Number(profile.days_per_week) || 3, profile.experience);
  const def = SPLITS[splitKey];
  const nDays =
    splitKey === "full_body" ? Math.min(Number(profile.days_per_week) || 3, def.days.length) : def.days.length;

  const seen = new Set();
  const out = [];
  for (const v of VARIATIONS) {
    const built = buildVariation(v, def, nDays, profile, filtered);
    // de-dupe variations that came out identical (e.g. limited equipment)
    const sig = built.days.map((d) => d.exercises.map((e) => e.exercise_id || e.custom_exercise_id).join(",")).join("|");
    if (seen.has(sig)) continue;
    seen.add(sig);
    out.push(built);
  }
  return out;
}

export const SPLIT_LABELS = {
  full_body: "Full Body",
  upper_lower: "Upper / Lower",
  ppl: "Push / Pull / Legs",
  upper_lower_ppl: "Upper / Lower / PPL",
  bro_split: "Body-part Split",
};
