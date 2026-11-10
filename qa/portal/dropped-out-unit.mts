// Dropped out (2026-11-09): an alum who left USC before graduating. Every reading of it, checked without a database:
// the tag and year line, the STATUS filter's three separate answers, the date rules,
// who gets which messages, and the AI-search sentence (with everyone else's sentence unchanged).
import assert from 'node:assert/strict';
import { STANDING_TAG, leftUscLine, semesterName, standingOf, tagOf } from '../../supabase/functions/_shared/standing.ts';
import { yearProblems } from '../../src/lib/portal/years.ts';
import { inAudience, type Member } from '../../supabase/functions/_shared/audience.ts';
import { profileText } from '../../supabase/functions/_shared/profile-text.ts';

// ── standing: tag and line ─────────────────────────────────────────────────────────────────────────────────────────
const student = { status: 'student', dropped_out: false, grad_term: 'SP', grad_year: 2028 };
const alum = { status: 'alum', dropped_out: false, grad_term: null, grad_year: 2024 };
const dropout = { status: 'alum', dropped_out: true, grad_term: 'FA', grad_year: 2024 };
assert.equal(tagOf(student), 'STUDENT'); assert.equal(tagOf(alum), 'ALUM'); assert.equal(tagOf(dropout), 'DROPPED OUT');
assert.equal(tagOf({ status: 'alum' }), 'ALUM', 'a row from before the column existed (no dropped_out) is an alum');
assert.equal(tagOf({ status: 'alum', dropped_out: null }), 'ALUM');
assert.equal(tagOf({ status: 'student', dropped_out: true }), 'STUDENT', 'the database refuses this mix; if it ever showed up, a student still reads as a student');
assert.equal(leftUscLine(alum), 'Class of 2024');
assert.equal(leftUscLine(dropout), 'Last at USC Fall 2024');
assert.equal(leftUscLine({ ...dropout, grad_term: 'SP' }), 'Last at USC Spring 2024');
assert.equal(leftUscLine({ ...dropout, grad_term: null }), 'Last at USC 2024', 'semester unknown: the year alone');
assert.equal(leftUscLine({ ...dropout, grad_year: null }), '', 'no year yet: no line');
assert.equal(leftUscLine(student), '', 'a student: each page words their year itself');
assert.equal(semesterName('FA', 2023), 'Fall 2023');
assert.deepEqual(Object.values(STANDING_TAG), ['STUDENT', 'ALUM', 'DROPPED OUT']);
console.log('PASS: standing — tags (STUDENT / ALUM / DROPPED OUT, old rows read as ALUM) and the year line ("Class of" / "Last at USC Fall 2024")');

// ── the STATUS filter: option A, three separate answers (the Network page matches p.status to the chip exactly) ─────
const people = [student, alum, dropout, { ...alum, grad_year: 2020 }, { ...dropout, grad_year: 2022 }];
const pick = (chips: string[]) => people.filter((p) => chips.includes(tagOf(p))).length;
assert.equal(pick(['ALUM']), 2, 'ALUM = graduates only');
assert.equal(pick(['DROPPED OUT']), 2, 'DROPPED OUT = dropouts only');
assert.equal(pick(['ALUM', 'DROPPED OUT']), 4, 'both = everyone who has left USC');
assert.equal(pick(['STUDENT', 'ALUM', 'DROPPED OUT']), people.length, 'all three = everyone, nobody twice');
console.log('PASS: STATUS filter — ALUM and DROPPED OUT never overlap; together they are everyone who left USC');

