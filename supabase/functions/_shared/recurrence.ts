/** Calendar recurrence anchored to local DTSTART, following RFC 5545 (including erratum 4271).
 * Missing month dates are skipped; repeated clocks use the first instant, skipped clocks use the
 * pre-transition offset. No elapsed-hour arithmetic, so 10 AM stays 10 AM across DST.
 */
export interface Recurrence {
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
  interval: number;
  timezone: string;
  start_local: string;
  weekdays?: number[]; // Sunday=0; Monday begins the interval week
  end: { type: 'never' } | { type: 'count'; count: number } | { type: 'until'; until: string };
}
const DAY = 86400000;
const localPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
function wall(value: string): number {
  const n = Date.parse(value + (value.length === 10 ? 'T00:00:00Z' : ':00Z'));
  if (!Number.isFinite(n) || new Date(n).toISOString().slice(0, value.length) !== value) throw new Error('Choose a valid calendar date and time.');
  return n;
}
const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(zone: string) {
  let f = formatters.get(zone);
  if (!f) { f = new Intl.DateTimeFormat('en-GB', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }); formatters.set(zone, f); }
  return f;
}
function localStamp(instant: number, zone: string): number {
  const p = Object.fromEntries(formatter(zone).formatToParts(new Date(instant)).map(x => [x.type, x.value]));
  return Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second));
}
/** Convert an explicit local calendar time to UTC, using RFC 5545's fold/gap convention. */
export function localToInstant(local: string, timezone: string): string {
  const desired = wall(local); formatter(timezone);
  const offsets = new Set([-2 * DAY, -DAY / 2, 0, DAY / 2, 2 * DAY].map(d => localStamp(desired + d, timezone) - (desired + d)));
  const candidates = [...offsets].map(offset => desired - offset);
  const exact = candidates.filter(n => localStamp(n, timezone) === desired).sort((a, b) => a - b);
  const forward = candidates.filter(n => localStamp(n, timezone) > desired).sort((a, b) => localStamp(a, timezone) - localStamp(b, timezone));
  const chosen = exact[0] ?? forward[0];
  if (chosen === undefined) throw new Error('Could not resolve this time in the selected time zone.');
  return new Date(chosen).toISOString();
}
export function cleanRecurrence(value: unknown): Recurrence | null {
  if (value == null) return null;
  if (typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid repeat schedule.');
  const r = value as Recurrence;
  if (!['daily', 'weekly', 'monthly', 'yearly'].includes(r.frequency)) throw new Error('Choose daily, weekly, monthly or yearly.');
  if (!Number.isInteger(r.interval) || r.interval < 1 || r.interval > 999) throw new Error('Repeat interval must be between 1 and 999.');
  if (typeof r.timezone !== 'string' || !r.timezone) throw new Error('Choose a time zone.');
  try { formatter(r.timezone); } catch { throw new Error('Choose a valid IANA time zone.'); }
  if (typeof r.start_local !== 'string' || !localPattern.test(r.start_local)) throw new Error('Choose the first local date and time.');
  wall(r.start_local);
  if (!r.end || !['never', 'count', 'until'].includes(r.end.type)) throw new Error('Choose when repetition ends.');
  let end: Recurrence['end'] = { type: 'never' };
  if (r.end.type === 'count') {
    if (!Number.isInteger(r.end.count) || r.end.count < 1 || r.end.count > 10000) throw new Error('Choose between 1 and 10,000 occurrences.');
    end = { type: 'count', count: r.end.count };
  } else if (r.end.type === 'until') {
    if (typeof r.end.until !== 'string' || !datePattern.test(r.end.until)) throw new Error('Choose a valid end date.');
    wall(r.end.until);
    if (r.end.until < r.start_local.slice(0, 10)) throw new Error('The end date must be on or after the first occurrence.');
    end = { type: 'until', until: r.end.until };
  }
  let weekdays: number[] | undefined;
  if (r.frequency === 'weekly' && r.weekdays !== undefined) {
    if (!Array.isArray(r.weekdays) || !r.weekdays.length || r.weekdays.some(d => !Number.isInteger(d) || d < 0 || d > 6)) throw new Error('Choose at least one valid weekday.');
    weekdays = [...new Set(r.weekdays)].sort((a, b) => a - b);
  }
  return { frequency: r.frequency, interval: r.interval, timezone: r.timezone, start_local: r.start_local, ...(weekdays ? { weekdays } : {}), end };
}
/** DTSTART is the first occurrence. Month/year intervals remain anchored even when a date is skipped. */
function* localOccurrences(r: Recurrence): Generator<string> {
  const start = wall(r.start_local), d = new Date(start), day = d.getUTCDate(), month = d.getUTCMonth(), year = d.getUTCFullYear();
  yield r.start_local;
  if (r.frequency === 'daily') {
    for (let n = 1; ; n++) yield new Date(start + n * r.interval * DAY).toISOString().slice(0, 16);
  } else if (r.frequency === 'weekly') {
    const monday = start - ((d.getUTCDay() + 6) % 7) * DAY, days = r.weekdays ?? [d.getUTCDay()];
    for (let week = 0; ; week += r.interval) for (let weekday = 0; weekday < 7; weekday++) {
      const at = monday + (week * 7 + weekday) * DAY;
      if (at > start && days.includes((weekday + 1) % 7)) yield new Date(at).toISOString().slice(0, 16);
    }
  } else {
    for (let n = 1; ; n++) {
      const targetMonth = r.frequency === 'monthly' ? month + n * r.interval : month;
      const targetYear = r.frequency === 'yearly' ? year + n * r.interval : year + Math.floor(targetMonth / 12);
      if (targetYear > 9999) return;
      const at = new Date(Date.UTC(targetYear, targetMonth % 12, day, d.getUTCHours(), d.getUTCMinutes()));
      if (at.getUTCDate() === day) yield at.toISOString().slice(0, 16);
    }
  }
}
export function recurrenceStart(rule: Recurrence): string { return localToInstant(rule.start_local, rule.timezone); }
export function describeRecurrence(value: unknown): string {
  const r = cleanRecurrence(value); if (!r) return 'Does not repeat';
  const unit = { daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' }[r.frequency];
  const days = r.frequency === 'weekly' && r.weekdays?.length ? ` on ${r.weekdays.map(d => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]).join(', ')}` : '';
  const ending = r.end.type === 'count' ? ` · ${r.end.count} occurrence${r.end.count === 1 ? '' : 's'}` : r.end.type === 'until' ? ` · through ${r.end.until}` : '';
  return `Every ${r.interval === 1 ? unit : `${r.interval} ${unit}s`}${days} at ${r.start_local.slice(11)} (${r.timezone})${ending}`;
}
export interface RecurrencePlan { occurrence_at: string; next_at: string | null; next_index: number; skipped: number }
/** At most the latest due slot is materialized. Count includes calendar slots skipped during downtime. */
export function planRecurrence(value: unknown, scheduledFor: string, now: string, cursor = 0): RecurrencePlan {
  const r = cleanRecurrence(value); if (!r) throw new Error('A recurrence rule is required.');
  const due = Date.parse(scheduledFor), clock = Date.parse(now);
  if (!Number.isFinite(due) || !Number.isFinite(clock) || due > clock || !Number.isInteger(cursor) || cursor < 0) throw new Error('Invalid recurrence cursor.');
  let index = 0, latest: string | null = null, next: string | null = null, skipped = -1, matched = false;
  for (const local of localOccurrences(r)) {
    if (index >= 100000) throw new Error('Repeat schedule exceeds the supported calendar range.');
    if (r.end.type === 'count' && index >= r.end.count) break;
    if (r.end.type === 'until' && local.slice(0, 10) > r.end.until) break;
    const instant = localToInstant(local, r.timezone), time = Date.parse(instant);
    if (index < cursor) { index++; continue; }
    if (!matched) { if (time !== due) throw new Error('The next send does not match the repeat schedule.'); matched = true; }
    if (time > clock) { next = instant; break; }
    latest = instant; skipped++; index++;
  }
  if (!latest) throw new Error('This repeat schedule has no due occurrence.');
  return { occurrence_at: latest, next_at: next, next_index: index, skipped };
}
