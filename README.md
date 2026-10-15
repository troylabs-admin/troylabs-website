# TroyLabs

The website of [USC TroyLabs](https://usctroylabs.com), a student-run startup accelerator at the University of
Southern California, and the **TL Alumni Network**: a members-only directory where TroyLabs members and alumni find
each other, and where leadership approves new members and sends them event texts.

**Live:** https://usctroylabs.com  ·  `troylabs.vc` redirects there

## What's in here

| Part | Where | What it is |
|---|---|---|
| Public site | `src/pages/` (`index`, `build`, `demo`, `ignite`, `apply`) | The marketing pages: static HTML, built with Astro |
| Legal pages | `src/pages/privacy`, `terms`, `texts` | Privacy Policy, Terms & Conditions, and the TroyLabs Texts program page |
| TL Alumni Network | `src/pages/alumni-portal/` | Sign-in, profiles, member search, the globe, and the admin pages |
| Backend | `supabase/` | Database schema (`migrations/`) and server functions (`functions/`) |
| Tests | `qa/portal/` | Unit tests, offline tests and end-to-end browser tests for the portal |

## Built with

- [Astro](https://astro.build) with Tailwind CSS and TypeScript; a few interactive parts use React
- [Supabase](https://supabase.com): Postgres database with row-level security, magic-link sign-in, and Deno edge functions
- [Twilio](https://www.twilio.com) for texts (A2P 10DLC registered) and [Resend](https://resend.com) for email
- Hosted on [Vercel](https://vercel.com)

## Running it locally

Requires Node 22 (see `.nvmrc`) and pnpm.

```bash
pnpm install
pnpm dev        # http://localhost:4321
pnpm build      # static site in dist/
pnpm preview    # serve the built site
```

The public pages work with no setup. The alumni portal needs a `.env` file with the Supabase project's public
values (ask a TroyLabs admin):

```
PUBLIC_SUPABASE_URL=...
PUBLIC_SUPABASE_KEY=...    # the publishable key: safe in the browser, access is enforced by row-level security
```

Secret keys (Supabase service role, Twilio, Resend, OpenAI, PostHog) are never in this repository. They live only in
Supabase function secrets and Vercel environment variables.

## Project structure

```
src/
  pages/                 one file per route (the portal is under alumni-portal/)
  components/
    sections/<page>/     one component per section of a public page
    portal/              portal pieces (search, globe, footer)
    nav/  ui/  space/    header and footer · buttons · illustrations
  content/               site data: e-board, copy
  lib/                   shared helpers (portal data access, phone numbers, years, audiences)
  scripts/               client-side scripts (portal pages, animation)
  styles/                design tokens, type scale, motion, mobile, portal
public/                  files served as-is (icons, share card, sitemap, the TroyLabs contact card)
supabase/
  migrations/            the database schema, in order
  functions/             edge functions: send-message (texts and email), account-email, linkedin-sync, semantic, posthog-stats
qa/portal/               tests
```

## Editing content

| To change | Edit |
|---|---|
| Executive board | `src/content/board.json`, photos in `src/assets/board/<key>.jpg` (square, 400×400) |
| Where "Apply" links to | `src/lib/links.ts` |
| Section copy | the data at the top of that section's component |
| The DEMO video | `src/assets/demo-stage.mp4`, `demo-stage-mobile.mp4`, captions in `demo-stage.vtt` |
| The link-preview card | `public/og.jpg` (1200×630) |
| Page titles and descriptions | the `<BaseLayout title=… description=…>` line at the top of each page |
| Automatic text wording | `supabase/functions/_shared/sms.ts` |

## Layout notes

Desktop pages are drawn on a fixed 1001-unit design grid scaled to the window by the `--u` CSS variable. Positions
come from the helpers in `src/lib/units.ts`, not hardcoded pixels:

```astro
<div class="abs" style={pos(219, 2234, 567, 567)} />   <!-- x, y, width, height -->
```

Below 768px each section renders a mobile version instead (`src/styles/mobile.css`). Animation runs only when the
visitor hasn't turned on "reduce motion"; the static page is the resting state of every animation.

## Tests

```bash
pnpm test:messages:offline    # message audiences, sending logic with a fake Twilio, the messages page
pnpm test:approvals:offline   # the approvals page with a mocked database
pnpm test:members:offline     # member list pagination
pnpm test:mobile:offline      # the portal on phones
```

The offline suites need no keys and send nothing. The end-to-end tests in `qa/portal/` that sign in to the real
project are run by maintainers only.

## Deployment

Pushing to `main` deploys automatically: Vercel builds the site and serves it at usctroylabs.com. Database changes
(`supabase/migrations/`) and edge functions are deployed to Supabase separately by a maintainer.

### Domains

`usctroylabs.com` is the real address; `troylabs.vc` redirects to it. Both are registered at Name.com. If the
primary domain ever changes, update `site` in `astro.config.mjs` and the URLs in `public/sitemap.xml` and
`public/robots.txt`.

## Contributing

Found a bug or have an idea? Open an issue. Pull requests are welcome; a TroyLabs maintainer reviews every change
before it reaches the live site. Please don't include anyone's personal information (names, emails, phone numbers)
in issues, pull requests or test data. Tests use throwaway `tl-qa-…@example.com` accounts.

---

© 2026 TroyLabs. All rights reserved.
