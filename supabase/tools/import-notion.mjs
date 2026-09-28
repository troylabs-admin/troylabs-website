#!/usr/bin/env node
/**
 * Roster import from Notion's "TroyLabs Fam" export (2026-09-28).
 *   node supabase/tools/import-notion.mjs <path to TroyLabs Fam ..._all.csv> [--apply]
 * Without --apply it only reports what it WOULD import (aggregates, never a person). With --apply it upserts
 * into public.roster through the service-role key, which must be in SUPABASE_SERVICE_ROLE_KEY for the run
 * (never stored in the repo). Re-running is safe: rows are matched by USC email.
 *
 * Column mapping (Notion → roster):
 *   Name → full_name · USC Email → usc_email (lower-cased; rows without one are skipped: nothing to sign in with)
 *   Rocket Class (e.g. "F24") → join_term/join_year; if empty, the earliest Active Semester
 *   Active Semesters ("S25, F25") → semesters {SP25,FA25} · Year → grad_year (2025.5 → 2025)
 *   Division → divisions[], vocabulary mapped to the portal's: PM→PRODUCT MANAGEMENT, UI/UX/DESIGN→DESIGN,
 *   Tech→TECH, VC→VC/FINANCE, Marketing→MARKETING, DEMO→DEMO, BUILD/LAUNCH→BUILD, IGNITE→IGNITE,
 *   Community→COMMUNITY; "Board" is e-board membership, not a division: kept aside for the admin to record roles.
 *   Phone Number → phone as +1XXXXXXXXXX · Linkedin → linkedin_url (only real URLs) · Major/minor → major · Hometown → hometown
 */
import { readFileSync } from 'node:fs';

const [file, ...flags] = process.argv.slice(2); const apply = flags.includes('--apply');
if (!file) { console.error('usage: import-notion.mjs <csv> [--apply]'); process.exit(1); }
const text = readFileSync(file, 'utf8').replace(/^﻿/, '');
const parse = (t) => { const rows = []; let row = [], cell = '', q = false; for (let i = 0; i < t.length; i++) { const c = t[i]; if (q) { if (c === '"' && t[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; } else if (c === '"') q = true; else if (c === ',') { row.push(cell); cell = ''; } else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; } else cell += c; } if (cell || row.length) { row.push(cell); rows.push(row); } return rows; };
const [header, ...data] = parse(text); const col = (r, name) => (r[header.indexOf(name)] ?? '').trim();
const term = (s) => { const m = /^([FS])\s?(\d{2})$/i.exec(s.trim()); return m ? { term: m[1].toUpperCase() === 'F' ? 'FA' : 'SP', year: 2000 + +m[2], code: `${m[1].toUpperCase() === 'F' ? 'FA' : 'SP'}${m[2]}` } : null; };
const DIV = { pm: 'PRODUCT MANAGEMENT', 'ui/ux': 'DESIGN', design: 'DESIGN', tech: 'TECH', vc: 'VC/FINANCE', marketing: 'MARKETING', demo: 'DEMO', 'build/launch': 'BUILD', ignite: 'IGNITE', community: 'COMMUNITY' };
const skipped = { noEmail: 0, notUsc: 0, example: 0, duplicate: 0 }; const unknownDiv = new Set(); const byEmail = new Map(); let board = 0;
for (const r of data) {
  const name = col(r, 'Name'); const email = col(r, 'USC Email').toLowerCase();
  if (/example|make copy|\btest\b/i.test(name)) { skipped.example++; continue; }
  if (!email) { skipped.noEmail++; continue; }
  if (!/@(?:[a-z0-9-]+\.)*usc\.edu$/.test(email)) { skipped.notUsc++; continue; }
  const sems = col(r, 'Active Semesters').split(/,\s*/).map(term).filter(Boolean).sort((a, b) => a.year - b.year || (a.term === 'SP' ? -1 : 1));
  const rc = term(col(r, 'Rocket Class')); const join = rc ?? sems[0] ?? null;
  const divs = []; for (const d of col(r, 'Division').split(/,\s*/).map((x) => x.trim()).filter(Boolean)) { if (/^board$/i.test(d)) { board++; continue; } const m = DIV[d.toLowerCase()]; if (m) divs.push(m); else unknownDiv.add(d); }
  const yr = parseFloat(col(r, 'Year')); const digits = col(r, 'Phone Number').replace(/\D/g, '');
  const li = col(r, 'Linkedin'); const row = {
    full_name: name, usc_email: email, join_term: join?.term ?? null, join_year: join?.year ?? null, division: divs[0] ?? null,
    divisions: [...new Set(divs)], semesters: [...new Set(sems.map((s) => s.code))], grad_year: Number.isFinite(yr) ? Math.floor(yr) : null,
    phone: digits.length === 10 ? `+1${digits}` : digits.length === 11 && digits.startsWith('1') ? `+${digits}` : null,
    linkedin_url: /linkedin\.com\//i.test(li) ? (li.startsWith('http') ? li : `https://${li}`) : null,
    major: col(r, 'Major/minor') || null, hometown: col(r, 'Hometown') || null, source: 'notion',
  };
  if (byEmail.has(email)) { skipped.duplicate++; const prev = byEmail.get(email); prev.semesters = [...new Set([...prev.semesters, ...row.semesters])]; prev.divisions = [...new Set([...prev.divisions, ...row.divisions])]; for (const k of Object.keys(row)) if (!prev[k] && row[k]) prev[k] = row[k]; continue; }
  byEmail.set(email, row);
}
const out = [...byEmail.values()]; const n = out.length; const cnt = (f) => out.filter(f).length;
console.log(`rows in file: ${data.length} · would import: ${n} · skipped: ${JSON.stringify(skipped)} (duplicates merged into one row)`);
console.log(`filled: join semester ${cnt((r) => r.join_year)} · semesters ${cnt((r) => r.semesters.length)} · grad year ${cnt((r) => r.grad_year)} · divisions ${cnt((r) => r.divisions.length)} · phone ${cnt((r) => r.phone)} · linkedin ${cnt((r) => r.linkedin_url)} · major ${cnt((r) => r.major)}`);
const tally = (xs) => Object.fromEntries([...xs.reduce((m, x) => m.set(x, (m.get(x) ?? 0) + 1), new Map())].sort((a, b) => b[1] - a[1]));
console.log('join semesters:', JSON.stringify(tally(out.map((r) => r.join_year ? `${r.join_term}${String(r.join_year).slice(2)}` : '—'))));
console.log('divisions:', JSON.stringify(tally(out.flatMap((r) => r.divisions))), '· on e-board at some point (Division "Board"):', board, '· unknown division labels:', [...unknownDiv]);
const y = new Date().getFullYear(), m = new Date().getMonth() + 1;
console.log('status at first sign-in:', JSON.stringify(tally(out.map((r) => r.grad_year ? (r.grad_year < y || (r.grad_year === y && m >= 6) ? `alum (class of ${r.grad_year})` : `student (expected ${r.grad_year})`) : 'student (no year on file)'))));
if (!apply) { console.log('\nDry run. Add --apply to write these rows to the roster.'); process.exit(0); }
const key = process.env.SUPABASE_SERVICE_ROLE_KEY; if (!key) { console.error('SUPABASE_SERVICE_ROLE_KEY is not set'); process.exit(1); }
const res = await fetch('https://ackmhqxyxnceoarbhcrp.supabase.co/rest/v1/roster?on_conflict=usc_email', { method: 'POST', headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(out) });
console.log(res.ok ? `\nImported ${n} people into the roster.` : `\nImport failed: ${res.status} ${(await res.text()).slice(0, 300)}`);
