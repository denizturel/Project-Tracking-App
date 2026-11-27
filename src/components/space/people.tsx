import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, Share, StyleSheet, Switch, View } from 'react-native';

import { PersonActions } from '@/components/person-actions';
import { QrCode } from '@/components/qr-code';
import { type SpaceInfo } from '@/components/space/space';
import { ThemedText } from '@/components/themed-text';
import { Avatar, Button, Card, Chip, Choices, ErrorText, Field, Icon, IconButton, TextButton } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { jobText } from '@/lib/i18n';
import { useLiveVersion } from '@/lib/live';
import { appLink, shareLink } from '@/lib/join-link';
import { supabase } from '@/lib/supabase';
import { useRows } from '@/lib/use-rows';
import { type SubgroupNode, useWorkspace } from '@/lib/workspace';

type Person = {
  user_id: string;
  role?: 'admin' | 'manager' | 'member';
  subgroup_id?: string;
  profile: { full_name: string; position: string | null; company_name: string | null; username?: string | null } | null;
};

type Invitation = { id: string; email: string; token: string; project_role: 'admin' | 'member' };

type Loaded = {
  /** Everyone in the project. */
  project: Person[];
  /** Who is in which group or team of the project. */
  placed: Person[];
  invitations: Invitation[];
  error: string | null;
};

const PROFILE = 'profile:profiles!user_id(full_name, position, company_name, username)';

async function fetchPeople(info: SpaceInfo, subgroupIds: string[]): Promise<Loaded> {
  const [project, placed, invitations] = await Promise.all([
    supabase.from('project_members').select(`user_id, role, ${PROFILE}`).eq('project_id', info.project.id),
    subgroupIds.length
      ? supabase.from('subgroup_members').select(`user_id, subgroup_id, role, ${PROFILE}`).in('subgroup_id', subgroupIds)
      : null,
    info.isAdmin && !info.subgroup
      ? supabase
          .from('invitations')
          .select('id, email, token, project_role')
          .eq('project_id', info.project.id)
          .is('accepted_at', null)
          .order('email')
      : null,
  ]);
  const byName = (a: Person, b: Person) =>
    (a.profile?.full_name ?? '').localeCompare(b.profile?.full_name ?? '');
  return {
    project: ((project.data ?? []) as unknown as Person[]).sort(byName),
    placed: ((placed?.data ?? []) as unknown as Person[]).sort(byName),
    invitations: (invitations?.data ?? []) as Invitation[],
    error: (project.error ?? placed?.error ?? invitations?.error)?.message ?? null,
  };
}

type Result = { error: { message: string } | null };
type Status = 'admin' | 'manager' | 'member';

const STATUS_LABEL: Record<Status, string> = { admin: 'Admin', manager: 'Manager', member: 'Staff' };
const STATUS_HINT: Record<Status, string> = {
  admin: 'Manages every group, team and person in the project.',
  manager: 'Manages one group, the teams inside it and their staff.',
  member: 'Sees their own team and their group, not other teams.',
};
const STATUSES = (['admin', 'manager', 'member'] as const).map((value) => ({ value, label: STATUS_LABEL[value] }));
const leads = (role: string | undefined) => role === 'admin' || role === 'manager';

/**
 * One simple list of who is here. Clicking a person opens their profile card.
 * Each person has one status: Admin (whole project), Manager (of a group) or Staff.
 */
