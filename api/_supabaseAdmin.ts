import { createClient } from '@supabase/supabase-js';

// Service-role client for server-only code (Vercel functions). Bypasses RLS
// — never import this from anything that ships to the browser.
export function supabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not configured');
  }
  return createClient(url, serviceRoleKey, { auth: { persistSession: false } });
}
