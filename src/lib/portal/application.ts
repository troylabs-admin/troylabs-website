/**
 * What a new member must tell us before leadership can recognise them (Bryan, 2026-09-30): everyone gets
 * the site link, signs up with any email, creates their own profile, and an admin approves them by hand.
 * These answers are the minimum an admin needs to say "yes, they were in TroyLabs", plus the city that puts them on the
 * globe (2026-10-05). The server checks the same list in submit_application() before anyone reaches the admins.
 */
export interface ApplicationFields { full_name: string | null; grad_year: number | null; join_year: number | null; divisions: string[] | null; city_id: number | null }
export function applicationMissing(r: ApplicationFields): string[] {
  const missing: string[] = [];
  if (!r.full_name?.trim()) missing.push('your name');
  if (!r.grad_year) missing.push('your graduation year');
  if (!r.join_year) missing.push('the semester you joined TroyLabs');
  if (!r.divisions?.length) missing.push('your division');
  if (!r.city_id) missing.push('your city');
  return missing;
}
export const listInWords = (items: string[]) => items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
