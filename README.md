# Turf (working title)

A real-world territory-claiming game for a private group of runners and
cyclists — close a GPS loop and everything inside becomes yours. Other
players can claim it back by looping through it themselves.

Activities are tracked via **Strava sync** — record your run or ride in the
Strava app as usual (background tracking, phone locked, whatever), and Turf
pulls it in afterward and turns it into a territory claim. There's also an
optional in-browser live tracker for testing or for anyone without Strava,
but Strava is the primary path specifically because it solves background
tracking, which a browser tab cannot.

## Decisions made before building

The project brief asked three questions before writing code. This was built
autonomously without waiting on answers, using the following defaults —
easy to revisit if you want something different:

1. **Web app first**, not React Native/Expo. React + Vite + MapLibre GL runs
   in a phone browser today with zero app-store friction.
2. **Free-tier by default**: Supabase (Postgres + PostGIS + Auth + Realtime)
   for the backend, Vercel for hosting + the small server-side pieces Strava
   OAuth needs, and MapLibre GL with an OpenStreetMap raster source for the
   map — no Mapbox account required. Swap in a Mapbox/MapTiler/Stadia vector
   style later for nicer styling (see `src/lib/mapStyle.ts`); OSM's public
   tile server isn't meant for heavy production traffic.
3. **Small group, realtime included**: built for a handful of friends
   (roughly 5–15), so Supabase Realtime is wired in from the start — everyone
   sees the map update live when someone's activity lands.

## How the game logic works

- **Loop detection** (`src/lib/geometry.ts`, pure TS/Turf.js — runs both in
  the browser and in the Strava-sync server function): the raw GPS track is
  simplified to remove jitter, then walked segment by segment. Whenever the
  newest segment crosses an earlier segment of the still-open path, the loop
  between the crossing point and the current position is cut off as a claim
  — the same rule Paper.io/Slither.io use for self-crossing, which naturally
  handles multi-lap routes. A final check also closes the loop if the route
  simply ends near where it started.
- **Claim resolution** (`supabase/schema.sql`, server-side, PostGIS): the
  detected polygon is sent to a Postgres function, `apply_territory_claim`,
  which in one transaction subtracts the new claim from every other
  player's territory (`ST_Difference`) and unions it into the claiming
  player's territory (`ST_Union`). Doing this atomically on the server —
  rather than client-side read/compute/write — avoids two friends' activities
  racing each other into an inconsistent map.
- **Run vs. ride**: every table carries a `type` column and territory is
  tracked as separate `(group, user, type)` rows, so runners and riders never
  compete for the same ground. Strava's activity types are mapped onto these
  two (`Run`/`TrailRun` → run, `Ride`/`MountainBikeRide`/`GravelRide`/etc. →
  ride) in `api/_strava.ts`.

## How Strava sync works

1. A player clicks **Connect Strava** (on the map screen). That's a plain
   redirect to Strava's OAuth page — no secret involved yet.
2. Strava redirects back to `api/strava/callback.ts`, a small server
   function that exchanges the code for an access/refresh token (this step
   needs your Strava app's *Client Secret*, which is why it has to happen
   server-side, never in the browser) and stores the tokens in
   `strava_connections` — a table with **no client access at all** (RLS
   enabled, zero policies), so tokens never reach anyone's browser.
3. `api/strava/sync.ts` fetches the player's recent Strava activities,
   skips any it's already imported (deduped on `strava_activity_id`), pulls
   the GPS stream for new ones, and runs each through the exact same loop
   detection + `apply_territory_claim` path a manual activity uses. It
   refreshes the Strava access token automatically when it's expired.
4. Sync runs automatically the moment the map page loads for a connected
   player, plus there's a manual **Sync now** button.

No webhooks in this version — sync is pull-based, triggered by opening the
app. That's simpler to set up and verify than Strava's webhook subscription
handshake, at the cost of activities not appearing until someone with Turf
open (or clicking Sync) checks. Real-time push via Strava webhooks is a
natural follow-up if that lag matters.

## Setup

### 1. Create a Supabase project

