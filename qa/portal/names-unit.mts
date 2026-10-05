// shortName: the top bar's "First L." (2026-10-05)
import assert from 'node:assert/strict';
import { shortName } from '../../src/lib/portal/names.ts';
const cases: [string, string][] = [
  ['Bryan Ramirez-Gonzalez', 'Bryan R.'], ['Charlotte Chang', 'Charlotte C.'], ['Stasia Ramirez', 'Stasia R.'],
  ['Cher', 'Cher'], ['  Ada   Lovelace  ', 'Ada L.'], ['Martin Luther King Jr.', 'Martin K.'], ['John Smith III', 'John S.'],
  ['Ángel Ñúñez', 'Ángel Ñ.'], ['Mary Jane Watson', 'Mary W.'], ['Prince Jr.', 'Prince'], ['', ''], ['bryanram2024', 'bryanram2024'],
];
for (const [input, want] of cases) assert.equal(shortName(input), want, JSON.stringify(input));
console.log(`PASS: shortName — ${cases.length} cases (suffixes, accents, single names, extra spaces)`);
