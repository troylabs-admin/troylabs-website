// toWorkHistory against Bryan's real LinkedIn scrape (2026-10-05, work fields only) + the scraper quirks ColorStack fixes.
// Also replays ColorStack's own merge rule on the same data, to show the duplicate it produced and that ours doesn't.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canonicalLinkedIn, isUsc, parseWhen, photoDecision, photoKey, snapshotOf, toItems, toRow, toSkills, toWorkHistory, type ScrapedExperience, type ScrapedFull } from '../../supabase/functions/_shared/work-history.ts';

const fx = JSON.parse(readFileSync(new URL('./fixtures/linkedin-bryanrg22.json', import.meta.url), 'utf8')) as ScrapedFull & { experience: ScrapedExperience[] };
assert.equal(fx.experience.length, 15, 'the scrape has 15 entries');

// ── the real scrape ─────────────────────────────────────────────────────────────────────────────
const rows = toWorkHistory(fx.experience);
assert.equal(rows.length, 14, 'NVIDIA, listed twice by the scraper, is stored once');
const nvidia = rows.filter((r) => r.company === 'NVIDIA');
assert.equal(nvidia.length, 1);
assert.deepEqual({ ...nvidia[0], company_logo: null, company_linkedin_url: null, company_linkedin_id: null }, { title: 'Software Engineering Intern', company: 'NVIDIA', company_linkedin_id: null, company_linkedin_url: null, company_logo: null, employment_type: 'Internship', workplace_type: 'On-site', location: 'Santa Clara, CA', description: null, start_year: 2026, start_month: 5, end_year: null, end_month: null }, 'the merged NVIDIA keeps On-site from the second copy');
assert.deepEqual(rows.map((r) => r.company), ['NVIDIA', 'OpenAI', 'USC Information Sciences Institute', 'USC Information Sciences Institute', 'Hudson River Trading', 'The D. E. Shaw Group', 'Jane Street', 'Two Sigma', 'Susquehanna International Group', 'USC Viterbi School of Engineering', 'Jane Street', 'LavaLab', 'Quant SC', 'TroyLabs'], 'LinkedIn order kept; two different Jane Street fellowships stay two');
assert.equal(rows.find((r) => r.company === 'Hudson River Trading')!.end_month, 5, 'ended jobs keep their end month');
assert.equal(rows.find((r) => r.company === 'OpenAI')!.end_year, null, 'current jobs have no end');
assert.ok(rows.find((r) => r.company === 'TroyLabs'), 'a job is kept even without a company id');
assert.deepEqual(toWorkHistory(fx.experience), rows, 'the same scrape always gives the same rows (so syncing again changes nothing)');
console.log('PASS: Bryan\'s scrape — 15 entries → 14 jobs, NVIDIA once with On-site, LinkedIn order, current/ended dates');

// ── ColorStack's rule on the same data (oyster linkedin.ts doesExperienceMatch, against a pre-sync snapshot) ───────
const handTyped = { company: 'NVIDIA', title: 'Incoming Software Engineering Intern', startYear: 2026, startMonth: 2, endYear: null as number | null };
const score = (e: ScrapedExperience, x: typeof handTyped) => {
  const r = toRow(e)!; if (!(x.company.includes(r.company) || r.company.includes(x.company))) return -1;
  let s = 0; if (r.title === x.title) s += 2; if (r.start_year === x.startYear) s++; if (r.start_month === x.startMonth) s++;
  if (!x.endYear && !r.end_year) s++; return s;
};
const theirNew = fx.experience.filter((e) => toRow(e)?.company === 'NVIDIA').filter((e) => score(e, handTyped) < 3);
assert.equal(theirNew.length, 2, 'ColorStack: both scraped NVIDIA copies score 2 (< 3) against the hand-typed job, so it creates both');
console.log('PASS: ColorStack\'s merge rule on the same data creates 2 new NVIDIA jobs next to the hand-typed one (3 in all) — the bug reproduced');

