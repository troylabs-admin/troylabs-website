/**
 * Who a message goes to (Bryan, 2026-10-02): any mix of groups, each split into CURRENT and ALUMNI.
 * The ONE implementation: the send-message function sends with it and the Message page counts with it, so
 * the number an admin sees is the number that goes out.
 *
 *   groups   EVERYONE · E-BOARD · BUILD · DEMO · PRODUCT MANAGEMENT · VC/FINANCE · TECH · MARKETING · DESIGN
 *   cells    a group × CURRENT or ALUMNI; the admin ticks any number of them
 *   rule     a member is in the audience if they are in ANY ticked cell (once, however many they're in),
 *            AND — when set — in one of the picked cohorts AND in one of the picked industries
 *
 *   CURRENT   students (status student); for E-BOARD: holds an e-board role this semester
 *   ALUMNI    alumni (status alum);      for E-BOARD: an alum who held an e-board role in any semester
 *
 * No cells ticked means nobody (never "everyone by accident"). Approval, opt-outs and contact details are
 * applied after this, by channel (email / text), in the function and the page alike.
 */
export const GROUPS = ['EVERYONE', 'E-BOARD', 'BUILD', 'DEMO', 'PRODUCT MANAGEMENT', 'VC/FINANCE', 'TECH', 'MARKETING', 'DESIGN'] as const;
export type Group = (typeof GROUPS)[number];
export type Who = 'current' | 'alumni';
export interface Cell { group: Group; who: Who }
export interface Audience { cells: Cell[]; cohort?: string[]; industries?: string[] }
export interface Member { id: string; status: 'student' | 'alum' | string; join_term: string | null; join_year: number | null; divisions: string[] | null; industries: string[] | null }
export interface EboardSets { now: Set<string>; ever: Set<string> }

export const cohortOf = (term: string | null, year: number | null) => (term && year ? `${term}${String(year).slice(2)}` : '');
const isAlum = (p: Member) => p.status === 'alum';

export function inCell(p: Member, c: Cell, eb: EboardSets): boolean {
  if (c.group === 'E-BOARD') return c.who === 'current' ? eb.now.has(p.id) : isAlum(p) && eb.ever.has(p.id);
  if ((c.who === 'alumni') !== isAlum(p)) return false;
  return c.group === 'EVERYONE' || (p.divisions ?? []).includes(c.group);
}

export function inAudience(p: Member, a: Audience | null | undefined, eb: EboardSets): boolean {
  if (!a?.cells?.length) return false;
  if (!a.cells.some((c) => inCell(p, c, eb))) return false;
  if (a.cohort?.length && !a.cohort.includes(cohortOf(p.join_term, p.join_year))) return false;
  if (a.industries?.length && !(p.industries ?? []).some((i) => a.industries!.includes(i))) return false;
  return true;
}

/** only well-formed cells, each once — what gets saved, whatever the page or a stale draft sends */
export function cleanAudience(a: unknown): Audience {
  const x = (a ?? {}) as Partial<Audience>; const seen = new Set<string>();
  const cells = (Array.isArray(x.cells) ? x.cells : []).filter((c): c is Cell => Boolean(c) && (GROUPS as readonly string[]).includes(c.group) && (c.who === 'current' || c.who === 'alumni'))
    .filter((c) => { const k = `${c.group}|${c.who}`; if (seen.has(k)) return false; seen.add(k); return true; });
  const list = (v: unknown) => (Array.isArray(v) ? [...new Set(v.filter((s) => typeof s === 'string' && s))] : []);
  return { cells, cohort: list(x.cohort), industries: list(x.industries) };
}

/** the audience in words: "Design (current + alumni), Tech alumni · cohort FA21" */
export function describeAudience(a: Audience | null | undefined): string {
  if (!a?.cells?.length) return 'nobody yet';
  const label = (g: Group) => (g === 'EVERYONE' ? 'Everyone' : g === 'E-BOARD' ? 'E-board' : g === 'PRODUCT MANAGEMENT' ? 'Product Management' : g === 'VC/FINANCE' ? 'VC/Finance' : g[0] + g.slice(1).toLowerCase());
  const parts = GROUPS.filter((g) => a.cells.some((c) => c.group === g)).map((g) => {
    const cur = a.cells.some((c) => c.group === g && c.who === 'current'), alu = a.cells.some((c) => c.group === g && c.who === 'alumni');
    if (g === 'EVERYONE') return cur && alu ? 'Everyone' : cur ? 'All current students' : 'All alumni';
    if (g === 'E-BOARD') return cur && alu ? 'E-board (current + alumni)' : cur ? 'Current e-board' : 'E-board alumni';
    return cur && alu ? `${label(g)} (current + alumni)` : cur ? `${label(g)} (current)` : `${label(g)} alumni`;
  });
  const narrow = [a.cohort?.length ? `cohort ${a.cohort.join(' or ')}` : '', a.industries?.length ? `industry ${a.industries.join(' or ')}` : ''].filter(Boolean);
  return parts.join('; ') + (narrow.length ? ` · only ${narrow.join(' and ')}` : '');
}