export function People({ info }: { info: SpaceInfo }) {
  const theme = useTheme();
  const { session } = useAuth();
  const me = session?.user.id;
  const { subgroups, reload } = useWorkspace();
  const { project, subgroup, isAdmin, isProjectAdmin } = info;

  const all = subgroups.filter((s) => s.project_id === project.id);
  const groups = all.filter((s) => !s.parent_id);
  const kids = (id: string) => all.filter((s) => s.parent_id === id);
  const idsKey = all.map((s) => s.id).join(',');
  // The places this page covers: the whole project, a group with its teams, or one team.
  const scope = subgroup ? [subgroup, ...kids(subgroup.id)] : groups.flatMap((group) => [group, ...kids(group.id)]);

  const [data, setData] = useState<Loaded | null>(null);
  const [version, setVersion] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [inviting, setInviting] = useState(false);
  const refresh = () => setVersion((v) => v + 1);
  const live = useLiveVersion();

  useEffect(() => {
    let active = true;
    fetchPeople(info, idsKey ? idsKey.split(',') : []).then((result) => {
      if (active) setData(result);
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [info.project.id, info.isAdmin, idsKey, version, live]);

  /** Runs the steps one after another and stops at the first that fails. */
  const run = async (...steps: (() => PromiseLike<Result>)[]) => {
    let failed: string | null = null;
    for (const step of steps) {
      const { error: stepError } = await step();
      if (stepError) {
        failed = stepError.message;
        break;
      }
    }
    setError(failed);
    refresh();
    reload();
  };

  if (!data) return <ActivityIndicator color={theme.primary} size="large" />;

  const projectRole = new Map(data.project.map((p) => [p.user_id, p.role]));
  const placedOf = (userId: string) => data.placed.filter((p) => p.user_id === userId);
  const inScope = (userId: string) => placedOf(userId).filter((p) => scope.some((s) => s.id === p.subgroup_id));
  const people = subgroup ? data.project.filter((p) => inScope(p.user_id).length > 0) : data.project;
  const nameOf = (id: string | undefined) => all.find((s) => s.id === id)?.name ?? '';
  /** The groups this person manages. */
  const managedBy = (userId: string) =>
    groups.filter((group) => placedOf(userId).some((p) => p.subgroup_id === group.id && leads(p.role)));
  const statusOf = (userId: string): Status =>
    projectRole.get(userId) === 'admin' ? 'admin' : managedBy(userId).length ? 'manager' : 'member';

  const open = people.find((p) => p.user_id === openId) ?? null;

  const setProjectRole = (userId: string, role: 'admin' | 'member') => () =>
    supabase.from('project_members').update({ role }).eq('project_id', project.id).eq('user_id', userId);
  const setPlaceRole = (userId: string, placeId: string, role: 'manager' | 'member') => () =>
    supabase.from('subgroup_members').upsert({ subgroup_id: placeId, user_id: userId, role }, { onConflict: 'subgroup_id,user_id' });
  /** Takes the Manager status away everywhere in this project. */
  const noLongerManager = (userId: string, except?: string) =>
    placedOf(userId)
      .filter((p) => leads(p.role) && p.subgroup_id !== except)
      .map((p) => setPlaceRole(userId, p.subgroup_id as string, 'member'));

  return (
    <>
      <ErrorText>{error ?? data.error}</ErrorText>
      <Card style={{ gap: 10 }}>
        <View style={styles.between}>
          <ThemedText type="heading" style={styles.grow} numberOfLines={2}>
            {subgroup ? subgroup.name : 'Everyone in this project'}
          </ThemedText>
          <Chip text={`${people.length} ${people.length === 1 ? 'person' : 'people'}`} tone="accent" />
        </View>
        <ThemedText type="small" themeColor="textSecondary">
          {isProjectAdmin
            ? 'Click a person to see their card, change their status or their groups.'
            : isAdmin
              ? 'Click a person to see their card or change their teams.'
              : 'Click a person to see their card.'}
        </ThemedText>

        {subgroup && isAdmin && (
          <Button title="Add people" icon="plus" variant="secondary" small onPress={() => setAdding(!adding)} />
        )}
        {adding && subgroup && (
          <View style={[styles.addBox, { backgroundColor: theme.background, borderColor: theme.border }]}>
            <AddToPlace
              companyId={project.company_id}
              here={data.placed.filter((p) => p.subgroup_id === subgroup.id).map((p) => p.user_id)}
              inProject={data.project.map((p) => p.user_id)}
              onAdd={(userId) => run(() => supabase.rpc('add_to_place', { place: subgroup.id, person: userId }))}
            />
          </View>
        )}

        {people.length === 0 && (
          <ThemedText type="small" themeColor="textSecondary">
            Nobody here yet.
          </ThemedText>
        )}
        <View>
          {people.map((person, index) => {
            const status = statusOf(person.user_id);
            const where = inScope(person.user_id).map((p) => nameOf(p.subgroup_id));
            return (
              <Pressable
                key={person.user_id}
                accessibilityRole="button"
                accessibilityLabel={`Open the card of ${person.profile?.full_name}`}
                onPress={() => setOpenId(person.user_id)}
                style={({ pressed }) => [
                  styles.row,
                  index > 0 && { borderTopWidth: 1, borderTopColor: theme.border },
                  { opacity: pressed ? 0.6 : 1 },
                ]}>
                <Avatar name={person.profile?.full_name} size={40} />
                <View style={styles.grow}>
                  <ThemedText type="bold" numberOfLines={1}>
                    {person.profile?.full_name ?? 'Unknown'}
                    {person.user_id === me && <ThemedText themeColor="textSecondary"> (you)</ThemedText>}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                    {scope.length > 1 && where.length > 0
                      ? where.join(', ')
                      : [person.profile?.position, person.profile?.company_name].filter(Boolean).join(' · ')}
                  </ThemedText>
                </View>
                <Chip text={STATUS_LABEL[status]} tone={status === 'member' ? 'plain' : status === 'admin' ? 'accent' : 'lavender'} />
                <Icon name="chevron-right" size={18} color="textSecondary" />
              </Pressable>
            );
          })}
        </View>
      </Card>

      {!subgroup && isProjectAdmin && (
        <>
          <Button
            title={inviting ? 'Hide' : `Invite someone${data.invitations.length ? ` (${data.invitations.length} waiting)` : ''}`}
            icon="user-plus"
            variant="secondary"
            onPress={() => setInviting(!inviting)}
          />
          {inviting && <AddFromCompany info={info} inProject={data.project.map((p) => p.user_id)} onAdd={(userId) => run(() => supabase.from('project_members').insert({ project_id: project.id, user_id: userId }))} />}
          {inviting && <InviteLink info={info} />}
          {inviting && (
            <Invite
              info={info}
              invitations={data.invitations}
              onChanged={refresh}
              onRemove={(id) => run(() => supabase.from('invitations').delete().eq('id', id))}
            />
          )}
        </>
      )}

      {open && (
        <ProfileCard
          person={open}
          isMe={open.user_id === me}
          onClose={() => setOpenId(null)}
          status={statusOf(open.user_id)}
          manages={managedBy(open.user_id).map((g) => g.name)}
          canChangeStatus={isProjectAdmin && open.user_id !== me}
          groups={groups.map((g) => ({ id: g.id, name: g.name }))}
          onStatus={(status, groupId) => {
            const id = open.user_id;
            if (status === 'admin') return run(setProjectRole(id, 'admin'), ...noLongerManager(id));
            if (status === 'manager' && groupId)
              return run(setProjectRole(id, 'member'), ...noLongerManager(id, groupId), setPlaceRole(id, groupId, 'manager'));
            return run(setProjectRole(id, 'member'), ...noLongerManager(id));
          }}
          onRemoveFromProject={
            isProjectAdmin && open.user_id !== me && !subgroup
              ? () => {
                  setOpenId(null);
                  return run(() => supabase.from('project_members').delete().eq('project_id', project.id).eq('user_id', open.user_id));
                }
              : null
          }
          places={placedOf(open.user_id)
            .filter((p) => all.some((s) => s.id === p.subgroup_id))
            .map((placed) => {
              const item = all.find((s) => s.id === placed.subgroup_id) as SubgroupNode;
              const mine = scope.some((s) => s.id === item.id);
              return {
                id: item.id,
                name: item.parent_id ? `${nameOf(item.parent_id)} · ${item.name}` : item.name,
                // Shown only where it is the person's status: a manager of a group.
                manager: leads(placed.role) && !item.parent_id && projectRole.get(open.user_id) !== 'admin',
                word: item.parent_id ? 'team' : 'group',
                // Managers take staff out of their own group and teams; anyone can leave.
                canRemove: open.user_id === me || isProjectAdmin || (isAdmin && mine && !leads(placed.role)),
                onRemove: () =>
                  run(() => supabase.from('subgroup_members').delete().eq('subgroup_id', item.id).eq('user_id', open.user_id)),
              };
            })}
          canAddTo={(isAdmin ? scope : [])
            .filter((item) => !placedOf(open.user_id).some((p) => p.subgroup_id === item.id))
            .map((item) => ({
              id: item.id,
              name: item.parent_id ? `${nameOf(item.parent_id)} · ${item.name}` : item.name,
              onAdd: () => run(() => supabase.rpc('add_to_place', { place: item.id, person: open.user_id })),
            }))}
        />
      )}
    </>
  );
}

type ProfileCardProps = {
  person: Person;
  isMe: boolean;
  onClose: () => void;
  status: Status;
  /** Names of the groups this person manages. */
  manages: string[];
  canChangeStatus: boolean;
  groups: { id: string; name: string }[];
  onStatus: (status: Status, groupId?: string) => void;
  onRemoveFromProject: (() => void) | null;
  places: { id: string; name: string; manager: boolean; word: string; canRemove: boolean; onRemove: () => void }[];
  canAddTo: { id: string; name: string; onAdd: () => void }[];
};

/** The small card of one person: name, role (their job) and status. Pressing the status shows the other options. */
function ProfileCard(props: ProfileCardProps) {
  const { person, isMe, onClose, status, manages, canChangeStatus, groups, onStatus, onRemoveFromProject, places, canAddTo } = props;
  const theme = useTheme();
  const [changing, setChanging] = useState(false);
  const [pickGroup, setPickGroup] = useState(false);
  const [adding, setAdding] = useState(false);
  // Leaving or removing takes two presses, so a slip does nothing.
  const [confirming, setConfirming] = useState<string | null>(null);
  const job = jobText(person.profile?.position, person.profile?.company_name);
  const statusText = status === 'manager' ? `Manager of ${manages.join(', ')}` : STATUS_LABEL[status];

  const choose = (next: Status) => {
    if (next === 'manager') {
      if (groups.length === 1) {
        setChanging(false);
        onStatus('manager', groups[0].id);
      } else setPickGroup(true);
      return;
    }
    setChanging(false);
    setPickGroup(false);
    if (next !== status) onStatus(next);
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable accessibilityLabel="Close card" style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.profileCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={styles.closeCorner}>
            <IconButton icon="x" label="Close" onPress={onClose} />
          </View>
          <View style={styles.cardTop}>
            <Avatar name={person.profile?.full_name} size={72} />
            <ThemedText type="subtitle" style={styles.center}>
              {person.profile?.full_name ?? 'Unknown'}
              {isMe && <ThemedText themeColor="textSecondary"> (you)</ThemedText>}
            </ThemedText>
            {!!person.profile?.username && (
              <ThemedText type="small" themeColor="textSecondary" raw selectable>
                @{person.profile.username}
              </ThemedText>
            )}
          </View>

          <View style={styles.cardLine}>
            <ThemedText type="label">Role</ThemedText>
            <ThemedText>{job || 'Not filled in'}</ThemedText>
          </View>

          {!isMe && <PersonActions userId={person.user_id} onLeave={onClose} />}

          <View style={styles.cardLine}>
            <ThemedText type="label">Status</ThemedText>
            {canChangeStatus ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Change status"
                onPress={() => {
                  setChanging(!changing);
                  setPickGroup(false);
                }}
                style={({ pressed }) => [styles.statusButton, { backgroundColor: theme.backgroundElement, opacity: pressed ? 0.6 : 1 }]}>
                <ThemedText type="smallBold" style={styles.shrink}>
                  {statusText}
                </ThemedText>
                <Icon name={changing ? 'chevron-up' : 'chevron-down'} size={16} />
              </Pressable>
            ) : (
              <View style={styles.start}>
                <Chip text={statusText} tone={status === 'member' ? 'plain' : status === 'admin' ? 'accent' : 'lavender'} />
              </View>
            )}
            {!changing && (
              <ThemedText type="small" themeColor="textSecondary">
                {STATUS_HINT[status]}
              </ThemedText>
            )}
            {changing && (
              <View style={[styles.options, { backgroundColor: theme.background, borderColor: theme.border }]}>
                <Choices
                  options={groups.length ? STATUSES : STATUSES.filter((s) => s.value !== 'manager')}
                  value={pickGroup ? 'manager' : status}
                  onChange={choose}
                />
                {pickGroup && (
                  <>
                    <ThemedText type="small" themeColor="textSecondary">
                      Manager of which group?
                    </ThemedText>
                    <View style={styles.addChips}>
                      {groups.map((group) => (
                        <Button
                          key={group.id}
                          title={group.name}
                          small
                          variant="secondary"
                          onPress={() => {
                            setChanging(false);
                            setPickGroup(false);
                            onStatus('manager', group.id);
                          }}
                        />
                      ))}
                    </View>
                  </>
                )}
                {onRemoveFromProject && <TextButton title="Remove from the project" danger onPress={onRemoveFromProject} />}
              </View>
            )}
          </View>

          <View style={styles.cardLine}>
            <ThemedText type="label">Groups and teams</ThemedText>
            {places.length === 0 && <ThemedText themeColor="textSecondary">Not in any group yet.</ThemedText>}
            {places.map((place) => (
              <View key={place.id} style={styles.between}>
                <ThemedText style={styles.grow} numberOfLines={2}>
                  {place.name}
                  {place.manager && <ThemedText themeColor="textSecondary"> · Manager</ThemedText>}
                </ThemedText>
                {place.canRemove && (
                  <TextButton
                    title={confirming === place.id ? (isMe ? 'Yes, leave' : 'Yes, remove') : isMe ? 'Leave' : 'Remove'}
                    danger
                    onPress={() => {
                      if (confirming !== place.id) return setConfirming(place.id);
                      setConfirming(null);
                      place.onRemove();
                    }}
                  />
                )}
              </View>
            ))}
            {canAddTo.length > 0 && (
              <>
                <TextButton title={adding ? 'Hide' : 'Add to a group or team'} onPress={() => setAdding(!adding)} />
                {adding && (
                  <View style={styles.addChips}>
                    {canAddTo.map((item) => (
                      <Button key={item.id} title={item.name} icon="plus" small variant="secondary" onPress={item.onAdd} />
                    ))}
                  </View>
                )}
              </>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1, minWidth: 0 },
  shrink: { flexShrink: 1 },
  start: { alignItems: 'flex-start' },
  center: { textAlign: 'center' },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  person: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  addBox: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 10 },
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.three,
    backgroundColor: 'rgba(60, 40, 30, 0.35)',
  },
  profileCard: { width: '100%', maxWidth: 400, borderRadius: 22, borderWidth: 1, padding: Spacing.four, gap: Spacing.three },
  closeCorner: { position: 'absolute', top: 10, right: 10, zIndex: 1 },
  cardTop: { alignItems: 'center', gap: 10 },
  cardLine: { gap: 8 },
  statusButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 999,
  },
  options: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 8 },
  addChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});

