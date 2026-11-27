import { supabase } from '@/lib/supabase';

/**
 * One person in a project, or in one group or team of it.
 * `inherited` means they are there because of a status higher up (decided by Deniz):
 * company owners and admins are admins in every project, group and team of the company,
 * project admins are present in every group and team, and a group's managers in its teams.
 */
export type PersonRow = {
  user_id: string;
  role?: 'admin' | 'manager' | 'member';
  subgroup_id?: string;
  inherited?: boolean;
  profile: { full_name: string; position: string | null; company_name: string | null; username?: string | null } | null;
};

type Raw = {
  user_id: string;
  subgroup_id: string | null;
  role: 'admin' | 'manager' | 'member';
  inherited: boolean;
  full_name: string | null;
  position: string | null;
  company_name: string | null;
  username: string | null;
};

export type ProjectPeople = { project: PersonRow[]; placed: PersonRow[]; error: string | null };

/** Everyone in the project and who is in which group or team, including people present through a higher status. */
export async function fetchProjectPeople(projectId: string): Promise<ProjectPeople> {
  const { data, error } = (await supabase.rpc('project_people', { p: projectId })) as {
    data: Raw[] | null;
    error: { message: string } | null;
  };
  const rows = (data ?? []).map(
    (row): PersonRow => ({
      user_id: row.user_id,
      role: row.role,
      subgroup_id: row.subgroup_id ?? undefined,
      inherited: row.inherited,
      profile: row.full_name === null ? null : { full_name: row.full_name, position: row.position, company_name: row.company_name, username: row.username },
    }),
  );
  return {
    project: rows.filter((row) => !row.subgroup_id),
    placed: rows.filter((row) => !!row.subgroup_id),
    error: error?.message ?? null,
  };
}

/** For useRows: the people of the project itself. */
export const projectRows = (projectId: string) => async () => {
  const people = await fetchProjectPeople(projectId);
  return { data: people.project, error: people.error ? { message: people.error } : null };
};

/** For useRows: who is in which group or team. */
export const placedRows = (projectId: string) => async () => {
  const people = await fetchProjectPeople(projectId);
  return { data: people.placed, error: people.error ? { message: people.error } : null };
};
