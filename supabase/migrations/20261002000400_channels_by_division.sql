-- Channels (Bryan, 2026-10-02): one per division plus the e-board, instead of PMs/Tech-only splits and a city.
-- EVERYONE, ALL ALUMNI and ALL STUDENTS stay (ids 1–3). "Alumni in Tech" and the like are one click away
-- under the Message page's filters, so the channel list stays short for whoever is sending.
-- Divisions: BUILD, DEMO, PRODUCT MANAGEMENT, VC/FINANCE, TECH, MARKETING, DESIGN (IGNITE left out for now).
-- E-BOARD = members with an e-board role this semester ({"eboard": "current"}; send-message and the page
-- read eboard_roles for the current term). Channels are rules, so nobody is ever added or removed by hand.
delete from public.channels where name in ('ALUMNI · PMS', 'ALUMNI · TECH', 'STUDENTS · PMS', 'STUDENTS · TECH', 'LA')
  and not exists (select 1 from public.messages m where m.channel_id = channels.id);
insert into public.channels (name, rule, system) values
  ('E-BOARD', '{"eboard": "current"}', true),
  ('BUILD', '{"division": "BUILD"}', true),
  ('DEMO', '{"division": "DEMO"}', true),
  ('PRODUCT MANAGEMENT', '{"division": "PRODUCT MANAGEMENT"}', true),
  ('VC/FINANCE', '{"division": "VC/FINANCE"}', true),
  ('TECH', '{"division": "TECH"}', true),
  ('MARKETING', '{"division": "MARKETING"}', true),
  ('DESIGN', '{"division": "DESIGN"}', true)
on conflict (name) do update set rule = excluded.rule, system = true;
