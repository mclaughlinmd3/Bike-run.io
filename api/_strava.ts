export interface StravaTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_at: number; // unix seconds
  athlete?: { id: number };
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

export async function exchangeStravaCode(code: string): Promise<StravaTokenResponse> {
  const res = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: requireEnv('STRAVA_CLIENT_ID'),
      client_secret: requireEnv('STRAVA_CLIENT_SECRET'),
      code,
      grant_type: 'authorization_code',
    }),
  });
  if (!res.ok) {
    throw new Error(`Strava token exchange failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as StravaTokenResponse;
}

export async function refreshStravaToken(refreshToken: string): Promise<StravaTokenResponse> {
  const res = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: requireEnv('STRAVA_CLIENT_ID'),
      client_secret: requireEnv('STRAVA_CLIENT_SECRET'),
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });
  if (!res.ok) {
    throw new Error(`Strava token refresh failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as StravaTokenResponse;
}

export interface StravaSummaryActivity {
  id: number;
  type: string;
  start_date: string;
  distance: number;
  elapsed_time: number;
}

export async function fetchRecentStravaActivities(accessToken: string): Promise<StravaSummaryActivity[]> {
  const res = await fetch('https://www.strava.com/api/v3/athlete/activities?per_page=30', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch Strava activities: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as StravaSummaryActivity[];
}

export interface StravaLatLngStream {
  latlng?: { data: [number, number][] };
  time?: { data: number[] };
}

export async function fetchStravaActivityStreams(
  accessToken: string,
  activityId: number,
): Promise<StravaLatLngStream> {
  const res = await fetch(
    `https://www.strava.com/api/v3/activities/${activityId}/streams?keys=latlng,time&key_by_type=true`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) {
    throw new Error(`Failed to fetch Strava streams: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as StravaLatLngStream;
}

// Strava activity types we track territory for, mapped to our two boards.
export const STRAVA_TYPE_MAP: Record<string, 'run' | 'ride' | undefined> = {
  Run: 'run',
  TrailRun: 'run',
  VirtualRun: 'run',
  Ride: 'ride',
  MountainBikeRide: 'ride',
  GravelRide: 'ride',
  EBikeRide: 'ride',
  VirtualRide: 'ride',
};
