import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '../_vercel-types.js';
import { supabaseAdmin } from '../_supabaseAdmin.js';
import {
  fetchRecentStravaActivities,
  fetchStravaActivityStreams,
  refreshStravaToken,
  STRAVA_TYPE_MAP,
} from '../_strava.js';
import { detectClaimedPolygons } from '../../src/lib/geometry.js';
import type { TrackPoint } from '../../src/lib/types.js';
import { getErrorMessage } from '../../src/lib/errors.js';

// Pulls the caller's recent Strava activities, imports any not already
// seen (deduped on strava_activity_id), and runs each through the same
// loop-detection + claim-resolution path a manually-tracked activity uses.
// This is what lets Strava's own (reliable, background-capable) GPS
// recording stand in for our in-browser tracker.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    await syncHandler(req, res);
  } catch (err) {
    console.error('Strava sync crashed', err);
    res.status(500).json({ error: getErrorMessage(err) });
  }
}

async function syncHandler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).send('Method not allowed');
    return;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).send('Missing bearer token');
    return;
  }
  const jwt = authHeader.slice('Bearer '.length);

  const supabaseUrl = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    res.status(500).send('Server misconfigured');
    return;
  }

  const callerClient = createClient(supabaseUrl, anonKey);
  const { data: userData, error: userErr } = await callerClient.auth.getUser(jwt);
  if (userErr || !userData.user) {
    res.status(401).send('Invalid session');
    return;
  }
  const profileId = userData.user.id;

  const admin = supabaseAdmin();

  const { data: profile } = await admin.from('profiles').select('*').eq('id', profileId).maybeSingle();
  if (!profile?.group_id) {
    res.status(400).json({ error: 'Join a group before syncing Strava.' });
    return;
  }

  const { data: connection } = await admin
    .from('strava_connections')
    .select('*')
    .eq('profile_id', profileId)
    .maybeSingle();
  if (!connection) {
    res.status(400).json({ error: 'Strava is not connected for this player.' });
    return;
  }

  let accessToken = connection.access_token as string;
  const expiresAt = new Date(connection.expires_at as string).getTime();
  if (expiresAt < Date.now() + 60_000) {
    try {
      const refreshed = await refreshStravaToken(connection.refresh_token as string);
      accessToken = refreshed.access_token;
      await admin
        .from('strava_connections')
        .update({
          access_token: refreshed.access_token,
          refresh_token: refreshed.refresh_token,
          expires_at: new Date(refreshed.expires_at * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('profile_id', profileId);
    } catch (err) {
      console.error('Strava token refresh failed', err);
      res.status(502).json({ error: 'Could not refresh Strava access — try reconnecting Strava.' });
      return;
    }
  }

  let stravaActivities;
  try {
    stravaActivities = await fetchRecentStravaActivities(accessToken);
  } catch (err) {
    console.error('Fetching Strava activities failed', err);
    res.status(502).json({ error: 'Could not reach Strava.' });
    return;
  }

  const importedActivityIds: string[] = [];
  const skipped: { stravaId: number; reason: string }[] = [];

  for (const act of stravaActivities) {
    const type = STRAVA_TYPE_MAP[act.type];
    if (!type) continue;

    const { data: existing } = await admin
      .from('activities')
      .select('id')
      .eq('strava_activity_id', act.id)
      .maybeSingle();
    if (existing) continue;

    let streams;
    try {
      streams = await fetchStravaActivityStreams(accessToken, act.id);
    } catch (err) {
      skipped.push({ stravaId: act.id, reason: 'streams fetch failed' });
      console.error(`Strava streams fetch failed for activity ${act.id}`, err);
      continue;
    }

    const latlng = streams.latlng?.data ?? [];
    const offsets = streams.time?.data ?? [];
    if (latlng.length < 4) {
      skipped.push({ stravaId: act.id, reason: 'no GPS stream' });
      continue;
    }

    const startedAtMs = new Date(act.start_date).getTime();
    const track: TrackPoint[] = latlng.map(([lat, lng], i) => ({
      lat,
      lng,
      timestamp: startedAtMs + (offsets[i] ?? i) * 1000,
    }));

    const claims = detectClaimedPolygons(track);

    const { data: inserted, error: insertErr } = await admin
      .from('activities')
      .insert({
        user_id: profileId,
        group_id: profile.group_id,
        type,
        started_at: act.start_date,
        ended_at: new Date(startedAtMs + act.elapsed_time * 1000).toISOString(),
        gps_track: track,
        distance_m: act.distance,
        duration_s: act.elapsed_time,
        source: 'strava',
        strava_activity_id: act.id,
      })
      .select('id')
      .single();

    if (insertErr || !inserted) {
      skipped.push({ stravaId: act.id, reason: insertErr?.message ?? 'insert failed' });
      continue;
    }

    for (const claim of claims) {
      const { error: claimErr } = await admin.rpc('apply_territory_claim', {
        p_activity_id: inserted.id,
        p_claim_geojson: claim.geometry,
      });
      if (claimErr) console.error(`apply_territory_claim failed for activity ${inserted.id}`, claimErr);
    }

    importedActivityIds.push(inserted.id);
  }

  res.status(200).json({ imported: importedActivityIds.length, skipped });
}
