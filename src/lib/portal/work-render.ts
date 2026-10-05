/**
 * LinkedIn work history and the rest, drawn as design B (Bryan, 2026-10-05: the timeline — ColorStack's rows on a
 * LinkedIn-style rail, back-to-back roles at one company grouped). Shared by the member page and the profile.
 * Everything from LinkedIn is escaped: it's text people wrote.
 */
import { escapeHtml as esc, webUrl } from './safe-html';
import { supabase } from '../supabase';

export interface WorkRow { title: string; company: string; company_linkedin_id?: string | null; is_club?: boolean; company_logo: string | null; employment_type: string | null; workplace_type: string | null; location: string | null; start_year: number | null; start_month: number | null; end_year: number | null; end_month: number | null; description: string | null; sort: number }
export interface ItemRow { kind: 'honor' | 'publication' | 'certification' | 'organization' | 'education'; title: string; issuer: string | null; detail: string | null; year: number | null; month: number | null; end_year: number | null; end_month: number | null; is_current: boolean; link: string | null; description: string | null; is_usc: boolean; sort: number }
export interface History { work: WorkRow[]; items: ItemRow[]; syncedAt: string | null }

const LOGOS = 'https://ackmhqxyxnceoarbhcrp.supabase.co/storage/v1/object/public/company-logos/';
const MON = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** a person's LinkedIn history (row-level security: their own, or anyone approved for members) */
export async function getHistory(id: string): Promise<History> {
  const sb = supabase();
  const [w, i, p] = await Promise.all([
    sb.from('work_experiences').select('title, company, company_linkedin_id, company_logo, employment_type, workplace_type, location, start_year, start_month, end_year, end_month, description, sort').eq('profile_id', id).order('sort'),
    sb.from('linkedin_items').select('kind, title, issuer, detail, year, month, end_year, end_month, is_current, link, description, is_usc, sort').eq('profile_id', id).order('sort'),
    sb.from('profiles').select('linkedin_synced_at').eq('id', id).maybeSingle(),
  ]);
  // clubs aren't companies (no company page to link to), and TroyLabs itself is left out: everyone here was in it (Bryan, 2026-10-05)
  const ids = [...new Set(((w.data ?? []) as WorkRow[]).map((r) => r.company_linkedin_id).filter((x): x is string => Boolean(x)))];
  const { data: clubs } = ids.length ? await sb.from('companies').select('linkedin_id').in('linkedin_id', ids).eq('is_club', true) : { data: [] };
  const club = new Set((clubs ?? []).map((c) => c.linkedin_id as string));
  const work = ((w.data ?? []) as WorkRow[]).filter((r) => !isTroyLabs(r)).map((r) => ({ ...r, is_club: Boolean(r.company_linkedin_id && club.has(r.company_linkedin_id)) }));
  return { work, items: (i.data ?? []) as ItemRow[], syncedAt: (p.data?.linkedin_synced_at as string | null) ?? null };
}

const now = () => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() + 1 }; };
const when = (y: number | null, m: number | null) => (y ? `${m ? `${MON[m]} ` : ''}${y}` : '');
const toMonth = (y: number | null, m: number | null, fallback: number) => (y ?? 0) * 12 + (m ?? fallback);
const monthsOf = (r: WorkRow) => { const n = now(); const end = r.end_year ? toMonth(r.end_year, r.end_month, 12) : n.y * 12 + n.m; return Math.max(1, end - toMonth(r.start_year, r.start_month, 1) + 1); };
/** "1 yr 6 mos", counted like LinkedIn: both ends included */
export const span = (n: number) => { const y = Math.floor(n / 12), m = n % 12; return [y ? `${y} yr${y > 1 ? 's' : ''}` : '', m ? `${m} mo${m > 1 ? 's' : ''}` : ''].filter(Boolean).join(' '); };
/** a company's total: first start to last end (adding roles up would double-count overlaps) */
export const groupMonths = (rs: WorkRow[]) => { const n = now(); const start = Math.min(...rs.map((r) => toMonth(r.start_year, r.start_month, 1))); const end = Math.max(...rs.map((r) => (r.end_year ? toMonth(r.end_year, r.end_month, 12) : n.y * 12 + n.m))); return Math.max(1, end - start + 1); };
const dates = (r: WorkRow) => `${when(r.start_year, r.start_month)} – ${r.end_year ? when(r.end_year, r.end_month) : 'Present'} · ${span(monthsOf(r))}`;
const place = (r: WorkRow) => [r.location, r.workplace_type].filter(Boolean).join(' · ');
const initials = (s: string) => s.replace(/^The\s+/i, '').split(/\s+/).map((w) => w[0] ?? '').join('').slice(0, 2).toUpperCase() || '?';
/** LinkedIn descriptions use "●" lines as bullets */
const lines = (d: string | null) => (d ?? '').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => l.replace(/^[●•▪\-–]\s*/, ''));
/** a description's lines as bullets: the first two, the rest behind "…see more" (LinkedIn trims the same way) */
const SHOW_LINES = 2;
const bullets = (d: string | null) => { const ls = lines(d); if (!ls.length) return ''; const more = ls.length - SHOW_LINES;
  return `<ul class="wh-bullets t-caption text-muted">${ls.map((l, i) => `<li${i >= SHOW_LINES ? ' class="wh-more-line"' : ''}>${esc(l)}</li>`).join('')}</ul>${more > 0 ? `<button type="button" class="t-fine wh-more-btn" data-wh-lines aria-expanded="false">…see more</button>` : ''}`; };
