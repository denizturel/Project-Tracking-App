-- Doneva: indexes that keep the bot limits fast. Safe to run twice. (Already applied.)
create index if not exists messages_sender_time on public.messages (sender_id, created_at);
create index if not exists connections_requester_time on public.connections (requester, created_at);
create index if not exists join_requests_user_time on public.company_join_requests (user_id, created_at);
