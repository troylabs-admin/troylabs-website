/**
 * Alumni portal › design-preview interactions. Every control responds visibly with NO backend
 * (Bryan, 2026-09-14: "make sure every design works before implementing anything back-end"):
 *   · filter chips toggle a clear selected state and update a summary line ("Sending to: IGNITE, TECH")
 *   · removable tags (×) remove; ADD buttons add what was typed as a new tag
 *   · SAVE / SEND / UPDATE / EXPORT / PREVIEW show what they would do; DELETE asks first
 *   · the profile completion bar recounts filled fields live
 * When the backend lands, these handlers are what call it — the feedback lines stay.
 */
function init() {
  const root = document.querySelector('.portal-section');
  if (!root || (root as HTMLElement).dataset.uiReady) return;
  (root as HTMLElement).dataset.uiReady = '1';

  // entrance stagger: each top-level block gets its index (styles/portal.css › portal-rise)
  [...root.querySelectorAll<HTMLElement>('.portal-col > *')].forEach((el, i) => el.style.setProperty('--pi', String(Math.min(i, 8))));

  // ── chips ──
  const summarise = (group: HTMLElement) => {
    // only a feedback line that is the group's OWN next sibling — never something further down the page
    // (on the profile this once printed "Selected: CO-PRESIDENT" above the divisions chips)
    const next = group.nextElementSibling as HTMLElement | null;
    const fb = next?.classList.contains('portal-feedback') ? next : null;
    if (!fb) return;
    const on = [...group.querySelectorAll<HTMLElement>('.portal-chip[aria-pressed="true"]')].map((c) => c.textContent!.replace(/^✓\s*/, '').trim());
    const label = fb.dataset.label ?? 'Selected';
    fb.textContent = on.length ? `${label}: ${on.join(', ')}` : '';
  };
  for (const chip of root.querySelectorAll<HTMLElement>('.portal-chip')) {
    chip.addEventListener('click', () => {
      const on = chip.getAttribute('aria-pressed') !== 'true';
      const single = chip.closest<HTMLElement>('[data-single]');
      if (single) {                                   // one answer only (status): pick this, clear the rest
        single.querySelectorAll('.portal-chip').forEach((c) => c.setAttribute('aria-pressed', 'false'));
        chip.setAttribute('aria-pressed', 'true');
        const isStudent = chip.dataset.value === 'student';
        const grad = root!.querySelector<HTMLElement>('#pf-grad'); if (grad) grad.hidden = !isStudent;
        const classof = root!.querySelector<HTMLElement>('#pf-classof'); if (classof) classof.hidden = isStudent;
        recount(); return;
      }
      chip.setAttribute('aria-pressed', String(on));
      // roles need a year: "Co-President" alone is not a fact, "Co-President 2025" is
      if (chip.closest('[data-field="eboard"]')) {
        const list = chip.closest<HTMLElement>('[data-roles]')?.querySelector<HTMLElement>('.portal-role-years') ?? null;
        const key = chip.textContent!.replace(/^✓\s*/, '').trim();
        const row = list?.querySelector<HTMLElement>(`[data-role="${CSS.escape(key)}"]`);
        if (on && list && !row) {
          const r = document.createElement('div');
          r.className = 'portal-inline portal-role-year'; r.dataset.role = key;
          const term = () => `<span class="portal-term-pair"><select class="t-caption portal-input portal-select" aria-label="Semester you were ${key}"><option>Fall</option><option>Spring</option></select><input class="t-caption portal-input" inputmode="numeric" placeholder="Year" aria-label="Year you were ${key}" style="max-width:calc(120 * var(--u))" /></span>`;
          r.innerHTML = `<span class="t-fine portal-tagx" style="flex:none">${key}</span><span class="portal-terms">${term()}</span><button type="button" class="t-label portal-linklike" data-more>+ ANOTHER SEMESTER</button>`;
          // a role can span several semesters (Bryan, 2026-09-14): each click adds a Fall/Spring + year pair
          r.querySelector('[data-more]')!.addEventListener('click', () => { const t = document.createElement('span'); t.className = 'portal-term-pair'; t.innerHTML = term().replace(/^<span class="portal-term-pair">|<\/span>$/g, ''); r.querySelector('.portal-terms')!.appendChild(t); t.querySelector('input')?.focus(); });
          list.appendChild(r); r.querySelector('input')?.focus();
        } else if (!on && row) row.remove();
      }
      const group = chip.closest<HTMLElement>('.portal-chips');
      if (group && !group.closest('[data-audience]')) summarise(group);   // inside an audience block the combined line reports instead
      recount();
    });
  }
  // audience: one summary across the three groups
  const audience = root.querySelector<HTMLElement>('[data-audience]');
  if (audience) {
    const fb = audience.querySelector<HTMLElement>('.portal-feedback');
    const update = () => {
      const on = [...audience.querySelectorAll<HTMLElement>('.portal-chip[aria-pressed="true"]')].map((c) => c.textContent!.replace(/^✓\s*/, '').trim());
      const label = audience.dataset.audience || 'Selected';
      if (fb) fb.textContent = on.length ? `${label}: ${on.join(', ')}` : (audience.dataset.empty ?? '');
    };
    audience.addEventListener('click', (e) => { if ((e.target as HTMLElement).closest('.portal-chip')) update(); });
    update();
  }

  // ── removable tags + ADD ──
  const wireTag = (tag: HTMLElement) => tag.querySelector('button')?.addEventListener('click', () => { tag.remove(); recount(); });
  root.querySelectorAll<HTMLElement>('.portal-tagx').forEach(wireTag);
  for (const row of root.querySelectorAll<HTMLElement>('.portal-inline[data-adds]')) {
    const input = row.querySelector<HTMLInputElement>('input');
    const btn = row.querySelector<HTMLButtonElement>('button');
    const target = document.querySelector<HTMLElement>(row.dataset.adds!);
    if (!input || !btn || !target) continue;
    const add = () => {
      const v = input.value.trim();
      if (!v) { input.focus(); return; }
      const tag = document.createElement('span');
      tag.className = 't-fine portal-tagx';
      tag.innerHTML = `${v.toUpperCase()} <button type="button" aria-label="Remove ${v}">×</button>`;
      target.appendChild(tag); wireTag(tag); input.value = ''; recount();
    };
    btn.addEventListener('click', add);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
  }

  // ── search page: live results as you type or pick a chip; each card says why it matched ──
  const sq = root.querySelector<HTMLInputElement>('#search-q');
  const sres = root.querySelector<HTMLElement>('[data-search-results]');
  if (sq && sres) {
    const filters = root.querySelector<HTMLElement>('[data-search-filters]')!;
    const list = sres.querySelector<HTMLElement>('[data-search-list]')!;
    const countEl = sres.querySelector<HTMLElement>('[data-search-count]')!;
    const empty = sres.querySelector<HTMLElement>('[data-search-empty]')!;
    const echo = sres.querySelector<HTMLElement>('[data-search-echo]')!;
    const clear = root.querySelector<HTMLButtonElement>('[data-search-clear]')!;
    const run = () => {
      const active: Record<string, string[]> = {};
      for (const g of filters.querySelectorAll<HTMLElement>('[data-filter]')) {
        const on = [...g.querySelectorAll<HTMLElement>('.portal-chip[aria-pressed="true"]')].map((c) => c.dataset.value!);
        if (on.length) active[g.dataset.filter!] = on;
      }
      const words = sq.value.trim().toLowerCase().split(/\s+/).filter((w) => w.length > 1 && !['in', 'at', 'the', 'a', 'an', 'who', 'and', 'or', 'of', 'for', 'with', 'someone', 'works', 'on', 'does', 'did'].includes(w));
      const searching = words.length > 0 || Object.keys(active).length > 0;
      root!.toggleAttribute('data-searching', searching);
      // the question shrinks while searching. Inline, because the site's .t-hero rule and this page's rule tie on
      // specificity and the site's wins on order (measured: stylesheet attempts landed at 35px, not 24px).
      const q = root!.querySelector<HTMLElement>('.portal-q');
      if (q) { const small = innerWidth < 768; q.style.fontSize = searching ? (small ? '20px' : 'calc(24 * var(--u))') : ''; q.style.lineHeight = searching ? (small ? '24px' : 'calc(28 * var(--u))') : ''; q.style.letterSpacing = searching ? (small ? '1.6px' : 'calc(2 * var(--u))') : ''; }
      sres.hidden = !searching; clear.hidden = !sq.value;
      if (!searching) return;
      let shown = 0;
      const rows = [...list.querySelectorAll<HTMLElement>('li')];
      const scored = rows.map((li) => {
        const why: string[] = [];
        // filters are hard requirements
        for (const [k, vals] of Object.entries(active)) {
          const have = (li.dataset[k] ?? '').split('|');
          const hit = vals.filter((v) => have.includes(v));
          if (!hit.length) return { li, score: -1, why };
          why.push(...hit);
        }
        // words: every word must appear somewhere; each hit adds to the score
        const text = li.dataset.text ?? '';
        let score = 0;
        for (const w of words) { if (!text.includes(w)) return { li, score: -1, why }; score++; why.push(w); }
        return { li, score, why };
      });
      scored.sort((a, b) => b.score - a.score);
      for (const { li, score, why } of scored) {
        li.hidden = score < 0; if (score >= 0) shown++;
        const w = li.querySelector<HTMLElement>('[data-why]'); if (w) w.textContent = score >= 0 && why.length ? 'MATCHED ' + [...new Set(why.map((x) => x.toUpperCase()))].join(' · ') : '';
        list.appendChild(li);   // re-order by score
      }
      countEl.textContent = shown ? `${shown} ${shown === 1 ? 'person' : 'people'}` : '';
      empty.hidden = shown > 0; echo.textContent = sq.value.trim() || Object.values(active).flat().join(', ');
    };
    sq.addEventListener('input', run);
    filters.addEventListener('click', (e) => { if ((e.target as HTMLElement).closest('.portal-chip')) setTimeout(run, 0); });
    clear.addEventListener('click', () => { sq.value = ''; filters.querySelectorAll('.portal-chip').forEach((c) => c.setAttribute('aria-pressed', 'false')); run(); sq.focus(); });
    run();
  }

  // ── admin › messages: schedule reveals a time; the SEND button follows it; tabs filter the list; recipients expand ──
  const when = root.querySelector<HTMLElement>('[data-when]');
  if (when) {
    const at = root.querySelector<HTMLElement>('[data-when-at]')!; const send = root.querySelector<HTMLElement>('[data-send-btn]')!;
    when.addEventListener('click', (e) => { const c = (e.target as HTMLElement).closest<HTMLElement>('.portal-chip'); if (!c) return; setTimeout(() => { const later = c.dataset.value === 'later'; at.hidden = !later; send.textContent = later ? 'SCHEDULE' : 'SEND NOW'; send.dataset.done = later ? 'SCHEDULED' : 'QUEUED'; send.dataset.feedback = later ? 'Scheduled. It appears under Scheduled below, editable until it sends.' : 'Sending is wired with the database (email) and SendBlue (texts). Nothing was sent.'; }, 0); });
  }
  const channels = root.querySelector<HTMLElement>('[data-channels]');
  if (channels) channels.addEventListener('click', (e) => { const c = (e.target as HTMLElement).closest<HTMLElement>('.portal-chip'); if (!c) return;
    setTimeout(() => { const on = c.getAttribute('aria-pressed') === 'true'; channels.querySelectorAll('.portal-chip').forEach((x) => x.setAttribute('aria-pressed', 'false')); c.setAttribute('aria-pressed', String(on));
      const fb = channels.closest('[data-audience]')!.querySelector<HTMLElement>('.portal-feedback'); if (fb && on) fb.textContent = `Sending to the ${c.dataset.value} channel (${c.title}).`; }, 0); });
  const tabs = root.querySelector<HTMLElement>('[data-msg-tabs]'); const mlist = root.querySelector<HTMLElement>('[data-msg-list]');
  if (tabs && mlist) {
    tabs.addEventListener('click', (e) => { const c = (e.target as HTMLElement).closest<HTMLElement>('.portal-chip'); if (!c) return;
      tabs.querySelectorAll('.portal-chip').forEach((x) => x.setAttribute('aria-pressed', 'false')); c.setAttribute('aria-pressed', 'true');
      const v = c.dataset.value; mlist.querySelectorAll<HTMLElement>(':scope > li').forEach((li) => { li.hidden = v !== 'all' && li.dataset.state !== v; }); });
    for (const b of mlist.querySelectorAll<HTMLElement>('[data-recipients]')) b.addEventListener('click', () => { const ul = b.closest('li')!.querySelector<HTMLElement>('.portal-recipients')!; ul.hidden = !ul.hidden; b.textContent = ul.hidden ? (b.closest('li')!.dataset.state === 'sent' ? 'WHO GOT IT' : 'WHO WILL GET IT') : 'HIDE'; });
  }

  // ── admin › members: filters + search narrow the table live (chips here filter, they don't summarise) ──
  const mf = root.querySelector<HTMLElement>('[data-members-filters]');
  const mtable = root.querySelector<HTMLElement>('[data-members] tbody');
  if (mf && mtable) {
    const q = mf.querySelector<HTMLInputElement>('#members-q');
    const count = mf.querySelector<HTMLElement>('[data-members-count]');
    const apply = () => {
      const active: Record<string, string[]> = {};
      for (const g of mf.querySelectorAll<HTMLElement>('[data-filter]')) {
        const on = [...g.querySelectorAll<HTMLElement>('.portal-chip[aria-pressed="true"]')].map((c) => c.dataset.value!);
        if (on.length) active[g.dataset.filter!] = on;
      }
      const text = (q?.value ?? '').trim().toLowerCase();
      let shown = 0, total = 0;
      for (const tr of mtable.querySelectorAll<HTMLTableRowElement>('tr:not(.portal-row-detail)')) {
        total++;
        const ok = Object.entries(active).every(([k, vals]) => vals.includes(tr.dataset[k] ?? '')) && (!text || (tr.dataset.text ?? '').includes(text));
        tr.hidden = !ok; if (ok) shown++;
        const detail = tr.nextElementSibling as HTMLElement | null; if (detail?.classList.contains('portal-row-detail')) detail.hidden = !ok;
      }
      if (count) count.textContent = shown === total ? `Showing all ${total} members.` : `Showing ${shown} of ${total} members.`;
    };
    mf.addEventListener('click', (e) => { if ((e.target as HTMLElement).closest('.portal-chip')) setTimeout(apply, 0); });
    q?.addEventListener('input', apply);
    apply();
  }

  // ── admin › users: ROLES opens the member's role picker in a row beneath ──
  for (const btn of root.querySelectorAll<HTMLElement>('[data-roles-for]')) {
    btn.addEventListener('click', () => {
      const tr = btn.closest('tr')!; const next = tr.nextElementSibling as HTMLElement | null;
      if (next?.classList.contains('portal-row-detail')) { next.remove(); btn.textContent = 'ROLES'; return; }
      const tpl = document.querySelector<HTMLTemplateElement>('#roles-picker')!;
      const row = document.createElement('tr'); row.className = 'portal-row-detail';
      const td = document.createElement('td'); td.colSpan = tr.children.length; td.appendChild(tpl.content.cloneNode(true)); row.appendChild(td);
      td.querySelector<HTMLElement>('[data-roles-name]')!.textContent = btn.dataset.rolesFor!;
      tr.after(row); btn.textContent = 'CLOSE';
      // wire the cloned chips (they were not in the DOM when init ran)
      for (const chip of td.querySelectorAll<HTMLElement>('.portal-chip')) chip.addEventListener('click', () => {
        const on = chip.getAttribute('aria-pressed') !== 'true'; chip.setAttribute('aria-pressed', String(on));
        const list = td.querySelector<HTMLElement>('.portal-role-years')!; const key = chip.textContent!.replace(/^✓\s*/, '').trim();
        const existing = list.querySelector<HTMLElement>(`[data-role="${CSS.escape(key)}"]`);
        if (on && !existing) {
          const term = () => `<span class="portal-term-pair"><select class="t-caption portal-input portal-select" aria-label="Semester"><option>Fall</option><option>Spring</option></select><input class="t-caption portal-input" inputmode="numeric" placeholder="Year" aria-label="Year" style="max-width:calc(120 * var(--u))" /></span>`;
          const r = document.createElement('div'); r.className = 'portal-inline portal-role-year'; r.dataset.role = key;
          r.innerHTML = `<span class="t-fine portal-tagx" style="flex:none">${key}</span><span class="portal-terms">${term()}</span><button type="button" class="t-label portal-linklike" data-more>+ ANOTHER SEMESTER</button>`;
          r.querySelector('[data-more]')!.addEventListener('click', () => { const t = document.createElement('span'); t.className = 'portal-term-pair'; t.innerHTML = term().replace(/^<span class="portal-term-pair">|<\/span>$/g, ''); r.querySelector('.portal-terms')!.appendChild(t); });
          list.appendChild(r);
        } else if (!on && existing) existing.remove();
      });
      td.querySelector<HTMLElement>('[data-action="save-roles"]')?.addEventListener('click', (e) => { e.preventDefault(); const fb = td.querySelector<HTMLElement>('.portal-feedback'); if (fb) fb.textContent = `Roles for ${btn.dataset.rolesFor} will save once the database is connected.`; });
    });
  }

  // ── contact rows: SAVE wakes up only when the value differs from what was loaded, sleeps again after saving ──
  for (const row of root.querySelectorAll<HTMLElement>('.portal-contact-row')) {
    const input = row.querySelector<HTMLInputElement>('input:not([type="checkbox"])');
    const save = row.querySelector<HTMLButtonElement>('.portal-save-row');
    if (!input || !save) continue;
    let saved = input.value;
    const sync = () => { save.disabled = input.value.trim() === saved.trim(); };
    input.addEventListener('input', sync);
    save.addEventListener('click', () => { saved = input.value; setTimeout(sync, 0); });
    sync();
  }

  // ── action buttons ──
  const flash = (btn: HTMLElement, text: string, fbSel?: string) => {
    const orig = btn.textContent;
    btn.classList.add('is-done'); btn.textContent = text;
    setTimeout(() => { btn.classList.remove('is-done'); btn.textContent = orig; }, 1800);
    // the feedback line may sit beside the button or one level up (input+button live in a .portal-inline row)
    const fb = fbSel ? document.querySelector<HTMLElement>(fbSel)
      : (btn.parentElement?.querySelector<HTMLElement>('.portal-feedback') ?? btn.closest<HTMLElement>('.portal-field, .portal-contact-row, .portal-save, .portal-panel')?.querySelector<HTMLElement>('.portal-feedback') ?? null);
    if (fb) { fb.textContent = btn.dataset.feedback ?? ''; }
  };
  for (const btn of root.querySelectorAll<HTMLElement>('[data-action]')) {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      if ((btn as HTMLButtonElement).disabled) return;
      const a = btn.dataset.action!;
      if (a === 'delete') { if (confirm(`${btn.dataset.confirm ?? 'Delete this?'}`)) btn.closest('tr, li')?.remove(); return; }
      flash(btn, btn.dataset.done ?? 'DONE', btn.dataset.feedbackTarget);
    });
  }
  for (const form of root.querySelectorAll('form')) form.addEventListener('submit', (e) => e.preventDefault());

  // ── profile photo: preview the chosen file in place (the upload itself is backend work) ──
  const photoInput = root.querySelector<HTMLInputElement>('#pf-photo');
  photoInput?.addEventListener('change', () => {
    const f = photoInput.files?.[0]; if (!f) return;
    const url = URL.createObjectURL(f);
    const img = root!.querySelector<HTMLImageElement>('#pf-photo-preview');
    if (img) { img.src = url; img.hidden = false; }
    root!.querySelector<HTMLElement>('.portal-photo .portal-avatar')?.setAttribute('data-has-photo', '1');
    recount();
  });

  // ── profile completion ──
  // Scores only what every alum can answer. Optional fields (data-optional) — e-board roles, BUILD
  // startups, phone, the free-text industries list — never count against you: an empty answer there is
  // the correct answer for most people (Bryan, 2026-09-14: "if they weren't e-board they can't put that").
  // The photo counts, and the note names what is still missing so the number means something.
  function recount() {
    const bar = root!.querySelector<HTMLElement>('.portal-progress i');
    const label = root!.querySelector<HTMLElement>('[data-completion]');
    const note = root!.querySelector<HTMLElement>('[data-completion-note]');
    if (!bar || !label) return;
    const missing: string[] = [];
    let done = 0, total = 0;
    const count = (filled: boolean, name: string) => { total++; if (filled) done++; else missing.push(name); };
    const photo = root!.querySelector<HTMLElement>('.portal-photo .portal-avatar');
    if (photo) count(photo.dataset.hasPhoto === '1', 'photo');
    for (const i of root!.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('.portal-profile .portal-input, .portal-profile .portal-textarea')) {
      // skip: add-boxes, anything inside an optional block (role years live under the optional e-board
      // section), and the semester <select> — a semester+year pair is ONE field, scored by its year input
      if (i.closest('[data-adds], [data-optional], #pf-eboard-years, #pf-grad') || i.hasAttribute('data-optional') || i.classList.contains('portal-select')) continue;
      if (i.closest('#pf-classof')) { const alum = root!.querySelector('[data-field="status"] .portal-chip[aria-pressed="true"]')?.getAttribute('data-value') === 'alum'; if (!alum) continue; }   // students have no class year yet
      count(i.value.trim() !== '', i.dataset.label ?? i.getAttribute('aria-label')?.toLowerCase() ?? 'field');
    }
    for (const g of root!.querySelectorAll<HTMLElement>('.portal-profile .portal-chips[data-field]:not([data-optional])'))
      count(!!g.querySelector('.portal-chip[aria-pressed="true"]'), g.dataset.label ?? g.dataset.field ?? 'field');
    for (const t of root!.querySelectorAll<HTMLElement>('.portal-profile [data-tags]:not([data-optional])'))
      count(!!t.querySelector('.portal-tagx'), t.dataset.label ?? 'tags');
    const pct = total ? Math.round((100 * done) / total) : 0;
    bar.style.width = `${pct}%`; label.textContent = `${pct}% · ${done}/${total} FIELDS`;
    bar.parentElement?.setAttribute('aria-valuenow', String(pct));
    if (note) note.textContent = missing.length ? `Still missing: ${missing.join(', ')}. Startups and phone are optional and don't count; e-board history is set by leadership.` : 'Complete — everything alumni can see about you is filled in.';
  }
  root.querySelectorAll('.portal-profile input, .portal-profile textarea').forEach((i) => i.addEventListener('input', recount));
  recount();
}
init();
document.addEventListener('astro:page-load', init);
