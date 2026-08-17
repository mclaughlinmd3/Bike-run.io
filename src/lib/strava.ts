import { supabase } from './supabase';

export const isStravaConfigured = Boolean(import.meta.env.VITE_STRAVA_CLIENT_ID);

// `state` carries the profile id so api/strava/callback.ts knows who just
// connected — Strava echoes it back verbatim, it isn't a secret.
export function buildStravaAuthorizeUrl(profileId: string): string {
  const clientId = import.meta.env.VITE_STRAVA_CLIENT_ID as string;
  const redirectUri = `${window.location.origin}/api/strava/callback`;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    approval_prompt: 'auto',
    scope: 'activity:read_all',
    state: profileId,
  });
  return `https://www.strava.com/oauth/authorize?${params.toString()}`;
}

export interface StravaSyncResult {
  imported: number;
  skipped: { stravaId: number; reason: string }[];
}

export async function syncStrava(): Promise<StravaSyncResult> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Not signed in.');

  const res = await fetch('/api/strava/sync', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? `Sync failed (${res.status})`);
  }
  return res.json();
}
