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

/** Years that are each real but don't make sense together, checked before a profile saves (2026-10-06, Bryan: "whenever
 *  someone signs up, we get … proper data … so we don't have to come back and fix it"). Each problem is a sentence for
 *  the person, naming the box to fix. `now` is passed in so tests can pin the date. Semesters: Spring starts in January,
 *  Fall in August, so joining "Fall 2026" is fine from August 2026. */
export interface YearAnswers { status: 'student' | 'alum' | null; grad_year: number | null; join_term: 'FA' | 'SP' | null; join_year: number | null }
export function yearProblems(a: YearAnswers, now = new Date()): { field: 'join' | 'grad'; message: string }[] {
  const out: { field: 'join' | 'grad'; message: string }[] = []; const y = now.getFullYear(), month = now.getMonth() + 1;
  if (a.join_year) {
    const started = a.join_year < y || (a.join_year === y && (a.join_term === 'SP' || month >= 8));
    if (!started) out.push({ field: 'join', message: `${a.join_term === 'FA' ? 'Fall' : 'Spring'} ${a.join_year} hasn’t started yet. Check the semester you joined TroyLabs.` });
    else if (a.join_year < 2015) out.push({ field: 'join', message: `TroyLabs didn’t exist in ${a.join_year}. Check the semester you joined.` });
  }
  if (a.grad_year && a.join_year && a.grad_year < a.join_year) out.push({ field: 'grad', message: `Your graduation year (${a.grad_year}) is before the year you joined TroyLabs (${a.join_year}).` });
  if (a.grad_year && a.status === 'student' && a.grad_year < y) out.push({ field: 'grad', message: `A ${a.grad_year} graduation is in the past. If you’ve graduated, choose ALUM.` });
  if (a.grad_year && a.status === 'student' && a.grad_year > y + 6) out.push({ field: 'grad', message: `Check your expected graduation: ${a.grad_year} is more than six years away.` });
  if (a.grad_year && a.status === 'alum' && a.grad_year > y) out.push({ field: 'grad', message: `Class of ${a.grad_year} hasn’t graduated yet. If you’re still studying, choose STUDENT.` });
  return out;
}
