/**
 * Website numbers for Admin › Analytics, read from PostHog with the PRIVATE personal API key — which is
 * why this runs here and not in the page. Admins only: the caller's session is checked against the
 * admin list through the same row-level security the rest of the portal uses. Counts only, no people.
 * Secrets: POSTHOG_API_KEY (personal API key, read scope on insights/query), POSTHOG_PROJECT_ID (611704).
 */
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const auth = req.headers.get('Authorization') ?? '';
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
  const { data: isAdmin, error } = await sb.rpc('is_admin');
  if (error || !isAdmin) return json({ error: 'admins only' }, 403);

  const key = Deno.env.get('POSTHOG_API_KEY'); const project = Deno.env.get('POSTHOG_PROJECT_ID') ?? '611704';
  if (!key) return json({ configured: false });
  const days = Math.min(90, Math.max(1, Number(new URL(req.url).searchParams.get('days') ?? 30)));
  const hogql = async (query: string) => {
    const r = await fetch(`https://us.posthog.com/api/projects/${project}/query/`, { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: { kind: 'HogQLQuery', query } }) });
    if (!r.ok) throw new Error(`PostHog ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return (await r.json()).results as unknown[][];
  };
  const since = `timestamp > now() - interval ${days} day`;
  try {
    const [totals, pages, devices, portal] = await Promise.all([
      hogql(`select event, count() from events where ${since} and event in ('$pageview','apply_click','outbound_click','email_click','portal_click','video_play','search_run','filter_press','globe_star_tap','portal_signin') group by event`),
      hogql(`select properties.$pathname as p, count() from events where ${since} and event = '$pageview' and not p like '/alumni-portal%' group by p order by count() desc limit 8`),
      hogql(`select properties.device as d, count() from events where ${since} and event = '$pageview' group by d`),
      hogql(`select properties.$pathname as p, count() from events where ${since} and event = '$pageview' and p like '/alumni-portal%' group by p order by count() desc limit 6`),
    ]);
    const counts = Object.fromEntries(totals.map(([e, n]) => [e as string, Number(n)]));
    return json({ configured: true, days, counts, pages: pages.map(([p, n]) => [p, Number(n)]), devices: Object.fromEntries(devices.map(([d, n]) => [d ?? 'unknown', Number(n)])), portalPages: portal.map(([p, n]) => [p, Number(n)]) });
  } catch (e) { return json({ configured: true, error: String(e) }, 502); }
});
