import { createContext, type ReactNode, use, useCallback, useEffect, useMemo, useState } from 'react';

import { useAuth } from '@/lib/auth';
import { type Company, type CompanyRole, type Project, type Subgroup, supabase } from '@/lib/supabase';

export type CompanyNode = Company & { role: CompanyRole };
export type ProjectNode = Project & { myRole: 'admin' | 'member' | null; editor: string | null };
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
};

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
  const [memberships, projects, roles, subgroups, ownGroups] = await Promise.all([
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
  ]);
  const failed =
    memberships.error ?? projects.error ?? roles.error ?? subgroups.error ?? ownGroups.error;
  if (failed) return { tree: null, error: failed.message };

  const roleOf = new Map((roles.data ?? []).map((r) => [r.project_id as string, r.role as 'admin' | 'member']));

  const companies = (memberships.data ?? []).flatMap((row) => {
    const company = row.companies as unknown as Company | null;
    return company ? [{ ...company, role: row.role as CompanyRole }] : [];
  });
  // Company owners and admins manage every project in their company.
  const managed = new Set(companies.filter((c) => c.role === 'owner' || c.role === 'admin').map((c) => c.id));

  return {
    error: null,
    tree: {
      companies,
      adminSubgroups: (ownGroups.data ?? []).filter((row) => row.role === 'admin').map((row) => row.subgroup_id as string),
      managerSubgroups: (ownGroups.data ?? [])
        .filter((row) => row.role === 'manager')
        .map((row) => row.subgroup_id as string),
      projects: (projects.data ?? []).map(({ editor, ...p }) => ({
        ...(p as Project),
        myRole: managed.has(p.company_id) ? 'admin' : (roleOf.get(p.id) ?? null),
        editor: editorName(editor),
      })),
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
  }, [userId, version]);

  const value = useMemo(
    () => ({ ...(tree ?? empty), loading: tree === null && error === null, error, reload }),
    [tree, error, reload],
  );

  return <WorkspaceContext value={value}>{children}</WorkspaceContext>;
}

/** Wide screens show the side menu next to the content; phones show it as the home screen. */
export const WIDE_SCREEN = 900;
