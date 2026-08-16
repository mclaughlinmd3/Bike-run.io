# Turf (working title)

A real-world territory-claiming game for a private group of runners and
cyclists — close a GPS loop and everything inside becomes yours. Other
players can claim it back by looping through it themselves.

This is the MVP: web app, foreground GPS tracking, one shared friend group,
live map, and a leaderboard.

## Decisions made before building

The project brief asked three questions before writing code. This was built
autonomously without waiting on answers, using the following defaults —
easy to revisit if you want something different:

1. **Web app first**, not React Native/Expo. React + Vite + MapLibre GL runs
   in a phone browser today with zero app-store friction; the geometry and
   backend logic here carry over directly to an Expo app later if you want
   background tracking or a native shell.
2. **Free-tier by default**: Supabase (Postgres + PostGIS + Auth + Realtime)
   for the backend, and MapLibre GL with an OpenStreetMap raster source for
   the map — no Mapbox account or token required to run this. Swap in a
   Mapbox/MapTiler/Stadia vector style later for nicer styling (see
   `src/lib/mapStyle.ts`); OSM's public tile server isn't meant for real
   production traffic.
3. **Small group, realtime included**: built for a handful of friends
   (roughly 5–15), so Supabase Realtime is wired in from the start — everyone
   sees the map update live when someone finishes an activity.

## How the game logic works

- **Loop detection** (`src/lib/geometry.ts`, client-side, Turf.js): the raw
  GPS track is simplified to remove jitter, then walked segment by segment.
  Whenever the newest segment crosses an earlier segment of the still-open
  path, the loop between the crossing point and the current position is cut
  off as a claim — the same rule Paper.io/Slither.io use for self-crossing,
  which naturally handles multi-lap routes. A final check also closes the
  loop if the route simply ends near where it started.
- **Claim resolution** (`supabase/schema.sql`, server-side, PostGIS): the
  detected polygon is sent to a Postgres function, `apply_territory_claim`,
  which in one transaction subtracts the new claim from every other
  player's territory (`ST_Difference`) and unions it into the claiming
  player's territory (`ST_Union`). Doing this atomically on the server —
  rather than client-side read/compute/write — avoids two friends' activities
  racing each other into an inconsistent map.
- **Run vs. ride**: every table carries a `type` column and territory is
  tracked as separate `(group, user, type)` rows, so runners and riders never
  compete for the same ground.

## Setup

### 1. Create a Supabase project

Free tier at [supabase.com](https://supabase.com) works fine for a friend
group. Once created:

- Open **SQL Editor** and run the contents of `supabase/schema.sql`. This
  creates the tables, the `apply_territory_claim` function, row-level
  security policies, and adds the realtime publication.
- Open **Authentication → Sign In / Providers** and enable **Anonymous
  sign-ins**. Auth is intentionally lightweight for a friends-only app:
  each device gets an anonymous Supabase Auth user, and an invite code
  gates which group/lobby they can join — no email/password flow needed.

### 2. Configure the app

```bash
cp .env.example .env.local
# then fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
# (Project Settings → API in the Supabase dashboard)
```

### 3. Run it

```bash
npm install
npm run dev
```

Open the printed local URL on your phone (same network) or in a desktop
browser for development — the browser Geolocation API is used for GPS, so
allow location access when prompted.

Without `.env.local` configured, the app shows a "Supabase isn't configured"
screen instead of crashing, so `npm run dev` is safe to try immediately after
cloning.

## Project structure

```
supabase/schema.sql       Postgres schema, RLS, claim-resolution function
src/lib/geometry.ts       Loop detection, distance/area helpers (Turf.js)
src/lib/useGpsTracker.ts  Foreground GPS recording hook
src/lib/supabase.ts       Supabase client
src/state/authStore.ts    Anonymous auth + group create/join
src/state/territoryStore.ts  Territory state + Supabase Realtime subscription
src/components/MapView.tsx   MapLibre GL map (territory, live track, claim preview)
src/pages/Join.tsx        Create/join a group
src/pages/Home.tsx        Shared map + leaderboard
src/pages/Activity.tsx    Start/stop tracking, review + save a claim
```

## Known MVP limitations (by design, not oversights)

- **Foreground tracking only.** The tab/browser must stay open and active
  while recording. Background tracking needs native APIs (Expo/React Native)
  — see the stretch goals in the original brief.
- **OSM raster tiles.** Free and token-free, but not meant for heavy
  production traffic or offline use. Swap the style in `src/lib/mapStyle.ts`
  when you're ready.
- **Loop detection is greedy/sequential**, not a full polygon-self-
  intersection solver. It matches how a runner actually experiences "closing
  a loop" and handles multi-lap routes, but an unusual path (e.g. crossing
  itself many times in a tight tangle) may not carve out every geometrically
  possible sub-loop.
- **No push notifications / territory battles / Strava sync / seasons** —
  all listed as stretch goals in the brief, not built yet.

## Next steps

- Test with 2+ real devices in the same group and confirm a steal actually
  clips the other player's polygon live on both screens.
- Tune `SIMPLIFY_TOLERANCE_DEG`, `CLOSE_LOOP_THRESHOLD_M`, and
  `MIN_LOOP_AREA_SQM` in `src/lib/geometry.ts` against real GPS traces —
  phone GPS accuracy varies a lot by device and environment.
- If background tracking becomes a priority, port `useGpsTracker` /
  `MapView` to an Expo app; the Supabase schema and claim-resolution logic
  need no changes.
