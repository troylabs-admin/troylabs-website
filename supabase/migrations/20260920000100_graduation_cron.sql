-- The student → alum switch runs by itself (2026-09-20). Every night at 10:00 UTC (3 am Pacific) the
-- database runs graduate_students(): anyone whose expected graduation semester has ended becomes an alum
-- (spring ends in June, fall in December). Channels are rules, so they move to the alumni channels with
-- no further work. pg_cron lives in the database; nothing outside has to be up for this to happen.
create extension if not exists pg_cron with schema pg_catalog;
select cron.unschedule(jobid) from cron.job where jobname = 'graduate-students';
select cron.schedule('graduate-students', '0 10 * * *', $$select public.graduate_students()$$);
