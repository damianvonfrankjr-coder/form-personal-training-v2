// =====================================================================
// Form Personal Training v2 — Supabase client + auth helpers
// No build step. Loaded as a native ES module from index.html:
//   <script type="module" src="supabase.js"></script>
// or imported by app.js:  import { auth, supabase } from "./supabase.js";
// =====================================================================

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

// ---------------------------------------------------------------------
// CONFIG — replace these two values with YOUR project's values.
// Both are safe to ship in client code: the publishable/anon key only
// identifies the project. Row Level Security (see schema.sql) is what
// actually protects user data. NEVER put the secret/service_role key here.
//
// Find them in the Supabase dashboard: Project Settings > API.
// Prefer the new "publishable" key (sb_publishable_...). The legacy
// "anon" key still works during the 2025-2026 migration window.
// ---------------------------------------------------------------------
const SUPABASE_URL = "https://YOUR-PROJECT-REF.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_REPLACE_ME";

// True once the two constants above are replaced with your real project
// values. Until then the app runs in offline "local-only" mode (no network
// auth, data kept in the browser). Paste your values and this flips to true,
// lighting up real accounts + cross-device sync. (No credentials invented.)
export const isSupabaseConfigured =
  !SUPABASE_URL.includes("YOUR-PROJECT-REF") &&
  !SUPABASE_PUBLISHABLE_KEY.includes("REPLACE_ME");

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true, // keep the session in localStorage across reloads
    autoRefreshToken: true, // refresh the access token in the background
    detectSessionInUrl: true, // complete magic-link / OAuth redirects
    flowType: "pkce", // recommended for browser apps
  },
});

// ---------------------------------------------------------------------
// AUTH HELPERS
// ---------------------------------------------------------------------
export const auth = {
  // Email + password sign up. `displayName` is forwarded to the
  // handle_new_user() trigger, which creates the profiles row.
  async signUp(email, password, displayName) {
    return supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { display_name: displayName ?? "" },
      },
    });
  },

  async signIn(email, password) {
    return supabase.auth.signInWithPassword({ email, password });
  },

  // Passwordless "magic link" sign-in. shouldCreateUser:true means a new
  // visitor can sign up just by entering their email.
  async signInWithMagicLink(email) {
    return supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: window.location.origin,
        shouldCreateUser: true,
      },
    });
  },

  async signOut() {
    return supabase.auth.signOut();
  },

  async getSession() {
    const { data } = await supabase.auth.getSession();
    return data.session; // null when logged out
  },

  async getUser() {
    const session = await this.getSession();
    return session?.user ?? null;
  },

  // Register a listener that fires on login/logout/token refresh.
  // Use this to switch between the logged-out auth screen and the app.
  //   auth.onChange((session) => session ? showApp(session.user) : showLogin());
  onChange(callback) {
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      callback(session);
    });
    return data.subscription; // call .unsubscribe() to stop listening
  },
};

// ---------------------------------------------------------------------
// PROFILE HELPERS (the row auto-created on signup; edited in onboarding)
// ---------------------------------------------------------------------
export const profileApi = {
  async get(userId) {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();
    if (error) throw error;
    return data;
  },

  async update(userId, patch) {
    const { data, error } = await supabase
      .from("profiles")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", userId)
      .select()
      .single();
    if (error) throw error;
    return data;
  },
};