type Colleague = { user_id: string; profile: { full_name: string; position: string | null } | null };

/**
 * Everyone in the company who is not in this group or team yet, added with one press.
 * A person who was not in the project joins it as staff at the same time.
 */
function AddToPlace(props: { companyId: string; here: string[]; inProject: string[]; onAdd: (userId: string) => void }) {
  const { rows, error, loading } = useRows<Colleague>(props.companyId, () =>
    supabase
      .from('company_members')
      .select('user_id, profile:profiles!user_id(full_name, position)')
      .eq('company_id', props.companyId)
      .returns<Colleague[]>(),
  );
  const waiting = rows
    .filter((person) => !props.here.includes(person.user_id))
    .sort((a, b) => (a.profile?.full_name ?? '').localeCompare(b.profile?.full_name ?? ''));

  return (
    <>
      <ErrorText>{error}</ErrorText>
      {!loading && waiting.length === 0 && (
        <ThemedText type="small" themeColor="textSecondary">
          Everyone in the company is already here. New people are added on the company&apos;s page.
        </ThemedText>
      )}
      {waiting.map((person) => (
        <View key={person.user_id} style={styles.person}>
          <Avatar name={person.profile?.full_name} size={30} />
          <View style={styles.grow}>
            <ThemedText raw numberOfLines={1}>
              {person.profile?.full_name ?? ''}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
              {props.inProject.includes(person.user_id) ? 'In this project' : 'In the company, joins this project too'}
            </ThemedText>
          </View>
          <Button title="Add" small variant="secondary" onPress={() => props.onAdd(person.user_id)} />
        </View>
      ))}
    </>
  );
}

