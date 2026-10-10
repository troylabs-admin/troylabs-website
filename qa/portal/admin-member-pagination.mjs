// Actual migration under PostgreSQL RLS, 500 approved real members + hidden tests + pending applicants.
// node qa/portal/admin-member-pagination.mjs (uses the project's installed development dependency)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const db = new PGlite();
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const query = async (sql, values = []) => (await db.query(sql, values)).rows;
try {
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('fixture.uid',true),'')::uuid $$;
    create table cities(id integer primary key,name text,region text,country text,lat float,lng float);
    create table admins(user_id uuid primary key);
    create table profiles(id uuid primary key,full_name text,approved boolean,declined_at timestamptz,status text,grad_term text,grad_year smallint,join_term text,join_year smallint,divisions text[],current_title text,current_company text,linkedin_url text,industries text[],startups text[],city_id integer,usc_email text,personal_email text,phone text,phone_opt_in boolean,email_opt_in boolean,avatar_path text,created_at timestamptz,updated_at timestamptz,submitted_at timestamptz,approved_at timestamptz,last_seen_at timestamptz,is_test boolean not null default false,embedding text,bio text);
    create table eboard_roles(id bigserial primary key,profile_id uuid,role text,term text,year smallint);
    create function public.is_admin() returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from admins where user_id=auth.uid()) $$;
    create function public.viewer_is_test() returns boolean language sql stable security definer set search_path=public as $$ select coalesce((select is_test from profiles where id=auth.uid()),false) $$;
    create function public.profile_visible(pid uuid) returns boolean language sql stable security definer set search_path=public as $$ select pid=auth.uid() or not coalesce((select is_test from profiles where id=pid),false) or viewer_is_test() $$;
    alter table profiles enable row level security;
    create policy profiles_read on profiles for select to authenticated using(id=auth.uid() or public.is_admin() or approved);
    create policy profiles_hide_tests on profiles as restrictive for select to authenticated using(id=auth.uid() or not is_test or public.viewer_is_test());
    alter table admins enable row level security;
    create policy admins_read on admins for select to authenticated using(user_id=auth.uid() or public.is_admin());
    alter table eboard_roles enable row level security;
    create policy roles_read on eboard_roles for select to authenticated using(public.is_admin());
    create policy roles_hide_tests on eboard_roles as restrictive for select to authenticated using(public.profile_visible(profile_id));
    grant usage on schema public,auth to authenticated,anon;
    grant select on profiles,cities,admins,eboard_roles to authenticated;
    insert into cities values(1,'Los Angeles','CA','US',34,-118),(2,'Detroit','MI','US',42,-83),(3,'Hidden Test City','ZZ','US',1,2);
  `);
  const fixture = [];
  for (let n=1;n<=540;n++) {
    const p={id:id(n),full_name:n===490?'Zebra Admin':n===498?'Same Name':n===499?'same name':n===450?"O'Neil Special":`Member ${String(n).padStart(4,'0')}`,approved:n<=530,status:n%2?'alum':'student',join_term:n>500?'SP':n%3?'FA':'SP',join_year:n>500?2077:n%3?2024:2023,divisions:n%5===0?['PRODUCT MANAGEMENT','TECH']:n%2?['TECH']:['BUILD'],current_company:n===450?'100%_Labs\\Ops':`Company ${n}`,city_id:n>500?3:n===475?2:1,personal_email:`person${n}@fixture.org`,usc_email:n===400?'unique-search@usc.edu':null,is_test:n>500&&n<=530};fixture.push(p);
    await query(`insert into profiles(id,full_name,approved,status,join_term,join_year,divisions,current_company,city_id,personal_email,usc_email,is_test,created_at,updated_at,submitted_at,phone,phone_opt_in,email_opt_in,industries,startups,embedding,bio) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,now(),now(),now(),'+12135550123',true,true,array['AI'],array['Acme'],'large secret vector','not needed on member table')`,[p.id,p.full_name,p.approved,p.status,p.join_term,p.join_year,p.divisions,p.current_company,p.city_id,p.personal_email,p.usc_email,p.is_test]);
  }
  await query('insert into admins values($1),($2),($3)',[id(1),id(490),id(501)]);
  await query("insert into eboard_roles(profile_id,role,term,year) values($1,'TECH','FA',2026),($1,'MARKETING','SP',2025),($2,'PRIVATE TEST ROLE','FA',2026)",[id(490),id(501)]);
  await db.exec(readFileSync(new URL('../../supabase/migrations/20261010000100_admin_member_pagination.sql',import.meta.url),'utf8'));
  const asUser = async (who,role='authenticated') => { await db.exec('reset role');await query("select set_config('fixture.uid',$1,false)",[who]);await db.exec(`set role ${role}`); };
  const page = async (o={}) => (await query('select admin_member_page($1,$2,$3,$4,$5,$6) as result',[o.search??'',o.statuses??[],o.cohorts??[],o.divisions??[],o.page??1,o.size??25]))[0].result;
  await asUser(id(1));
  const first=await page();assert.equal(first.total,500);assert.equal(first.page,1);assert.equal(first.page_size,25);assert.equal(first.rows.length,25);
  assert.deepEqual(first.rows.slice(0,2).map(p=>p.id),[id(1),id(490)],'admins appear before alphabetical members regardless of their names');
  assert.deepEqual(first.cohorts,['FA24','SP23'],'cohorts across visible approved members; tests cannot leak metadata');
  const adminRow=first.rows.find(p=>p.id===id(490));assert.equal(adminRow.roles.length,2);assert.equal(adminRow.city.name,'Los Angeles');assert.equal(adminRow.is_admin,true);
  assert.equal('embedding' in first.rows[0],false);assert.equal('bio' in first.rows[0],false);assert.equal('search_text' in first.rows[0],false);
  const all=[];for(let n=1;n<=20;n++)all.push(...(await page({page:n})).rows);
  assert.equal(new Set(all.map(p=>p.id)).size,500,'no duplicates or skipped rows across all pages');
  const expected=fixture.slice(0,500).sort((a,b)=>Number([id(1),id(490)].includes(b.id))-Number([id(1),id(490)].includes(a.id))||(a.full_name.toLowerCase()<b.full_name.toLowerCase()?-1:a.full_name.toLowerCase()>b.full_name.toLowerCase()?1:a.id<b.id?-1:1));
  assert.deepEqual(all.map(p=>p.id),expected.map(p=>p.id),'stable full order including case-insensitive duplicate names and UUID tiebreak');
  assert.equal((await page({page:999})).page,20,'out-of-range page clamps to last page');
  assert.equal((await page({page:-10,size:-3})).page_size,1);assert.equal((await page({size:5000})).rows.length,100);
  assert.equal((await page({search:'not-in-fixture',page:99})).page,1);assert.deepEqual((await page({search:'not-in-fixture'})).rows,[]);
  for(const [search,target] of [['person499@fixture.org',499],['unique-search@usc.edu',400],['Detroit',475],["o'NEIL",450],['%',450],['_',450],['\\',450],['100%_Labs\\Ops',450]]){
    const r=await page({search});assert.equal(r.total,1,`literal search ${search}`);assert.equal(r.rows[0].id,id(target));
  }
  assert.equal((await page({search:"' OR true --"})).total,0,'SQL metacharacters do not broaden search');
  assert.equal((await page({search:'HIDDEN TEST CITY'})).total,0,'search cannot expose hidden tests');
  assert.equal((await page({search:'  person499@fixture.org  '})).total,1);
  assert.equal((await page({search:'Detroit, MI'})).total,1,'formatted city text remains searchable');
  assert.equal((await page({search:'PRODUCT, TECH'})).total,100,'formatted division text remains searchable');
  assert.equal((await page({statuses:['STUDENT']})).total,250);assert.equal((await page({statuses:['student','alum']})).total,500);
  assert.equal((await page({statuses:['unknown']})).total,0,'invalid filters fail closed');
  assert.equal((await page({cohorts:['FA24']})).total,334);
  assert.equal((await page({divisions:['PRODUCT']})).total,100,'UI short division alias');
  assert.equal((await page({divisions:['TECH','BUILD']})).total,500,'OR within dimension');
  const combined=await page({search:'Company',statuses:['student'],cohorts:['FA24'],divisions:['PRODUCT MANAGEMENT']});
  const expectedCombined=fixture.slice(0,500).filter(p=>p.current_company.includes('Company')&&p.status==='student'&&p.join_term==='FA'&&p.divisions.includes('PRODUCT MANAGEMENT'));
  assert.equal(combined.total,expectedCombined.length,'AND between search/filter dimensions');assert.deepEqual(combined.cohorts,['FA24','SP23'],'filter options remain stable across search');
  await asUser(id(2));await assert.rejects(page(),/Admins only/,'ordinary members cannot retrieve admin contacts or counts');
  await asUser('', 'anon');await assert.rejects(page(),/permission denied/,'anonymous RPC execution revoked');
  await asUser(id(501));const testView=await page();assert.equal(testView.total,530,'test admin keeps existing RLS visibility (real + test)');assert.ok(testView.cohorts.includes('SP77'));
  await asUser(id(1));assert.equal((await page({cohorts:['SP77']})).total,0,'returning to real admin never retains test visibility');
  // Removing the last page's member naturally clamps requests; count/page/rows come from one statement snapshot.
  await db.exec('reset role');await query('update profiles set approved=false where id=$1',[all.at(-1).id]);await asUser(id(1));
  const changed=await page({page:20});assert.equal(changed.total,499);assert.equal(changed.rows.length,24);
  await db.exec('reset role');await query('update profiles set approved=false where not is_test');await asUser(id(1));
  const empty=await page({page:99});assert.equal(empty.total,0);assert.equal(empty.page,1);assert.deepEqual(empty.rows,[]);assert.deepEqual(empty.cohorts,[]);
  console.log('PASS: 500-row real PostgreSQL pagination, admins first, unique stable sorting, accurate total/clamped pages, literal special-character search, filter intersections, complete cohorts, lean city/role rows, anon/nonadmin denial and real/test RLS preservation');
} finally { await db.close(); }
