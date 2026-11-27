import { createContext, type ReactNode, use, useEffect, useMemo, useState } from 'react';

import { type ThemeColor } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { useLiveVersion } from '@/lib/live';
import { supabase } from '@/lib/supabase';

export type UnseenKind = 'chat' | 'tasks' | 'questions';
type Row = { project_id: string; subgroup_id: string | null; kind: UnseenKind; n: number };
export type Counts = Record<UnseenKind, number>;

/** Each kind of news has its own colour in the menu: red for messages, blue for tasks, purple for questions. */
export const UNSEEN_COLOR: Record<UnseenKind, ThemeColor> = { chat: 'danger', tasks: 'skyInk', questions: 'lavenderInk' };
/** The section of a page that clears each kind when it is opened. */
export const TAB_KIND: Record<string, UnseenKind> = { Chat: 'chat', Tasks: 'tasks', 'Questions & solutions': 'questions' };

const none: Counts = { chat: 0, tasks: 0, questions: 0 };
const add = (a: Counts, b: Counts): Counts => ({ chat: a.chat + b.chat, tasks: a.tasks + b.tasks, questions: a.questions + b.questions });
/** The colour of the most pressing kind that has something new, or null. */
export const colorOf = (counts: Counts): ThemeColor | null =>
  counts.chat ? UNSEEN_COLOR.chat : counts.tasks ? UNSEEN_COLOR.tasks : counts.questions ? UNSEEN_COLOR.questions : null;

type Value = {
  /** New things on one page itself: a project's own chat, tasks and questions, or a group's or team's. */
  own: (placeId: string) => Counts;
  /** A project with everything inside it. */
  project: (projectId: string) => Counts;
  /** A group together with its teams. */
  group: (groupId: string, teamIds: string[]) => Counts;
};

const UnseenContext = createContext<Value>({ own: () => none, project: () => none, group: () => none });
export const useUnseen = () => use(UnseenContext);

let refresh: (() => void) | null = null;

/** Called when a chat, the tasks or the questions of a place are on screen: its mark goes away. */
export function markSeen(placeId: string, kind: UnseenKind) {
  supabase.rpc('mark_seen', { place: placeId, what: kind }).then(() => refresh?.());
}

export function UnseenProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user.id;
  const [rows, setRows] = useState<Row[]>([]);
  const [version, setVersion] = useState(0);
  const live = useLiveVersion();

  useEffect(() => {
    if (!userId) return;
    let active = true;
    supabase.rpc('my_unseen').then((result) => {
      if (active && result.data) setRows(result.data as Row[]);
    });
    return () => {
      active = false;
    };
  }, [userId, version, live]);

  useEffect(() => {
    if (!userId) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const again = () => {
      clearTimeout(timer);
      // A moment later, so a page that is open has marked the new thing as seen first.
      timer = setTimeout(() => setVersion((v) => v + 1), 900);
    };
    refresh = again;
    const channel = supabase.channel(`unseen-${userId}`);
    for (const table of ['messages', 'tasks', 'questions']) {
      channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table }, again);
    }
    channel.subscribe();
    return () => {
      refresh = null;
      clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [userId]);

  const value = useMemo<Value>(() => {
    const sum = (list: Row[]) => list.reduce((total, row) => add(total, { ...none, [row.kind]: row.n }), none);
    return {
      own: (placeId) => sum(rows.filter((r) => (r.subgroup_id ?? r.project_id) === placeId)),
      project: (projectId) => sum(rows.filter((r) => r.project_id === projectId)),
      group: (groupId, teamIds) => sum(rows.filter((r) => r.subgroup_id === groupId || teamIds.includes(r.subgroup_id ?? ''))),
    };
  }, [rows]);

  return <UnseenContext value={value}>{children}</UnseenContext>;
}
