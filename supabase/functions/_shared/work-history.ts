/**
 * Turning a LinkedIn scrape into the rows we store (2026-10-05). Pure, shared by the `linkedin-sync` function and the
 * unit test. The clean-up rules are ColorStack's (oyster, packages/core/src/modules/linkedin.ts, LinkedInExperience):
 * the scraper sometimes swaps location and workplace type, puts "Remote" in the location, says "Earth", and leaves
 * internships untyped. What's ours: repeats inside one scrape are merged (the scraper returns Bryan's NVIDIA internship
 * twice; ColorStack stored both), and jobs without a company page are kept (ColorStack drops them).
 */

export interface ScrapedDate { month?: string | null; year?: number | null; text?: string | null }
export interface ScrapedExperience {
  position?: string | null; companyName?: string | null; companyId?: string | null; companyLinkedinUrl?: string | null; companyLogo?: { url?: string } | string | null;
  employmentType?: string | null; workplaceType?: string | null; location?: string | null; description?: string | null;
  startDate?: ScrapedDate | null; endDate?: ScrapedDate | null;
}
export interface ScrapedProfile { experience?: ScrapedExperience[] | null; error?: string | null; originalQuery?: { url?: string } | null; linkedinUrl?: string | null }
export interface WorkRow {
  title: string; company: string; company_linkedin_id: string | null; company_linkedin_url: string | null; company_logo: string | null;
  employment_type: string | null; workplace_type: string | null; location: string | null; description: string | null;
  start_year: number | null; start_month: number | null; end_year: number | null; end_month: number | null;
}

