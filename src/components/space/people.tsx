import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Switch, View } from 'react-native';

import { type SpaceInfo } from '@/components/space/space';
import { ThemedText } from '@/components/themed-text';
import { Avatar, Button, Card, Chip, Choices, ErrorText, Field, Icon, IconButton, TextButton } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { type SubgroupNode, useWorkspace } from '@/lib/workspace';

type Person = {
  user_id: string;
  role?: 'admin' | 'manager' | 'member';
  subgroup_id?: string;
  profile: { full_name: string; position: string | null; company_name: string | null } | null;
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

const PROFILE = 'profile:profiles!user_id(full_name, position, company_name)';

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

type Run = (action: PromiseLike<{ error: { message: string } | null }>) => Promise<void>;
type Role = 'admin' | 'manager' | 'member';

const ROLE_LABEL: Record<Role, string> = { admin: 'Admin', manager: 'Manager', member: 'Staff' };
const PLACE_ROLES = (['admin', 'manager', 'member'] as const).map((value) => ({ value, label: ROLE_LABEL[value] }));
const PROJECT_ROLES = [
  { value: 'admin', label: 'Admin' },
  { value: 'member', label: 'Staff' },
] as const;

/**
 * One simple list of who is here. Clicking a person opens their profile card,
 * where admins and managers change their status, add them to groups or remove them.
 */
export function People({ info }: { info: SpaceInfo }) {
  const theme = useTheme();
  const { session } = useAuth();
  const me = session?.user.id;
  const { subgroups } = useWorkspace();
  const { project, subgroup, isAdmin, isProjectAdmin } = info;
  const full = info.isFullAdmin;

  const all = subgroups.filter((s) => s.project_id === project.id);
  const kids = (id: string) => all.filter((s) => s.parent_id === id);
  const idsKey = all.map((s) => s.id).join(',');
  // The places this page covers: the whole project, a group with its teams, or one team.
  const scope = subgroup
    ? [subgroup, ...kids(subgroup.id)]
    : all.filter((s) => !s.parent_id).flatMap((group) => [group, ...kids(group.id)]);

  const [data, setData] = useState<Loaded | null>(null);
  const [version, setVersion] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [inviting, setInviting] = useState(false);
  const refresh = () => setVersion((v) => v + 1);

  useEffect(() => {
    let active = true;
    fetchPeople(info, idsKey ? idsKey.split(',') : []).then((result) => {
      if (active) setData(result);
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [info.project.id, info.isAdmin, idsKey, version]);

  const run: Run = async (action) => {
    const { error: failed } = await action;
    setError(failed?.message ?? null);
    refresh();
  };

  if (!data) return <ActivityIndicator color={theme.primary} size="large" />;

  const inScope = data.placed.filter((p) => scope.some((s) => s.id === p.subgroup_id));
  const projectRole = new Map(data.project.map((p) => [p.user_id, p.role]));
  const people = subgroup
    ? data.project.filter((p) => inScope.some((h) => h.user_id === p.user_id))
    : data.project;
  const placesOf = (userId: string) => inScope.filter((p) => p.user_id === userId);
  const nameOf = (id: string | undefined) => scope.find((s) => s.id === id)?.name ?? '';
  // A manager manages the people of their own group or team only, and cannot make admins.
  const canManage = (item: SubgroupNode) => full || (isAdmin && item.id === subgroup?.id);

  const statusOf = (userId: string) => {
    if (projectRole.get(userId) === 'admin') return 'Admin';
    const roles = placesOf(userId).map((p) => p.role);
    return roles.includes('admin') ? 'Group admin' : roles.includes('manager') ? 'Manager' : 'Staff';
  };

  const open = people.find((p) => p.user_id === openId) ?? null;
  const notHere = subgroup ? data.project.filter((p) => !placesOf(p.user_id).some((h) => h.subgroup_id === subgroup.id)) : [];
  const word = subgroup?.parent_id ? 'team' : 'group';

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
          {isAdmin ? 'Click a person to see their card, change their status or remove them.' : 'Click a person to see their card.'}
        </ThemedText>

        {subgroup && canManage(subgroup) && (
          <Button title="Add people" icon="plus" variant="secondary" small onPress={() => setAdding(!adding)} />
        )}
        {adding && subgroup && (
          <View style={[styles.addBox, { backgroundColor: theme.background, borderColor: theme.border }]}>
            {notHere.length === 0 && (
              <ThemedText type="small" themeColor="textSecondary">
                Everyone in the project is already here. Invite new people on the project&apos;s People page.
              </ThemedText>
            )}
            {notHere.map((person) => (
              <View key={person.user_id} style={styles.person}>
                <Avatar name={person.profile?.full_name} size={30} />
                <ThemedText style={styles.grow} numberOfLines={1}>
                  {person.profile?.full_name ?? 'Unknown'}
                </ThemedText>
                <Button
                  title="Add"
                  small
                  variant="secondary"
                  onPress={() => run(supabase.from('subgroup_members').insert({ subgroup_id: subgroup.id, user_id: person.user_id }))}
                />
              </View>
            ))}
          </View>
        )}

        {people.length === 0 && (
          <ThemedText type="small" themeColor="textSecondary">
            Nobody here yet.
          </ThemedText>
        )}
        <View>
          {people.map((person, index) => {
            const where = placesOf(person.user_id).map((p) => nameOf(p.subgroup_id));
            const showWhere = scope.length > 1 && where.length > 0;
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
                    {showWhere
                      ? where.join(', ')
                      : [person.profile?.position, person.profile?.company_name].filter(Boolean).join(' · ')}
                  </ThemedText>
                </View>
                <Chip text={statusOf(person.user_id)} tone={statusOf(person.user_id) === 'Staff' ? 'plain' : 'lavender'} />
                <Icon name="chevron-right" size={18} color="textSecondary" />
              </Pressable>
            );
          })}
        </View>
      </Card>

      {!subgroup && isProjectAdmin && (
        <>
          <Button
            title={inviting ? 'Hide invitations' : `Invite someone${data.invitations.length ? ` (${data.invitations.length} waiting)` : ''}`}
            icon="user-plus"
            variant="secondary"
            onPress={() => setInviting(!inviting)}
          />
          {inviting && (
            <Invite
              info={info}
              invitations={data.invitations}
              onChanged={refresh}
              onRemove={(id) => run(supabase.from('invitations').delete().eq('id', id))}
            />
          )}
        </>
      )}

      {open && (
        <ProfileCard
          person={open}
          isMe={open.user_id === me}
          onClose={() => setOpenId(null)}
          projectStatus={
            subgroup
              ? null
              : {
                  role: projectRole.get(open.user_id) === 'admin' ? 'admin' : 'member',
                  canChange: isProjectAdmin && open.user_id !== me,
                  onChange: (role) =>
                    run(supabase.from('project_members').update({ role }).eq('project_id', project.id).eq('user_id', open.user_id)),
                  onRemove: () => {
                    setOpenId(null);
                    return run(supabase.from('project_members').delete().eq('project_id', project.id).eq('user_id', open.user_id));
                  },
                }
          }
          places={placesOf(open.user_id).map((placed) => {
            const item = scope.find((s) => s.id === placed.subgroup_id) as SubgroupNode;
            const role = (placed.role ?? 'member') as Role;
            const manage = canManage(item) && (full || role !== 'admin');
            return {
              id: item.id,
              name: item.name,
              role,
              word: item.parent_id ? 'team' : 'group',
              roles: manage && open.user_id !== me ? (full ? PLACE_ROLES : PLACE_ROLES.slice(1)) : null,
              canRemove: manage || open.user_id === me,
              onChange: (next: Role) =>
                run(supabase.from('subgroup_members').update({ role: next }).eq('subgroup_id', item.id).eq('user_id', open.user_id)),
              onRemove: () =>
                run(supabase.from('subgroup_members').delete().eq('subgroup_id', item.id).eq('user_id', open.user_id)),
            };
          })}
          canAddTo={scope
            .filter((item) => canManage(item) && !placesOf(open.user_id).some((p) => p.subgroup_id === item.id))
            .map((item) => ({
              id: item.id,
              name: item.name,
              onAdd: () => run(supabase.from('subgroup_members').insert({ subgroup_id: item.id, user_id: open.user_id })),
            }))}
          emptyNote={subgroup ? `Not in this ${word}.` : 'Not in any group yet.'}
        />
      )}
    </>
  );
}

type CardPlace = {
  id: string;
  name: string;
  role: Role;
  word: string;
  /** The statuses that can be picked; null when it cannot be changed. */
  roles: readonly { value: Role; label: string }[] | null;
  canRemove: boolean;
  onChange: (role: Role) => void;
  onRemove: () => void;
};

type ProfileCardProps = {
  person: Person;
  isMe: boolean;
  onClose: () => void;
  projectStatus: {
    role: 'admin' | 'member';
    canChange: boolean;
    onChange: (role: 'admin' | 'member') => void;
    onRemove: () => void;
  } | null;
  places: CardPlace[];
  canAddTo: { id: string; name: string; onAdd: () => void }[];
  emptyNote: string;
};

/** The small card of one person: name, role (their job) and status. Pressing a status shows the other options. */
function ProfileCard({ person, isMe, onClose, projectStatus, places, canAddTo, emptyNote }: ProfileCardProps) {
  const theme = useTheme();
  // Which status is showing its options: 'project' or the id of a group or team.
  const [changing, setChanging] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const job = [person.profile?.position, person.profile?.company_name].filter(Boolean).join(' at ');

  const statusChip = (key: string, text: string, canOpen: boolean) =>
    canOpen ? (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Change status ${text}`}
        onPress={() => setChanging(changing === key ? null : key)}
        style={({ pressed }) => [styles.statusButton, { backgroundColor: theme.backgroundElement, opacity: pressed ? 0.6 : 1 }]}>
        <ThemedText type="smallBold">{text}</ThemedText>
        <Icon name={changing === key ? 'chevron-up' : 'chevron-down'} size={16} />
      </Pressable>
    ) : (
      <Chip text={text} tone={text === 'Staff' ? 'plain' : 'lavender'} />
    );

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
          </View>

          <View style={styles.cardLine}>
            <ThemedText type="label">Role</ThemedText>
            <ThemedText>{job || 'Not filled in'}</ThemedText>
          </View>

          <View style={styles.cardLine}>
            <ThemedText type="label">Status</ThemedText>
            {projectStatus && (
              <View style={styles.statusBlock}>
                <View style={styles.between}>
                  <ThemedText type="bold" style={styles.grow}>
                    Whole project
                  </ThemedText>
                  {statusChip('project', projectStatus.role === 'admin' ? 'Admin' : 'Staff', projectStatus.canChange)}
                </View>
                {changing === 'project' && (
                  <View style={[styles.options, { backgroundColor: theme.background, borderColor: theme.border }]}>
                    <Choices
                      options={PROJECT_ROLES}
                      value={projectStatus.role}
                      onChange={(role) => {
                        setChanging(null);
                        projectStatus.onChange(role);
                      }}
                    />
                    <TextButton title="Remove from the project" danger onPress={projectStatus.onRemove} />
                  </View>
                )}
              </View>
            )}
            {places.length === 0 && !projectStatus && <ThemedText themeColor="textSecondary">{emptyNote}</ThemedText>}
            {places.map((place) => (
              <View key={place.id} style={styles.statusBlock}>
                <View style={styles.between}>
                  <ThemedText type="bold" style={styles.grow} numberOfLines={2}>
                    {place.name}
                  </ThemedText>
                  {statusChip(place.id, ROLE_LABEL[place.role], !!place.roles || place.canRemove)}
                </View>
                {changing === place.id && (
                  <View style={[styles.options, { backgroundColor: theme.background, borderColor: theme.border }]}>
                    {place.roles && (
                      <Choices
                        options={place.roles}
                        value={place.role}
                        onChange={(role) => {
                          setChanging(null);
                          place.onChange(role);
                        }}
                      />
                    )}
                    {place.canRemove && (
                      <TextButton
                        title={isMe ? `Leave this ${place.word}` : `Remove from this ${place.word}`}
                        danger
                        onPress={() => {
                          setChanging(null);
                          place.onRemove();
                        }}
                      />
                    )}
                  </View>
                )}
              </View>
            ))}
          </View>

          {canAddTo.length > 0 && (
            <View style={styles.cardLine}>
              <TextButton title={adding ? 'Hide groups' : 'Add to a group or team'} onPress={() => setAdding(!adding)} />
              {adding && (
                <View style={styles.addChips}>
                  {canAddTo.map((item) => (
                    <Button key={item.id} title={item.name} icon="plus" small variant="secondary" onPress={item.onAdd} />
                  ))}
                </View>
              )}
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1, minWidth: 0 },
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
  statusBlock: { gap: 8 },
  statusButton: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 7, paddingHorizontal: 12, borderRadius: 999 },
  options: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 6 },
  addChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});

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
      <ThemedText type="bold">Invite someone to this project</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        They get a code. After they sign up with this email address, they paste the code on their Home
        screen. Invitations last 14 days.
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