/** People who are already in the company space are added with one press, no code needed. */
function AddFromCompany(props: { info: SpaceInfo; inProject: string[]; onAdd: (userId: string) => void }) {
  const { project } = props.info;
  const { rows, error } = useRows<Colleague>(project.company_id, () =>
    supabase
      .from('company_members')
      .select('user_id, profile:profiles!user_id(full_name, position)')
      .eq('company_id', project.company_id)
      .returns<Colleague[]>(),
  );
  const waiting = rows
    .filter((person) => !props.inProject.includes(person.user_id))
    .sort((a, b) => (a.profile?.full_name ?? '').localeCompare(b.profile?.full_name ?? ''));

  return (
    <Card tint="mint">
      <ThemedText type="bold">Add people from the company</ThemedText>
      <ErrorText>{error}</ErrorText>
      {waiting.length === 0 && (
        <ThemedText type="small" themeColor="textSecondary">
          Everyone in the company space is already in this project.
        </ThemedText>
      )}
      {waiting.map((person) => (
        <View key={person.user_id} style={styles.person}>
          <Avatar name={person.profile?.full_name} size={30} />
          <View style={styles.grow}>
            <ThemedText raw numberOfLines={1}>
              {person.profile?.full_name ?? ''}
            </ThemedText>
            {!!person.profile?.position && (
              <ThemedText type="small" themeColor="textSecondary" raw numberOfLines={1}>
                {person.profile.position}
              </ThemedText>
            )}
          </View>
          <Button title="Add" small variant="secondary" onPress={() => props.onAdd(person.user_id)} />
        </View>
      ))}
    </Card>
  );
}

