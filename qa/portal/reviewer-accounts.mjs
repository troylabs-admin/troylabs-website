// Throwaway accounts for a human or AI reviewer of the sign-up flow (2026-10-05). No email is sent: each account
// gets a one-time sign-in link that opens the local portal already signed in.
//   node qa/portal/reviewer-accounts.mjs create [baseUrl]   → prints a NEW (blank) applicant, an ADMIN and a MEMBER
//   node qa/portal/reviewer-accounts.mjs links  [baseUrl]   → fresh sign-in links for the accounts already created
//   node qa/portal/reviewer-accounts.mjs cleanup            → deletes every reviewer account and purges their backups
// Needs SUPABASE_CLI (the logged-in Supabase CLI) like the other qa/portal scripts. Accounts are
// tl-qa-review-<role>-<random>@example.com, so they never collide with real people and are easy to remove.
import { adminClient } from './helpers.mjs';

const admin = adminClient();
const [cmd = 'create', base = 'http://localhost:4321'] = process.argv.slice(2);
const mine = async () => ((await admin.auth.admin.listUsers({ perPage: 1000 })).data?.users ?? []).filter((u) => /^tl-qa-review-/.test(u.email ?? ''));
const link = async (email, path = '/alumni-portal/home') => {
  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email, options: { redirectTo: `${base}${path}` } });
  if (error) throw error; return data.properties.action_link;
};

if (cmd === 'create') {
  if ((await mine()).length) { console.log('Reviewer accounts already exist. Run "cleanup" first, or "links" for new sign-in links.'); process.exit(1); }
  const make = async (role) => {
    const email = `tl-qa-review-${role}-${crypto.randomUUID().slice(0, 8)}@example.com`;
    const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true }); if (error) throw error;
    return { id: data.user.id, email };
  };
  const applicant = await make('applicant');   // exactly what a stranger who just opened the link looks like: empty, unapproved
  const boss = await make('admin');
  await admin.from('profiles').update({ full_name: 'Reviewer Admin', status: 'alum', grad_year: 2022, join_term: 'FA', join_year: 2019, divisions: ['TECH'], city_id: 1, approved: true, submitted_at: new Date().toISOString() }).eq('id', boss.id);
  await admin.from('admins').insert({ user_id: boss.id });
  const member = await make('member');
  await admin.from('profiles').update({ full_name: 'Reviewer Member', status: 'student', grad_year: 2027, join_term: 'FA', join_year: 2024, divisions: ['DESIGN'], city_id: 2, approved: true, submitted_at: new Date().toISOString(), current_title: 'Design Intern', current_company: 'Figma' }).eq('id', member.id);
  for (const [label, a] of [['NEW APPLICANT (blank, as if they just opened the sign-up link)', applicant], ['ADMIN', boss], ['MEMBER (approved, not an admin)', member]]) {
    console.log(`\n${label}\n  email: ${a.email}\n  sign-in link (works once, about an hour): ${await link(a.email)}`);
  }
  console.log('\nOpen each link in its own browser profile or private window (each one signs that window in).');
} else if (cmd === 'links') {
  for (const u of await mine()) console.log(`${u.email}\n  ${await link(u.email)}`);
} else if (cmd === 'cleanup') {
  const users = await mine();
  for (const u of users) await admin.auth.admin.deleteUser(u.id);
  const purged = await admin.rpc('purge_test_backups');
  console.log(`Deleted ${users.length} reviewer accounts; purged ${purged.data ?? 0} test backup rows.`);
} else { console.log('usage: create [baseUrl] | links [baseUrl] | cleanup'); process.exit(1); }
