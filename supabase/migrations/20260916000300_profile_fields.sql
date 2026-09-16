-- Profile fields the page actually has (2026-09-16): a person can be in more than one division, and an
-- access request can be declined without deleting the account (they simply stay outside).
alter table public.profiles drop column if exists division;
alter table public.profiles add column if not exists divisions text[] not null default '{}';
alter table public.profiles add column if not exists declined_at timestamptz;
create index if not exists profiles_pending_idx on public.profiles (approved) where not approved;
