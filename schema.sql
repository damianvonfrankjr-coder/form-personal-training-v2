-- =====================================================================
-- Form Personal Training v2 — Supabase / Postgres schema
-- Run this FIRST in the Supabase SQL Editor (Dashboard > SQL Editor > New query).
-- Then run seed_exercises.sql to populate the shared catalog.
--
-- This sets up: profiles, a shared exercise catalog, custom exercises,
-- workout plans -> plan_days -> plan_day_exercises, and
-- logged workouts -> workout_sets. Row Level Security (RLS) is enabled on
-- every table so each user can only ever touch their own data.
-- =====================================================================

-- ---------- TABLES ----------

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  sex text check (sex in ('male','female','other','prefer_not_to_say')),
  birth_year int,
  height_cm numeric,
  bodyweight numeric,                       -- stored in KG internally
  unit_preference text not null default 'kg' check (unit_preference in ('kg','lb')),
  weekly_workout_goal int default 3,
  experience text check (experience in ('beginner','intermediate','advanced')),
  primary_goal text check (primary_goal in ('muscle','strength','fat_loss','general','endurance')),
  available_equipment text,                 -- 'full_gym' | 'home_gym' | 'dumbbells' | 'bodyweight'
  priority_muscles text[],                  -- optional emphasis, e.g. {'Chest','Back'}
  onboarding_complete boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.exercises (
  id text primary key,                      -- stable slug, e.g. 'barbell-bench-press'
  name text not null,
  primary_muscle text not null,
  category text not null,                   -- push | pull | legs | core | full_body
  equipment text not null,                  -- barbell | dumbbell | machine | cable | bodyweight | kettlebell | band | plate
  movement_pattern text not null,
  is_compound boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.custom_exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  primary_muscle text not null,
  category text,
  equipment text,
  movement_pattern text,
  is_compound boolean default true,
  created_at timestamptz not null default now()
);

create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  split_type text,                          -- full_body | upper_lower | ppl | upper_lower_ppl | bro_split
  goal text,
  days_per_week int,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.plan_days (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  day_order int not null,                   -- 1..N within the plan
  name text,                                -- 'Push A', 'Legs', ...
  created_at timestamptz not null default now()
);

create table if not exists public.plan_day_exercises (
  id uuid primary key default gen_random_uuid(),
  plan_day_id uuid not null references public.plan_days(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  exercise_id text references public.exercises(id),
  custom_exercise_id uuid references public.custom_exercises(id),
  position int not null,                    -- ordering within the day
  target_sets int,
  target_reps_low int,
  target_reps_high int,
  target_rest_seconds int,
  check (exercise_id is not null or custom_exercise_id is not null)
);

create table if not exists public.workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id uuid references public.plans(id) on delete set null,
  plan_day_id uuid references public.plan_days(id) on delete set null,
  performed_at timestamptz not null default now(),
  notes text,
  duration_seconds int,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz                    -- soft delete so other devices can sync removals
);

create table if not exists public.workout_sets (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references public.workouts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  exercise_id text references public.exercises(id),
  custom_exercise_id uuid references public.custom_exercises(id),
  set_number int not null,
  weight numeric,                           -- stored in KG
  reps int,
  is_done boolean not null default false,
  is_warmup boolean not null default false,
  performed_at timestamptz not null default now()
);

-- ---------- INDEXES ----------
create index if not exists idx_custom_exercises_user on public.custom_exercises(user_id);
create index if not exists idx_plans_user on public.plans(user_id);
create index if not exists idx_plan_days_plan on public.plan_days(plan_id);
create index if not exists idx_pde_plan_day on public.plan_day_exercises(plan_day_id);
create index if not exists idx_workouts_user_date on public.workouts(user_id, performed_at desc);
create index if not exists idx_sets_workout on public.workout_sets(workout_id);
create index if not exists idx_sets_user_ex_date on public.workout_sets(user_id, exercise_id, performed_at desc);
create index if not exists idx_exercises_muscle on public.exercises(primary_muscle);
create index if not exists idx_exercises_category on public.exercises(category);

-- ---------- AUTO-CREATE PROFILE ON SIGNUP ----------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, new.raw_user_meta_data ->> 'display_name');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ---------- ROW LEVEL SECURITY ----------
alter table public.profiles            enable row level security;
alter table public.exercises           enable row level security;
alter table public.custom_exercises    enable row level security;
alter table public.plans               enable row level security;
alter table public.plan_days           enable row level security;
alter table public.plan_day_exercises  enable row level security;
alter table public.workouts            enable row level security;
alter table public.workout_sets        enable row level security;

-- Shared catalog: any logged-in user can read; nobody can write via the API.
drop policy if exists "exercises_read" on public.exercises;
create policy "exercises_read" on public.exercises
  for select to authenticated using (true);

-- Profiles (own row only). (select auth.uid()) is wrapped in a subselect for performance.
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);
drop policy if exists "profiles_insert" on public.profiles;
create policy "profiles_insert" on public.profiles
  for insert to authenticated with check ((select auth.uid()) = id);
drop policy if exists "profiles_update" on public.profiles;
create policy "profiles_update" on public.profiles
  for update to authenticated using ((select auth.uid()) = id);

-- Helper macro pattern: each per-user table gets the same four policies.
-- (Postgres has no loops in plain DDL, so they are spelled out per table.)

-- custom_exercises
drop policy if exists "ce_all" on public.custom_exercises;
create policy "ce_all" on public.custom_exercises
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- plans
drop policy if exists "plans_all" on public.plans;
create policy "plans_all" on public.plans
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- plan_days
drop policy if exists "plan_days_all" on public.plan_days;
create policy "plan_days_all" on public.plan_days
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- plan_day_exercises
drop policy if exists "pde_all" on public.plan_day_exercises;
create policy "pde_all" on public.plan_day_exercises
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- workouts
drop policy if exists "workouts_all" on public.workouts;
create policy "workouts_all" on public.workouts
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- workout_sets
drop policy if exists "sets_all" on public.workout_sets;
create policy "sets_all" on public.workout_sets
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- =====================================================================
-- Done. Verify with: select tablename, rowsecurity from pg_tables
--   where schemaname = 'public';  (rowsecurity should be true everywhere)
-- =====================================================================
