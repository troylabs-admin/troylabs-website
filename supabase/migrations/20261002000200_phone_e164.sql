-- Texts (2026-10-02): phone numbers are stored in E.164 (+13105550101), the only format texting providers
-- accept. The profile page normalises what members type (src/lib/portal/phone.ts); this keeps anything else
-- out of the table. Texts go only to members who ticked "Text me TroyLabs event invitations", and that box
-- means nothing without a number.
update public.profiles set phone = null where phone is not null and btrim(phone) = '';
alter table public.profiles
  add constraint profiles_phone_e164 check (phone is null or phone ~ '^\+[1-9][0-9]{7,14}$'),
  add constraint profiles_texts_need_phone check (not phone_opt_in or phone is not null);

-- the number a text went to, kept with the delivery record like the email address is
alter table public.message_recipients add column if not exists phone text;
