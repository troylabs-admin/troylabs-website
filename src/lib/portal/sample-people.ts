/**
 * DESIGN PREVIEW roster — one generated set of people that feeds search, filters and the globe alike, so
 * a chip or a query narrows both at once. Deterministic, none real. Skewed the way the real roster will
 * be (300 in San Francisco; Bay Area / SoCal / East Coast neighbours close enough to merge on the globe).
 * Replaced by the database when Supabase lands; the shape below is the one the data model will keep.
 */
export const STATUS = ['STUDENT', 'ALUM'] as const;
export const COHORTS = ['FA26', 'SP26', 'FA25', 'SP25', 'FA24', 'SP24', 'FA23', 'SP23'];
export const DIVISIONS = ['PRODUCT', 'DESIGN', 'TECH', 'VC/FINANCE', 'MARKETING'];
export const INDUSTRIES = ['AI', 'FINTECH', 'HEALTHTECH', 'CLIMATE', 'CONSUMER', 'ENTERPRISE', 'EDTECH', 'ROBOTICS', 'DESIGN', 'MEDIA'];

export interface Person {
  id: string; full_name: string; initials: string;
  status: 'STUDENT' | 'ALUM'; cohort: string; classOf: string; division: string;
  current_title: string; current_company: string; industries: string[]; bio: string;
  city: string; region: string; lat: number; lng: number; programs: string[];
  avatar?: string | null;
}

const CITIES: [string, string, number, number, number][] = [
  ['San Francisco', 'CA', 37.7749, -122.4194, 300], ['Palo Alto', 'CA', 37.4419, -122.143, 12], ['San Jose', 'CA', 37.3382, -121.8863, 8], ['Oakland', 'CA', 37.8044, -122.2712, 6],
  ['Los Angeles', 'CA', 34.0522, -118.2437, 40], ['Irvine', 'CA', 33.6846, -117.8265, 7], ['San Diego', 'CA', 32.7157, -117.1611, 9],
  ['New York', 'NY', 40.7128, -74.006, 25], ['Boston', 'MA', 42.3601, -71.0589, 6], ['Philadelphia', 'PA', 39.9526, -75.1652, 3], ['Washington', 'DC', 38.9072, -77.0369, 5],
  ['Chicago', 'IL', 41.8781, -87.6298, 8], ['Seattle', 'WA', 47.6062, -122.3321, 10], ['Austin', 'TX', 30.2672, -97.7431, 5], ['Miami', 'FL', 25.7617, -80.1918, 4], ['Toronto', 'ON', 43.6532, -79.3832, 3],
  ['London', 'UK', 51.5074, -0.1278, 6], ['Singapore', '', 1.3521, 103.8198, 3], ['Tokyo', 'JP', 35.6762, 139.6503, 2], ['Mexico City', 'MX', 19.4326, -99.1332, 1],
];
const ROLES: [string, string, string, string[], string][] = [   // title, company, division, industries, bio
  ['Software Engineer', 'Stripe', 'TECH', ['FINTECH', 'AI'], 'payments infrastructure'],
  ['Product Designer', 'Figma', 'DESIGN', ['DESIGN', 'ENTERPRISE'], 'design systems'],
  ['Senior PM', 'Oscar Health', 'PRODUCT', ['HEALTHTECH'], 'insurance products'],
  ['Associate', 'a16z', 'VC/FINANCE', ['FINTECH', 'ENTERPRISE'], 'early-stage investing'],
  ['Founding Engineer', 'ClimateAI', 'TECH', ['CLIMATE', 'AI'], 'climate models'],
  ['Head of Growth', 'Notion', 'MARKETING', ['ENTERPRISE', 'CONSUMER'], 'growth and lifecycle'],
  ['Video Producer', 'YouTube', 'DESIGN', ['MEDIA', 'CONSUMER'], 'video and creator tools'],
  ['Robotics Engineer', 'Boston Dynamics', 'TECH', ['ROBOTICS', 'AI'], 'perception'],
  ['PM Intern', 'Khan Academy', 'PRODUCT', ['EDTECH'], 'learning products'],
  ['SWE Intern', 'Cloudflare', 'TECH', ['ENTERPRISE', 'AI'], 'security'],
  ['Analyst Intern', 'Fund', 'VC/FINANCE', ['FINTECH'], 'fintech investing'],
  ['Founder', 'Startup', 'MARKETING', ['CONSUMER', 'MEDIA'], 'short-form video app'],
  ['Data Scientist', 'Company', 'TECH', ['AI', 'HEALTHTECH'], 'clinical data'],
];

let n = 0;
export const PEOPLE: Person[] = CITIES.flatMap(([city, region, lat, lng, count]) => Array.from({ length: count }, () => {
  n += 1;
  const student = n % 4 === 0;   // one in four is a current student
  const cohort = student ? COHORTS[n % 2] : COHORTS[2 + (n % 6)];
  const [current_title, current_company, division, industries, bio] = ROLES[n % ROLES.length];
  return {
    id: 'sample', full_name: `Sample ${student ? 'Student' : 'Alum'} ${n}`, initials: student ? 'SS' : 'SA',
    status: student ? 'STUDENT' : 'ALUM', cohort, classOf: student ? '2027' : String(2025 - (n % 3)), division,
    current_title: student && !/Intern/.test(current_title) ? `${current_title} Intern` : current_title, current_company, industries, bio,
    city, region, lat, lng, programs: n % 3 === 0 ? ['IGNITE'] : n % 7 === 0 ? ['TL INTERNAL', 'IGNITE'] : ['TL INTERNAL'],
  } as Person;
}));
