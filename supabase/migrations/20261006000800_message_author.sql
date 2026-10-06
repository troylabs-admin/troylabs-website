-- A message remembers who wrote it (created_by was never filled in): the page's insert now records the signed-in admin.
-- send-message uses it for a scheduled send, to keep test accounts and real members apart (hide_test_accounts).
alter table public.messages alter column created_by set default auth.uid();
