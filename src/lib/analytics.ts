/**
 * Analytics — PostHog, counts only (decided with Bryan, 2026-09-16).
 * The public site is marketing: how many came, from where, on what device, and whether they clicked
 * Apply. Vercel Analytics already counts visits with no cookie; PostHog adds what people DO on a page.
 * The portal is a product: are searches, filters and the globe used. Never who did what.
 *
 * So: no autocapture, no session replay, no heatmaps, no surveys, no identify() ever, no cookie
 * (memory persistence — so no consent banner, and a returning visitor looks new; Vercel counts uniques),
 * IP not stored, Do Not Track respected. Eight named events, each carrying page, section and device
 * class. Loads only on the live host (or with ?ph=1 for testing) so local work never lands in the data.
 * Project: us.posthog.com/project/611704 (TroyLabs · Default project). The token is PostHog's public,
 * write-only key — safe in the page by design.
 */
import posthog from 'posthog-js';

const KEY = 'phc_zeww6NYTJsq6inaUfzsbTVRURQbbzsjCiCtxka3jV5nP';
const HOST = 'https://us.i.posthog.com';
const LIVE = 'usctroylabs.com';

let on = false;
const device = () => (matchMedia('(max-width: 767px)').matches ? 'phone' : matchMedia('(max-width: 1100px)').matches ? 'tablet' : 'desktop');
const sectionOf = (el: Element | null) => (el?.closest('[data-figma], [data-m]') as HTMLElement | null)?.dataset.figma ?? (el?.closest('[data-m]') as HTMLElement | null)?.dataset.m ?? null;

/** the one way anything on the site records an event */
export function track(event: string, props: Record<string, unknown> = {}) {
  if (!on) return;
  posthog.capture(event, { ...props, page: location.pathname, device: device() });
}

export function initAnalytics() {
  if (on || typeof window === 'undefined') return;
  const debug = new URLSearchParams(location.search).has('ph');
  if (location.hostname !== LIVE && !debug) return;
  posthog.init(KEY, {
    api_host: HOST,
    autocapture: false,
    capture_pageview: 'history_change',   // the site swaps pages with the History API (Astro's ClientRouter)
    capture_pageleave: false,
    disable_session_recording: true,
    disable_surveys: true,
    capture_heatmaps: false,
    persistence: 'memory',                // no cookie, no localStorage: nothing follows a visitor around
    person_profiles: 'never',             // events only — no person records, ever
    respect_dnt: true,
    ip: false,
    disable_compression: debug,           // so a test can read what was sent
    opt_out_useragent_filter: debug,      // PostHog drops events from bots and automation; a test browser is one
    debug,
  });
  on = true;
  if (debug) (window as any).posthog = posthog;   // ?ph=1 only: lets a test read the live config

  /* clicks that matter, classified from what was clicked — no markup to maintain:
     the Apply pill/link · a call-to-action to a page of ours · a link off the site · an email link */
  document.addEventListener('click', (e) => {
    const a = (e.target as Element).closest('a[href]') as HTMLAnchorElement | null; if (!a) return;
    const label = (a.getAttribute('aria-label') || a.textContent || '').trim().slice(0, 60);
    const base = { label, section: sectionOf(a) };
    const url = new URL(a.href, location.href);
    if (a.classList.contains('apply') || url.pathname === '/apply') return track('apply_click', base);
    if (url.protocol === 'mailto:') return track('email_click', { ...base, to: url.pathname });
    if (url.host && url.host !== location.host) return track('outbound_click', { ...base, host: url.host.replace(/^www\./, '') });
    if (url.pathname.startsWith('/alumni-portal') && !location.pathname.startsWith('/alumni-portal')) return track('portal_click', base);
  }, { capture: true });

  /* a sign-in landing (the magic link brings the session in the URL hash): one count, no one identified */
  if (/access_token=/.test(location.hash) || /type=magiclink/.test(location.hash)) track('portal_signin');

  /* the DEMO reel: did anyone press play */
  document.addEventListener('play', (e) => { const v = e.target as HTMLVideoElement; if (v.tagName === 'VIDEO' && !v.dataset.phPlayed) { v.dataset.phPlayed = '1'; track('video_play', { section: sectionOf(v) }); } }, { capture: true });

  /* how far down each page people read: 25 / 50 / 75 / 100, once each per page view */
  let reached = new Set<number>();
  const depth = () => {
    const max = document.documentElement.scrollHeight - innerHeight; if (max <= 0) return;
    const pct = Math.round(((scrollY + innerHeight) / document.documentElement.scrollHeight) * 100);
    for (const m of [25, 50, 75, 100]) if (pct >= m && !reached.has(m)) { reached.add(m); track('scroll_depth', { percent: m }); }
  };
  addEventListener('scroll', depth, { passive: true });
  document.addEventListener('astro:page-load', () => { reached = new Set(); });
}
