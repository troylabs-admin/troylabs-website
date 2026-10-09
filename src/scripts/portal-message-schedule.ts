/** Calendar controls keep wall-clock time stable across daylight saving changes. */
import { cleanRecurrence, localToInstant, type Recurrence } from '../../supabase/functions/_shared/recurrence';
const input = (id: string) => document.querySelector<HTMLInputElement | HTMLSelectElement>(id);
const value = (id: string) => input(id)?.value ?? '';
let timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Los_Angeles';
const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const scheduleTimezone = () => timezone;
export function localDateTime(iso: string, zone = timezone): string {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso)).map(p => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}
export function formatScheduleDate(iso: string, zone = timezone): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: zone, weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(new Date(iso));
}
export function describeRepeat(rule: Recurrence | null): string {
  if (!rule) return 'One-time message';
  const unit = { daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' }[rule.frequency];
  const start = new Date(rule.start_local + ':00Z');
  const weekday = rule.weekdays ?? [start.getUTCDay()];
  const repeat = rule.interval === 1 ? `Every ${unit}` : `Every ${rule.interval} ${unit}s`;
  const on = rule.frequency === 'weekly' ? ` on ${weekday.map(d => days[d]).join(', ')}` : rule.frequency === 'monthly' ? ` on day ${start.getUTCDate()}` : rule.frequency === 'yearly' ? ` on ${start.toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' })}` : '';
  const time = start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' });
  const ending = rule.end.type === 'count' ? ` · Ends after ${rule.end.count} ${rule.end.count === 1 ? 'send' : 'sends'}` : rule.end.type === 'until' ? ` · Ends ${rule.end.until}` : ' · No end date';
  const missingDates = rule.frequency === 'monthly' && start.getUTCDate() > 28 ? ` · Months without day ${start.getUTCDate()} are skipped` : rule.frequency === 'yearly' && start.getUTCMonth() === 1 && start.getUTCDate() === 29 ? ' · Years without February 29 are skipped' : '';
  return `${repeat}${on} at ${time} (${rule.timezone === 'America/Los_Angeles' ? 'Pacific time' : rule.timezone.replaceAll('_', ' ')})${ending}${missingDates}`;
}
export function readSchedule(): { recurrence: Recurrence | null; scheduled_for: string } {
  const start_local = value('#mc-when');
  if (!start_local) throw new Error('Choose the first send date and time.');
  const repeat = value('#mc-repeat') || 'once';
  const scheduled_for = localToInstant(start_local, timezone);
  if (repeat === 'once') return { recurrence: null, scheduled_for };
  const frequency = (repeat === 'custom' ? value('#mc-frequency') : repeat) as Recurrence['frequency'];
  const endType = value('#mc-repeat-end') || 'never';
  const end: Recurrence['end'] = endType === 'count' ? { type: 'count', count: Number(value('#mc-repeat-count')) } : endType === 'until' ? { type: 'until', until: value('#mc-repeat-until') } : { type: 'never' };
  const weekdays = [...document.querySelectorAll<HTMLInputElement>('[data-repeat-weekdays] input:checked')].map(el => Number(el.dataset.weekday));
  const recurrence = cleanRecurrence({ frequency, interval: repeat === 'custom' ? Number(value('#mc-interval')) : 1, timezone, start_local, ...(frequency === 'weekly' ? { weekdays } : {}), end });
  return { recurrence, scheduled_for };
}
export function fillSchedule(iso: string | null, rule: Recurrence | null = null) {
  timezone = rule?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Los_Angeles';
  const set = (id: string, v: string) => { const el = input(id); if (el) el.value = v; };
  set('#mc-when', iso ? localDateTime(iso) : '');
  set('#mc-repeat', rule ? rule.interval === 1 ? rule.frequency : 'custom' : 'once');
  set('#mc-frequency', rule?.frequency || 'weekly'); set('#mc-interval', String(rule?.interval || 1));
  set('#mc-repeat-end', rule?.end.type || 'never'); set('#mc-repeat-count', String(rule?.end.type === 'count' ? rule.end.count : 10)); set('#mc-repeat-until', rule?.end.type === 'until' ? rule.end.until : '');
  const start = iso ? new Date(localDateTime(iso) + ':00Z').getUTCDay() : null;
  document.querySelectorAll<HTMLInputElement>('[data-repeat-weekdays] input').forEach(el => { el.checked = rule?.weekdays?.includes(Number(el.dataset.weekday)) ?? (start !== null && start === Number(el.dataset.weekday)); });
  updateSchedule();
}
export function updateSchedule() {
  const repeat = value('#mc-repeat') || 'once', frequency = repeat === 'custom' ? value('#mc-frequency') : repeat;
  const hide = (selector: string, hidden: boolean) => { const el = document.querySelector<HTMLElement>(selector); if (el) el.hidden = hidden; };
  hide('[data-repeat-custom]', repeat !== 'custom'); hide('[data-repeat-options]', repeat === 'once'); hide('[data-repeat-weekdays]', frequency !== 'weekly');
  hide('[data-repeat-count-field]', value('#mc-repeat-end') !== 'count'); hide('[data-repeat-until-field]', value('#mc-repeat-end') !== 'until');
  const checked = [...document.querySelectorAll<HTMLInputElement>('[data-repeat-weekdays] input:checked')];
  if (frequency === 'weekly' && !checked.length && value('#mc-when')) {
    const day = new Date(value('#mc-when') + ':00Z').getUTCDay();
    const el = document.querySelector<HTMLInputElement>(`[data-weekday="${day}"]`); if (el) el.checked = true;
  }
  const label = document.querySelector<HTMLElement>('[data-timezone]'); if (label) label.textContent = `First send (${timezone === 'America/Los_Angeles' ? 'Pacific time' : timezone.replaceAll('_', ' ')})`;
  const out = document.querySelector<HTMLElement>('[data-schedule-description]'); if (!out) return;
  try { const plan = readSchedule(); out.textContent = `${describeRepeat(plan.recurrence)} · First send ${formatScheduleDate(plan.scheduled_for)}. Scheduled texts are checked every five minutes.`; }
  catch (error) { out.textContent = error instanceof Error ? error.message : 'Choose a schedule.'; }
}
export function wireSchedule() {
  fillSchedule(null);
  document.querySelector<HTMLElement>('[data-when-at]')?.addEventListener('input', updateSchedule);
  document.querySelector<HTMLElement>('[data-when-at]')?.addEventListener('change', updateSchedule);
}
