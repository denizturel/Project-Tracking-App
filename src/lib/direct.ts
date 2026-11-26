import { useEffect, useId, useState } from 'react';

import { supabase } from '@/lib/supabase';

/** One private chat in the list, with the other person and the latest message. */
export type DirectChat = {
  conversation_id: string;
  user_id: string;
  full_name: string;
  position: string | null;
  last_body: string | null;
  last_at: string;
  last_mine: boolean | null;
  last_deleted: boolean | null;
  unread: number;
};

/** Someone I share a project with, or have a connection or request with. */
export type MyPerson = {
  user_id: string;
  full_name: string;
  position: string | null;
  company_name: string | null;
  shares_project: boolean;
  connection: 'connected' | 'sent' | 'received' | null;
  connection_id: string | null;
};

/** People I may message: those in my projects and my connections. */
export const canMessage = (person: MyPerson) => person.shares_project || person.connection === 'connected';

/** My private chats, kept up to date while messages arrive. `key` reloads it, e.g. when the page changes. */
export function useDirectChats(key = '') {
  const channelName = `direct-${useId()}`;
  const [chats, setChats] = useState<DirectChat[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let active = true;
    supabase.rpc('my_direct_chats').then((result) => {
      if (!active) return;
      setError(result.error?.message ?? null);
      if (result.data) setChats(result.data as DirectChat[]);
    });
    return () => {
      active = false;
    };
  }, [key, version]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => {
        // A moment later, so an open chat has marked the message as read first.
        clearTimeout(timer);
        timer = setTimeout(() => setVersion((v) => v + 1), 800);
      })
      .subscribe();
    return () => {
      clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [channelName]);

  const list = chats ?? [];
  return {
    chats: list,
    loading: chats === null && error === null,
    error,
    unread: list.reduce((sum, chat) => sum + chat.unread, 0),
    reload: () => setVersion((v) => v + 1),
  };
}

/** Everyone I can message or am connected with. */
export function useMyPeople() {
  const [people, setPeople] = useState<MyPerson[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let active = true;
    supabase.rpc('my_people').then((result) => {
      if (!active) return;
      setError(result.error?.message ?? null);
      if (result.data) setPeople(result.data as MyPerson[]);
    });
    return () => {
      active = false;
    };
  }, [version]);

  return { people: people ?? [], loading: people === null && error === null, error, reload: () => setVersion((v) => v + 1) };
}

/** Finds or creates the private chat with a person. Returns its id, or the reason it cannot be opened. */
export async function startChat(userId: string): Promise<{ id: string | null; error: string | null }> {
  const result = await supabase.rpc('start_direct_chat', { other_user: userId });
  return { id: (result.data as string | null) ?? null, error: result.error?.message ?? null };
}

export const blockPerson = (userId: string) => supabase.from('user_blocks').insert({ blocked: userId });
export const unblockPerson = (userId: string, me: string) =>
  supabase.from('user_blocks').delete().eq('blocker', me).eq('blocked', userId);
export const reportPerson = (userId: string, reason: string, conversationId?: string) =>
  supabase.from('user_reports').insert({ reported: userId, reason: reason.trim(), conversation_id: conversationId ?? null });

export const askToConnect = (userId: string) => supabase.from('connections').insert({ addressee: userId });
export const acceptConnection = (id: string) => supabase.from('connections').update({ status: 'accepted' }).eq('id', id);
/** Declines a request, takes back my own request, or ends a connection. */
export const removeConnection = (id: string) => supabase.from('connections').delete().eq('id', id);
