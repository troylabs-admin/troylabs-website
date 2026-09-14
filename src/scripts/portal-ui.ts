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

  // ── chips ──
  const summarise = (group: HTMLElement) => {
    const fb = group.parentElement?.querySelector<HTMLElement>(':scope > .portal-feedback') ?? group.nextElementSibling?.classList.contains('portal-feedback') ? (group.nextElementSibling as HTMLElement) : null;
    if (!fb) return;
    const on = [...group.querySelectorAll<HTMLElement>('.portal-chip[aria-pressed="true"]')].map((c) => c.textContent!.replace(/^✓\s*/, '').trim());
    const label = fb.dataset.label ?? 'Selected';
    fb.textContent = on.length ? `${label}: ${on.join(', ')}` : '';
  };
  for (const chip of root.querySelectorAll<HTMLElement>('.portal-chip')) {
    chip.addEventListener('click', () => {
      chip.setAttribute('aria-pressed', String(chip.getAttribute('aria-pressed') !== 'true'));
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

  // ── action buttons ──
  const flash = (btn: HTMLElement, text: string, fbSel?: string) => {
    const orig = btn.textContent;
    btn.classList.add('is-done'); btn.textContent = text;
    setTimeout(() => { btn.classList.remove('is-done'); btn.textContent = orig; }, 1800);
    const fb = fbSel ? document.querySelector<HTMLElement>(fbSel) : btn.parentElement?.querySelector<HTMLElement>('.portal-feedback');
    if (fb) { fb.textContent = btn.dataset.feedback ?? ''; }
  };
  for (const btn of root.querySelectorAll<HTMLElement>('[data-action]')) {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
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
  function recount() {
    const bar = root!.querySelector<HTMLElement>('.portal-progress i');
    const label = root!.querySelector<HTMLElement>('[data-completion]');
    if (!bar || !label) return;
    const inputs = [...root!.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('.portal-profile .portal-input, .portal-profile .portal-textarea')].filter((i) => !i.closest('[data-adds]'));
    const groups = [...root!.querySelectorAll<HTMLElement>('.portal-profile .portal-chips[data-field]')];
    const tags = [...root!.querySelectorAll<HTMLElement>('.portal-profile [data-tags]')];
    const photo = root!.querySelector<HTMLElement>('.portal-photo .portal-avatar');
    const fields = [
      ...(photo ? [photo.dataset.hasPhoto === '1'] : []),   // the photo is a field too
      ...inputs.map((i) => i.value.trim() !== ''),
      ...groups.map((g) => !!g.querySelector('.portal-chip[aria-pressed="true"]')),
      ...tags.map((t) => !!t.querySelector('.portal-tagx')),
    ];
    const done = fields.filter(Boolean).length, total = fields.length;
    const pct = Math.round((100 * done) / total);
    bar.style.width = `${pct}%`; label.textContent = `${pct}% · ${done}/${total} FIELDS`;
    bar.parentElement?.setAttribute('aria-valuenow', String(pct));
  }
  root.querySelectorAll('.portal-profile input, .portal-profile textarea').forEach((i) => i.addEventListener('input', recount));
  recount();
}
init();
document.addEventListener('astro:page-load', init);
