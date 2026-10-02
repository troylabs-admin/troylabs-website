-- Mix-and-match audiences (Bryan, 2026-10-02): a message's audience is any set of group × CURRENT/ALUMNI cells
-- plus optional cohort / industry narrowing, e.g. {"cells":[{"group":"DESIGN","who":"current"},{"group":"DESIGN","who":"alumni"}],
-- "cohort":[],"industries":[]}. Rules live in supabase/functions/_shared/audience.ts (one implementation for the
-- page and the sender). channel_id / filters are no longer written; the channels table stays as the record
-- of the old saved audiences but nothing reads it.
alter table public.messages add column if not exists audience jsonb not null default '{"cells": [], "cohort": [], "industries": []}'::jsonb;
