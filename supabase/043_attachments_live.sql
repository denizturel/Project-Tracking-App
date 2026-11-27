-- Files and voice messages sent in a chat show up live for the others (Deniz, 2026-11-27).
alter publication supabase_realtime add table public.attachments;
