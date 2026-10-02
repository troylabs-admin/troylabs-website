// The audience rules (supabase/functions/_shared/audience.ts), checked exhaustively without a database:
// every single cell, the combinations Bryan asked for, overlaps, narrowing, and malformed input.
// Run: node --experimental-strip-types qa/portal/audience-unit.mts
import assert from 'node:assert/strict';
import { GROUPS, inAudience, cleanAudience, describeAudience, type Audience, type Member } from '../../supabase/functions/_shared/audience.ts';

const m = (id: string, status: string, divisions: string[], extra: Partial<Member> = {}): Member => ({ id, status, join_term: 'FA', join_year: 2021, divisions, industries: [], ...extra });
const people: Member[] = [
  m('dS', 'student', ['DESIGN']), m('dA', 'alum', ['DESIGN']),
  m('tS', 'student', ['TECH']), m('tA', 'alum', ['TECH']),
  m('bS', 'student', ['BUILD', 'MARKETING']), m('bA', 'alum', ['BUILD']),
  m('xS', 'student', ['DEMO']), m('xA', 'alum', ['DEMO'], { join_term: 'SP', join_year: 2019, industries: ['AI'] }),
  m('pS', 'student', ['PRODUCT MANAGEMENT'], { industries: ['AI', 'FINTECH'] }), m('pA', 'alum', ['PRODUCT MANAGEMENT']),
  m('vS', 'student', ['VC/FINANCE']), m('vA', 'alum', ['VC/FINANCE']),
  m('mA', 'alum', ['MARKETING']),
  m('eNow', 'student', ['TECH']),          // e-board this semester
  m('eAlum', 'alum', ['DESIGN']),          // e-board in a past semester, now an alum
  m('ePastStudent', 'student', ['TECH']),  // e-board last semester, still a student: neither CURRENT nor ALUMNI e-board
  m('none', 'alum', []),                   // no division
];
const eb = { now: new Set(['eNow']), ever: new Set(['eNow', 'eAlum', 'ePastStudent']) };
const run = (a: Audience) => people.filter((p) => inAudience(p, a, eb)).map((p) => p.id).sort().join(' ');
const C = (group: string, who: 'current' | 'alumni') => ({ group, who }) as Audience['cells'][number];
const students = people.filter((p) => p.status === 'student').map((p) => p.id), alumni = people.filter((p) => p.status === 'alum').map((p) => p.id);
const want = (ids: string[]) => [...ids].sort().join(' ');

// every single cell
const single: Record<string, [string[], string[]]> = {
  'EVERYONE': [students, alumni],
  'E-BOARD': [['eNow'], ['eAlum']],
  'BUILD': [['bS'], ['bA']], 'DEMO': [['xS'], ['xA']], 'PRODUCT MANAGEMENT': [['pS'], ['pA']], 'VC/FINANCE': [['vS'], ['vA']],
  'TECH': [['tS', 'eNow', 'ePastStudent'], ['tA']], 'MARKETING': [['bS'], ['mA']], 'DESIGN': [['dS'], ['dA', 'eAlum']],
};
assert.deepEqual(Object.keys(single).sort(), [...GROUPS].sort(), 'every group covered');
for (const g of GROUPS) {
  assert.equal(run({ cells: [C(g, 'current')] }), want(single[g][0]), `${g} current`);
  assert.equal(run({ cells: [C(g, 'alumni')] }), want(single[g][1]), `${g} alumni`);
  assert.equal(run({ cells: [C(g, 'current'), C(g, 'alumni')] }), want([...new Set([...single[g][0], ...single[g][1]])]), `${g} current + alumni`);
}
console.log(`PASS: all ${GROUPS.length * 3} single groups (current, alumni, both)`);

// Bryan's combinations (2026-10-02)
const combos: [string, Audience, string[]][] = [
  ['e-board: current + alumni', { cells: [C('E-BOARD', 'current'), C('E-BOARD', 'alumni')] }, ['eNow', 'eAlum']],
  ['design now', { cells: [C('DESIGN', 'current')] }, ['dS']],
  ['design alumni', { cells: [C('DESIGN', 'alumni')] }, ['dA', 'eAlum']],
  ['design current + design alumni', { cells: [C('DESIGN', 'current'), C('DESIGN', 'alumni')] }, ['dS', 'dA', 'eAlum']],
  ['tech + tech alumni + design + design alumni', { cells: [C('TECH', 'current'), C('TECH', 'alumni'), C('DESIGN', 'current'), C('DESIGN', 'alumni')] }, ['tS', 'tA', 'eNow', 'ePastStudent', 'dS', 'dA', 'eAlum']],
  ['current e-board + all alumni', { cells: [C('E-BOARD', 'current'), C('EVERYONE', 'alumni')] }, ['eNow', ...alumni]],
  ['build current + marketing current (bS is in both: once)', { cells: [C('BUILD', 'current'), C('MARKETING', 'current')] }, ['bS']],
  ['everyone current + everyone alumni = everyone', { cells: [C('EVERYONE', 'current'), C('EVERYONE', 'alumni')] }, people.map((p) => p.id)],
  ['nothing ticked = nobody', { cells: [] }, []],
];
for (const [label, a, ids] of combos) assert.equal(run(a), want(ids), label);
console.log(`PASS: ${combos.length} mixed audiences, including every combination asked for`);

// narrowing on top of the cells
assert.equal(run({ cells: [C('EVERYONE', 'alumni')], cohort: ['SP19'] }), 'xA', 'cohort narrows');
assert.equal(run({ cells: [C('EVERYONE', 'current'), C('EVERYONE', 'alumni')], industries: ['AI'] }), want(['xA', 'pS']), 'industry narrows');
assert.equal(run({ cells: [C('EVERYONE', 'current')], industries: ['AI'], cohort: ['SP19'] }), '', 'both narrowings must hold');
assert.equal(run({ cells: [], cohort: ['FA21'] }), '', 'a cohort alone is still nobody (pick a group first)');
console.log('PASS: cohort / industry narrow the ticked groups; neither picks anyone on its own');

// what gets saved
assert.deepEqual(cleanAudience({ cells: [C('TECH', 'current'), C('TECH', 'current'), { group: 'IGNITE', who: 'current' }, { group: 'TECH', who: 'everyone' }, null], cohort: ['FA21', 'FA21', ''], industries: 'AI' }),
  { cells: [C('TECH', 'current')], cohort: ['FA21'], industries: [] }, 'duplicates, unknown groups, bad values dropped');
assert.deepEqual(cleanAudience(undefined), { cells: [], cohort: [], industries: [] });
assert.equal(describeAudience({ cells: [C('DESIGN', 'current'), C('DESIGN', 'alumni'), C('TECH', 'alumni'), C('E-BOARD', 'current')], cohort: ['FA21'] }), 'Current e-board; Tech alumni; Design (current + alumni) · only cohort FA21');
console.log('PASS: saved audiences are cleaned; descriptions read plainly');
