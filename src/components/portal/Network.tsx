/**
 * Alumni portal › THE NETWORK — search and the globe on one page (Bryan, 2026-09-15: "combine the search
 * and globe page… as you put down filters it should filter the globe as well, so you can see exactly
 * where the person is"). One state drives everything: the words you type and the chips you press narrow
 * the list AND the stars; a tap on a star is the location filter — it zooms in and narrows the list to
 * the people at that star. One column, in this order (Bryan): the question, the globe, the bar, every
 * filter row open, the results. Search, not a chatbot: the answer is a list of people. Keyword + filters
 * is the whole engine; semantic ranking on top is a later add with a key.
 * DESIGN PREVIEW: the generated roster in lib/portal/sample-people.ts; nothing is wired to data.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import AlumniGlobe, { type Cluster } from './AlumniGlobe';
import { clusterLabel } from '../../lib/portal/cluster';
import { COHORTS, DIVISIONS, INDUSTRIES, PEOPLE, STATUS, type Person } from '../../lib/portal/sample-people';

const FILTERS: [string, string, readonly string[]][] = [['status', 'STATUS', STATUS], ['cohort', 'COHORT', COHORTS], ['division', 'DIVISION', DIVISIONS], ['industry', 'INDUSTRY', INDUSTRIES]];
const FILLER = new Set(['in', 'at', 'the', 'a', 'an', 'who', 'and', 'or', 'of', 'for', 'with', 'someone', 'works', 'on', 'does', 'did']);
const PAGE = 24;
const haystack = (p: Person) => `${p.full_name} ${p.current_title} ${p.current_company} ${p.city} ${p.region} ${p.industries.join(' ')} ${p.division} ${p.bio}`.toLowerCase();
const upper = (s: string) => s.toUpperCase();

export default function Network() {
  const [q, setQ] = useState('');
  const [active, setActive] = useState<Record<string, string[]>>({});
  const [place, setPlace] = useState<Cluster | null>(null);
  const [page, setPage] = useState(1);
  const resultsRef = useRef<HTMLElement>(null);
  const globeRef = useRef<HTMLDivElement>(null);


  const words = q.trim().toLowerCase().split(/\s+/).filter((w) => w.length > 1 && !FILLER.has(w));
  const activeCount = Object.values(active).reduce((n, v) => n + v.length, 0);
  const searching = words.length > 0 || activeCount > 0 || !!place;
  const typed = words.length > 0;

  /* Typing is a search: once you pause (or hit return) the page scrolls down to the results. Chips and
     the globe are browsing: nothing moves, so you can watch the count under the globe change (Bryan,
     2026-09-15 — the question shrinking on a chip press read as the page jumping). */
  const toResults = () => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const typedKey = words.join(' ');
  useEffect(() => { if (!typedKey) return; const t = setTimeout(toResults, 1000); return () => clearTimeout(t); }, [typedKey]);

  /* words + chips narrow the people; the globe shows THEM, so you see where a search lands. Every chip
     group is a hard requirement (any chip within a group), every word must appear somewhere. */
  const matched = useMemo(() => {
    const out: { p: Person; why: string[]; score: number }[] = [];
    for (const p of PEOPLE) {
      const why: string[] = []; let ok = true;
      for (const [key, vals] of Object.entries(active)) {
        const have = key === 'industry' ? p.industries : [p[key as 'status' | 'cohort' | 'division']];
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
  }, [active, words.join(' ')]);

  /* a tapped star narrows the list to its cities — the globe is the location filter */
  const placeKeys = useMemo(() => place && new Set(place.cities.map((c) => c.key)), [place]);
  const cityKey = (p: Person) => `${p.city}|${p.region}`.toLowerCase();
  const results = useMemo(() => (placeKeys ? matched.filter(({ p }) => placeKeys.has(cityKey(p))) : matched), [matched, placeKeys]);
  const pins = useMemo(() => matched.map(({ p }) => p), [matched]);
  const cities = useMemo(() => new Set(pins.map(cityKey)).size, [pins]);

  const toggle = (key: string, v: string) => { setPage(1); setPlace(null); setActive((a) => { const cur = a[key] ?? []; const next = cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]; const out = { ...a, [key]: next }; if (!next.length) delete out[key]; return out; }); };
  const clearAll = () => { setQ(''); setActive({}); setPlace(null); setPage(1); };
  const pick = (c: Cluster) => { setPlace(c); setPage(1); setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 650); };   // the list is under the globe: once the zoom has been seen, bring it up

  const small = typeof innerWidth !== 'undefined' && innerWidth < 768;
  const qStyle = typed ? { fontSize: small ? '20px' : 'calc(24 * var(--u))', lineHeight: small ? '24px' : 'calc(28 * var(--u))', letterSpacing: small ? '1.6px' : 'calc(2 * var(--u))' } : undefined;
  const shown = results.slice(0, page * PAGE);
  const echo = q.trim() || Object.values(active).flat().join(', ') || (place ? clusterLabel(place) : '');

  return (
    <div className="portal-network" data-searching={typed || undefined}>
      <header className="flex flex-col items-center portal-head">
        <span className="t-label text-muted">THE NETWORK</span>
        <h1 className="m-0 t-hero text-center glow-text portal-q" style={qStyle}>WHO ARE YOU LOOKING FOR?</h1>
        <p className="m-0 t-caption text-muted text-center portal-sub">Type a name, a company, a city, an industry — or a few words about who you need. Filters and the globe narrow it together.</p>
      </header>

      <div ref={globeRef} className="portal-explore-globe">
          <AlumniGlobe pins={pins} onPick={pick} />
          <p className="t-fine text-muted m-0 portal-explore-count">{searching && pins.length !== PEOPLE.length ? `${pins.length} OF ${PEOPLE.length}` : PEOPLE.length} ON THE GLOBE · {cities} {cities === 1 ? 'CITY' : 'CITIES'}. One star per city; bigger stars are more people. Tap a star for who's there.</p>
      </div>

      <form className="portal-search" role="search" onSubmit={(e) => { e.preventDefault(); if (typed) toResults(); (document.activeElement as HTMLElement | null)?.blur(); }}>
        <svg className="portal-search-glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
        <input id="search-q" type="search" className="t-caption portal-search-input" placeholder='e.g. "fintech in san francisco" or "video"' aria-label="Search the network" autoComplete="off" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        {q && <button type="button" className="portal-search-x" aria-label="Clear the search" onClick={() => setQ('')}>×</button>}
      </form>

      <div className="portal-filters" data-search-filters>
        {FILTERS.map(([key, label, items]) => (
          <div className="portal-filter-row" key={key}>
            <span className="t-fine text-muted portal-filter-label">{label}</span>
            <div className="flex flex-wrap portal-chips" data-filter={key}>{items.map((c) => <button type="button" key={c} className="t-fine portal-chip" aria-pressed={(active[key] ?? []).includes(c)} data-value={c} onClick={() => toggle(key, c)}>{c}</button>)}</div>
          </div>
        ))}
      </div>

        <section ref={resultsRef} className="portal-results" aria-live="polite">
          {searching ? (
            <>
              <div className="portal-results-head">
                <p className="t-label text-muted m-0 portal-results-count">{results.length ? `${results.length} ${results.length === 1 ? 'person' : 'people'}` : ''}{place ? <> · <span className="portal-place">IN {upper(clusterLabel(place))} <button type="button" className="portal-place-x" aria-label="Remove the location filter" onClick={() => setPlace(null)}>×</button></span></> : ''}</p>
                <button type="button" className="t-fine portal-linklike" onClick={clearAll}>CLEAR ALL</button>
              </div>
              {results.length > 0 ? (
                <ul className="m-0 p-0 list-none portal-grid">
                  {shown.map(({ p, why }, i) => (
                    <li key={i}>
                      <a href={`/alumni-portal/members/${p.id}`} className="portal-card no-underline text-ink">
                        <span className="portal-avatar t-sub" aria-hidden="true">{p.initials}</span>
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
            <p className="t-fine text-muted portal-results-hint">Everyone is on the globe. Type, press a filter, or tap a star to see who's where.</p>
          )}
        </section>
    </div>
  );
}