Free tier at [supabase.com](https://supabase.com) works fine for a friend
group. Once created:

- Open **SQL Editor** and run the contents of `supabase/schema.sql`. This
  creates the tables (including `strava_connections`), the
  `apply_territory_claim` function, row-level security policies, and adds
  the realtime publication.
- Open **Authentication → Sign In / Providers** and enable **Anonymous
  sign-ins**. Auth is intentionally lightweight for a friends-only app:
  each device gets an anonymous Supabase Auth user, and an invite code
  gates which group/lobby they can join — no email/password flow needed.
- Open **Project Settings → API** and note the **Project URL**, **anon
  public key**, and **service_role key** (Settings → API → Project API
  keys — keep this one secret, it bypasses all security rules).

### 2. Create a Strava API application

At [strava.com/settings/api](https://www.strava.com/settings/api) (needs a
Strava account): create an app, any name/icon is fine. You'll get a
**Client ID** and **Client Secret**. For **Authorization Callback Domain**,
use the domain your app will be hosted at (e.g. `your-app.vercel.app`) —
you can come back and fix this after step 3 once you know the real domain.

### 3. Deploy to Vercel

[vercel.com](https://vercel.com) → sign in with GitHub → **Add New Project**
→ import this repo → Deploy. Vercel auto-detects the Vite build and the
`api/` serverless functions, no config needed beyond environment variables.

In the Vercel project's **Settings → Environment Variables**, add:

| Name | Value | Used by |
|---|---|---|
| `VITE_SUPABASE_URL` | Supabase Project URL | browser |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key | browser |
| `VITE_STRAVA_CLIENT_ID` | Strava Client ID | browser (OAuth redirect) |
| `SUPABASE_URL` | same Supabase Project URL | server functions |
| `SUPABASE_ANON_KEY` | same Supabase anon key | server functions |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service_role key | server functions |
| `STRAVA_CLIENT_ID` | same Strava Client ID | server functions |
| `STRAVA_CLIENT_SECRET` | Strava Client Secret | server functions |

(The Supabase URL/anon key are duplicated with and without the `VITE_`
prefix on purpose — Vite only bundles `VITE_`-prefixed vars into the
browser build; the plain names are read by the server functions at
runtime and never shipped to the browser.)

Redeploy after adding the variables (Vercel does this automatically on the
next push, or trigger one manually from the dashboard). Once deployed, go
back to your Strava API app settings and make sure **Authorization Callback
Domain** matches the real Vercel domain.

### 4. Local development (optional)

```bash
cp .env.example .env.local   # fill in the VITE_ variables at minimum
npm install
npm run dev
```

Geolocation for the optional in-browser tracker needs HTTPS or `localhost`
to work, and will prompt for location permission. `api/` functions only run
when deployed to Vercel (or via `vercel dev`), not under plain `vite dev`.

Without `.env.local` configured, the app shows a "Supabase isn't configured"
screen instead of crashing, so `npm run dev` is safe to try immediately after
cloning.

## Project structure

```
supabase/schema.sql       Postgres schema, RLS, claim-resolution function
api/strava/callback.ts    OAuth code → token exchange (server-only secret)
api/strava/sync.ts        Fetch Strava activities, detect loops, claim territory
api/_strava.ts            Strava API helpers shared by callback + sync
api/_supabaseAdmin.ts      Service-role Supabase client (server-only)
src/lib/geometry.ts       Loop detection, distance/area helpers (Turf.js)
src/lib/strava.ts         Client-side Strava OAuth URL + sync trigger
src/lib/useGpsTracker.ts  Optional foreground GPS recording hook
src/lib/supabase.ts       Supabase client
src/state/authStore.ts    Anonymous auth + group create/join
src/state/territoryStore.ts  Territory state + Supabase Realtime subscription
src/components/MapView.tsx     MapLibre GL map (territory, live track, claim preview)
src/components/StravaConnect.tsx  Connect/sync UI
src/pages/Join.tsx        Create/join a group
src/pages/Home.tsx        Shared map + leaderboard
src/pages/Activity.tsx    Optional manual start/stop tracking
```

## Known MVP limitations (by design, not oversights)

- **Strava sync is pull-based, not real-time.** An activity shows up once
  someone opens the app (auto-syncs) or hits "Sync now" — typically within
  seconds of opening, but not the instant the ride ends. Webhooks would
  close that gap; not built yet.
- **The optional in-browser tracker is still foreground-only** — if you use
  it instead of Strava, the tab has to stay open and active. This is a
  browser platform limitation, not something fixable in a web app; it's why
  Strava sync is the recommended path rather than a v2 feature.
- **OSM raster tiles.** Free and token-free, but not meant for heavy
  production traffic or offline use. Swap the style in `src/lib/mapStyle.ts`
  when you're ready.
- **Loop detection is greedy/sequential**, not a full polygon-self-
  intersection solver. It matches how a runner actually experiences "closing
  a loop" and handles multi-lap routes, but an unusual path (e.g. crossing
  itself many times in a tight tangle) may not carve out every geometrically
  possible sub-loop.
- **No push notifications / territory battles / seasons** — stretch goals
  from the brief, not built yet.

## Next steps

- Connect Strava for 2+ real players in the same group, ride/run a real
  loop, and confirm a steal actually clips the other player's polygon live
  on both screens.
- Tune `SIMPLIFY_TOLERANCE_DEG`, `CLOSE_LOOP_THRESHOLD_M`, and
  `MIN_LOOP_AREA_SQM` in `src/lib/geometry.ts` against real GPS traces —
  accuracy varies by device, and Strava's own recording differs slightly
  from raw phone GPS.
- If sync latency becomes annoying, add a Strava webhook subscription
  (`POST /api/v3/push_subscriptions`) pointing at a new `api/strava/webhook`
  function, so new activities import automatically without anyone opening
  the app.
