/**
 * The choices members pick from, in one place so the profile, the search page, Admin › Members and
 * Admin › Message can never disagree (they had four different division lists before 2026-10-02).
 *
 * Divisions (Bryan, 2026-10-02): BUILD, DEMO, PRODUCT MANAGEMENT, VC/FINANCE, TECH, MARKETING, DESIGN.
 * IGNITE is left out for now. Profiles store the full name; the search page and the Members table
 * show PRODUCT MANAGEMENT as PRODUCT to fit (`shortDivision`).
 */
export const DIVISIONS = ['BUILD', 'DEMO', 'PRODUCT MANAGEMENT', 'VC/FINANCE', 'TECH', 'MARKETING', 'DESIGN'] as const;
export const shortDivision = (d: string) => d.replace('PRODUCT MANAGEMENT', 'PRODUCT');
export const DIVISIONS_SHORT = DIVISIONS.map(shortDivision);

/** e-board roles, as leadership records them (Admin › Members) and applicants list them (profile, while waiting) */
export const EBOARD_ROLES = ['CO-PRESIDENT', 'DIRECTOR OF BUILD', 'DIRECTOR OF DEMO', 'DIRECTOR OF IGNITE', 'DIRECTOR OF PMS', 'DIRECTOR OF VC/FINANCE', 'DIRECTOR OF TECH', 'DIRECTOR OF MARKETING', 'DIRECTOR OF DESIGN', 'DIRECTOR OF COMMUNITY', 'DIRECTOR OF RECRUITMENT'];

export const INDUSTRIES = ['AI', 'FINTECH', 'HEALTHTECH', 'CLIMATE TECH', 'CONSUMER', 'ENTERPRISE', 'EDTECH', 'CYBERSECURITY', 'ROBOTICS', 'DESIGN', 'SAAS', 'VC/FINANCE', 'DEVELOPER TOOLS', 'NONPROFIT', 'TRAVEL', 'PRODUCTIVITY', 'INSURANCE', 'HARDWARE', 'MARKETING'];

/** the semester right now: spring runs January to June, fall July to December (the graduation job uses the same split) */
export function currentTerm(d = new Date()): { term: 'FA' | 'SP'; year: number } {
  const la = new Date(d.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
  return { term: la.getMonth() >= 6 ? 'FA' : 'SP', year: la.getFullYear() };
}
