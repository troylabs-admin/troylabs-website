# Independent review: TL Alumni Network sign-up and approval

You are reviewing the sign-up and approval flow of the **TL Alumni Network Portal**, the members-only part of
usctroylabs.com (USC TroyLabs, a student startup accelerator). It is about to be shared with every past and present
TroyLabs member, and it must work perfectly the first time. Another AI already built and tested it. Your job is
to **independently try to break it**, then report what you find. Do not trust the existing tests or this document's
claims: verify everything yourself.

**Out of scope:** sending email or text messages (Admin › Message delivery). Ignore that area except to note design
problems.

## What it is supposed to do (verify every line)

1. A person gets the link `https://usctroylabs.com/alumni-portal` (locally: `http://localhost:4321/alumni-portal`).
   They type **any email** and press EMAIL ME A LINK. There is no password and no separate sign-up page.
2. Opening the emailed link signs them in. A brand-new account is sent to **/alumni-portal/profile?welcome=1** with
   a "Create your profile" panel. Every other portal page (search, member pages, admin) sends them back there, with
   a sentence explaining why.
3. Required before they can submit: **student or alum** (nothing is pre-selected), **full name**, **graduation year**,
   **the semester they joined TroyLabs**, **at least one division** (BUILD, DEMO, PRODUCT MANAGEMENT, VC/FINANCE,
   TECH, MARKETING, DESIGN; several allowed), and **their city**. The panel lists what is still missing, live.
   Optional: photo, job, company, LinkedIn, bio, industries, phone, a note to leadership, and **e-board roles they
   held** (role + semester + year).
4. The main button says **SUBMIT FOR APPROVAL**. It refuses until everything required is filled in. The server
   also refuses (database function `submit_application`), even if the page is bypassed.
5. After submitting: "Sent. You're on the list." The button becomes SAVE CHANGES. They can keep editing.
   /alumni-portal/home shows **YOU'RE ON THE LIST**. Nothing else in the portal is reachable.
