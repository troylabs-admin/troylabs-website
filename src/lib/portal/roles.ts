/** The e-board line on a search card (Bryan, 2026-10-05: "are we not putting roles?"). One tag: the role held this
 *  semester ("CO-PRESIDENT"), else the most recent past one ("FORMER DIRECTOR OF TECH"), else one that starts later
 *  ("INCOMING CO-PRESIDENT"). "This semester" is the same rule the E-BOARD audience uses (options.currentTerm). */
import { currentTerm } from './options.ts';

export interface RoleTerm { role: string; term: 'FA' | 'SP'; year: number }
const order = (r: { term: 'FA' | 'SP'; year: number }) => r.year * 2 + (r.term === 'FA' ? 1 : 0);   // SP 2026 < FA 2026 < SP 2027

export function cardRole(roles: RoleTerm[], now = currentTerm()): string {
  if (!roles.length) return '';
  const today = order(now);
  const current = roles.filter((r) => order(r) === today).map((r) => r.role);
  if (current.length) return [...new Set(current)].join(' · ');
  const past = roles.filter((r) => order(r) < today).sort((a, b) => order(b) - order(a));
  if (past.length) return `FORMER ${past[0].role}`;
  const next = [...roles].sort((a, b) => order(a) - order(b));
  return `INCOMING ${next[0].role}`;
}
