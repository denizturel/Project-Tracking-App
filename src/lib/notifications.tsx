import { createContext, type ReactNode, use, useCallback, useEffect, useMemo, useState } from 'react';

import { useAuth } from '@/lib/auth';
import { useLiveVersion } from '@/lib/live';
import { supabase } from '@/lib/supabase';

export type Notice = {
  id: string;
  kind: string;
  payload: Record<string, string | boolean | null | undefined>;
  read_at: string | null;
  created_at: string;
};

type Value = {
  notices: Notice[];
  unread: number;
  loading: boolean;
  /** Marks one as read. */
  read: (id: string) => void;
  readAll: () => void;
};

const NotificationsContext = createContext<Value | null>(null);

export function useNotifications() {
  const value = use(NotificationsContext);
  if (!value) throw new Error('useNotifications must be used inside <NotificationsProvider>');
  return value;
}

/** Invitations and connections have their own list on the Notifications page. */
export const isInvitation = (notice: Notice) =>
  notice.kind === 'company_invite' || notice.kind === 'company_invite_accepted' || notice.kind === 'connection_request' || notice.kind === 'connection_accepted';

/** Where pressing a notification takes you. */
export function noticeTarget(notice: Notice): { pathname: string; params?: Record<string, string> } {
  const p = notice.payload;
  const id = (value: unknown) => String(value ?? '');
  switch (notice.kind) {
    case 'company_invite':
      // The invitation is answered on the Notifications page; the company cannot be opened before that.
      return { pathname: '/notifications' };
    case 'added_company':
    case 'company_invite_accepted':
      return { pathname: '/company/[id]', params: { id: id(p.company_id) } };
    case 'added_project':
      return { pathname: '/project/[id]', params: { id: id(p.project_id) } };
    case 'added_group':
      return { pathname: '/group/[id]', params: { id: id(p.subgroup_id) } };
    case 'task_assigned':
      return { pathname: '/project/[id]', params: { id: id(p.project_id), tab: 'Tasks' } };
    case 'solution_posted':
    case 'solution_worked':
    case 'solution_did_not_work':
      return { pathname: '/project/[id]', params: { id: id(p.project_id), tab: 'Questions & solutions' } };
    default:
      return { pathname: '/connections' };
  }
}

/** The sentence shown for a notification. */
export function noticeText(notice: Notice): string {
  const by = typeof notice.payload.by_name === 'string' && notice.payload.by_name ? notice.payload.by_name : 'Someone';
  const name = typeof notice.payload.name === 'string' ? notice.payload.name : '';
  switch (notice.kind) {
    case 'company_invite':
      return `${by} invited you to the company ${name}`;
    case 'company_invite_accepted':
      return `${by} accepted your invitation to ${name}`;
    case 'added_company':
      return `${by} added you to the company ${name}`;
    case 'added_project':
      return `${by} added you to the project ${name}`;
    case 'added_group':
      return notice.payload.team ? `${by} added you to the team ${name}` : `${by} added you to the group ${name}`;
    case 'connection_request':
      return `${by} wants to connect with you`;
    case 'connection_accepted':
      return `${by} accepted your connection request`;
    case 'task_assigned':
      return 'A task was given to you';
    case 'solution_posted':
      return 'Someone suggested a solution to your question';
    case 'solution_worked':
      return 'Your solution was marked as working';
    case 'solution_did_not_work':
      return 'Your solution was marked as not working';
    default:
      return 'Something new happened';
  }
}

export const noticeIcon = (kind: string) =>
  kind.startsWith('connection') ? 'user-check' : kind === 'task_assigned' ? 'check-square' : kind.startsWith('solution') ? 'help-circle' : 'user-plus';

/** Keeps the newest notifications and their unread count up to date for the whole app. */
export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user.id;
  const [notices, setNotices] = useState<Notice[] | null>(null);
  const [version, setVersion] = useState(0);
  const live = useLiveVersion();

  useEffect(() => {
    if (!userId) return;
    let active = true;
    supabase
      .from('notifications')
      .select('id, kind, payload, read_at, created_at')
      // Private messages have their own count on Messages.
      .neq('kind', 'direct_message')
      .order('created_at', { ascending: false })
      .limit(60)
      .then((result) => {
        if (active && result.data) setNotices(result.data as Notice[]);
      });
    return () => {
      active = false;
    };
  }, [userId, version, live]);

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`notifications-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, () =>
        setVersion((v) => v + 1),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  const read = useCallback((id: string) => {
    const now = new Date().toISOString();
    setNotices((list) => list?.map((n) => (n.id === id && !n.read_at ? { ...n, read_at: now } : n)) ?? null);
    supabase.from('notifications').update({ read_at: now }).eq('id', id).is('read_at', null).then(() => {});
  }, []);

  const readAll = useCallback(() => {
    const now = new Date().toISOString();
    setNotices((list) => list?.map((n) => (n.read_at ? n : { ...n, read_at: now })) ?? null);
    supabase.from('notifications').update({ read_at: now }).is('read_at', null).neq('kind', 'direct_message').then(() => {});
  }, []);

  const value = useMemo(() => {
    const list = notices ?? [];
    return { notices: list, unread: list.filter((n) => !n.read_at).length, loading: notices === null, read, readAll };
  }, [notices, read, readAll]);

  return <NotificationsContext value={value}>{children}</NotificationsContext>;
}
