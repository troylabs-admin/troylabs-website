# Alumni portal audit — 2026-09-28

## Scope and visual direction

Audit of the existing directory/globe, profiles, member pages, admin membership, drafts, statistics. (A members' posts feed was built alongside and then removed on 2026-09-30 to keep the portal simple; its tables were dropped.) Browser verification uses temporary Supabase accounts, real RLS and persisted records. No emails or texts are sent. The website is not deployed by this work.

The previous globe depended on protocol-relative unpkg demo textures. Repeated HTTP failures left it blank locally. HTTPS reproduced the original intended design, revealing bright five-point badges crowding the mobile map and a clipped selection card at 320px.

The replacement keeps the same 3D globe, screen-space city clustering, zoom, drag and filtered directory. A self-hosted Natural Earth basemap uses restrained slate land, visible coastlines/borders, fine graticules and orange outlined counts; singleton markers use the four-point star. No demo CDN requests or pulsing marker glow. Mobile selection cards are contained within the frame. A native city selector provides a keyboard/single-pointer alternative to dragging; the directory remains available if map loading or WebGL fails. Offscreen/background rendering pauses; reduced-motion preferences also apply to fly-to and count/scroll animations.

Basemap: `public/maps/alumni-earth.png`, regenerated with `node qa/portal/build-globe-map.mjs` from the existing world-atlas/Natural Earth data. [Natural Earth data is public domain](https://www.naturalearthdata.com/about/terms-of-use/). Interaction reference: [W3C dragging alternatives](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html).

## Defects addressed

- Blank globe on texture failure; no fallback; clipped narrow-phone selection; unsafe marker label HTML; sample preview hydration mismatch; marker counts going stale when the renderer inserted an element after the React update.
- Directory ignored secondary divisions, omitted members without locations from totals, and silently treated failed reads as empty data. Added browse-all, retry, dynamic cohort options and tab-focus refresh.
- Loaded profile tags could not be removed. New tags were interpolated as HTML. Photo/location updates discarded unrelated form drafts.
- Admin click handlers accumulated after Astro navigation, immediately closing role editors and creating duplicate drafts. Handlers now belong to their page element. Repeated draft saves update the same record; New Draft starts another.
- Role replacement used separate delete/insert requests. Migration `20260928000400_atomic_eboard_roles.sql` replaces them with an admin-checked, security-invoker transaction. Invalid or duplicate roles leave previous history intact; ordinary members and anonymous callers are denied. [Supabase function guidance](https://supabase.com/docs/guides/database/functions).
- CSV import split quoted names incorrectly and populated the legacy `division` column while signup read `divisions`. Quoted CSV now parses correctly and both fields are populated.
- Monthly sent count used only five recent messages; it now uses a separate exact count. Admin titles render as text. Approval/removal failures no longer claim success.
- Personal contact-email updates falsely claimed to change the sign-in address. Copy now describes the actual contact-only behavior. Pending approval no longer promises an email. Unconnected broadcast delivery and channel-editing actions are visibly unavailable.

## Verification

`pnpm test:portal` runs five suites sequentially. Set `PORTAL_URL` for a production preview (default `http://127.0.0.1:4321`) and `SUPABASE_CLI` if the executable is not on PATH. Helpers exchange generated signup tokens without sending email; temporary auth users, posts/replies, roster rows and avatar objects are removed afterward. Never save service keys or session state to files.

- `onboarding.mjs`: the sign-up flow (2026-09-30): a new account from any email is unapproved and sees only itself; it is sent to create its profile; the still-needed list follows the form; SAVE sends it; the waiting screen; the admin's badge, queue card, approve, decline, the declined screen and restore; notes rendered as text; sign-in copy; phone widths.
- `system-audit.mjs`: loaded tag removal, contact persistence, multi-division search, location-free members, approval, leadership roles, CSV export, navigation, draft edit/delete and live analytics rendering.
- `system-edge-cases.mjs`: role transaction rollback and authorization; real avatar upload/reload and cross-account denial; location and unsaved draft preservation; quoted roster import; grant/revoke admin; access removal under RLS; monthly-count and HTML-escaping fixtures; sign-out.
- `globe-interactions.mjs`: 463 people across 20 fixture cities, far-side city navigation, filters retaining an empty selected location, browse-all pagination, zoom/drag/wheel behavior, failed texture and WebGL-disabled fallback, safe labels, empty results and failed directory reads/retry.
- `globe-audit.mjs`: captures and asserts layouts at 1440, 768, 390 and 320px, no horizontal overflow, contained selection cards and reduced motion. Screenshots under `test-results/globe/` are generated evidence, not production members.
- Scoped TypeScript and production build pass. Existing globe bundle-size warning remains.
- All four original Figma fidelity checks pass without changing masks/thresholds: Home 1.22%, BUILD 1.05%, DEMO 0.59%, IGNITE 0.55%. Run with `pnpm exec playwright test --config playwright.config.ts --output /tmp/tl-fidelity-results` to preserve portal captures.

## Still unfinished / outside the verified release

- Email/text broadcast delivery, approval/graduation notifications and channel editing are not connected. Draft persistence and recipient previews do not verify delivery. No real messages were sent during testing.
- Changing an account's actual login email still needs a verified email-change flow. Editing `personal_email` is contact information only.
- Declined and removed people are kept; Admin › Members lists them under Declined with APPROVE and BACK TO WAITING LIST (2026-09-30).
- Actual mailbox receipt, scheduled graduation execution, every external geocoder ambiguity, Safari/iOS hardware rendering and load beyond the 463-person visual fixture were not certified by these desktop-browser checks. Tests do not make the unfinished portal fully launch-ready.
