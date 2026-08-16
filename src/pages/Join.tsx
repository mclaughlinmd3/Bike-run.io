import { useState } from 'react';
import { useAuthStore } from '../state/authStore';
import { PLAYER_COLORS } from '../lib/types';

export default function Join() {
  const { createGroup, joinGroup, loading, error } = useAuthStore();
  const [mode, setMode] = useState<'join' | 'create'>('join');
  const [playerName, setPlayerName] = useState('');
  const [color, setColor] = useState(PLAYER_COLORS[0]);
  const [inviteCode, setInviteCode] = useState('');
  const [groupName, setGroupName] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!playerName.trim()) return;
    if (mode === 'join') {
      if (!inviteCode.trim()) return;
      joinGroup(inviteCode, playerName.trim(), color);
    } else {
      if (!groupName.trim()) return;
      createGroup(groupName.trim(), playerName.trim(), color);
    }
  };

  return (
    <div className="join-screen">
      <h1>Turf</h1>
      <p className="tagline">Close a loop, claim the ground. Runners vs. runners, riders vs. riders.</p>

      <div className="join-tabs">
        <button className={mode === 'join' ? 'active' : ''} onClick={() => setMode('join')}>
          Join a group
        </button>
        <button className={mode === 'create' ? 'active' : ''} onClick={() => setMode('create')}>
          Create a group
        </button>
      </div>

      <form onSubmit={handleSubmit} className="join-form">
        <label>
          Your name
          <input value={playerName} onChange={(e) => setPlayerName(e.target.value)} placeholder="e.g. Sam" required />
        </label>

        <label>
          Your color
          <div className="color-picker">
            {PLAYER_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className={`color-swatch${c === color ? ' selected' : ''}`}
                style={{ background: c }}
                onClick={() => setColor(c)}
                aria-label={c}
              />
            ))}
          </div>
        </label>

        {mode === 'join' ? (
          <label>
            Invite code
            <input
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              placeholder="e.g. XK4P9Q"
              required
            />
          </label>
        ) : (
          <label>
            Group name
            <input
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="e.g. Weekend Warriors"
              required
            />
          </label>
        )}

        {error && <p className="form-error">{error}</p>}

        <button type="submit" className="primary" disabled={loading}>
          {loading ? 'Working…' : mode === 'join' ? 'Join group' : 'Create group'}
        </button>
      </form>
    </div>
  );
}
