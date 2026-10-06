/**
 * Alumni portal › THE NETWORK — search and the globe on one page (Bryan, 2026-09-15: "combine the search
 * and globe page… as you put down filters it should filter the globe as well, so you can see exactly
 * where the person is"). One state drives everything: the words you type and the chips you press narrow
 * the list AND the stars; a tap on a star is the location filter — it zooms in and narrows the list to
 * the people at that star. One column, in this order (Bryan): the question, the globe, the bar, every
 * filter row open, the results. Search, not a chatbot: the answer is a list of people. Keyword + filters
 * is the whole engine; semantic ranking on top is a later add with a key.
 * People come from the database once you are an approved member (lib/portal/data.ts); a build without
 * a session (or with ?sample=1) shows the generated roster in lib/portal/sample-people.ts.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { glideTo, tickNumber } from '../../lib/portal/tick';
import { track } from '../../lib/analytics';
import AlumniGlobe, { type Cluster } from './AlumniGlobe';
import { clusterLabel } from '../../lib/portal/cluster';
import { COHORTS, DIVISIONS, INDUSTRIES, PEOPLE as SAMPLE, STATUS, type Person } from '../../lib/portal/sample-people';
import { INDUSTRIES as ALL_INDUSTRIES } from '../../lib/portal/options';
import { closeMatches, semanticSearch, type Hit } from '../../lib/portal/semantic';
import { listPeople } from '../../lib/portal/data';

/* the live network offers what members can actually pick (lib/portal/options.ts) and the cohorts they actually joined in;
   the sample preview keeps its own generated lists (2026-10-05: search offered the sample's 10 industries, not the profile's 19) */
const filtersFor = (sample: boolean): [string, string, readonly string[]][] => [['status', 'STATUS', STATUS], ['cohort', 'COHORT', sample ? COHORTS : []], ['division', 'DIVISION', DIVISIONS], ['industry', 'INDUSTRY', sample ? INDUSTRIES : ALL_INDUSTRIES]];
const cohortKey = (c: string) => Number(c.slice(2)) * 2 + (c.startsWith('FA') ? 1 : 0);
const FILLER = new Set(['in', 'at', 'the', 'a', 'an', 'who', 'and', 'or', 'of', 'for', 'with', 'someone', 'works', 'on', 'does', 'did']);
const PAGE = 24;
const haystack = (p: Person) => `${p.full_name} ${p.role ?? ''} ${p.current_title} ${p.current_company} ${p.city} ${p.region} ${p.industries.join(' ')} ${(p.divisions ?? [p.division]).join(' ')} ${p.bio}`.toLowerCase();
const upper = (s: string) => s.toUpperCase();

/** a number that ticks to its new value instead of jumping (same ease as the home page stats) */
/** a result card: a link to the member's page, or (in the sample preview, where nobody has a page) a plain card */
function CardLink({ sample, href, children }: { sample: boolean; href: string; children: React.ReactNode }) {
  return sample ? <div className="portal-card text-ink" title="A sample person: the preview has no profile pages">{children}</div> : <a href={href} className="portal-card no-underline text-ink">{children}</a>;
}
function Tick({ n }: { n: number }) {
  const ref = useRef<HTMLSpanElement>(null); const last = useRef(n);
  useEffect(() => { if (ref.current && last.current !== n) tickNumber(ref.current, last.current, n); last.current = n; }, [n]);
  return <span ref={ref}>{n}</span>;
}

