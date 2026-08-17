export type ActivityType = 'run' | 'ride';

export interface Group {
  id: string;
  name: string;
  invite_code: string;
  created_at: string;
}

export interface Profile {
  id: string;
  name: string;
  color: string;
  group_id: string | null;
  strava_connected: boolean;
  created_at: string;
}

export interface TrackPoint {
  lat: number;
  lng: number;
  timestamp: number;
}

export interface Activity {
  id: string;
  user_id: string;
  group_id: string;
  type: ActivityType;
  started_at: string;
  ended_at: string | null;
  gps_track: TrackPoint[];
  distance_m: number;
  duration_s: number;
  source: 'manual' | 'strava';
  strava_activity_id: number | null;
  created_at: string;
}

export interface TerritoryStateRow {
  id: string;
  group_id: string;
  user_id: string;
  type: ActivityType;
  polygon: GeoJSON.MultiPolygon | null;
  area_sq_m: number;
  updated_at: string;
}

export const PLAYER_COLORS = [
  '#e6194b',
  '#3cb44b',
  '#4363d8',
  '#f58231',
  '#911eb4',
  '#42d4f4',
  '#f032e6',
  '#bfef45',
  '#fabed4',
  '#469990',
];