/** a company page link, when LinkedIn told us which company it is */
const companyLink = (r: WorkRow, text: string) => (r.company_linkedin_id && !r.is_club ? `<a class="wh-co-link" href="/alumni-portal/companies/?id=${encodeURIComponent(r.company_linkedin_id)}">${text}</a>` : text);
/** "SHOW ALL 14 EXPERIENCES" under a trimmed list */
const showAll = (hidden: number, total: number, noun: string) => (hidden > 0 ? `<button type="button" class="t-label portal-linklike wh-show-all" data-wh-all data-label="SHOW ALL ${total} ${noun.toUpperCase()}" aria-expanded="false">SHOW ALL ${total} ${noun.toUpperCase()} ↓</button>` : '');
const SHOW_GROUPS = 5, SHOW_ITEMS = 3;
/** TroyLabs on someone's LinkedIn (by LinkedIn's company id, or the name) */
export const isTroyLabs = (r: { company: string; company_linkedin_id?: string | null }) => r.company_linkedin_id === '18216697' || /^\s*troy\s?labs\s*$/i.test(r.company);
export const companyLogoUrl = (path: string | null) => (path ? LOGOS + path : null);
export const logoHtml = (path: string | null, name: string, cls = '') => `<span class="wh-logo${cls ? ` ${cls}` : ''}" aria-hidden="true">${path ? `<img src="${esc(LOGOS + path)}" alt="" loading="lazy" onerror="this.remove()">` : ''}<b>${esc(initials(name))}</b></span>`;
const logo = (path: string | null, name: string) => `<span class="wh-logo" aria-hidden="true">${path ? `<img src="${esc(LOGOS + path)}" alt="" loading="lazy" onerror="this.remove()">` : ''}<b>${esc(initials(name))}</b></span>`;
const now_ = '<span class="t-fine wh-now">NOW</span>';

/** the timeline: one node per company stretch; back-to-back roles at one company under one logo */
export function timelineHtml(work: WorkRow[]): string {
  const groups: WorkRow[][] = [];
  for (const r of work) { const g = groups.at(-1); if (g && g[0].company === r.company) g.push(r); else groups.push([r]); }
  return `<div class="wh-collapse"><ol class="wh-rail">${groups.map((g, gi) => {
    const many = g.length > 1;
    const head = many ? `<p class="m-0 t-name wh-title">${companyLink(g[0], esc(g[0].company))} <span class="t-fine text-muted">· ${span(groupMonths(g))}</span></p>` : '';
    const roles = g.map((r) => `<div class="wh-role${many ? ' is-sub' : ''}">
        <p class="m-0 ${many ? 't-caption text-ink' : 't-name wh-title'}">${esc(r.title)}${r.end_year ? '' : now_}</p>
        ${many ? '' : `<p class="m-0 t-caption">${companyLink(r, esc(r.company))}${r.employment_type ? ` · ${esc(r.employment_type)}` : ''}</p>`}
        <p class="m-0 t-fine text-muted wh-meta">${esc(dates(r))}${place(r) ? ` · ${esc(place(r))}` : ''}</p>
        ${bullets(r.description)}
      </div>`).join('');
    return `<li class="wh-group${gi >= SHOW_GROUPS ? ' wh-more-row' : ''}">${logo(g[0].company_logo, g[0].company)}<div class="wh-body">${head}${roles}</div></li>`;
  }).join('')}</ol>${showAll(groups.length > SHOW_GROUPS ? 1 : 0, work.length, work.length === 1 ? 'experience' : 'experiences')}</div>`;
}

