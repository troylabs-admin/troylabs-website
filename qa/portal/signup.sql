-- All rows and checks roll back; never creates a real member or sends email.
begin;
do $$
declare student uuid := gen_random_uuid(); alum uuid := gen_random_uuid(); pending uuid := gen_random_uuid();
        prefix text := 'tl-qa-' || gen_random_uuid()::text; p public.profiles;
begin
  insert into public.roster(full_name,usc_email,join_term,join_year,divisions,grad_year,phone,linkedin_url)
    values ('QA Student', prefix || '-student@usc.edu','FA',2025,array['TECH'],extract(year from now())::int + 2,'+13105550101','https://example.com/student'),
           ('QA Alum', prefix || '-alum@usc.edu','SP',2020,array['DESIGN'],2022,null,null);
  insert into auth.users(id,email,raw_user_meta_data) values (student,prefix || '-student@usc.edu','{}'),(alum,prefix || '-alum@usc.edu','{}'),(pending,prefix || '-pending@usc.edu','{}');
  select * into p from public.profiles where id=student;
  if not p.approved or p.status <> 'student' or p.grad_term <> 'SP' or p.join_term <> 'FA' or p.divisions <> array['TECH'] or p.phone <> '+13105550101' or p.full_name <> 'QA Student' then raise exception 'Student roster regression'; end if;
  select * into p from public.profiles where id=alum;
  if not p.approved or p.status <> 'alum' or p.grad_year <> 2022 or p.divisions <> array['DESIGN'] then raise exception 'Alum roster regression'; end if;
  select * into p from public.profiles where id=pending;
  if p.approved or p.status <> 'student' or p.grad_term is not null then raise exception 'Pending signup regression'; end if;
end $$;
select 'PASS: roster prefill, student/alum enum values, unknown-member approval gate' as result;
rollback;