// ── the scraper quirks ColorStack works around ──────────────────────────────────────────────────
const base: ScrapedExperience = { position: 'Engineer', companyName: 'Acme', startDate: { month: 'Jan', year: 2024 } };
assert.deepEqual([toRow({ ...base, location: 'Remote' })!.location, toRow({ ...base, location: 'Remote' })!.workplace_type], [null, 'Remote'], 'workplace in the location field');
assert.deepEqual([toRow({ ...base, workplaceType: 'Austin, TX' })!.location, toRow({ ...base, workplaceType: 'Austin, TX' })!.workplace_type], ['Austin, TX', null], 'location in the workplace field');
assert.deepEqual([toRow({ ...base, location: 'Hybrid', workplaceType: 'Boston, MA' })!.location, toRow({ ...base, location: 'Hybrid', workplaceType: 'Boston, MA' })!.workplace_type], ['Boston, MA', 'Hybrid'], 'both swapped');
assert.equal(toRow({ ...base, location: 'Earth' })!.location, null);
assert.equal(toRow({ ...base, location: 'Greater Seattle Area' })!.location, 'Seattle');
assert.equal(toRow({ ...base, location: 'San Francisco Bay Area' })!.location, 'San Francisco');
assert.equal(toRow({ ...base, position: 'Product Intern' })!.employment_type, 'Internship');
assert.equal(toRow({ ...base, position: 'Internal Tools Engineer' })!.employment_type, null, '"Internal" is not an internship');
assert.equal(toRow({ ...base, startDate: { year: 2024 } })!.start_month, null, 'a year without a month');
assert.equal(toRow({ ...base, startDate: null }), null, 'no start date → skipped');
assert.equal(toRow({ ...base, companyName: '' }), null, 'no company → skipped');
assert.equal(toRow({ ...base, position: '  ' }), null, 'no title → skipped');
assert.equal(toRow({ ...base, endDate: { text: 'Present' } })!.end_year, null);
console.log('PASS: scraper quirks — swapped location/workplace, Earth, metro names, untyped internships, missing dates/company/title');

// ── links ───────────────────────────────────────────────────────────────────────────────────────
for (const [raw, want] of [['linkedin.com/in/bryanrg22', 'https://www.linkedin.com/in/bryanrg22'], ['https://www.linkedin.com/in/BryanRG22/', 'https://www.linkedin.com/in/bryanrg22'], ['http://linkedin.com/in/bryanrg22?utm=x#top', 'https://www.linkedin.com/in/bryanrg22'], ['https://uk.linkedin.com/in/jane-doe-123/details/experience/', 'https://www.linkedin.com/in/jane-doe-123'], ['https://www.linkedin.com/in/jos%C3%A9', 'https://www.linkedin.com/in/josé']] as const)
  assert.equal(canonicalLinkedIn(raw), want, raw);
for (const bad of ['', 'bryanrg22', 'https://www.linkedin.com/company/nvidia', 'https://evil.com/linkedin.com/in/x', 'https://notlinkedin.com/in/x']) assert.equal(canonicalLinkedIn(bad), null, bad);
console.log('PASS: LinkedIn links — one form for any spelling; company pages and look-alike sites refused');

// ── everything else on the profile ──────────────────────────────────────────────────────────────
const items = toItems(fx);
const by = (k: string) => items.filter((i) => i.kind === k);
assert.deepEqual([by('honor').length, by('publication').length, by('certification').length, by('organization').length, by('education').length], [7, 1, 1, 3, 1], 'Bryan: 7 honors, 1 publication, 1 certification, 3 organizations, 1 school');
assert.deepEqual(by('honor')[0], { kind: 'honor', title: 'Anthropic - Claude Builder Hackathon', issuer: 'Anthropic', detail: null, year: 2026, month: 4, end_year: null, end_month: null, current: false, link: null, description: null, is_usc: false });
assert.deepEqual([by('publication')[0].title, by('publication')[0].year, by('publication')[0].month, by('publication')[0].link], ['EDTok: A Dataset for Eating Disorder Content on TikTok', 2025, 5, 'https://arxiv.org/abs/2505.02250'], 'publication date and link');
assert.equal(by('education')[0].is_usc, true, 'USC is marked (pages show only other schools)'); assert.equal(by('education')[0].detail, "Bachelor's degree, Computer Science");
assert.equal(by('organization')[0].current, true, 'an organization with no end is current');
assert.ok(by('certification')[0].link?.startsWith('https://www.linkedin.com/learning/certificates/'));
const dup = toItems({ honorsAndAwards: [{ title: 'Winner', issuedBy: 'X', issuedAt: 'Apr 2025' }, { title: 'winner', issuedBy: 'x', issuedAt: 'Apr 2025' }, { title: 'Winner', issuedBy: 'X', issuedAt: 'Apr 2024' }, { title: '' }], publications: [{ title: 'P', link: 'javascript:alert(1)' }] });
assert.equal(dup.filter((i) => i.kind === 'honor').length, 2, 'a repeated honor once; the same title another year is its own'); assert.equal(dup.find((i) => i.kind === 'publication')!.link, null, 'only http(s) links');
assert.deepEqual(toItems({}), [], 'no sections → nothing');
assert.deepEqual([isUsc('University of Southern California'), isUsc('USC Marshall School of Business'), isUsc('Stanford University'), isUsc('Some School', '3084')], [true, true, false, true]);
assert.deepEqual([parseWhen('Apr 2026'), parseWhen('May 4, 2025'), parseWhen('2024'), parseWhen(null)], [{ year: 2026, month: 4 }, { year: 2025, month: 5 }, { year: 2024, month: null }, { year: null, month: null }]);
console.log('PASS: honors, publications, certifications, organizations, schools (USC marked) — repeats dropped, only http(s) links, dates parsed');

