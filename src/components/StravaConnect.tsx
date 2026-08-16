import { useEffect, useState } from 'react';
import type { Profile } from '../lib/types';
import { buildStravaAuthorizeUrl, isStravaConfigured, syncStrava, type StravaSyncResult } from '../lib/strava';

interface StravaConnectProps {
  profile: Profile;
}

export default function StravaConnect({ profile }: StravaConnectProps) {
  const [syncing, setSyncing] = useState(false);
  const [lastResult, setLastResult] = useState<StravaSyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  const runSync = async () => {
    setSyncing(true);
    setError(null);
    try {
      const result = await syncStrava();
      setLastResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSyncing(false);
    }
  };

  // Handle the redirect back from api/strava/callback.ts, then auto-sync
  // once so a freshly-connected player doesn't have to click twice.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get('strava');
    const err = params.get('strava_error');
    if (status || err) {
      if (status === 'connected') setBanner('Strava connected!');
      if (err) setError(`Strava connection failed (${err}). Try again?`);
      window.history.replaceState({}, '', window.location.pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (profile.strava_connected) runSync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.strava_connected]);

  if (!isStravaConfigured) return null;

  return (
    <div className="strava-card">
      {banner && <p className="strava-banner">{banner}</p>}
      {error && <p className="form-error">{error}</p>}

      {!profile.strava_connected ? (
        <a className="primary strava-connect-btn" href={buildStravaAuthorizeUrl(profile.id)}>
          Connect Strava
        </a>
      ) : (
        <div className="strava-status">
          <span>Strava connected</span>
          <button className="secondary" onClick={runSync} disabled={syncing}>
            {syncing ? 'Syncing…' : 'Sync now'}
          </button>
          {lastResult && !syncing && (
            <span className="strava-result">
              {lastResult.imported > 0
                ? `Imported ${lastResult.imported} activit${lastResult.imported === 1 ? 'y' : 'ies'}`
                : 'Up to date'}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