const SECTIONS: { kind: ItemRow['kind']; title: string }[] = [
  { kind: 'honor', title: 'Honors & awards' }, { kind: 'publication', title: 'Publications' }, { kind: 'certification', title: 'Certifications' },
  { kind: 'organization', title: 'Organizations' }, { kind: 'education', title: 'Other schools' },
];
function itemHtml(i: ItemRow, more = false): string {
  const link = i.link ? webUrl(i.link) : null;
  const date = i.kind === 'organization' || i.kind === 'education'
    ? [when(i.year, i.month), i.end_year ? when(i.end_year, i.end_month) : i.is_current ? 'Present' : ''].filter(Boolean).join(' – ')
    : when(i.year, i.month);
  const meta = [i.issuer, i.detail, date].filter(Boolean).map((x) => esc(String(x))).join(' · ');
  return `<li class="wh-item${more ? ' wh-more-row' : ''}"><p class="m-0 t-caption text-ink">${link ? `<a href="${esc(link)}" target="_blank" rel="noopener noreferrer" class="wh-link">${esc(i.title)} ↗</a>` : esc(i.title)}</p>${meta ? `<p class="m-0 t-fine text-muted wh-meta">${meta}</p>` : ''}${bullets(i.description)}</li>`;
}

/** every LinkedIn section that has something, each under its own heading; USC is left out of schools (everyone's) */
export function historyHtml(h: History, opts: { synced?: boolean; part?: 'work' | 'extras' } = {}): string {
  const out: string[] = [];
  if (h.work.length && opts.part !== 'extras') {
    const note = opts.synced !== false && h.syncedAt ? `<span class="t-fine text-muted">FROM LINKEDIN · ${esc(new Date(h.syncedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase())}</span>` : '';
    out.push(`<div class="wh-head"><h2 class="t-sub portal-section-h">Experience</h2>${note}</div>${timelineHtml(h.work)}`);
  }
  if (opts.part !== 'work') for (const s of SECTIONS) {
    const xs = h.items.filter((i) => i.kind === s.kind && !(i.kind === 'education' && i.is_usc));
    if (xs.length) out.push(`<h2 class="t-sub portal-section-h">${s.title}</h2><div class="wh-collapse"><ul class="wh-items">${xs.map((x, i) => itemHtml(x, i >= SHOW_ITEMS)).join('')}</ul>${showAll(xs.length - SHOW_ITEMS, xs.length, s.title.replace('&', 'and'))}</div>`);
  }
  return out.join('');
}

/** ask for my LinkedIn import (or, for an admin, anyone's): the worker takes it within a minute or two */
export async function requestSync(profileId?: string): Promise<{ status: number; queued?: boolean; error?: string }> {
  const { data: { session } } = await supabase().auth.getSession();
  const r = await fetch('https://ackmhqxyxnceoarbhcrp.supabase.co/functions/v1/linkedin-sync', { method: 'POST', headers: { Authorization: `Bearer ${session?.access_token ?? ''}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'request', ...(profileId ? { profile_id: profileId } : {}) }) });
  return { status: r.status, ...(await r.json().catch(() => ({ error: `status ${r.status}` }))) };
}
export async function myLinkedInStatus(): Promise<{ queued: boolean; synced_at: string | null; error: string | null } | null> {
  const { data } = await supabase().rpc('my_linkedin_status'); return (data as { queued: boolean; synced_at: string | null; error: string | null } | null) ?? null;
}

/** SHOW ALL / SHOW FEWER and …see more, for every page that draws history (one listener for the whole site) */
if (typeof document !== 'undefined' && !(window as unknown as { __whMore?: boolean }).__whMore) {
  (window as unknown as { __whMore?: boolean }).__whMore = true;
  document.addEventListener('click', (e) => {
    const t = e.target as Element;
    const all = t.closest<HTMLButtonElement>('[data-wh-all]');
    if (all) {
      const box = all.closest<HTMLElement>('.wh-collapse')!; const open = !box.hasAttribute('data-open');
      box.toggleAttribute('data-open', open); all.setAttribute('aria-expanded', String(open));
      all.textContent = open ? 'SHOW FEWER ↑' : `${all.dataset.label} ↓`;
      if (!open) { const top = box.getBoundingClientRect().top; if (top < 0) box.scrollIntoView({ block: 'start' }); }   // closing a long list: come back to its top
      return;
    }
    const lines = t.closest<HTMLButtonElement>('[data-wh-lines]');
    if (lines) { const holder = lines.parentElement!; const open = !holder.hasAttribute('data-open'); holder.toggleAttribute('data-open', open); lines.setAttribute('aria-expanded', String(open)); lines.textContent = open ? 'see less' : '…see more'; }
  });
}
