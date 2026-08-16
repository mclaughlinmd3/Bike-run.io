import { useCallback, useEffect, useRef, useState } from 'react';
import type { TrackPoint } from './types';
import { trackDistanceMeters } from './geometry';

// Foreground-only tracking for the MVP (per project scope — background
// tracking is a stretch goal that needs native APIs beyond the browser).
export function useGpsTracker() {
  const [track, setTrack] = useState<TrackPoint[]>([]);
  const [tracking, setTracking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [, forceTick] = useState(0);
  const watchIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (!tracking) return;
    const id = window.setInterval(() => forceTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [tracking]);

  const start = useCallback(() => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported on this device.');
      return;
    }
    setError(null);
    setTrack([]);
    setStartedAt(Date.now());
    setTracking(true);

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const point: TrackPoint = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          timestamp: pos.timestamp,
        };
        setTrack((prev) => [...prev, point]);
      },
      (err) => setError(err.message),
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 },
    );
  }, []);

  const stop = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setTracking(false);
  }, []);

  const reset = useCallback(() => {
    setTrack([]);
    setStartedAt(null);
    setError(null);
  }, []);

  const distanceMeters = trackDistanceMeters(track);
  const durationSeconds = startedAt ? Math.round((Date.now() - startedAt) / 1000) : 0;

  return { track, tracking, error, start, stop, reset, distanceMeters, durationSeconds, startedAt };
}
