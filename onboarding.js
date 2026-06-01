// =====================================================================
// Form Personal Training v2 — onboarding wizard
// One question per step, progress indicator, Back button, fieldset/legend
// for radio groups (a11y). Writes profile fields + plan-generator inputs.
// (Question set / order are documented defaults standing in for SPEC.md §5.)
// =====================================================================

import { MUSCLE_GROUPS } from "./exercises.js";
import { toKg, toCm, unitLabel, heightUnitLabel } from "./units.js";

const esc = (v) =>
  String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

// --- option sets ---
const GOALS = [
  ["muscle", "Build muscle", "Hypertrophy-focused training"],
  ["strength", "Get stronger", "Heavier loads, lower reps"],
  ["fat_loss", "Lose fat", "Higher volume, shorter rests"],
  ["general", "General fitness", "A balanced, sustainable mix"],
  ["endurance", "Endurance", "Higher reps, conditioning"],
];
const EXPERIENCE = [
  ["beginner", "Beginner", "Less than 1 year"],
  ["intermediate", "Intermediate", "1–3 years"],
  ["advanced", "Advanced", "3+ years"],
];
const DAYS = [
  ["2", "2 days"],
  ["3", "3 days"],
  ["4", "4 days"],
  ["5", "5 days"],
  ["6", "6 days"],
];
const EQUIPMENT = [
  ["full_gym", "Full gym", "Barbells, machines, cables, dumbbells"],
  ["home_gym", "Home gym", "Barbell + rack, dumbbells, bands"],
  ["dumbbells", "Dumbbells only", "Adjustable or fixed dumbbells"],
  ["bodyweight", "Bodyweight only", "No equipment needed"],
];
const SEX = [
  ["male", "Male"],
  ["female", "Female"],
  ["other", "Other"],
  ["prefer_not_to_say", "Prefer not to say"],
];

// --- small render helpers ---
function radioGroup(name, options, selected) {
  return `<div class="choice-grid" role="radiogroup">
    ${options
      .map(([value, label, desc]) => {
        const checked = String(selected) === String(value);
        return `<label class="choice ${checked ? "selected" : ""}">
          <input type="radio" name="${name}" value="${esc(value)}" ${checked ? "checked" : ""} />
          <span class="choice-body"><span class="choice-label">${esc(label)}</span>${desc ? `<span class="choice-desc">${esc(desc)}</span>` : ""}</span>
          <span class="choice-tick" aria-hidden="true"></span>
        </label>`;
      })
      .join("")}
  </div>`;
}

function checked(name) {
  const el = document.querySelector(`input[name="${name}"]:checked`);
  return el ? el.value : "";
}

function fieldVal(id) {
  const el = document.getElementById(id);
  return el ? el.value.trim() : "";
}

// --- steps: each has legend, render(answers), collect(answers) -> error|null ---
const STEPS = [
  {
    key: "display_name",
    legend: "What should we call you?",
    render: (a) =>
      `<div class="field"><label class="field-label" for="onb-name">Your name</label>
        <input class="text-input" id="onb-name" type="text" autocomplete="name" placeholder="e.g. Alex" value="${esc(a.display_name)}" /></div>`,
    collect: (a) => {
      a.display_name = fieldVal("onb-name");
      if (!a.display_name) return "Please enter your name.";
      return null;
    },
  },
  {
    key: "primary_goal",
    legend: "What's your main goal?",
    render: (a) => radioGroup("goal", GOALS, a.primary_goal),
    collect: (a) => {
      a.primary_goal = checked("goal");
      if (!a.primary_goal) return "Pick a goal to continue.";
      return null;
    },
  },
  {
    key: "experience",
    legend: "How much training experience do you have?",
    render: (a) => radioGroup("exp", EXPERIENCE, a.experience),
    collect: (a) => {
      a.experience = checked("exp");
      if (!a.experience) return "Pick your experience level.";
      return null;
    },
  },
  {
    key: "days_per_week",
    legend: "How many days per week can you train?",
    render: (a) => radioGroup("days", DAYS, a.days_per_week),
    collect: (a) => {
      const v = checked("days");
      if (!v) return "Choose how many days you'll train.";
      a.days_per_week = Number(v);
      return null;
    },
  },
  {
    key: "available_equipment",
    legend: "What equipment do you have?",
    render: (a) => radioGroup("equip", EQUIPMENT, a.available_equipment),
    collect: (a) => {
      a.available_equipment = checked("equip");
      if (!a.available_equipment) return "Pick your available equipment.";
      return null;
    },
  },
  {
    key: "priority_muscles",
    legend: "Any muscles you want to prioritize?",
    hint: "Optional — pick any you'd like a little extra volume on.",
    render: (a) => {
      const sel = a.priority_muscles || [];
      return `<div class="chips">
        ${MUSCLE_GROUPS.map(
          (m) =>
            `<button type="button" class="chip ${sel.includes(m) ? "active" : ""}" data-action="onboarding-toggle-muscle" data-muscle="${esc(m)}" aria-pressed="${sel.includes(m)}">${esc(m)}</button>`,
        ).join("")}
      </div>`;
    },
    collect: () => null, // toggled live
  },
  {
    key: "unit_preference",
    legend: "Which units do you prefer?",
    render: (a) =>
      radioGroup(
        "unit",
        [
          ["lb", "Pounds (lb)"],
          ["kg", "Kilograms (kg)"],
        ],
        a.unit_preference || "lb",
      ),
    collect: (a) => {
      a.unit_preference = checked("unit") || "lb";
      return null;
    },
  },
  {
    key: "measurements",
    legend: "A few measurements",
    hint: "Optional — helps tailor starting weights. You can skip any of these.",
    render: (a) => {
      const wu = unitLabel(a.unit_preference || "lb");
      const hu = heightUnitLabel(a.unit_preference || "lb");
      return `<div class="form-grid-2">
        <div class="field"><label class="field-label" for="onb-weight">Bodyweight (${wu})</label>
          <input class="text-input" id="onb-weight" type="number" min="0" inputmode="decimal" placeholder="${wu === "lb" ? "165" : "75"}" value="${esc(a.bodyweight ?? "")}" /></div>
        <div class="field"><label class="field-label" for="onb-height">Height (${hu})</label>
          <input class="text-input" id="onb-height" type="number" min="0" inputmode="decimal" placeholder="${hu === "in" ? "70" : "178"}" value="${esc(a.height ?? "")}" /></div>
        <div class="field"><label class="field-label" for="onb-age">Age</label>
          <input class="text-input" id="onb-age" type="number" min="0" inputmode="numeric" placeholder="30" value="${esc(a.age ?? "")}" /></div>
        <div class="field"><label class="field-label" for="onb-sex">Sex</label>
          <select class="select-input" id="onb-sex">
            <option value="">—</option>
            ${SEX.map(([v, l]) => `<option value="${v}" ${a.sex === v ? "selected" : ""}>${esc(l)}</option>`).join("")}
          </select></div>
      </div>`;
    },
    collect: (a) => {
      a.bodyweight = fieldVal("onb-weight");
      a.height = fieldVal("onb-height");
      a.age = fieldVal("onb-age");
      a.sex = document.getElementById("onb-sex")?.value || "";
      return null;
    },
  },
  {
    key: "review",
    legend: "You're all set",
    render: (a) => {
      const goal = GOALS.find((g) => g[0] === a.primary_goal)?.[1] || "—";
      const exp = EXPERIENCE.find((e) => e[0] === a.experience)?.[1] || "—";
      const equip = EQUIPMENT.find((e) => e[0] === a.available_equipment)?.[1] || "—";
      const pri = (a.priority_muscles || []).join(", ") || "None";
      const row = (k, v) => `<div class="settings-row"><span>${k}</span><strong>${esc(v)}</strong></div>`;
      return `<p class="onboard-review-lead">We'll generate a few plan options from this:</p>
        <div class="settings-rows">
          ${row("Name", a.display_name || "—")}
          ${row("Goal", goal)}
          ${row("Experience", exp)}
          ${row("Days / week", a.days_per_week || "—")}
          ${row("Equipment", equip)}
          ${row("Priority", pri)}
        </div>`;
    },
    collect: () => null,
  },
];

