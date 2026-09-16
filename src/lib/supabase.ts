/**
 * The one Supabase client for the browser. URL and publishable key are public by design (row-level
 * security in the database is what protects the data — see supabase/migrations). Project TL_Network,
 * us-west-2. The client is created lazily so pages that never touch data pay nothing, and the sign-in
 * session lives in localStorage on the device (that is what "you stay signed in" means).
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;
export function supabase(): SupabaseClient {
  if (client) return client;
  const url = import.meta.env.PUBLIC_SUPABASE_URL as string | undefined;
  const key = import.meta.env.PUBLIC_SUPABASE_KEY as string | undefined;
  if (!url || !key) throw new Error('Supabase is not configured: PUBLIC_SUPABASE_URL / PUBLIC_SUPABASE_KEY are missing');
  // implicit flow, not PKCE: a magic link is often opened in a different browser than the one that asked
  // for it (mail app → Safari, while the form was filled in Chrome). PKCE would fail there; the implicit
  // flow carries the session in the link itself and works anywhere.
  client = createClient(url, key, { auth: { flowType: 'implicit', detectSessionInUrl: true, persistSession: true, autoRefreshToken: true } });
  return client;
}
export const configured = () => Boolean(import.meta.env.PUBLIC_SUPABASE_URL && import.meta.env.PUBLIC_SUPABASE_KEY);