type ProjectLink = { token: string; enabled: boolean };

/** One invite link per project, also shown as a QR code. Whoever opens it joins the project as staff. */
function InviteLink({ info }: { info: SpaceInfo }) {
  const theme = useTheme();
  const projectId = info.project.id;
  const [failed, setFailed] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const { rows, loading, error, reload } = useRows<ProjectLink>(projectId, () =>
    supabase.from('project_links').select('token, enabled').eq('project_id', projectId).returns<ProjectLink[]>(),
  );
  const link = rows[0] ?? null;

  /** Turns the link on or off, or makes a new one so the old link and QR code stop working. */
  async function save(change: { enabled?: boolean; token?: string }) {
    const result = await supabase
      .from('project_links')
      .upsert({ project_id: projectId, ...change }, { onConflict: 'project_id' });
    setFailed(result.error?.message ?? null);
    setCopied(false);
    reload();
  }

  async function share(text: string) {
    if (Platform.OS === 'web') {
      await navigator.clipboard?.writeText(text).catch(() => {});
      setCopied(true);
    } else {
      await Share.share({ message: text }).catch(() => {});
    }
  }

  const on = !!link?.enabled;
  const newToken = () =>
    'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => Math.floor(Math.random() * 16).toString(16));

  return (
    <Card tint="lavender">
      <View style={styles.between}>
        <ThemedText type="bold" style={styles.grow}>
          Invite link and QR code
        </ThemedText>
        <Switch
          accessibilityLabel="Invite link"
          value={on}
          disabled={loading}
          onValueChange={(enabled) => save({ enabled })}
          trackColor={{ true: theme.primary, false: theme.border }}
        />
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        {on
          ? 'Anyone who opens this link or scans the code joins this project as staff. People new to the company come in as guests. Turn it off when everyone is in.'
          : 'Turn this on to let people join this project with one link or by scanning a QR code, without a code for each person.'}
      </ThemedText>
      <ErrorText>{failed ?? error}</ErrorText>
      {on && link && (
        <>
          <QrCode value={appLink(link.token)} />
          <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
            Scan with the phone&apos;s camera. The Doneva app must be on the phone.
          </ThemedText>
          <ThemedText type="small" raw selectable style={{ textAlign: 'center' }}>
            {shareLink(link.token)}
          </ThemedText>
          <View style={[styles.between, { justifyContent: 'center', flexWrap: 'wrap' }]}>
            <Button
              title={Platform.OS === 'web' ? (copied ? 'Copied' : 'Copy link') : 'Share link'}
              icon={Platform.OS === 'web' ? 'copy' : 'share'}
              small
              onPress={() => share(shareLink(link.token))}
            />
            <Button title="Make a new link" icon="refresh-cw" small variant="secondary" onPress={() => save({ token: newToken() })} />
          </View>
          <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
            A new link stops the old link and QR code from working.
          </ThemedText>
        </>
      )}
    </Card>
  );
}

