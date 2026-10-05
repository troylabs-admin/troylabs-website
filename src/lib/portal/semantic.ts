/**
 * AI search on the network page (2026-10-05): the `semantic` function embeds what a member typed and returns the
 * closest approved profiles with a similarity score (cosine, text-embedding-3-small). Keyword matches always come
 * first; these are the "close matches" a keyword search would miss ("energy storage" → the battery founder).
 *
 * Which scores count as a close match, MEASURED on real embeddings (qa/portal/semantic.mjs, 2026-10-05): the right
 * person ranked first for every real question, at 0.21–0.44; wrong runners-up reached 0.27 (as high as one correct
 * top hit, so a fixed bar alone can't separate them); an unrelated question ("baking sourdough bread") topped out at
 * 0.11. Rule: at least 0.20 AND within 0.08 of the best score. On the measured set that keeps exactly the right
 * person for each question and nobody for the unrelated one.
 */
import { supabase } from '../supabase';

export const MIN_SIMILARITY = 0.2;
export const WITHIN_BEST = 0.08;
export interface Hit { id: string; similarity: number }

/** the hits that count as close matches, best first */
export function closeMatches(hits: Hit[]): Hit[] {
  const best = hits.reduce((m, h) => Math.max(m, h.similarity), 0);
  return hits.filter((h) => h.similarity >= MIN_SIMILARITY && h.similarity >= best - WITHIN_BEST).sort((a, b) => b.similarity - a.similarity);
}

/** ask the function; any failure just means no close matches (keyword search still works) */
export async function semanticSearch(q: string, signal?: AbortSignal): Promise<Hit[]> {
  const { data: { session } } = await supabase().auth.getSession(); if (!session) return [];
  try {
    const r = await fetch('https://ackmhqxyxnceoarbhcrp.supabase.co/functions/v1/semantic', { method: 'POST', signal, headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'search', q }) });
    if (!r.ok) return [];
    return ((await r.json()).hits ?? []) as Hit[];
  } catch { return []; }
}
