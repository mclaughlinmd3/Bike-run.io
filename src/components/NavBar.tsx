import { Link, useLocation } from 'react-router-dom';
import type { ActivityType } from '../lib/types';

interface NavBarProps {
  groupName: string;
  activityType: ActivityType;
  onChangeType: (type: ActivityType) => void;
}

export default function NavBar({ groupName, activityType, onChangeType }: NavBarProps) {
  const location = useLocation();

  return (
    <header className="navbar">
      <div className="navbar-title">
        <strong>Turf</strong>
        <span className="navbar-group">{groupName}</span>
      </div>
      <div className="navbar-toggle">
        <button className={activityType === 'run' ? 'active' : ''} onClick={() => onChangeType('run')}>
          Run
        </button>
        <button className={activityType === 'ride' ? 'active' : ''} onClick={() => onChangeType('ride')}>
          Ride
        </button>
      </div>
      <nav className="navbar-links">
        <Link to="/" className={location.pathname === '/' ? 'active' : ''}>
          Map
        </Link>
        <Link to="/activity" className={location.pathname === '/activity' ? 'active' : ''}>
          Start Activity
        </Link>
      </nav>
    </header>
  );
}
