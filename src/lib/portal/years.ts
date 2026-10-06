/** A year typed in the profile form (2026-10-06: Mirella typed "26" and the number 26 was stored, so her cohort read "SP").
 *  "2026" → 2026; "26" or "'26" → 2026 (two digits always mean 20xx); empty → null; anything else → undefined (not a year:
 *  the page asks for four digits instead of saving it). The database refuses years outside 1990–2100 as well. */
export function parseYear(v: string): number | null | undefined {
  const t = v.trim().replace(/^['’‘]/, '');
  if (!t) return null;
  if (/^\d{2}$/.test(t)) return 2000 + Number(t);
  if (/^\d{4}$/.test(t)) { const n = Number(t); return n >= 1990 && n <= 2100 ? n : undefined; }
  return undefined;
}
