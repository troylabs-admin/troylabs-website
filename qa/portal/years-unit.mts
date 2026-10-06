// parseYear: every way a year gets typed into the profile form
import assert from 'node:assert/strict';
import { parseYear } from '../../src/lib/portal/years.ts';
const cases: [string, number | null | undefined][] = [['2026', 2026], ['26', 2026], [' 26 ', 2026], ["'26", 2026], ['’29', 2029], ['00', 2000], ['1999', 1999], ['', null], ['   ', null],
  ['6', undefined], ['226', undefined], ['20266', undefined], ['1850', undefined], ['2101', undefined], ['abc', undefined], ['2O26', undefined], ['26.5', undefined], ['-26', undefined], ['Spring 2026', undefined]];
for (const [input, want] of cases) assert.equal(parseYear(input), want, `parseYear(${JSON.stringify(input)})`);
console.log(`PASS: parseYear — ${cases.length} spellings (four digits, two digits as 20xx, empty, and ${cases.filter(([, w]) => w === undefined).length} that aren't years)`);
