// parseYear: every way a year gets typed into the profile form
import assert from 'node:assert/strict';
import { parseYear } from '../../src/lib/portal/years.ts';
const cases: [string, number | null | undefined][] = [['2026', 2026], ['26', 2026], [' 26 ', 2026], ["'26", 2026], ['’29', 2029], ['00', 2000], ['1999', 1999], ['', null], ['   ', null],
  ['6', undefined], ['226', undefined], ['20266', undefined], ['1850', undefined], ['2101', undefined], ['abc', undefined], ['2O26', undefined], ['26.5', undefined], ['-26', undefined], ['Spring 2026', undefined]];
for (const [input, want] of cases) assert.equal(parseYear(input), want, `parseYear(${JSON.stringify(input)})`);
console.log(`PASS: parseYear — ${cases.length} spellings (four digits, two digits as 20xx, empty, and ${cases.filter(([, w]) => w === undefined).length} that aren't years)`);
import { yearProblems } from '../../src/lib/portal/years.ts';
const oct = new Date(2026, 9, 6), may = new Date(2026, 4, 1);
const p = (a: Partial<Parameters<typeof yearProblems>[0]>, now = oct) => yearProblems({ status: 'student', grad_year: 2029, join_term: 'FA', join_year: 2026, ...a }, now).map((x) => x.field);
const yc: [string, string[], string[]][] = [
  ['a normal new student (Fall 2026, class of 2029)', p({}), []],
  ['Mirella: Spring 2026, class of 2029', p({ join_term: 'SP', join_year: 2026 }), []],
  ['Fall 2026 asked in May 2026 (not started)', p({}, may), ['join']],
  ['Spring 2027 asked in October 2026', p({ join_term: 'SP', join_year: 2027 }), ['join']],
  ['joined 2010', p({ join_year: 2010 }), ['join']],
  ['graduates before joining', p({ status: 'alum', grad_year: 2023, join_year: 2024 }), ['grad']],
  ['student graduating in the past', p({ grad_year: 2025, join_year: 2024 }), ['grad']],
  ['student graduating this year', p({ grad_year: 2026, join_year: 2024 }), []],
  ['student graduating in 2040', p({ grad_year: 2040 }), ['grad']],
  ['alum, class of 2027', p({ status: 'alum', grad_year: 2027, join_year: 2024 }), ['grad']],
  ['alum, class of 2025', p({ status: 'alum', grad_year: 2025, join_year: 2023 }), []],
  ['nothing typed yet', yearProblems({ status: null, grad_year: null, join_term: null, join_year: null }, oct).map((x) => x.field), []],
];
for (const [what, got, want] of yc) assert.deepEqual(got, want, what);
console.log(`PASS: yearProblems — ${yc.length} cases (semester not started, before TroyLabs, graduating before joining, student in the past or too far out, alum in the future; the normal cases pass)`);
