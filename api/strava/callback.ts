import type { VercelRequest, VercelResponse } from '../_vercel-types.js';
import { supabaseAdmin } from '../_supabaseAdmin.js';
import { exchangeStravaCode } from '../_strava.js';
import { getErrorMessage } from '../../src/lib/errors.js';

// Strava redirects here after the user approves the OAuth prompt. `state`
// carries the Supabase profile id we started the connect flow for (set by
// the frontend when it builds the authorize URL) — it's not a secret, just
// a way to know which player just connected.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const { code, state, error } = req.query;

    if (error) {
      res.redirect(302, `/?strava_error=${encodeURIComponent(String(error))}`);
      return;
    }
    if (typeof code !== 'string' || typeof state !== 'string') {
      res.redirect(302, `/?strava_error=${encodeURIComponent('Missing code or state from Strava redirect')}`);
      return;
    }

    const token = await exchangeStravaCode(code);
    if (!token.athlete) {
      throw new Error('Strava token response missing athlete id');
    }

    const admin = supabaseAdmin();
    const { error: dbError } = await admin.from('strava_connections').upsert({
      profile_id: state,
      strava_athlete_id: token.athlete.id,
      access_token: token.access_token,
      refresh_token: token.refresh_token,
      expires_at: new Date(token.expires_at * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    });
    if (dbError) throw dbError;

    const { error: profileError } = await admin
      .from('profiles')
      .update({ strava_connected: true })
      .eq('id', state);
    if (profileError) throw profileError;

    res.redirect(302, '/?strava=connected');
  } catch (err) {
    console.error('Strava OAuth callback failed', err);
    // Encode the real reason into the redirect so it's visible without
    // needing to dig through platform logs.
    res.redirect(302, `/?strava_error=${encodeURIComponent(getErrorMessage(err))}`);
  }
}
