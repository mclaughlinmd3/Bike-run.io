import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './state/authStore';
import { isSupabaseConfigured } from './lib/supabase';
import Join from './pages/Join';
import Home from './pages/Home';
import Activity from './pages/Activity';

function ConfigureSupabase() {
  return (
    <div className="join-screen">
      <h1>Turf</h1>
      <p className="tagline">Supabase isn't configured yet.</p>
      <p>
        Create a <code>.env.local</code> with <code>VITE_SUPABASE_URL</code> and{' '}
        <code>VITE_SUPABASE_ANON_KEY</code>, run <code>supabase/schema.sql</code> against your project, and
        enable anonymous sign-ins under Authentication settings. See <code>README.md</code> for full steps.
      </p>
    </div>
  );
}

export default function App() {
  const { profile, group, loading, init } = useAuthStore();

  useEffect(() => {
    if (isSupabaseConfigured) init();
  }, [init]);

  if (!isSupabaseConfigured) return <ConfigureSupabase />;
  if (loading) return <div className="join-screen">Loading…</div>;
  if (!profile || !group) return <Join />;

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/activity" element={<Activity />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