export default function Network() {
  // approved yet? the gate (scripts/portal-auth.ts) stamps <html data-member>; until an admin lets you in, the network is a note
  const [member, setMember] = useState<string>('');
  const [PEOPLE, setPeople] = useState<Person[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [reload, setReload] = useState(0);
  const [browsing, setBrowsing] = useState(false);
  const refresh = useCallback(() => setReload(n => n + 1), []);
  const [sample, setSample] = useState(false);
  useEffect(() => {
    const sample = new URLSearchParams(location.search).has('sample'); setSample(sample);
    const load = async (approved: boolean) => { if (sample) { setPeople(SAMPLE); setLoaded(true); return; } if (!approved) return; try { setPeople((await listPeople()).filter((p) => p.full_name?.trim())); setLoadError(false); }   /* a profile with no name yet isn't a person anyone can find */ catch { setLoadError(true); } finally { setLoaded(true); } };
    const on = (e: Event) => { const d = (e as CustomEvent).detail; setMember(d.approved ? 'ok' : d.declined ? 'declined' : 'pending'); void load(d.approved); };
    document.addEventListener('tl:me', on); setMember(document.documentElement.dataset.member ?? ''); if (document.documentElement.dataset.member === 'ok' || sample) void load(true);
    return () => document.removeEventListener('tl:me', on);
  }, [reload]);
  /* the search lives in the address (?q=…&division=TECH,DESIGN), so Back from a member's page, or BACK TO SEARCH,
     returns to the same results (audit 2026-10-02: they came back to an empty box) */
  const fromUrl = () => { if (typeof location === 'undefined') return { q: '', active: {} as Record<string, string[]> }; const u = new URLSearchParams(location.search); const active: Record<string, string[]> = {}; for (const k of ['status', 'cohort', 'division', 'industry']) { const v = u.get(k); if (v) active[k] = v.split(',').filter(Boolean); } return { q: u.get('q') ?? '', active }; };
  const [q, setQ] = useState(() => fromUrl().q);
  const [active, setActive] = useState<Record<string, string[]>>(() => fromUrl().active);
  const restored = useRef(Boolean(fromUrl().q));
  useEffect(() => {
    const u = new URLSearchParams(location.search); u.delete('q'); for (const k of ['status', 'cohort', 'division', 'industry']) u.delete(k);
    if (q.trim()) u.set('q', q.trim()); for (const [k, v] of Object.entries(active)) if (v.length) u.set(k, v.join(','));
    const next = `${location.pathname}${u.toString() ? `?${u}` : ''}${location.hash}`; if (next !== `${location.pathname}${location.search}${location.hash}`) history.replaceState(history.state, '', next);
    try { sessionStorage.setItem('tl-last-search', next); } catch { /* private mode: BACK TO SEARCH falls back to a fresh search */ }
  }, [q, active]);
  const [place, setPlace] = useState<Cluster | null>(null);
  const [page, setPage] = useState(1);
  const [reset, setReset] = useState(0);   // bumped to make the globe drop its selection and zoom back out
  const resultsRef = useRef<HTMLElement>(null);
  const globeRef = useRef<HTMLDivElement>(null);


  const words = q.trim().toLowerCase().split(/\s+/).filter((w) => w.length > 1 && !FILLER.has(w));
  const activeCount = Object.values(active).reduce((n, v) => n + v.length, 0);
  const searching = words.length > 0 || activeCount > 0 || !!place;
  const typed = words.length > 0;

  /* Typing is a search: once you pause (or hit return) the page scrolls down to the results. Chips and
     the globe are browsing: nothing moves, so you can watch the count under the globe change (Bryan,
     2026-09-15 — the question shrinking on a chip press read as the page jumping). */
  const glide = useRef<(() => void) | null>(null);
  const toResults = (after = 0) => { glide.current?.(); if (resultsRef.current) glide.current = glideTo(resultsRef.current, { after, ms: 1500 }); };
  const typedKey = words.join(' ');
  useEffect(() => { if (!typedKey) return; const t = setTimeout(() => { toResults(); if (restored.current) { restored.current = false; return; } track('search_run', { words: words.length, filters: activeCount, results: results.length }); /* counts only: typed words often contain people's names */ }, 1000); return () => clearTimeout(t); }, [typedKey]);

  /* AI close matches for what was typed (live network only; the sample roster has no embeddings) */
  const [hits, setHits] = useState<{ q: string; list: Hit[] }>({ q: '', list: [] });
  useEffect(() => {
    if (sample || member !== 'ok' || q.trim().length < 3) { setHits({ q: '', list: [] }); return; }
    const ctl = new AbortController(); const query = q.trim();
    const t = setTimeout(async () => { const list = await semanticSearch(query, ctl.signal); if (!ctl.signal.aborted) setHits({ q: query, list: closeMatches(list) }); }, 350);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [q, sample, member]);
  const close = useMemo(() => new Map((hits.q === q.trim() ? hits.list : []).map((h) => [h.id, h.similarity])), [hits, q]);

  /* words + chips narrow the people; the globe shows THEM, so you see where a search lands. Every chip
     group is a hard requirement (any chip within a group), every word must appear somewhere. */
  const matched = useMemo(() => {
    const out: { p: Person; why: string[]; score: number; closeMatch?: boolean }[] = [];
    for (const p of PEOPLE) {
      const why: string[] = []; let ok = true;
      for (const [key, vals] of Object.entries(active)) {
        const have = key === 'division' ? p.divisions ?? [p.division] : key === 'industry' ? (sample ? p.industries.map(v => v === 'CLIMATE TECH' ? 'CLIMATE' : v) : p.industries) : [p[key as 'status' | 'cohort' | 'division']];
        const hit = vals.filter((v) => have.includes(v));
        if (!hit.length) { ok = false; break; }
        why.push(...hit);
      }
      if (!ok) continue;
      const text = haystack(p); const cityText = `${p.city} ${p.region}`.toLowerCase(); let score = 0, cityHit = false;
      const chipWhy = why.length;
      for (const w of words) { if (!text.includes(w)) { ok = false; break; } score++; if (cityText.includes(w)) cityHit = true; else why.push(w); }
      if (!ok) {   // the words aren't in their profile, but the AI says it's about what was asked: a close match, after every keyword match
        const sim = close.get(p.id); if (sim !== undefined) out.push({ p, why: why.slice(0, chipWhy), score: -1 + sim, closeMatch: true });
        continue;
      }
      if (cityHit) why.push(p.region ? `${p.city}, ${p.region}` : p.city);   // "san francisco" reads as one place, not two words
      out.push({ p, why, score });
    }
    return out.sort((a, b) => b.score - a.score);
  }, [active, words.join(' '), PEOPLE, sample, close]);

  /* a tapped star narrows the list to its cities — the globe is the location filter */
  const placeKeys = useMemo(() => place && new Set(place.cities.map((c) => c.key)), [place]);
  const cityKey = (p: Person) => `${p.city}|${p.region}`.toLowerCase();
  const results = useMemo(() => (placeKeys ? matched.filter(({ p }) => placeKeys.has(cityKey(p))) : matched), [matched, placeKeys]);
  const pins = useMemo(() => matched.map(({ p }) => p).filter((p) => p.lat || p.lng), [matched]);   // no city yet → in the list, not on the globe (0,0 is the Gulf of Guinea)
  const cities = useMemo(() => new Set(pins.map(cityKey)).size, [pins]);
  const students = useMemo(() => PEOPLE.filter((p) => p.status === 'STUDENT').length, [PEOPLE]);
  const leftCities = useMemo(() => new Set(results.filter(({p}) => p.city).map(({ p }) => cityKey(p))).size, [results]);

  const toggle = (key: string, v: string) => { track('filter_press', { group: key, value: v, on: !(active[key] ?? []).includes(v) }); setPage(1); setActive((a) => { const cur = a[key] ?? []; const next = cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]; const out = { ...a, [key]: next }; if (!next.length) delete out[key]; return out; }); };
  const clearAll = () => { setQ(''); setActive({}); setBrowsing(false); setPage(1); if (place) setReset((r) => r + 1); };
  const placeName = (c: Cluster) => upper(c.cities.slice(0, 4).map((x) => x.name).join(' · ')) + (c.cities.length > 4 ? ` +${c.cities.length - 4} MORE` : '');
  // a star tap selects it: the globe names it on a card and the list narrows. Nothing scrolls on its own
  // (Bryan, 2026-09-15); the card's SEE WHO'S HERE link is the way down.
  // the globe re-reports the same star as it re-clusters after the fly-in; count a tap once, when the star changes
  const pick = (c: Cluster | null) => { if (c && c.seed.key !== place?.seed.key) track('globe_star_tap', { city: c.seed.name, cities: c.cities.length, people: c.count }); setPlace(c); setPage(1); };

  const small = typeof innerWidth !== 'undefined' && innerWidth < 768;
  const qStyle = typed ? { fontSize: small ? '20px' : 'calc(24 * var(--u))', lineHeight: small ? '24px' : 'calc(28 * var(--u))', letterSpacing: small ? '1.6px' : 'calc(2 * var(--u))' } : undefined;
  const shown = results.slice(0, page * PAGE);
  const echo = q.trim() || Object.values(active).flat().join(', ') || (place ? clusterLabel(place) : '');

  // not in yet (Bryan, 2026-09-30: "if they try to log in and it hasn't been approved yet it'll just show
  // waiting for it to get approved"). The gate only lets someone here once their profile has the basics.
  // until the gate says who you are, show nothing that might be wrong (pending people saw the whole search page for
  // ~600 ms before "you're on the list"; audit 2026-10-02)
  if (!member && !sample) return (<div className="portal-network"><header className="flex flex-col items-center portal-head"><span className="t-label text-muted">THE NETWORK</span><p className="m-0 t-caption text-muted" role="status" style={{ marginTop: 'calc(16 * var(--u))' }}>Loading…</p></header></div>);
  if (member === 'pending' || member === 'declined') return (
    <div className="portal-network">
      <header className="flex flex-col items-center portal-head portal-waiting">
        <span className="t-label text-muted">THE NETWORK</span>
        {member === 'pending' ? <>
          <h1 className="m-0 t-hero text-center glow-text portal-q">WAITING FOR APPROVAL</h1>
          <p className="m-0 t-caption text-muted text-center portal-sub">Your profile is with TroyLabs leadership, who approve every member by hand. We'll email you the moment you're in. Then this page becomes the network: everyone from TroyLabs on a globe, searchable by name, company, city or division.</p>
          <ol className="portal-wait-steps" aria-label="Where you are">
            <li className="is-done"><span className="portal-wait-dot" aria-hidden="true">✓</span><span>Profile submitted</span></li>
            <li className="is-now" aria-current="step"><span className="portal-wait-dot" aria-hidden="true" /><span>Leadership is reviewing it</span></li>
            <li><span className="portal-wait-dot" aria-hidden="true" /><span>You're in: we email you</span></li>
          </ol>
          <a href="/alumni-portal/profile" className="portal-btn is-small is-quiet t-label no-underline text-ink portal-waiting-cta">EDIT YOUR PROFILE</a>
        </> : <>
          <h1 className="m-0 t-hero text-center glow-text portal-q">NOT APPROVED</h1>
          <p className="m-0 t-caption text-muted text-center portal-sub">Leadership couldn't match your profile to a TroyLabs member. If you were part of TroyLabs, email <a href="mailto:troylabs@usc.edu" className="text-ink">troylabs@usc.edu</a> and they'll take another look.</p>
        </>}
      </header>
    </div>
  );
  return (
    <div className="portal-network" data-react-controls data-searching={typed || undefined}>
      <header className="flex flex-col items-center portal-head">
        <span className="t-label text-muted">THE NETWORK</span>
        <h1 className="m-0 t-hero text-center glow-text portal-q" style={qStyle}>WHO ARE YOU LOOKING FOR?</h1>
        <p className="m-0 t-caption text-muted text-center portal-sub">Type a name, a company, a city, an industry — or a few words about who you need. Filters and the globe narrow it together.</p>
      </header>

      {sample && <p className="t-caption text-muted text-center">Design preview · 463 fictional members. <a href="/alumni-portal/home" className="portal-linklike">Back to the live network</a></p>}
      {loadError && <p role="alert" className="t-caption text-center">Could not refresh the network. <button type="button" className="portal-linklike" onClick={refresh}>Try again</button></p>}
      <div ref={globeRef} className="portal-explore-globe">
          <AlumniGlobe pins={pins} onRefresh={refresh} onPick={pick} onSeeList={() => toResults()} reset={reset} />
          {/* under the globe (Bryan, 2026-09-15): plain stats at rest; once anything is pressed or typed,
              what's on and how many are left. The numbers tick, and they keep their identity (keys) across
              the two states so the tick runs from the old value. */}
          {searching && (
            /* what's on, as the same orange pills as the rows below (one state — remove here, it unpresses
               there). The place pill names the actual cities under the tapped star; its × also zooms the
               globe back out. */
            <div className="portal-active" aria-label="Active filters">
              <span className="t-fine text-muted portal-active-label">FILTERS</span>
              {Object.entries(active).flatMap(([k, vs]) => vs.map((v) => <button type="button" key={k + v} className="t-fine portal-chip is-removable" aria-pressed="true" onClick={() => toggle(k, v)} aria-label={`Remove ${v}`}>{v}<span className="portal-chip-x" aria-hidden="true">×</span></button>))}
              {q.trim() && <button type="button" className="t-fine portal-chip is-removable" aria-pressed="true" onClick={() => setQ('')} aria-label="Clear the search words">“{q.trim()}”<span className="portal-chip-x" aria-hidden="true">×</span></button>}
              {place && <button type="button" className="t-fine portal-chip is-removable" aria-pressed="true" onClick={() => setReset((r) => r + 1)} aria-label="Remove the place">{placeName(place)}<span className="portal-chip-x" aria-hidden="true">×</span></button>}
            </div>
          )}
          <p className="t-label portal-explore-stats">
            {[
              <span key="n"><Tick n={searching ? results.length : PEOPLE.length} /> {searching ? 'LEFT' : 'PEOPLE'}</span>,
              ...(searching ? [] : [<span key="s"> · <Tick n={students} /> {students === 1 ? 'STUDENT' : 'STUDENTS'}</span>, <span key="a"> · <Tick n={PEOPLE.length - students} /> {PEOPLE.length - students === 1 ? 'ALUM' : 'ALUMNI'}</span>]),
              <span key="c"> · <Tick n={searching ? leftCities : cities} /> {(searching ? leftCities : cities) === 1 ? 'CITY' : 'CITIES'}</span>,
            ]}
          </p>
          <p className="t-fine text-muted m-0 portal-explore-count">Drag to explore. Select a marker to meet members; nearby cities group together.</p>
      </div>

      <form className="portal-search" role="search" onSubmit={(e) => { e.preventDefault(); if (typed) toResults(); (document.activeElement as HTMLElement | null)?.blur(); }}>
        <svg className="portal-search-glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
        <input id="search-q" type="search" className="t-caption portal-search-input" placeholder='e.g. "fintech in san francisco" or "video"' aria-label="Search the network" autoComplete="off" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        {q && <button type="button" className="portal-search-x" aria-label="Clear the search" onClick={() => setQ('')}>×</button>}
      </form>

      <div className="portal-filters" data-search-filters>
        {filtersFor(sample).map(([key, label, defaults]) => { const items = key === 'cohort' ? [...new Set([...defaults, ...PEOPLE.map(p => p.cohort).filter(Boolean)])].sort((a, b) => cohortKey(b) - cohortKey(a)) : defaults; return (
          <div className="portal-filter-row" key={key}>
            <span className="t-fine text-muted portal-filter-label">{label}</span>
            <div className="flex flex-wrap portal-chips" data-filter={key}>{items.map((c) => <button type="button" key={c} className="t-fine portal-chip" aria-pressed={(active[key] ?? []).includes(c)} data-value={c} onClick={() => toggle(key, c)}>{c}</button>)}</div>
          </div>
        ); })}
      </div>

        <section ref={resultsRef} className="portal-results" aria-live="polite">
          {searching || browsing || (loaded && PEOPLE.length > 0) ? (   /* the whole directory shows until you search (Bryan, 2026-10-06: an empty space under the filters read as nobody being here) */
            <>
              <div className="portal-results-head">
                <p className="t-label text-muted m-0 portal-results-count">{results.length ? <><Tick n={results.length} /> {results.length === 1 ? 'person' : 'people'}</> : ''}</p>
                {(searching || browsing) && <button type="button" className="t-fine portal-linklike" onClick={clearAll}>CLEAR ALL</button>}
              </div>
              {results.length > 0 ? (
                <ul className="m-0 p-0 list-none portal-grid">
                  {shown.map(({ p, why, closeMatch }, i) => (
                    <li key={`${p.id}-${i}`}>
                      <CardLink sample={sample} href={`/alumni-portal/members/?id=${p.id}`}>
                        <span className="portal-avatar t-sub" aria-hidden="true">{p.avatar ? <img src={p.avatar} alt="" loading="lazy" /> : p.initials}</span>
                        <span className="portal-card-body">
                          <span className="t-name portal-card-name">{p.full_name}</span>
                          <span className="portal-card-status"><span className="t-fine portal-role">{p.status}</span>{p.role && <span className="t-fine portal-card-eboard">{p.role}</span>}</span>
                          {(p.current_title || p.current_company) && <span className="t-caption text-muted">{[p.current_title, p.current_company].filter(Boolean).join(' · ')}</span>}
                          <span className="t-fine text-muted">{[p.city ? `${p.city}${p.region ? `, ${p.region}` : ''}` : '', p.status === 'ALUM' && p.classOf ? `Class of ${p.classOf}` : ''].filter(Boolean).join(' · ')}</span>
                          {closeMatch ? <span className="t-fine portal-match portal-close-match" title="Not the exact words, but their profile is about what you asked">CLOSE MATCH{why.length ? ` · ${[...new Set(why.map(upper))].join(' · ')}` : ''}</span>
                            : why.length > 0 && <span className="t-fine portal-match">MATCHED {[...new Set(why.map(upper))].join(' · ')}</span>}
                        </span>
                      </CardLink>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="portal-panel portal-results-empty">
                  <p className="m-0 t-caption text-ink">Nobody matches “{echo}” yet.</p>
                  <p className="m-0 t-fine text-muted" style={{ marginTop: 'calc(8 * var(--u))' }}>Try an industry, a company or a city — or clear a filter. As more alumni fill in their profiles, more searches will land.</p>
                </div>
              )}
              {results.length > shown.length && <button type="button" className="portal-btn is-small is-quiet t-label portal-globe-more" onClick={() => setPage(page + 1)}>SHOW {Math.min(PAGE, results.length - shown.length)} MORE · {results.length - shown.length} LEFT</button>}
            </>
          ) : (
            <p className="t-fine text-muted portal-results-hint">{!loaded ? 'Loading the network…' : PEOPLE.length === 0 ? 'The network is waiting for its first approved members.' : <><button type="button" className="t-label portal-linklike" onClick={() => setBrowsing(true)}>BROWSE ALL MEMBERS</button><br />Members without a city are included in the directory.</>}</p>
          )}
        </section>
    </div>
  );
}
