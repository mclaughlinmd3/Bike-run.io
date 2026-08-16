import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Feature, Polygon } from 'geojson';
import { useAuthStore } from '../state/authStore';
import { useTerritoryStore } from '../state/territoryStore';
import { useGpsTracker } from '../lib/useGpsTracker';
import { detectClaimedPolygons, squareMetersToKm2 } from '../lib/geometry';
import { supabase } from '../lib/supabase';
import MapView from '../components/MapView';
import * as turf from '@turf/turf';

type Phase = 'idle' | 'tracking' | 'reviewing' | 'saving';

function formatDuration(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function Activity() {
  const navigate = useNavigate();
  const { profile, group } = useAuthStore();
  const { activityType, rows, profiles, submitClaims } = useTerritoryStore();
  const tracker = useGpsTracker();
  const [phase, setPhase] = useState<Phase>('idle');
  const [claims, setClaims] = useState<Feature<Polygon>[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);

  const rowsForType = useMemo(() => rows.filter((r) => r.type === activityType), [rows, activityType]);
  const totalClaimedArea = useMemo(
    () => claims.reduce((sum, c) => sum + turf.area(c), 0),
    [claims],
  );

  const handleStart = () => {
    setPhase('tracking');
    setSaveError(null);
    tracker.start();
  };

  const handleStop = () => {
    tracker.stop();
    const detected = detectClaimedPolygons(tracker.track);
    setClaims(detected);
    setPhase('reviewing');
  };

  const handleDiscard = () => {
    tracker.reset();
    setClaims([]);
    setPhase('idle');
  };

  const handleSave = async () => {
    if (!profile || !group) return;
    setPhase('saving');
    setSaveError(null);
    try {
      const { data: activity, error } = await supabase
        .from('activities')
        .insert({
          user_id: profile.id,
          group_id: group.id,
          type: activityType,
          started_at: new Date(tracker.startedAt ?? Date.now()).toISOString(),
          ended_at: new Date().toISOString(),
          gps_track: tracker.track,
          distance_m: tracker.distanceMeters,
          duration_s: tracker.durationSeconds,
        })
        .select('id')
        .single();
      if (error) throw error;

      if (claims.length > 0) {
        await submitClaims(activity.id, claims);
      }
      navigate('/');
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
      setPhase('reviewing');
    }
  };

  return (
    <div className="app-shell">
      <div className="activity-map-pane">
        <MapView
          rows={rowsForType}
          profiles={profiles}
          liveTrack={tracker.track}
          previewPolygons={phase === 'reviewing' ? claims : undefined}
        />
      </div>

      <div className="activity-controls">
        {phase === 'idle' && (
          <p className="activity-hint">
            Tracking with Strava? Just record there as usual — connect Strava from the map screen and your
            run or ride will sync in automatically. This screen only tracks while it stays open on screen.
          </p>
        )}
        <div className="activity-stats">
          <div>
            <span className="stat-label">Distance</span>
            <span className="stat-value">{(tracker.distanceMeters / 1000).toFixed(2)} km</span>
          </div>
          <div>
            <span className="stat-label">Duration</span>
            <span className="stat-value">{formatDuration(tracker.durationSeconds)}</span>
          </div>
          <div>
            <span className="stat-label">Type</span>
            <span className="stat-value">{activityType === 'run' ? 'Run' : 'Ride'}</span>
          </div>
        </div>

        {tracker.error && <p className="form-error">{tracker.error}</p>}
        {saveError && <p className="form-error">{saveError}</p>}

        {phase === 'idle' && (
          <button className="primary" onClick={handleStart}>
            Start {activityType === 'run' ? 'Run' : 'Ride'}
          </button>
        )}

        {phase === 'tracking' && (
          <button className="primary stop" onClick={handleStop}>
            Stop &amp; Review
          </button>
        )}

        {phase === 'reviewing' && (
          <div className="review-panel">
            {claims.length > 0 ? (
              <p className="claim-summary">
                Closed {claims.length} loop{claims.length > 1 ? 's' : ''} — claiming{' '}
                <strong>{squareMetersToKm2(totalClaimedArea).toFixed(3)} km²</strong>
              </p>
            ) : (
              <p className="claim-summary">No closed loop detected — this activity won't claim territory.</p>
            )}
            <div className="review-actions">
              <button className="secondary" onClick={handleDiscard}>
                Discard
              </button>
              <button className="primary" onClick={handleSave}>
                Save Activity
              </button>
            </div>
          </div>
        )}

        {phase === 'saving' && <p>Saving…</p>}
      </div>
    </div>
  );
}
