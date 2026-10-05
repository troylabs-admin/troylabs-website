/** The text an AI-search embedding is made from (semantic function). Work facts only: never names, emails or phone numbers. */
export interface ProfileFacts { id: string; status: string; grad_year: number | null; join_term: string | null; join_year: number | null; divisions: string[] | null; current_title: string | null; current_company: string | null; industries: string[] | null; startups: string[] | null; bio: string | null; embedding_hash: string | null; city: { name: string; region: string } | null;
  // from a LinkedIn sync (2026-10-05): what they did and won, so "someone who interned at Jane Street" finds them
  linkedin_headline?: string | null; linkedin_skills?: string[] | null;
  work?: { title: string; company: string; start_year: number | null; end_year: number | null; sort?: number }[] | null;
  items?: { kind: string; title: string; issuer: string | null; detail: string | null; is_usc: boolean; sort?: number }[] | null }

/** the profile as one paragraph of work facts — the only thing OpenAI ever sees about a person */
export function profileText(r: ProfileFacts): string {
  const cohort = r.join_term && r.join_year ? `${r.join_term === 'FA' ? 'Fall' : 'Spring'} ${r.join_year}` : '';
  const parts = [
    `${r.status === 'student' ? 'Current USC student' : 'USC alum'}${r.grad_year ? `, ${r.status === 'student' ? 'graduating' : 'class of'} ${r.grad_year}` : ''}.`,
    cohort && `Joined TroyLabs in ${cohort}.`,
    r.divisions?.length && `TroyLabs divisions: ${r.divisions.join(', ')}.`,
    (r.current_title || r.current_company) && `Works as ${[r.current_title, r.current_company && `at ${r.current_company}`].filter(Boolean).join(' ')}.`,
    r.city?.name && `Based in ${r.city.name}${r.city.region ? `, ${r.city.region}` : ''}.`,
    r.industries?.length && `Industries: ${r.industries.join(', ')}.`,
    r.startups?.length && `Startups: ${r.startups.join(', ')}.`,
    r.bio?.trim() && r.bio.trim(),
  ];
  return parts.filter(Boolean).join(' ').slice(0, 4000);
}

/** what AI search embeds for a person, as separate pieces (2026-10-05): the core facts, then each job, the honors, the
 *  publications, certifications and organizations, skills, and other schools. One vector per piece and a person's
 *  score is their best piece — one long paragraph averaged everything together, so a single job at Jane Street was
 *  drowned out by fourteen others (measured: a member without LinkedIn data outranked the one who interned there). */
export function profileChunks(r: ProfileFacts): string[] {
  const out = [profileText(r) + (r.linkedin_headline?.trim() ? ` Headline: ${r.linkedin_headline.trim()}.` : '')];
  const span = (w: { start_year: number | null; end_year: number | null }) => (w.start_year ? ` (${w.start_year}–${w.end_year ?? 'present'})` : '');
  for (const w of (r.work ?? []).slice(0, 25)) out.push(`Experience: ${w.title} at ${w.company}${span(w)}.`);
  const list = (kind: string, label: string) => { const xs = (r.items ?? []).filter((i) => i.kind === kind); if (xs.length) out.push(`${label}: ${xs.slice(0, 15).map((i) => [i.title, i.issuer && `(${i.issuer})`].filter(Boolean).join(' ')).join('; ')}.`); };
  list('honor', 'Honors and awards'); list('publication', 'Publications'); list('certification', 'Certifications'); list('organization', 'Organizations');
  if (r.linkedin_skills?.length) out.push(`Skills: ${r.linkedin_skills.slice(0, 30).join(', ')}.`);
  const schools = (r.items ?? []).filter((i) => i.kind === 'education' && !i.is_usc && !/\b(high school|secondary school|preparatory|prep school|middle school)\b/i.test(`${i.title} ${i.detail ?? ''}`));   // grad school, not high school
  if (schools.length) out.push(`Other schools: ${schools.map((i) => [i.title, i.detail].filter(Boolean).join(', ')).join('; ')}.`);
  return out.map((t) => t.slice(0, 2000));
}