export const onboardingSteps = STEPS;
export const onboardingLength = STEPS.length;

export function seedAnswers(profile = {}) {
  return {
    display_name: profile.display_name || "",
    primary_goal: profile.primary_goal || "",
    experience: profile.experience || "",
    days_per_week: profile.days_per_week || "",
    available_equipment: profile.available_equipment || "",
    priority_muscles: profile.priority_muscles || [],
    unit_preference: profile.unit_preference || "lb",
    bodyweight: "",
    height: "",
    age: "",
    sex: profile.sex || "",
  };
}

export function renderOnboarding(state) {
  const { step, answers } = state.onboarding;
  const def = STEPS[step];
  const pct = Math.round(((step + 1) / STEPS.length) * 100);
  const isLast = step === STEPS.length - 1;
  return `
    <div class="onboard-shell">
      <section class="onboard-card card">
        <div class="onboard-head">
          <div class="onboard-progress"><div class="onboard-progress-bar" style="width:${pct}%"></div></div>
          <div class="onboard-step-count">Step ${step + 1} of ${STEPS.length}</div>
        </div>
        <form class="onboard-form" data-action="onboarding-submit-form">
          <fieldset class="onboard-fieldset">
            <legend class="onboard-legend">${esc(def.legend)}</legend>
            ${def.hint ? `<p class="onboard-hint">${esc(def.hint)}</p>` : ""}
            ${def.render(answers)}
          </fieldset>
          ${state.onboarding.error ? `<p class="onboard-error" role="alert">${esc(state.onboarding.error)}</p>` : ""}
          <div class="onboard-actions">
            <button class="secondary-button" type="button" data-action="onboarding-back" ${step === 0 ? "disabled" : ""}>Back</button>
            <button class="primary-button" type="submit">${isLast ? "Generate my plan" : "Next"}</button>
          </div>
        </form>
      </section>
    </div>`;
}

// Reads the current step's DOM into answers; returns an error string or null.
export function collectCurrent(state) {
  const def = STEPS[state.onboarding.step];
  return def.collect(state.onboarding.answers);
}

// Turn collected answers into a profiles patch (metric internals).
export function buildProfilePatch(a) {
  const patch = {
    display_name: a.display_name || "",
    primary_goal: a.primary_goal || null,
    experience: a.experience || null,
    days_per_week: a.days_per_week ? Number(a.days_per_week) : null,
    available_equipment: a.available_equipment || null,
    priority_muscles: a.priority_muscles && a.priority_muscles.length ? a.priority_muscles : null,
    unit_preference: a.unit_preference || "lb",
    weekly_workout_goal: a.days_per_week ? Number(a.days_per_week) : 3,
  };
  const wkg = a.bodyweight ? toKg(a.bodyweight, a.unit_preference) : null;
  if (wkg != null) patch.bodyweight = Math.round(wkg * 10) / 10;
  const hcm = a.height ? toCm(a.height, a.unit_preference) : null;
  if (hcm != null) patch.height_cm = Math.round(hcm);
  if (a.age) {
    const yr = new Date().getFullYear() - Number(a.age);
    if (yr > 1900 && yr < 2100) patch.birth_year = yr;
  }
  if (a.sex) patch.sex = a.sex;
  return patch;
}
