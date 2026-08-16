import type { Profile, TerritoryStateRow } from '../lib/types';
import { squareMetersToKm2 } from '../lib/geometry';

interface LeaderboardProps {
  rows: TerritoryStateRow[];
  profiles: Record<string, Profile>;
}

export default function Leaderboard({ rows, profiles }: LeaderboardProps) {
  const ranked = [...rows]
    .filter((r) => r.area_sq_m > 0)
    .sort((a, b) => b.area_sq_m - a.area_sq_m);

  if (ranked.length === 0) {
    return <p className="leaderboard-empty">No territory claimed yet — go start a loop!</p>;
  }

  return (
    <ol className="leaderboard">
      {ranked.map((row, i) => {
        const profile = profiles[row.user_id];
        return (
          <li key={row.id} className="leaderboard-row">
            <span className="leaderboard-rank">{i + 1}</span>
            <span className="leaderboard-swatch" style={{ background: profile?.color ?? '#888' }} />
            <span className="leaderboard-name">{profile?.name ?? 'Unknown'}</span>
            <span className="leaderboard-area">{squareMetersToKm2(row.area_sq_m).toFixed(3)} km²</span>
          </li>
        );
      })}
    </ol>
  );
}
