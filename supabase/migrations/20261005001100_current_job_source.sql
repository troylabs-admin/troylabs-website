-- Whose "current job" is on the card (2026-10-05, Bryan: "if it's different from the one found on LinkedIn"):
-- 'linkedin' = it came from a sync, so the next sync keeps it current; 'manual' = they typed it, so a sync never
-- overwrites it (their profile offers LinkedIn's instead). Null with a job typed = typed before this existed = theirs.
alter table public.profiles add column if not exists current_job_source text check (current_job_source in ('manual', 'linkedin'));
