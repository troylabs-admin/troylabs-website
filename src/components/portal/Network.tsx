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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { glideTo, tickNumber } from '../../lib/portal/tick';
import { track } from '../../lib/analytics';
import AlumniGlobe, { type Cluster } from './AlumniGlobe';
import { clusterLabel } from '../../lib/portal/cluster';
import { COHORTS, DIVISIONS, INDUSTRIES, PEOPLE as SAMPLE, STATUS, type Person } from '../../lib/portal/sample-people';
import { listPeople } from '../../lib/portal/data';

const FILTERS: [string, string, readonly string[]][] = [['status', 'STATUS', STATUS], ['cohort', 'COHORT', COHORTS], ['division', 'DIVISION', DIVISIONS], ['industry', 'INDUSTRY', INDUSTRIES]];
const FILLER = new Set(['in', 'at', 'the', 'a', 'an', 'who', 'and', 'or', 'of', 'for', 'with', 'someone', 'works', 'on', 'does', 'did']);
const PAGE = 24;
const haystack = (p: Person) => `${p.full_name} ${p.current_title} ${p.current_company} ${p.city} ${p.region} ${p.industries.join(' ')} ${(p.divisions ?? [p.division]).join(' ')} ${p.bio}`.toLowerCase();
const upper = (s: string) => s.toUpperCase();

/** a number that ticks to its new value instead of jumping (same ease as the home page stats) */
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
    const load = async (approved: boolean) => { if (sample) { setPeople(SAMPLE); setLoaded(true); return; } if (!approved) return; try { setPeople(await listPeople()); setLoadError(false); } catch { setLoadError(true); } finally { setLoaded(true); } };
    const on = (e: Event) => { const d = (e as CustomEvent).detail; setMember(d.approved ? 'ok' : d.declined ? 'declined' : 'pending'); void load(d.approved); };
    document.addEventListener('tl:me', on); setMember(document.documentElement.dataset.member ?? ''); if (document.documentElement.dataset.member === 'ok' || sample) void load(true);
    return () => document.removeEventListener('tl:me', on);
  }, [reload]);
  const [q, setQ] = useState('');
  const [active, setActive] = useState<Record<string, string[]>>({});
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
  useEffect(() => { if (!typedKey) return; const t = setTimeout(() => { toResults(); track('search_run', { terms: typedKey, filters: activeCount, results: results.length }); }, 1000); return () => clearTimeout(t); }, [typedKey]);

  /* words + chips narrow the people; the globe shows THEM, so you see where a search lands. Every chip
     group is a hard requirement (any chip within a group), every word must appear somewhere. */
  const matched = useMemo(() => {
    const out: { p: Person; why: string[]; score: number }[] = [];
    for (const p of PEOPLE) {
      const why: string[] = []; let ok = true;
      for (const [key, vals] of Object.entries(active)) {
        const have = key === 'division' ? p.divisions ?? [p.division] : key === 'industry' ? p.industries.map(v => v === 'CLIMATE TECH' ? 'CLIMATE' : v) : [p[key as 'status' | 'cohort' | 'division']];
        const hit = vals.filter((v) => have.includes(v));
        if (!hit.length) { ok = false; break; }
        why.push(...hit);
      }
      if (!ok) continue;
      const text = haystack(p); const cityText = `${p.city} ${p.region}`.toLowerCase(); let score = 0, cityHit = false;
      for (const w of words) { if (!text.includes(w)) { ok = false; break; } score++; if (cityText.includes(w)) cityHit = true; else why.push(w); }
      if (!ok) continue;
      if (cityHit) why.push(p.region ? `${p.city}, ${p.region}` : p.city);   // "san francisco" reads as one place, not two words
      out.push({ p, why, score });
    }
    return out.sort((a, b) => b.score - a.score);
  }, [active, words.join(' '), PEOPLE]);

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
  if (member === 'pending' || member === 'declined') return (
    <div className="portal-network">
      <header className="flex flex-col items-center portal-head portal-waiting">
        <span className="t-label text-muted">THE NETWORK</span>
        {member === 'pending' ? <>
          <h1 className="m-0 t-hero text-center glow-text portal-q">YOU'RE ON THE LIST</h1>
          <p className="m-0 t-caption text-muted text-center portal-sub">TroyLabs leadership approves every member by hand. Once you're in, this page becomes the network: everyone from TroyLabs on a globe, searchable by name, company, city or division. Check back here.</p>
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
              ...(searching ? [] : [<span key="s"> · <Tick n={students} /> STUDENTS</span>, <span key="a"> · <Tick n={PEOPLE.length - students} /> ALUMNI</span>]),
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
        {FILTERS.map(([key, label, defaults]) => { const items = key === 'cohort' ? [...new Set([...defaults, ...PEOPLE.map(p => p.cohort).filter(Boolean)])] : defaults; return (
          <div className="portal-filter-row" key={key}>
            <span className="t-fine text-muted portal-filter-label">{label}</span>
            <div className="flex flex-wrap portal-chips" data-filter={key}>{items.map((c) => <button type="button" key={c} className="t-fine portal-chip" aria-pressed={(active[key] ?? []).includes(c)} data-value={c} onClick={() => toggle(key, c)}>{c}</button>)}</div>
          </div>
        ); })}
      </div>

        <section ref={resultsRef} className="portal-results" aria-live="polite">
          {searching || browsing ? (
            <>
              <div className="portal-results-head">
                <p className="t-label text-muted m-0 portal-results-count">{results.length ? <><Tick n={results.length} /> {results.length === 1 ? 'person' : 'people'}</> : ''}</p>
                <button type="button" className="t-fine portal-linklike" onClick={clearAll}>CLEAR ALL</button>
              </div>
              {results.length > 0 ? (
                <ul className="m-0 p-0 list-none portal-grid">
                  {shown.map(({ p, why }, i) => (
                    <li key={`${p.id}-${i}`}>
                      <a href={`/alumni-portal/members/?id=${p.id}`} className="portal-card no-underline text-ink">
                        <span className="portal-avatar t-sub" aria-hidden="true">{p.avatar ? <img src={p.avatar} alt="" loading="lazy" /> : p.initials}</span>
                        <span className="portal-card-body">
                          <span className="t-name portal-card-name">{p.full_name} <span className="t-fine portal-role">{p.status}</span></span>
                          <span className="t-caption text-muted">{p.current_title} · {p.current_company}</span>
                          <span className="t-fine text-muted">{p.city}{p.region ? `, ${p.region}` : ''} · TL {p.cohort} · {p.status === 'ALUM' ? `Class of ${p.classOf}` : `Expected ${p.classOf}`}</span>
                          <span className="flex flex-wrap portal-card-tags">{p.industries.map((t) => <span key={t} className="t-fine portal-tag">{t}</span>)}</span>
                          {why.length > 0 && <span className="t-fine portal-match">MATCHED {[...new Set(why.map(upper))].join(' · ')}</span>}
                        </span>
                      </a>
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
