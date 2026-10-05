/** "Bryan Ramirez-Gonzalez" → "Bryan R." for the top bar (2026-10-05: full names ran out of room). First name and the
 *  initial of the family name, the "First L." form Slack and Facebook use. Suffixes (Jr., III, PhD…) are skipped
 *  so "Martin Luther King Jr." is "Martin K.", and a single name stays whole. */
const SUFFIX = /^(jr|sr|ii|iii|iv|v|phd|md|esq)\.?,?$/i;
export function shortName(full: string): string {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  while (parts.length > 1 && SUFFIX.test(parts.at(-1)!)) parts.pop();
  if (parts.length < 2) return parts[0] ?? '';
  return `${parts[0]} ${Array.from(parts.at(-1)!)[0]}.`;
}
