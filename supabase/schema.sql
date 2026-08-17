-- Turf (working title) — MVP schema
-- Run this in the Supabase SQL editor for a fresh project.
-- Requires: Auth > Providers > Anonymous Sign-ins enabled (Settings > Authentication).

create extension if not exists postgis;

-- ---------------------------------------------------------------------------
-- Core tables
-- ---------------------------------------------------------------------------

create table if not exists groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  color text not null,
  group_id uuid references groups (id) on delete set null,
  strava_connected boolean not null default false,
  created_at timestamptz not null default now()
);

-- Strava OAuth tokens. Deliberately has NO RLS policies (RLS is enabled with
-- zero grants below), so no client role can read or write this table at all
-- — only the server-side service-role key used by api/strava/*.ts can touch
-- it. Tokens must never reach the browser.
create table if not exists strava_connections (
  profile_id uuid primary key references profiles (id) on delete cascade,
  strava_athlete_id bigint not null,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

do $$ begin
  create type activity_type as enum ('run', 'ride');
exception
  when duplicate_object then null;
end $$;

create table if not exists activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  group_id uuid not null references groups (id) on delete cascade,
  type activity_type not null,
  started_at timestamptz not null,
  ended_at timestamptz,
  gps_track jsonb not null default '[]'::jsonb,
  distance_m double precision not null default 0,
  duration_s integer not null default 0,
  source text not null default 'manual' check (source in ('manual', 'strava')),
  strava_activity_id bigint,
  created_at timestamptz not null default now()
);
-- One row per Strava activity, so re-syncing never double-claims territory.
create unique index if not exists activities_strava_activity_id_uidx
  on activities (strava_activity_id) where strava_activity_id is not null;

create table if not exists territory_claims (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references activities (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  group_id uuid not null references groups (id) on delete cascade,
  type activity_type not null,
  polygon geometry(Polygon, 4326) not null,
  area_sq_m double precision not null,
  claimed_at timestamptz not null default now()
);
create index if not exists territory_claims_polygon_gix on territory_claims using gist (polygon);
create index if not exists territory_claims_group_type_idx on territory_claims (group_id, type);

-- Authoritative current-state map: one row per (group, user, activity type).
-- Recomputed incrementally by apply_territory_claim() below, not from full history scans.
create table if not exists territory_state (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  type activity_type not null,
  polygon geometry(MultiPolygon, 4326),
  area_sq_m double precision not null default 0,
  updated_at timestamptz not null default now(),
  unique (group_id, user_id, type)
);
create index if not exists territory_state_polygon_gix on territory_state using gist (polygon);

-- ---------------------------------------------------------------------------
-- Claim resolution (server-side, atomic)
--
-- Runs inside one transaction so two friends finishing activities at the same
-- moment can't race each other into an inconsistent map. PostGIS does the
-- polygon set-math (steal = difference, own territory = union); the client
-- only has to detect the closed loop and hand over its geometry.
-- ---------------------------------------------------------------------------

create or replace function apply_territory_claim(
  p_activity_id uuid,
  p_claim_geojson jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_group_id uuid;
  v_type activity_type;
  v_polygon geometry;
  v_area double precision;
  r record;
  v_remaining geometry;
  v_empty_mp geometry := ST_SetSRID(ST_GeomFromText('MULTIPOLYGON EMPTY'), 4326);
begin
  select user_id, group_id, type into v_user_id, v_group_id, v_type
  from activities where id = p_activity_id;

  if v_user_id is null then
    raise exception 'activity % not found', p_activity_id;
  end if;

  -- auth.uid() is null for service-role callers (the Strava sync function,
  -- which has already authenticated the player itself before calling this) —
  -- only enforce ownership when the call carries a real user JWT.
  if auth.uid() is not null and v_user_id <> auth.uid() then
    raise exception 'not authorized to claim on behalf of activity %', p_activity_id;
  end if;

  v_polygon := ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON(p_claim_geojson), 4326));
  if ST_IsEmpty(v_polygon) then
    return;
  end if;
  v_area := ST_Area(v_polygon::geography);

  insert into territory_claims (activity_id, user_id, group_id, type, polygon, area_sq_m)
  values (p_activity_id, v_user_id, v_group_id, v_type, v_polygon, v_area);

  -- Steal: clip the new claim out of every other player's current territory.
  for r in
    select id, polygon from territory_state
    where group_id = v_group_id and type = v_type and user_id <> v_user_id
      and polygon is not null and ST_Intersects(polygon, v_polygon)
    for update
  loop
    v_remaining := ST_Difference(r.polygon, v_polygon);
    if v_remaining is null or ST_IsEmpty(v_remaining) then
      update territory_state set polygon = null, area_sq_m = 0, updated_at = now() where id = r.id;
    else
      update territory_state
      set polygon = ST_Multi(v_remaining),
          area_sq_m = ST_Area(v_remaining::geography),
          updated_at = now()
      where id = r.id;
    end if;
  end loop;

  -- Grow the claiming player's own territory.
  insert into territory_state (group_id, user_id, type, polygon, area_sq_m)
  values (v_group_id, v_user_id, v_type, ST_Multi(v_polygon), v_area)
  on conflict (group_id, user_id, type) do update
  set polygon = ST_Multi(ST_Union(coalesce(territory_state.polygon, v_empty_mp), v_polygon)),
      area_sq_m = ST_Area(ST_Union(coalesce(territory_state.polygon, v_empty_mp), v_polygon)::geography),
      updated_at = now();
end;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

-- A policy on `profiles` can't query `profiles` in its own USING clause —
-- Postgres re-applies the same policy to that inner query and recurses
-- forever ("infinite recursion detected in policy for relation profiles").
-- Routing the lookup through a SECURITY DEFINER function sidesteps this: the
-- function runs as its (table-owning) creator, which bypasses RLS entirely,
-- so the inner lookup never re-triggers the policy. Every policy below that
-- needs "is this row in my group" reuses this instead of a raw subquery on
-- profiles.
create or replace function current_profile_group_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select group_id from profiles where id = auth.uid()
$$;

alter table groups enable row level security;
alter table profiles enable row level security;
alter table activities enable row level security;
alter table territory_claims enable row level security;
alter table territory_state enable row level security;
alter table strava_connections enable row level security;
-- No policies for strava_connections on purpose: RLS with zero grants means
-- every client-facing role (anon, authenticated) is denied entirely, while
-- the service-role key (server-side only) still bypasses RLS as usual.

-- Policies are dropped and recreated so this file is safe to re-run on a
-- database that already has an earlier version of them.

drop policy if exists "groups are readable by signed-in users" on groups;
drop policy if exists "signed-in users can create a group" on groups;
-- groups: any signed-in user can look up a group (invite code is the secret);
-- only the code itself, not row access, gates who can actually join.
create policy "groups are readable by signed-in users" on groups
  for select using (auth.role() = 'authenticated' or auth.role() = 'anon');
create policy "signed-in users can create a group" on groups
  for insert with check (auth.uid() is not null);

drop policy if exists "profiles are readable within the same group" on profiles;
drop policy if exists "users manage their own profile" on profiles;
drop policy if exists "users update their own profile" on profiles;
create policy "profiles are readable within the same group" on profiles
  for select using (
    id = auth.uid()
    or group_id = current_profile_group_id()
  );
create policy "users manage their own profile" on profiles
  for insert with check (id = auth.uid());
create policy "users update their own profile" on profiles
  for update using (id = auth.uid());

drop policy if exists "activities readable within group" on activities;
drop policy if exists "users insert their own activities" on activities;
drop policy if exists "users update their own activities" on activities;
create policy "activities readable within group" on activities
  for select using (group_id = current_profile_group_id());
create policy "users insert their own activities" on activities
  for insert with check (
    user_id = auth.uid() and group_id = current_profile_group_id()
  );
create policy "users update their own activities" on activities
  for update using (user_id = auth.uid());

drop policy if exists "claims readable within group" on territory_claims;
create policy "claims readable within group" on territory_claims
  for select using (group_id = current_profile_group_id());

drop policy if exists "territory readable within group" on territory_state;
create policy "territory readable within group" on territory_state
  for select using (group_id = current_profile_group_id());

-- ---------------------------------------------------------------------------
-- Realtime: broadcast changes so every group member's map updates live.
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table territory_state;
alter publication supabase_realtime add table profiles;
