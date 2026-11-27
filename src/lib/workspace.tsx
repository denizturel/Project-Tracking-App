import { createContext, type ReactNode, use, useCallback, useEffect, useMemo, useState } from 'react';

import { AppState } from 'react-native';

import { useAuth } from '@/lib/auth';
import { somethingChanged, useLiveVersion } from '@/lib/live';
import { type Company, type CompanyRole, type Project, type Subgroup, supabase } from '@/lib/supabase';

export type CompanyNode = Company & { role: CompanyRole; pinned: boolean };
export type ProjectNode = Project & { myRole: 'admin' | 'member' | null; editor: string | null; pinned: boolean };
export type SubgroupNode = Subgroup & { edited_at: string | null; editor: string | null };

type Tree = {
  companies: CompanyNode[];
  projects: ProjectNode[];
  subgroups: SubgroupNode[];
  /** Groups and teams where the signed-in person is that group's or team's own admin. */
  adminSubgroups: string[];
  /** Groups and teams where the person is a manager: admin rights for that one place only. */
  managerSubgroups: string[];
};

type WorkspaceValue = Tree & {
  /** True until the first load has finished. */
  loading: boolean;
  error: string | null;
  reload: () => void;
  /** Pins or unpins a company or project for this person (2 of each at most). Gives back what went wrong, if anything. */
  togglePin: (kind: 'companies' | 'projects', id: string) => Promise<string | null>;
};

/** How many companies, and how many projects, one person can pin to the top (decided by Deniz). */
const MAX_PINS = 2;

const empty: Tree = { companies: [], projects: [], subgroups: [], adminSubgroups: [], managerSubgroups: [] };
const WorkspaceContext = createContext<WorkspaceValue | null>(null);

export function useWorkspace() {
  const value = use(WorkspaceContext);
  if (!value) throw new Error('useWorkspace must be used inside <WorkspaceProvider>');
  return value;
}

type Editor = { full_name: string } | null;
const editorName = (value: unknown) => (value as Editor)?.full_name ?? null;

/** Everything the signed-in person may see: the database rules do the filtering. */
async function fetchTree(userId: string): Promise<{ tree: Tree | null; error: string | null }> {
  const [memberships, projects, roles, subgroups, ownGroups, pins] = await Promise.all([
    supabase.from('company_members').select('role, companies(id, name)').eq('user_id', userId),
    supabase
      .from('projects')
      .select(
        'id, company_id, name, description, restrict_to_subgroups, edited_at, editor:profiles!edited_by(full_name)',
      )
      .order('name'),
    supabase.from('project_members').select('project_id, role').eq('user_id', userId),
    supabase
      .from('subgroups')
      .select(
        'id, project_id, parent_id, name, description, color, edited_at, editor:profiles!edited_by(full_name)',
      )
      .order('name'),
    supabase.from('subgroup_members').select('subgroup_id, role').eq('user_id', userId).in('role', ['admin', 'manager']),
    supabase.from('user_pins').select('companies, projects').eq('user_id', userId).maybeSingle(),
  ]);
  const failed =
    memberships.error ?? projects.error ?? roles.error ?? subgroups.error ?? ownGroups.error;
  if (failed) return { tree: null, error: failed.message };

  const roleOf = new Map((roles.data ?? []).map((r) => [r.project_id as string, r.role as 'admin' | 'member']));

  // Pinned companies and projects come first (2 of each at most, chosen by the person).
  const pinned = (pins.data ?? { companies: [], projects: [] }) as { companies: string[]; projects: string[] };
  const pinnedFirst = <T extends { pinned: boolean }>(list: T[]) => [...list.filter((x) => x.pinned), ...list.filter((x) => !x.pinned)];

  const companies = pinnedFirst(
    (memberships.data ?? []).flatMap((row) => {
      const company = row.companies as unknown as Company | null;
      return company ? [{ ...company, role: row.role as CompanyRole, pinned: pinned.companies.includes(company.id) }] : [];
    }),
  );
  // Company owners and admins manage every project in their company.
  const managed = new Set(companies.filter((c) => c.role === 'owner' || c.role === 'admin').map((c) => c.id));

  return {
    error: null,
    tree: {
      companies,
      adminSubgroups: (ownGroups.data ?? []).filter((row) => row.role === 'admin' || row.role === 'manager').map((row) => row.subgroup_id as string),
      managerSubgroups: (ownGroups.data ?? [])
        .filter((row) => row.role === 'manager')
        .map((row) => row.subgroup_id as string),
      projects: pinnedFirst(
        (projects.data ?? []).map(({ editor, ...p }) => ({
          ...(p as Project),
          myRole: managed.has(p.company_id) ? ('admin' as const) : (roleOf.get(p.id) ?? null),
          editor: editorName(editor),
          pinned: pinned.projects.includes(p.id),
        })),
      ),
      subgroups: (subgroups.data ?? []).map(({ editor, ...s }) => ({
        ...(s as Subgroup & { edited_at: string | null }),
        editor: editorName(editor),
      })),
    },
  };
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user.id;

  const [tree, setTree] = useState<Tree | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  const live = useLiveVersion();

  // Someone added, moved or removed a person, or made or renamed a project, group or team:
  // the database tells every open app, and the menu and lists load again by themselves.
  useEffect(() => {
    if (!userId) return;
    const channel = supabase.channel(`workspace-${userId}`);
    for (const table of ['company_members', 'project_members', 'subgroup_members', 'projects', 'subgroups']) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, somethingChanged);
    }
    channel.subscribe();
    // Coming back to the app (or to its browser tab) also brings everything up to date.
    let away = 0;
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') away = away || Date.now();
      else if (away && Date.now() - away > 5000) somethingChanged();
      if (state === 'active') away = 0;
    });
    return () => {
      sub.remove();
      supabase.removeChannel(channel);
    };
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    fetchTree(userId).then((result) => {
      if (!active) return;
      setError(result.error);
      if (result.tree) setTree(result.tree);
    });
    return () => {
      active = false;
    };
  }, [userId, version, live]);

  const togglePin = useCallback(
    async (kind: 'companies' | 'projects', id: string) => {
      if (!userId || !tree) return null;
      const now = { companies: tree.companies.filter((c) => c.pinned).map((c) => c.id), projects: tree.projects.filter((p) => p.pinned).map((p) => p.id) };
      const has = now[kind].includes(id);
      if (!has && now[kind].length >= MAX_PINS) return kind === 'companies' ? 'You can pin 2 companies at most. Unpin one first.' : 'You can pin 2 projects at most. Unpin one first.';
      const next = { ...now, [kind]: has ? now[kind].filter((x) => x !== id) : [...now[kind], id] };
      const { error: failed } = await supabase.from('user_pins').upsert({ user_id: userId, ...next, updated_at: new Date().toISOString() });
      if (failed) return failed.message;
      reload();
      return null;
    },
    [userId, tree, reload],
  );

  const value = useMemo(
    () => ({ ...(tree ?? empty), loading: tree === null && error === null, error, reload, togglePin }),
    [tree, error, reload, togglePin],
  );

  return <WorkspaceContext value={value}>{children}</WorkspaceContext>;
}

/** Wide screens show the side menu next to the content; phones show it as the home screen. */
export const WIDE_SCREEN = 900;