function Invite(props: {
  info: SpaceInfo;
  invitations: Invitation[];
  onChanged: () => void;
  onRemove: (id: string) => void;
}) {
  const theme = useTheme();
  const { project } = props.info;
  const [email, setEmail] = useState('');
  const [colleague, setColleague] = useState(false);
  const [admin, setAdmin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function invite() {
    setBusy(true);
    setError(null);
    const { error: failed } = await supabase.from('invitations').insert({
      company_id: project.company_id,
      project_id: project.id,
      email: email.trim().toLowerCase(),
      project_role: admin ? 'admin' : 'member',
      // Guests see only the projects they are added to, nothing else in the company space.
      company_role: colleague ? 'member' : 'guest',
    });
    setBusy(false);
    if (failed) {
      setError(failed.message);
      return;
    }
    setEmail('');
    setAdmin(false);
    props.onChanged();
  }

  const toggle = (label: string, hint: string, value: boolean, onChange: (v: boolean) => void) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.three }}>
      <View style={{ flex: 1 }}>
        <ThemedText>{label}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {hint}
        </ThemedText>
      </View>
      <Switch
        accessibilityLabel={label}
        value={value}
        onValueChange={onChange}
        trackColor={{ true: theme.primary, false: theme.border }}
      />
    </View>
  );

  return (
    <Card tint="sky">
      <ThemedText type="bold">Invite one person by email</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        For a code that only one person can use, and to bring someone in as an admin. After they sign up with this
        email address, they paste the code on their Home screen. Invitations last 14 days.
      </ThemedText>
      <Field
        label="Their email"
        required
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
      />
      {toggle('Works at our company', 'Off: a guest who sees only this project.', colleague, setColleague)}
      {toggle('Make them an admin', 'Admins can edit everything in this project.', admin, setAdmin)}
      <ErrorText>{error}</ErrorText>
      <Button title="Create invitation" onPress={invite} loading={busy} disabled={!/^\S+@\S+\.\S+$/.test(email.trim())} />

      {props.invitations.map((invitation) => (
        <View key={invitation.id} style={{ gap: Spacing.half }}>
          <ThemedText type="bold">
            {invitation.email}
            {invitation.project_role === 'admin' ? ' · Admin' : ''}
          </ThemedText>
          <ThemedText type="small" selectable>
            Code: {invitation.token}
          </ThemedText>
          <TextButton title="Cancel this invitation" danger onPress={() => props.onRemove(invitation.id)} />
        </View>
      ))}
    </Card>
  );
}