// ── date rules ─────────────────────────────────────────────────────────────────────────────────────────────────────
const nov = new Date(2026, 10, 9), may = new Date(2026, 4, 1);
const d = (a: Partial<Parameters<typeof yearProblems>[0]>, now = nov) => yearProblems({ status: 'alum', dropped_out: true, grad_term: 'FA', grad_year: 2024, join_term: 'FA', join_year: 2023, ...a }, now).map((x) => x.field);
const dc: [string, string[], string[]][] = [
  ['left Fall 2024, joined Fall 2023', d({}), []],
  ['left the same semester they joined', d({ grad_term: 'FA', grad_year: 2023 }), []],
  ['left this semester (Fall 2026, asked in November)', d({ grad_term: 'FA', grad_year: 2026, join_year: 2025 }), []],
  ['left Spring 2026 (asked in May)', d({ grad_term: 'SP', grad_year: 2026, join_year: 2025 }, may), []],
  ['Fall 2026 asked in May: not started', d({ grad_term: 'FA', grad_year: 2026, join_year: 2025, join_term: 'SP' }, may), ['grad']],
  ['Spring 2027: not started', d({ grad_term: 'SP', grad_year: 2027 }), ['grad']],
  ['left Spring 2023, joined Fall 2023: before joining', d({ grad_term: 'SP', grad_year: 2023 }), ['grad']],
  ['left 2022, joined 2023: before joining', d({ grad_year: 2022 }), ['grad']],
  ['last year typed, semester unknown, same year as joining', d({ grad_term: null, grad_year: 2023 }), []],
  ['no year typed yet', d({ grad_year: null }), []],
  ['joined in the future still flagged', d({ join_term: 'SP', join_year: 2027, grad_year: 2026, grad_term: 'SP' }), ['join', 'grad']],
];
for (const [what, got, want] of dc) assert.deepEqual(got, want, what);
// the alum rule "class of 2027 hasn't graduated" must not fire for a dropout; and alums/students are unchanged
assert.deepEqual(yearProblems({ status: 'alum', grad_year: 2027, join_term: 'FA', join_year: 2024 }, nov).map((x) => x.field), ['grad'], 'alum in the future still refused');
assert.deepEqual(yearProblems({ status: 'alum', dropped_out: false, grad_year: 2025, join_term: 'FA', join_year: 2023 }, nov), [], 'a graduate passes');
const msg = yearProblems({ status: 'alum', dropped_out: true, grad_term: 'SP', grad_year: 2027, join_term: 'FA', join_year: 2024 }, nov)[0].message;
assert.match(msg, /Spring 2027 hasn’t started yet\. Check your last semester at USC\./);
const before = yearProblems({ status: 'alum', dropped_out: true, grad_term: 'SP', grad_year: 2023, join_term: 'FA', join_year: 2023 }, nov)[0].message;
assert.match(before, /Your last semester at USC \(Spring 2023\) is before you joined TroyLabs \(Fall 2023\)\./);
console.log(`PASS: date rules — ${dc.length} dropout cases (not started, before joining, same semester ok) + graduates and students unchanged`);

// (the "still needed" wording — "your last semester at USC" — is checked in the page test, dropped-out.mjs: application.ts
//  imports work-history without an extension, which only the bundler resolves)

// ── messages: a dropout is an alum (ALUMNI cells, never CURRENT) ─────────────────────────────────────────────────────
const m = (o: Partial<Member>): Member => ({ id: 'x', status: 'alum', join_term: 'FA', join_year: 2023, divisions: ['TECH'], industries: [], ...o });
const eb = { now: new Set<string>(), ever: new Set<string>(['x']) };
const dropMember = { ...m({}), dropped_out: true } as Member;
const C = (group: string, who: 'current' | 'alumni') => ({ cells: [{ group, who }] }) as any;
assert.equal(inAudience(dropMember, C('EVERYONE', 'alumni'), eb), true, 'everyone · alumni reaches a dropout');
assert.equal(inAudience(dropMember, C('TECH', 'alumni'), eb), true, 'their division · alumni reaches them');
assert.equal(inAudience(dropMember, C('EVERYONE', 'current'), eb), false, 'current students never');
assert.equal(inAudience(dropMember, C('E-BOARD', 'alumni'), eb), true, 'a former e-board dropout is in alumni e-board');
console.log('PASS: messages — a dropout gets alumni messages and never current-student ones');

// ── AI search sentence ─────────────────────────────────────────────────────────────────────────────────────────────
const facts = { id: 'x', status: 'alum', grad_year: 2024, join_term: 'FA', join_year: 2022, divisions: ['TECH'], current_title: 'Founder', current_company: 'Acme', industries: [], startups: [], bio: null, embedding_hash: null, city: null };
assert.match(profileText({ ...facts, dropped_out: true, grad_term: 'FA' }), /^Dropped out of USC \(left before graduating\), last at USC Fall 2024\./);
assert.doesNotMatch(profileText({ ...facts, dropped_out: true, grad_term: 'FA' }), /class of/i);
// everyone else's sentence is exactly what it was, so nobody else is re-embedded
assert.match(profileText(facts), /^USC alum, class of 2024\./);
assert.match(profileText({ ...facts, dropped_out: false }), /^USC alum, class of 2024\./);
assert.match(profileText({ ...facts, status: 'student', grad_year: 2028 }), /^Current USC student, graduating 2028\./);
console.log('PASS: AI search — a dropout reads "Dropped out of USC … last at USC Fall 2024"; alums and students read exactly as before');
