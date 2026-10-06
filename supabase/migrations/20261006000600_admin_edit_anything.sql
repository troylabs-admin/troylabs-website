-- Admins can change anything on a member's profile (Bryan, 2026-10-06: "let the admin be able to edit anything. That's
-- the whole point of the admin"). The previous version refused an admin's change to someone's emails or email/text
-- consent; now those go through like every other field and are recorded the same way: an 'admin_edit' event in the
-- member's timeline naming the admin and the fields (and, for consent, the texts_on/off and email_on/off events carry
-- the admin as the actor, so the consent record shows who turned it on). Emails are set through the account-email
-- function (it also keeps the sign-in addresses in step); this trigger records direct column changes.
create or replace function public.profiles_admin_edit() returns trigger
language plpgsql security definer set search_path = public as $$
declare who uuid := auth.uid(); changed text[];
begin
  if who is null or who = new.id or not public.is_admin() then return new; end if;
  select array_agg(n.key order by n.key) into changed
    from jsonb_each(to_jsonb(new)) n join jsonb_each(to_jsonb(old)) o using (key)
    where n.value is distinct from o.value
      and n.key in ('full_name', 'status', 'grad_term', 'grad_year', 'join_term', 'join_year', 'divisions', 'linkedin_url',
                    'bio', 'industries', 'startups', 'city_id', 'phone', 'avatar_path', 'usc_email', 'personal_email',
                    'email_opt_in', 'phone_opt_in');
  if changed is not null then
    insert into public.profile_events (profile_id, event, actor, detail) values (new.id, 'admin_edit', who, jsonb_build_object('fields', changed));
  end if;
  return new;
end $$;

-- years that fit together: nobody graduates before they joined (the page also checks the date-dependent ones:
-- a semester that hasn't started, a student graduating in the past, an alum graduating in the future)
alter table public.profiles drop constraint if exists profiles_grad_after_join;
alter table public.profiles add constraint profiles_grad_after_join check (grad_year is null or join_year is null or grad_year >= join_year);
