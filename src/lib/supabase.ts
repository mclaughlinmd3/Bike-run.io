import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(url && anonKey);

// A harmless placeholder so createClient doesn't throw when unconfigured —
// callers gate all real usage behind isSupabaseConfigured (see App.tsx).
export const supabase = createClient(url || 'https://placeholder.supabase.co', anonKey || 'placeholder');