6. **Every submission is copied** into the table `profile_submissions`. It is append-only: nobody can change or
   delete a row (members, admins, or the server's service role). Members cannot read it; admins can.
7. Admins see **only people who pressed SUBMIT**, on Admin › Members › Waiting for approval. Each row shows their
   answers, the e-board roles they listed, their note, and DETAILS. The list supports search, sort, select all,
   bulk APPROVE/DECLINE with UNDO, and 25 people at a time. People who signed in but never submitted appear
   **nowhere** in admin.
8. APPROVE: the person is in the network on their next visit. Their listed e-board roles become their official
   record. DECLINE: they see NOT APPROVED. An admin can restore them from the Declined list.
9. An approved member gets the search page: a question, a globe of everyone by city, a search bar, filters
   (status, cohort, division, industry) and results. Results open member pages, and BACK TO SEARCH returns to
   the same search. Nameless profiles never appear in search.

## How to get accounts without email (use these, do not sign up with real addresses)

The project lives at `/Users/bryanramirez-gonzalez/dev/GitHub/Troylabs_Website`. A dev server should be running on
`http://localhost:4321`; if not, run `pnpm dev`. Then:

```
export SUPABASE_CLI=/Users/bryanramirez-gonzalez/.npm/_npx/aa8e5c70f9d8d161/node_modules/.bin/supabase
node qa/portal/reviewer-accounts.mjs create     # prints a NEW applicant, an ADMIN and a MEMBER, each with a one-time sign-in link
node qa/portal/reviewer-accounts.mjs links      # fresh links for the same accounts (each link works once, ~1 hour)
node qa/portal/reviewer-accounts.mjs cleanup    # deletes them all when you're done — always run this at the end
```

Open each link in its **own** browser profile or private window, so you are the applicant and the admin at the
same time. To test approval again, run cleanup and then create for a fresh applicant.

**Rules:**
- Never touch the real accounts: Bryan (bryanram2024@gmail.com), Charlotte (ctnchang@icloud.com), Stasia (stasiaramirez6@gmail.com) and myyin@usc.edu.
- Never click SEND NOW or SEND A TEST TO ME.
- Don't send sign-in emails to real addresses. The free mail tier allows about 2 per hour, and the real launch
  needs them.
- Clean up everything you create.

## What to do

### A. As two people at once: browser, agentic

Use a real browser. Check at **1440×900 desktop** and at **390×844 phone** (also try 320 wide).

1. **The applicant.** Walk the whole flow. Try to submit with each required answer missing, one at a time.
   Then try:
   - nonsense years (`20x4`, `1800`, next century)
   - a city that doesn't exist
   - a 2,000-character note
   - emoji and HTML/JS in every text field (`<img src=x onerror=alert(1)>`)
   - double-clicking SUBMIT
   - pressing SUBMIT then reloading immediately
   - going offline mid-submit
   - typing before the page finishes loading
   - browser Back and Forward everywhere
   - opening /alumni-portal/admin and /alumni-portal/members/?id=<someone> by URL
   - signing out and back in (a new link)
2. **The admin.** Find the applicant and check the details are exactly what they entered. Then:
   - Approve.
   - UNDO.
   - Decline: check what the applicant sees.
   - Restore and approve again.
   - Check that someone who never submitted is invisible.
   - Bulk-select, search and sort with several applicants (create more with cleanup/create, or ask for more).
3. **After approval.** As the applicant:
   - search for the member account by name, city and division, and check the cards
   - open a member page, then come back
   - edit your own profile
   - check that your listed e-board role shows as recorded
4. **Design.** Screenshot every step at both sizes and look at them carefully. Look for overlaps, cut-off text,
   sideways scrolling, inconsistent spacing or type, unclear wording, dead ends, buttons that do nothing, and
   messages that don't explain what to do.

### B. The code: read it, don't skim

Key files:
- `supabase/migrations/*.sql`: the schema and row-level security. Especially `20260916000100_init.sql` (policies),
  `20261002000600_approval_queue.sql` and `20261005000100_submit_and_backup.sql`.
- `src/scripts/portal-auth.ts` (the gate), `src/scripts/portal-profile.ts`, `src/scripts/portal-members.ts`,
  `src/lib/auth.ts`, `src/lib/portal/application.ts`, `src/lib/portal/data.ts`, `src/components/portal/Network.tsx`,
  `src/pages/alumni-portal/**`.

Questions to answer:
- Can a signed-in user use the public Supabase API directly (URL and publishable key are in `src/lib/supabase.ts`)
  to:
  - approve themselves
  - mark themselves submitted
  - clear a decline
  - read other people's profiles before approval
  - read `profile_submissions`
  - call `approve_members`, `decline_members` or `purge_test_backups`
  - write `eboard_roles`?

  **Try it**, with the reviewer accounts' sessions.
- Are all required fields enforced on the server, not only in the page?
- Is any user-provided text rendered as HTML anywhere without escaping?
- Race conditions:
  - two admins approving and declining the same person
  - a submit during a decline
  - UNDO after the person was changed elsewhere
- Is anything client-only that should be in the database?

### C. Run the existing checks, then judge them

```
pnpm build
node /Users/bryanramirez-gonzalez/.npm/_npx/69f9afb961c37556/node_modules/typescript/bin/tsc -p qa/portal --noEmit
SUPABASE_CLI=… PORTAL_URL=http://localhost:4321 node qa/portal/onboarding.mjs      # the full journey, screenshots in test-results/journey/
SUPABASE_CLI=… PORTAL_URL=http://localhost:4321 node qa/portal/approvals.mjs       # the waiting list with 60 applicants
SUPABASE_CLI=… PORTAL_URL=http://localhost:4321 node qa/portal/admin-pages.mjs
```

Then say what these tests **don't** cover that they should.

Note: Supabase rate-limits sign-ins after about 10 test runs in a few minutes. If you see "rate limit", wait 5 minutes.

## Report

Return a list ordered by severity:
- **Broken:** wrong data, a security hole, a dead end, or a crash.
- **Confusing:** works, but a real person would get stuck or worried.
- **Cosmetic:** looks off.

For each finding give:
- where it is (URL, button, file:line)
- exact steps to reproduce
- what happened, with a screenshot or console output
- what should happen
- whether you **reproduced it twice**

Only report problems you reproduced. Say separately what you checked and found working, so the coverage is
clear. Finish by confirming you ran `reviewer-accounts.mjs cleanup`.
