// =====================================================================
// Form Personal Training v2 — units
// Internals are ALWAYS metric (weight in kg, height in cm). We convert
// only at the edges (display + entry) based on the user's unit_preference.
// =====================================================================

export const KG_PER_LB = 0.45359237;
export const CM_PER_IN = 2.54;

const round = (n, digits = 1) => {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
};

// entry (user's unit) -> kg
export function toKg(value, unit) {
  const n = Number(value);
  if (!isFinite(n)) return null;
  return unit === "lb" ? n * KG_PER_LB : n;
}

// kg -> user's unit
export function fromKg(kg, unit) {
  const n = Number(kg);
  if (!isFinite(n)) return null;
  return unit === "lb" ? n / KG_PER_LB : n;
}

export function unitLabel(unit) {
  return unit === "lb" ? "lb" : "kg";
}

// kg -> a display number in the user's unit (string, no label)
export function displayWeight(kg, unit, digits = 1) {
  const v = fromKg(kg, unit);
  if (v == null) return "0";
  return String(round(v, digits)).replace(/\.0$/, "");
}

// kg -> "<n> <unit>"
export function formatWeight(kg, unit, digits = 1) {
  return `${displayWeight(kg, unit, digits)} ${unitLabel(unit)}`;
}

// height helpers (entry can be cm or inches; stored cm)
export function toCm(value, unit) {
  const n = Number(value);
  if (!isFinite(n)) return null;
  return unit === "lb" ? n * CM_PER_IN : n; // lb users enter inches
}

export function heightUnitLabel(unit) {
  return unit === "lb" ? "in" : "cm";
}
