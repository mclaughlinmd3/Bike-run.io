import { useEffect, useMemo } from 'react';
import { useAuthStore } from '../state/authStore';
import { useTerritoryStore } from '../state/territoryStore';
import MapView from '../components/MapView';
import Leaderboard from '../components/Leaderboard';
import NavBar from '../components/NavBar';
import StravaConnect from '../components/StravaConnect';

export default function Home() {
  const { profile, group } = useAuthStore();
  const { rows, profiles, activityType, setActivityType, connect, loading } = useTerritoryStore();

  useEffect(() => {
    if (group) connect(group.id);
  }, [group, connect]);

  const rowsForType = useMemo(() => rows.filter((r) => r.type === activityType), [rows, activityType]);

  if (!group || !profile) return null;

  return (
    <div className="app-shell">
      <NavBar groupName={group.name} activityType={activityType} onChangeType={setActivityType} />
      <div className="home-body">
        <div className="map-pane">
          <MapView rows={rowsForType} profiles={profiles} />
        </div>
        <aside className="side-pane">
          <div className="invite-card">
            <span>Invite code</span>
            <strong>{group.invite_code}</strong>
          </div>
          <StravaConnect profile={profile} />
          <h2>Leaderboard · {activityType === 'run' ? 'Runners' : 'Riders'}</h2>
          {loading ? <p>Loading…</p> : <Leaderboard rows={rowsForType} profiles={profiles} />}
        </aside>
      </div>
    </div>
  );
}
