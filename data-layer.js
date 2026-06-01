// =====================================================================
// Form Personal Training v2 — offline-first data layer
// Replaces the v1 localStorage save/load loop. Strategy:
//   1. Read instantly from a local cache (works offline, no spinner).
//   2. On every write: update cache + UI optimistically, then push to
//      Supabase. If the push fails (offline), queue it in an "outbox".
//   3. On reconnect / app start, replay the outbox, then pull fresh
//      server data and reconcile (last-write-wins via updated_at).
//
// This keeps the app usable with no connection while still syncing
// across devices once online. IDs are generated client-side so records
// created offline keep stable primary keys after sync.
// =====================================================================

import { supabase, isSupabaseConfigured } from "./supabase.js";

const CACHE_KEY = "form-pt-cache-v2"; // bump if the cache shape changes
const OUTBOX_KEY = "form-pt-outbox-v2";

export const newId = () => crypto.randomUUID();

// ---------------------------------------------------------------------
// LOCAL CACHE
// ---------------------------------------------------------------------
function readCache() {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY)) ?? {};
  } catch {
    return {};
  }
}

function writeCache(cache) {
  localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
}

export const cache = {
  getTable(table) {
    return readCache()[table] ?? [];
  },
  upsertRow(table, row) {
    const c = readCache();
    const rows = c[table] ?? [];
    const i = rows.findIndex((r) => r.id === row.id);
    if (i >= 0) rows[i] = { ...rows[i], ...row };
    else rows.push(row);
    c[table] = rows;
    writeCache(c);
  },
  removeRow(table, id) {
    const c = readCache();
    c[table] = (c[table] ?? []).filter((r) => r.id !== id);
    writeCache(c);
  },
  replaceTable(table, rows) {
    const c = readCache();
    c[table] = rows;
    writeCache(c);
  },
};

// ---------------------------------------------------------------------
// OUTBOX (pending writes while offline)
// ---------------------------------------------------------------------
function readOutbox() {
  try {
    return JSON.parse(localStorage.getItem(OUTBOX_KEY)) ?? [];
  } catch {
    return [];
  }
}
function writeOutbox(ops) {
  localStorage.setItem(OUTBOX_KEY, JSON.stringify(ops));
}
function enqueue(op) {
  const ops = readOutbox();
  ops.push(op);
  writeOutbox(ops);
}

// ---------------------------------------------------------------------
// WRITE-THROUGH OPERATIONS
// Each call updates the cache first (instant UI), then tries the server.
// ---------------------------------------------------------------------
export const db = {
  // Insert or update a row.
  async upsert(table, row) {
    const stamped = { ...row, updated_at: new Date().toISOString() };
    cache.upsertRow(table, stamped);
    if (!isSupabaseConfigured) return stamped; // local-only: cache is the store
    try {
      const { error } = await supabase.from(table).upsert(stamped);
      if (error) throw error;
    } catch {
      enqueue({ kind: "upsert", table, row: stamped });
    }
    return stamped;
  },

  // Soft delete where the table supports it (workouts); hard delete otherwise.
  async remove(table, id, { soft = false } = {}) {
    if (soft) {
      return this.upsert(table, { id, deleted_at: new Date().toISOString() });
    }
    cache.removeRow(table, id);
    if (!isSupabaseConfigured) return; // local-only: cache is the store
    try {
      const { error } = await supabase.from(table).delete().eq("id", id);
      if (error) throw error;
    } catch {
      enqueue({ kind: "delete", table, id });
    }
  },

  // Pull a table from the server into the cache (call on login / refresh).
  async pull(table, { userId } = {}) {
    if (!isSupabaseConfigured) return cache.getTable(table); // local-only
    let q = supabase.from(table).select("*");
    if (userId) q = q.eq("user_id", userId);
    const { data, error } = await q;
    if (error) return cache.getTable(table); // stay on cache if offline
    const rows = (data ?? []).filter((r) => !r.deleted_at);
    cache.replaceTable(table, rows);
    return rows;
  },
};

// ---------------------------------------------------------------------
// SYNC: replay queued writes, then refresh from server.
// Call on app start (after auth) and on the "online" event.
// ---------------------------------------------------------------------
export async function flushOutbox() {
  if (!isSupabaseConfigured) return; // nothing to sync in local-only mode
  const ops = readOutbox();
  if (!ops.length) return;
  const remaining = [];
  for (const op of ops) {
    try {
      if (op.kind === "upsert") {
        const { error } = await supabase.from(op.table).upsert(op.row);
        if (error) throw error;
      } else if (op.kind === "delete") {
        const { error } = await supabase.from(op.table).delete().eq("id", op.id);
        if (error) throw error;
      }
    } catch {
      remaining.push(op); // still offline / failed — keep for next time
    }
  }
  writeOutbox(remaining);
}

export async function syncAll(userId, tables) {
  await flushOutbox();
  for (const table of tables) {
    await db.pull(table, { userId });
  }
}

// Auto-flush whenever the browser regains connectivity.
window.addEventListener("online", () => {
  flushOutbox().catch(() => {});
});

// ---------------------------------------------------------------------
// ONE-TIME MIGRATION: import v1 localStorage data on first login.
// v1 stored everything under "form-personal-training-v1".
// ---------------------------------------------------------------------
const V1_KEY = "form-personal-training-v1";
const MIGRATED_FLAG = "form-pt-migrated-v1";

export async function migrateV1IfNeeded(userId) {
  if (localStorage.getItem(MIGRATED_FLAG)) return { migrated: false };
  let legacy;
  try {
    legacy = JSON.parse(localStorage.getItem(V1_KEY));
  } catch {
    legacy = null;
  }
  if (!legacy?.history?.length) {
    localStorage.setItem(MIGRATED_FLAG, "1");
    return { migrated: false };
  }

  // Map each v1 history session -> a workouts row. v1 history stored
  // summary stats (volume, completedSets, duration, exercise names) but
  // not per-set detail, so we create the session record and leave sets
  // empty. New v2 workouts will capture full set detail going forward.
  for (const s of legacy.history) {
    await db.upsert("workouts", {
      id: newId(),
      user_id: userId,
      performed_at: s.date ?? new Date().toISOString(),
      duration_seconds: (s.duration ?? 0) * 60,
      notes: `Imported from v1 · ${s.completedSets ?? 0} sets · ${s.volume ?? 0} lb · ${(s.exercises ?? []).join(", ")}`,
    });
  }

  localStorage.setItem(MIGRATED_FLAG, "1");
  return { migrated: true, count: legacy.history.length };
}