/** a LinkedIn profile link in one form, or null: https://www.linkedin.com/in/<handle> */
export function canonicalLinkedIn(raw: string): string | null {
  const m = raw.trim().match(/^(?:https?:\/\/)?(?:[a-z]{2,3}\.)?linkedin\.com\/in\/([^/?#\s]+)/i);
  if (!m) return null;
  let handle = m[1]; try { handle = decodeURIComponent(handle); } catch { /* keep as typed */ }
  return `https://www.linkedin.com/in/${handle.toLowerCase()}`;
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const WORKPLACE = new Set(['On-site', 'Hybrid', 'Remote']);
const clean = (s: unknown) => { const t = typeof s === 'string' ? s.trim() : ''; return t || null; };   // the scraper sends objects in some fields
const month = (d?: ScrapedDate | null) => (d?.month ? MONTHS[d.month.slice(0, 3).toLowerCase()] ?? null : null);

/** one scraped job → our row, with ColorStack's fixes; null if it has no title, company or start year */
export function toRow(e: ScrapedExperience): WorkRow | null {
  const title = clean(e.position), company = clean(e.companyName);
  if (!title || !company || !e.startDate?.year) return null;
  let location = clean(e.location)?.replace('Metropolitan Area', '').replace('Metropolitan Region', '').replace('Area', '').replace('Greater', '').replace('San Francisco Bay', 'San Francisco').trim() || null;
  let workplace = clean(e.workplaceType);
  if (location === 'Earth') location = null;
  const locationIsWorkplace = location !== null && WORKPLACE.has(location);
  const workplaceIsLocation = workplace !== null && !WORKPLACE.has(workplace);
  if (locationIsWorkplace && workplaceIsLocation) [location, workplace] = [workplace, location];
  else if (locationIsWorkplace) { workplace = location; location = null; }
  else if (workplaceIsLocation) { location = workplace; workplace = null; }
  let type = clean(e.employmentType); if (!type && /\bintern(ship)?\b/i.test(title)) type = 'Internship';
  const endYear = e.endDate?.year ?? null;
  return {
    title, company, company_linkedin_id: clean(e.companyId), company_linkedin_url: clean(e.companyLinkedinUrl), company_logo: null,   // LinkedIn's logo links expire within weeks (signed media.licdn.com URLs): not stored until we copy logos into our own storage
    employment_type: type, workplace_type: workplace, location, description: clean(e.description),
    start_year: e.startDate.year, start_month: month(e.startDate), end_year: endYear, end_month: endYear ? month(e.endDate) : null,
  };
}

/** the same job listed twice in one scrape: same company, title and start month */
const sameJob = (r: WorkRow) => [r.company_linkedin_id ?? r.company.toLowerCase(), r.title.toLowerCase(), r.start_year, r.start_month ?? ''].join('|');
const fuller = <T>(a: T | null, b: T | null) => (a ?? b);

/** a whole scrape → rows in LinkedIn's order, repeats merged into one keeping every detail either copy had */
export function toWorkHistory(experience: ScrapedExperience[]): WorkRow[] {
  const out: WorkRow[] = []; const at = new Map<string, number>();
  for (const e of experience) {
    const r = toRow(e); if (!r) continue;
    const k = sameJob(r), i = at.get(k);
    if (i === undefined) { at.set(k, out.length); out.push(r); continue; }
    const a = out[i];
    out[i] = {
      ...a,
      company_linkedin_id: fuller(a.company_linkedin_id, r.company_linkedin_id), company_linkedin_url: fuller(a.company_linkedin_url, r.company_linkedin_url), company_logo: fuller(a.company_logo, r.company_logo),
      employment_type: fuller(a.employment_type, r.employment_type), workplace_type: fuller(a.workplace_type, r.workplace_type),
      location: (r.location?.length ?? 0) > (a.location?.length ?? 0) ? r.location : a.location,
      description: (r.description?.length ?? 0) > (a.description?.length ?? 0) ? r.description : a.description,
    };
  }
  return out;
}

// ── everything else on the profile (2026-10-05) ─────────────────────────────────────────────────

export type ItemKind = 'honor' | 'publication' | 'certification' | 'organization' | 'education';
export interface ItemRow { kind: ItemKind; title: string; issuer: string | null; detail: string | null; year: number | null; month: number | null; end_year: number | null; end_month: number | null; current: boolean; link: string | null; description: string | null; is_usc: boolean }
export interface ScrapedFull extends ScrapedProfile {
  headline?: string | null; about?: string | null; photo?: string | null; openToWork?: boolean | null;
  skills?: { name?: string | null }[] | null; topSkills?: string[] | null;
  honorsAndAwards?: { title?: string; issuedBy?: string; issuedAt?: string; description?: string; link?: string }[] | null;
  publications?: { title?: string; publishedAt?: string; publishedBy?: string; publisher?: string; description?: string; link?: string }[] | null;
  certifications?: { title?: string; issuedBy?: string; issuedAt?: string; link?: string; credentialId?: string }[] | null;
  organizations?: { name?: string; positionHeld?: string; description?: string; startDate?: ScrapedDate | null; endDate?: ScrapedDate | null }[] | null;
  education?: { schoolName?: string; schoolId?: string; degree?: string; fieldOfStudy?: string; description?: string; startDate?: ScrapedDate | null; endDate?: ScrapedDate | null }[] | null;
  [key: string]: unknown;
}

/** "Apr 2026", "May 4, 2025", "2024" → year and month */
export function parseWhen(s: unknown): { year: number | null; month: number | null } {
  const t = typeof s === 'string' ? s : ''; const y = t.match(/\b(19|20)\d{2}\b/); const m = t.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/i);
  return { year: y ? Number(y[0]) : null, month: m ? MONTHS[m[1].toLowerCase()] : null };
}
const httpLink = (s: unknown) => { const t = clean(s); return t && /^https?:\/\//i.test(t) ? t : null; };
/** USC by LinkedIn's school id (3084) or its name */
export const isUsc = (name: string | null, id?: string | null) => id === '3084' || /university of southern california|^usc\b/i.test(name ?? '');

/** honors, publications, certifications, organizations and schools → one list of rows, each kind in LinkedIn's order, repeats dropped */
export function toItems(p: ScrapedFull): ItemRow[] {
  const out: ItemRow[] = []; const seen = new Set<string>();
  const push = (r: ItemRow) => { const k = [r.kind, r.title.toLowerCase(), r.issuer?.toLowerCase() ?? '', r.year ?? ''].join('|'); if (seen.has(k)) return; seen.add(k); out.push(r); };
  const base = { detail: null, end_year: null, end_month: null, current: false, link: null, description: null, is_usc: false };
  for (const h of p.honorsAndAwards ?? []) { const title = clean(h?.title); if (!title) continue; push({ ...base, kind: 'honor', title, issuer: clean(h.issuedBy), ...parseWhen(h.issuedAt), link: httpLink(h.link), description: clean(h.description) }); }
  for (const x of p.publications ?? []) { const title = clean(x?.title); if (!title) continue; push({ ...base, kind: 'publication', title, issuer: clean(x.publishedBy ?? x.publisher), ...parseWhen(x.publishedAt), link: httpLink(x.link), description: clean(x.description) }); }
  for (const c of p.certifications ?? []) { const title = clean(c?.title); if (!title) continue; push({ ...base, kind: 'certification', title, issuer: clean(c.issuedBy), detail: clean(c.credentialId), ...parseWhen(c.issuedAt), link: httpLink(c.link) }); }
  for (const o of p.organizations ?? []) { const title = clean(o?.name); if (!title) continue; const end = o.endDate?.year ?? null; push({ ...base, kind: 'organization', title, issuer: null, detail: clean(o.positionHeld), year: o.startDate?.year ?? null, month: month(o.startDate), end_year: end, end_month: end ? month(o.endDate) : null, current: !end && Boolean(o.startDate?.year), description: clean(o.description) }); }
  for (const e of p.education ?? []) { const title = clean(e?.schoolName); if (!title) continue; const end = e.endDate?.year ?? null; push({ ...base, kind: 'education', title, issuer: null, detail: [clean(e.degree), clean(e.fieldOfStudy)].filter(Boolean).join(', ') || null, year: e.startDate?.year ?? null, month: month(e.startDate), end_year: end, end_month: end ? month(e.endDate) : null, description: clean(e.description), is_usc: isUsc(title, clean(e.schoolId)) }); }
  return out;
}

/** skills, top ones first, no repeats, at most 50 */
export function toSkills(p: ScrapedFull): string[] {
  const all = [...(p.topSkills ?? []), ...(p.skills ?? []).map((s) => s?.name)].map((s) => clean(s)).filter((s): s is string => Boolean(s));
  const seen = new Set<string>(); return all.filter((s) => { const k = s.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 50);
}

/** the copy we keep of a scrape: the member's OWN public sections only. Left out on purpose: the scraper's guessed
 *  email addresses, "people also viewed" (other people), recommendations (other people's words), counts and UI fields. */
const KEEP = ['id', 'publicIdentifier', 'linkedinUrl', 'firstName', 'lastName', 'headline', 'about', 'location', 'openToWork', 'photo', 'experience', 'education', 'certifications', 'projects', 'volunteering', 'honorsAndAwards', 'publications', 'courses', 'patents', 'languages', 'organizations', 'skills', 'topSkills'];
export function snapshotOf(p: ScrapedFull): Record<string, unknown> { const o: Record<string, unknown> = {}; for (const k of KEEP) if (p[k] !== undefined && p[k] !== null) o[k] = p[k]; return o; }

/** a LinkedIn photo's identity: the image id in its path (the signed query string changes on every scrape; the id only when they change the photo) */
export const photoKey = (url: string | null | undefined) => { const u = (url ?? '').trim(); if (!/^https?:\/\//i.test(u)) return null; const m = u.match(/\/dms\/image\/v2\/([^/?]+)\//); return m ? m[1] : u.split(/[?#]/)[0]; };   // other hosts: the address without its query

/** take their LinkedIn photo? Only when they have no photo, or still have the one an earlier sync brought in — never over a
 *  photo they uploaded (ColorStack replaces it every sync) — and, like ColorStack, not the #OpenToWork-framed one. */
export function photoDecision(profile: { avatar_path: string | null; avatar_source: string | null; avatar_linkedin_key: string | null }, scrape: ScrapedFull): 'take' | 'keep' {
  const key = photoKey(scrape.photo); if (!key || scrape.openToWork) return 'keep';
  if (!profile.avatar_path) return 'take';
  if (profile.avatar_source === 'linkedin' && profile.avatar_linkedin_key !== key) return 'take';
  return 'keep';
}

/** LinkedIn's current job: the first role with no end (LinkedIn lists the main one first) */
/** TroyLabs and the known student clubs aren't someone's job here (everyone was in TroyLabs) */
export const isClubName = (company: string) => /^\s*(troy\s?labs|lava\s?lab|quant\s?sc)\s*$/i.test(company);
export const currentRole = (rows: WorkRow[]) => rows.find((r) => r.end_year === null && !isClubName(r.company) && r.company_linkedin_id !== '18216697') ?? null;
/** the card's current job comes from LinkedIn (2026-10-05: the profile no longer has job boxes — "the work history will
 *  import it"): their current LinkedIn job (TroyLabs and clubs skipped), or nothing when LinkedIn shows none */
export function jobDecision(p: { current_title: string | null; current_company: string | null; current_job_source?: string | null }, role: WorkRow | null): 'take' | 'keep' | 'clear' {
  if (role) return 'take';
  return p.current_title || p.current_company ? 'clear' : 'keep';
}
