import { type SpaceInfo } from '@/components/space/space';
import { type SubgroupNode } from '@/lib/workspace';

/**
 * Which rows a tab shows. A project shows everything in it, a group shows its
 * own rows and those of its teams, a team shows only its own.
 */
export function inScope(info: SpaceInfo, subgroups: SubgroupNode[], subgroupId: string | null) {
  if (info.level === 'project') return true;
  if (!info.subgroup) return false;
  if (subgroupId === info.subgroup.id) return true;
  if (info.level !== 'group' || !subgroupId) return false;
  return subgroups.some((s) => s.id === subgroupId && s.parent_id === info.subgroup?.id);
}

/** Name of the group or team a row belongs to, when that is not the page itself. */
export function placeName(info: SpaceInfo, subgroups: SubgroupNode[], subgroupId: string | null) {
  if (subgroupId === (info.subgroup?.id ?? null)) return null;
  if (!subgroupId) return 'Whole project';
  return subgroups.find((s) => s.id === subgroupId)?.name ?? null;
}

type Named = { full_name: string } | null;
export const personName = (value: unknown) => (value as Named)?.full_name ?? 'Someone';
