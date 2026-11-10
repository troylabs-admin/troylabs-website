/**
 * Where someone stands with USC (Charlotte and Bryan, 2026-11-09: "add a dropped out section"; some members left USC to
 * build their startups). Stored as two columns so everything that means "no longer a student" keeps working untouched:
 *   status       'student' | 'alum'   (alum = not at USC any more; messages, the nightly graduation job, the globe count)
 *   dropped_out  true when they left USC before graduating (only ever with status 'alum'; the database refuses a
 *                dropped-out student)
 * For a dropout, grad_term + grad_year hold the LAST SEMESTER they were at USC, not a graduation.
 * One reading, shared by the pages and the edge functions, so a dropout never reads "Class of 2024" anywhere.
 * Filters treat the three as separate (Bryan, 2026-11-09, option A): ALUM = graduates only, DROPPED OUT = dropouts only.
 */
export type Standing = 'student' | 'alum' | 'dropped_out';
export interface StandingFacts { status: string; dropped_out?: boolean | null; grad_term?: string | null; grad_year?: number | null }

export const standingOf = (r: Pick<StandingFacts, 'status' | 'dropped_out'>): Standing =>
  r.status === 'student' ? 'student' : r.dropped_out ? 'dropped_out' : 'alum';

/** the tag on cards, the member page and the admin lists, and the STATUS filter's chips (one word set, so a filter and a tag always agree) */
export const STANDING_TAG = { student: 'STUDENT', alum: 'ALUM', dropped_out: 'DROPPED OUT' } as const;
export type StandingTag = typeof STANDING_TAG[Standing];
export const tagOf = (r: Pick<StandingFacts, 'status' | 'dropped_out'>): StandingTag => STANDING_TAG[standingOf(r)];

/** "Fall 2024"; just the year when the semester isn't known */
export const semesterName = (term: string | null | undefined, year: number) => (term === 'FA' ? `Fall ${year}` : term === 'SP' ? `Spring ${year}` : String(year));

/** the line an alum or a dropout gets under their name: "Class of 2024" / "Last at USC Fall 2024"; '' for a student
 *  (each page words a student's year its own way) or when no year is known */
export function leftUscLine(r: StandingFacts): string {
  if (!r.grad_year) return '';
  const s = standingOf(r);
  return s === 'alum' ? `Class of ${r.grad_year}` : s === 'dropped_out' ? `Last at USC ${semesterName(r.grad_term, r.grad_year)}` : '';
}
