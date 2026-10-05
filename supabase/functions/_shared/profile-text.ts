/** The text an AI-search embedding is made from (semantic function). Work facts only: never names, emails or phone numbers. */
export interface ProfileFacts { id: string; status: string; grad_year: number | null; join_term: string | null; join_year: number | null; divisions: string[] | null; current_title: string | null; current_company: string | null; industries: string[] | null; startups: string[] | null; bio: string | null; embedding_hash: string | null; city: { name: string; region: string } | null }

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