const skills = toSkills(fx);
assert.deepEqual(skills.slice(0, 3), ['Python (Programming Language)', 'Java', 'C++'], 'top skills first'); assert.equal(new Set(skills.map((x) => x.toLowerCase())).size, skills.length, 'no repeats');
assert.equal(toSkills({ skills: Array.from({ length: 80 }, (_, i) => ({ name: `S${i}` })) }).length, 50, 'at most 50');
console.log(`PASS: skills — ${skills.length} for Bryan, top ones first, no repeats, at most 50`);

const snap = snapshotOf({ ...fx, emails: ['guess@x.com'], moreProfiles: [{ firstName: 'Someone', lastName: 'Else' }], receivedRecommendations: [{ text: 'great' }], connectionsCount: 500, profileActions: ['x'] });
for (const k of ['emails', 'moreProfiles', 'receivedRecommendations', 'connectionsCount', 'profileActions']) assert.ok(!(k in snap), `the copy leaves out ${k}`);
for (const k of ['headline', 'about', 'experience', 'honorsAndAwards', 'publications', 'education', 'skills']) assert.ok(k in snap, `the copy keeps ${k}`);
assert.ok(!JSON.stringify(snap).includes('Someone'), 'nobody else is in the copy');
console.log('PASS: the stored copy — their own sections only: no guessed emails, no "people also viewed", no recommendations');

const A = 'https://media.licdn.com/dms/image/v2/AAA111/profile-displayphoto-shrink_800_800/0/1?e=1&t=x', A2 = 'https://media.licdn.com/dms/image/v2/AAA111/profile-displayphoto-shrink_800_800/0/1?e=2&t=y', B = 'https://media.licdn.com/dms/image/v2/BBB222/p/0/1?e=1';
assert.equal(photoKey(A), 'AAA111'); assert.equal(photoKey(A), photoKey(A2), 'the same photo with a new signature is the same photo'); assert.equal(photoKey('https://x.com/a.png?v=1'), 'https://x.com/a.png'); assert.equal(photoKey(null), null); assert.equal(photoKey('javascript:x'), null);
const none = { avatar_path: null, avatar_source: null, avatar_linkedin_key: null };
assert.equal(photoDecision(none, { photo: A }), 'take', 'no photo → take LinkedIn\'s');
assert.equal(photoDecision({ avatar_path: 'u/avatar.webp', avatar_source: 'upload', avatar_linkedin_key: null }, { photo: A }), 'keep', 'an uploaded photo is never replaced');
assert.equal(photoDecision({ avatar_path: 'u/avatar.webp', avatar_source: null, avatar_linkedin_key: null }, { photo: A }), 'keep', 'a photo from before this feature counts as uploaded');
assert.equal(photoDecision({ avatar_path: 'u/linkedin.jpg', avatar_source: 'linkedin', avatar_linkedin_key: 'AAA111' }, { photo: A2 }), 'keep', 'the same LinkedIn photo isn\'t downloaded again');
assert.equal(photoDecision({ avatar_path: 'u/linkedin.jpg', avatar_source: 'linkedin', avatar_linkedin_key: 'AAA111' }, { photo: B }), 'take', 'they changed their LinkedIn photo → follow it');
assert.equal(photoDecision(none, { photo: A, openToWork: true }), 'keep', 'not the #OpenToWork-framed photo (ColorStack\'s rule)');
assert.equal(photoDecision(none, {}), 'keep', 'no LinkedIn photo → nothing');
console.log('PASS: photos — LinkedIn\'s only when they have none or still have the synced one; uploads never replaced; #OpenToWork skipped');
