// cardRole: the e-board tag on search cards (2026-10-05)
import assert from 'node:assert/strict';
import { cardRole } from '../../src/lib/portal/roles.ts';
const now = { term: 'FA' as const, year: 2026 };
const r = (role: string, term: 'FA' | 'SP', year: number) => ({ role, term, year });
const cases: [string, ReturnType<typeof r>[], string][] = [
  ['nobody', [], ''],
  ['this semester', [r('DIRECTOR OF TECH', 'FA', 2026)], 'DIRECTOR OF TECH'],
  ['current beats past (Charlotte)', [r('CO-PRESIDENT', 'SP', 2026), r('CO-PRESIDENT', 'FA', 2026)], 'CO-PRESIDENT'],
  ['current among several (Stasia)', [r('DIRECTOR OF MARKETING', 'SP', 2025), r('DIRECTOR OF BUILD', 'FA', 2025), r('CO-PRESIDENT', 'SP', 2026), r('CO-PRESIDENT', 'FA', 2026)], 'CO-PRESIDENT'],
  ['two roles at once', [r('CO-PRESIDENT', 'FA', 2026), r('DIRECTOR OF TECH', 'FA', 2026)], 'CO-PRESIDENT · DIRECTOR OF TECH'],
  ['latest past', [r('DIRECTOR OF DEMO', 'FA', 2023), r('DIRECTOR OF BUILD', 'SP', 2025), r('DIRECTOR OF TECH', 'FA', 2024)], 'FORMER DIRECTOR OF BUILD'],
  ['spring after fall of the same year is later', [r('A', 'FA', 2025), r('B', 'SP', 2026)], 'FORMER B'],
  ['spring of the same year is earlier than fall', [r('A', 'SP', 2026)], 'FORMER A'],
  ['future only', [r('CO-PRESIDENT', 'FA', 2027), r('DIRECTOR OF TECH', 'SP', 2027)], 'INCOMING DIRECTOR OF TECH'],
];
for (const [name, roles, want] of cases) assert.equal(cardRole(roles, now), want, name);
assert.equal(cardRole([r('X', 'SP', 2027)], { term: 'SP', year: 2027 }), 'X', 'spring current');
console.log(`PASS: cardRole — ${cases.length + 1} cases (current, several, past, future, semester order)`);
