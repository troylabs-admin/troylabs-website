// Admin › Message delivery (2026-10-02): the send-message function's access rules, who it picks as recipients,
// the email it renders, and that it refuses to send without the Resend key. Temporary accounts; all removed.
import assert from 'node:assert/strict';
import { adminClient, makeUser } from './helpers.mjs';
const admin = adminClient(), users = [], msgs = [];
const FN = 'https://ackmhqxyxnceoarbhcrp.supabase.co/functions/v1/send-message';
const call = async (u, mode, messageId) => { const r = await fetch(FN, { method: 'POST', headers: { Authorization: `Bearer ${u.session.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ mode, messageId }) }); return { status: r.status, body: await r.json() }; };
try {
  const boss = await makeUser(admin, 'Admin QA'); users.push(boss); await admin.from('admins').insert({ user_id: boss.id });
  const alum = await makeUser(admin, 'Alum Tech QA'); users.push(alum);                                    // alum, TECH (helper defaults)
  const student = await makeUser(admin, 'Student Design QA'); users.push(student);
  await admin.from('profiles').update({ status: 'student', grad_year: 2028, divisions: ['DESIGN'] }).eq('id', student.id);
  const optedOut = await makeUser(admin, 'Opted Out QA'); users.push(optedOut); await admin.from('profiles').update({ email_opt_in: false }).eq('id', optedOut.id);
  const pending = await makeUser(admin, 'Pending QA', false); users.push(pending);
  const plain = await makeUser(admin, 'Plain Member QA'); users.push(plain);
  const mine = new Set(users.map((u) => u.email));

  // status
  const st = await call(boss, 'status'); console.log('status:', JSON.stringify(st.body));
  const keyed = st.body.email?.configured === true;
  assert.equal((await call(plain, 'status')).status, 403, 'a non-admin member is refused');

  // audiences
  const allAlumni = (await admin.from('channels').select('id').eq('name', 'ALL ALUMNI').single()).data.id;
  const ins = async (row) => { const { data, error } = await admin.from('messages').insert({ title: 'QA subject', body: 'Hello <b>team</b> & friends\nsecond line <script>alert(1)</script>', ...row }).select().single(); if (error) throw error; msgs.push(data.id); return data.id; };
  const onlyMine = (list) => list.filter((r) => mine.has(r.email)).map((r) => r.name).sort();
  const pAlumni = await call(boss, 'preview', await ins({ channel_id: allAlumni }));
  console.log('ALL ALUMNI →', onlyMine(pAlumni.body.recipients));
  assert.deepEqual(onlyMine(pAlumni.body.recipients), ['Admin QA', 'Alum Tech QA', 'Plain Member QA'], 'channel: alumni only; opted-out and pending excluded');
  const pDesign = await call(boss, 'preview', await ins({ filters: { status: ['STUDENTS'], divisions: ['DESIGN'] } }));
  console.log('STUDENTS + DESIGN →', onlyMine(pDesign.body.recipients));
  assert.deepEqual(onlyMine(pDesign.body.recipients), ['Student Design QA'], 'filters combine');
  const everyone = await call(boss, 'preview', await ins({ filters: {}, event: { name: 'Fall mixer', when: '2026-10-08T19:00', where: 'Founders Lounge', rsvp: 'https://example.com/rsvp' } }));
  assert.ok(!onlyMine(everyone.body.recipients).includes('Opted Out QA') && !onlyMine(everyone.body.recipients).includes('Pending QA'), 'everyone still excludes opted-out and pending');
  // the email: escaped body, line breaks, event block, footer
  const h = everyone.body.html;
  assert.ok(h.includes('Hello &lt;b&gt;team&lt;/b&gt; &amp; friends<br>second line &lt;script&gt;'), 'body escaped, newlines kept');
  assert.ok(!/<script>/i.test(h), 'no live script');
  assert.ok(h.includes('Thursday, October 8') && h.includes('7:00 PM') && h.includes('Founders Lounge') && h.includes('href="https://example.com/rsvp"'), 'event block');
  assert.ok(h.includes('alumni-portal/profile') && /stop these emails/.test(h), 'opt-out footer');
  assert.ok(everyone.body.text.includes('RSVP: https://example.com/rsvp'), 'plain-text version');
  console.log('PASS: recipients (channel, filters, opt-out, pending), escaping, event block, footer, text version');

  // without a key nothing sends (skipped once the key exists: then a real test send goes to the admin's own inbox, which these throwaway example.com accounts can't receive)
  if (!keyed) {
    const t = await call(boss, 'test', msgs[0]); const s = await call(boss, 'send', msgs[0]);
    assert.equal(t.status, 503); assert.equal(s.status, 503);
    assert.equal((await admin.from('messages').select('state').eq('id', msgs[0]).single()).data.state, 'draft', 'still a draft');
    console.log('PASS: refuses to send without the Resend key; message untouched');
  } else console.log('SKIP: no-key checks (the Resend key is set)');
  // the scheduler secret: refused without it
  assert.equal((await fetch(FN, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'due' }) })).status, 403, 'scheduler call refused without the secret');
  console.log('PASS: scheduler endpoint refuses calls without its secret');
} finally {
  for (const id of msgs) await admin.from('messages').delete().eq('id', id);
  for (const u of users.reverse()) await u.cleanup();
  console.log(`Cleaned up ${users.length} temporary accounts and ${msgs.length} messages.`);
}
