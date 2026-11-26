import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, useWindowDimensions, View } from 'react-native';

import { type SpaceInfo } from '@/components/space/space';
import { ThemedText } from '@/components/themed-text';
import { Avatar, Button, Card, Chip, Choices, ErrorText, Field, Icon, IconButton, type IconName, TextButton } from '@/components/ui';
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

/** Who is in which group. Admins add and remove people and make others admin. */
export function People({ info }: { info: SpaceInfo }) {
  const theme = useTheme();
  const { session } = useAuth();
  const me = session?.user.id;
  const { subgroups } = useWorkspace();
  const { project, subgroup, level, isAdmin, isProjectAdmin } = info;
  const wide = useWindowDimensions().width >= 1100;

  const all = subgroups.filter((s) => s.project_id === project.id);
  const groups = all.filter((s) => !s.parent_id);
  const kids = (id: string) => all.filter((s) => s.parent_id === id);
  const idsKey = all.map((s) => s.id).join(',');

  const [data, setData] = useState<Loaded | null>(null);
  const [version, setVersion] = useState(0);
  const [error, setError] = useState<string | null>(null);
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

  const inPlace = (id: string) => data.placed.filter((p) => p.subgroup_id === id);
  const shared = { me, project: data.project, projectId: project.id, run, isProjectAdmin };
  // A manager manages the people of their own group or team only, and cannot make admins.
  const full = info.isFullAdmin;
  const placeCard = (item: SubgroupNode, title: string) => (
    <PeopleCard
      key={item.id}
      {...shared}
      title={title}
      people={inPlace(item.id)}
      place={item}
      canManage={full || (isAdmin && item.id === subgroup?.id)}
      canMakeAdmin={full}
      wide={wide}
    />
  );

  // A team, or a group without teams: one list.
  if (subgroup && (level === 'team' || kids(subgroup.id).length === 0)) {
    return (
      <>
        <ErrorText>{error ?? data.error}</ErrorText>
        {placeCard(subgroup, subgroup.name)}
      </>
    );
  }

  if (subgroup) {
    return (
      <>
        <ErrorText>{error ?? data.error}</ErrorText>
        <View style={styles.grid}>
          {placeCard(subgroup, 'Managers of this group')}
          {kids(subgroup.id).map((team) => placeCard(team, team.name))}
        </View>
        <ThemedText type="small" themeColor="textSecondary">
          Managers of this group see every team inside it.
        </ThemedText>
      </>
    );
  }

  const places = groups.flatMap((group) => [group, ...kids(group.id)]);
  return (
    <>
      <ThemedText themeColor="textSecondary">
        Who is in which group. {isAdmin ? 'Use the table at the bottom to move people between groups.' : 'Only admins can change this.'}
      </ThemedText>
      <ErrorText>{error ?? data.error}</ErrorText>
      <View style={styles.grid}>
        <PeopleCard
          {...shared}
          title="Admins · see everything"
          people={data.project.filter((p) => p.role === 'admin')}
          place={null}
          canManage={false}
          canMakeAdmin={false}
          wide={wide}
        />
        {groups.flatMap((group) => [
          placeCard(group, kids(group.id).length ? `${group.name} · managers` : group.name),
          ...kids(group.id).map((team) => placeCard(team, `${group.name} · ${team.name}`)),
        ])}
        <PeopleCard {...shared} title="Whole project" people={data.project} place={null} canManage={isAdmin} canMakeAdmin={full} wide={wide} />
      </View>

      {isAdmin && places.length > 0 && (
        <>
          <ThemedText type="subtitle">Manage groups</ThemedText>
          <Card style={styles.tableCard}>
            <ScrollView horizontal showsHorizontalScrollIndicator>
              <View>
                <View style={[styles.tableRow, { borderBottomColor: theme.border }]}>
                  <ThemedText type="smallBold" themeColor="textSecondary" style={styles.personCell}>
                    Person
                  </ThemedText>
                  <ThemedText type="smallBold" themeColor="textSecondary" style={styles.cell}>
                    Admin
                  </ThemedText>
                  {places.map((item) => (
                    <ThemedText
                      key={item.id}
                      type={item.parent_id ? 'small' : 'smallBold'}
                      themeColor={item.parent_id ? 'textSecondary' : 'text'}
                      numberOfLines={2}
                      style={styles.cell}>
                      {item.name}
                    </ThemedText>
                  ))}
                </View>
                {data.project.map((person) => (
                  <View key={person.user_id} style={[styles.tableRow, { borderBottomColor: theme.border }]}>
                    <View style={[styles.personCell, styles.person]}>
                      <Avatar name={person.profile?.full_name} size={34} />
                      <View style={styles.grow}>
                        <ThemedText type="bold" numberOfLines={1}>
                          {person.profile?.full_name ?? 'Unknown'}
                        </ThemedText>
                        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                          {[person.profile?.position, person.profile?.company_name].filter(Boolean).join(' · ')}
                        </ThemedText>
                      </View>
                    </View>
                    <View style={styles.cell}>
                      <Toggle
                        icon="shield"
                        label={`${person.profile?.full_name} is an admin`}
                        on={person.role === 'admin'}
                        disabled={!isProjectAdmin || person.user_id === me}
                        onPress={() =>
                          run(
                            supabase
                              .from('project_members')
                              .update({ role: person.role === 'admin' ? 'member' : 'admin' })
                              .eq('project_id', project.id)
                              .eq('user_id', person.user_id),
                          )
                        }
                      />
                    </View>
                    {places.map((item) => {
                      const on = data.placed.some((p) => p.subgroup_id === item.id && p.user_id === person.user_id);
                      return (
                        <View key={item.id} style={styles.cell}>
                          <Toggle
                            icon="check"
                            label={`${person.profile?.full_name} in ${item.name}`}
                            on={on}
                            onPress={() =>
                              run(
                                on
                                  ? supabase.from('subgroup_members').delete().eq('subgroup_id', item.id).eq('user_id', person.user_id)
                                  : supabase.from('subgroup_members').insert({ subgroup_id: item.id, user_id: person.user_id }),
                              )
                            }
                          />
                        </View>
                      );
                    })}
                  </View>
                ))}
              </View>
            </ScrollView>
          </Card>
        </>
      )}

      {isProjectAdmin && (
        <Invite
          info={info}
          invitations={data.invitations}
          onChanged={refresh}
          onRemove={(id) => run(supabase.from('invitations').delete().eq('id', id))}
        />
      )}
    </>
  );
}

/** A square on/off button in the table of who is in which group. */
function Toggle(props: { icon: IconName; label: string; on: boolean; disabled?: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={props.label}
      accessibilityState={{ checked: props.on, disabled: !!props.disabled }}
      disabled={props.disabled}
      onPress={props.onPress}
      style={[
        styles.toggle,
        {
          backgroundColor: props.on ? theme.primary : theme.card,
          borderColor: props.on ? theme.primary : theme.border,
          opacity: props.disabled ? 0.5 : 1,
        },
      ]}>
      <Icon name={props.icon} size={16} color={props.on ? 'card' : 'border'} />
    </Pressable>
  );
}

const PLACE_ROLES = [
  { value: 'admin', label: 'Admin' },
  { value: 'manager', label: 'Manager' },
  { value: 'member', label: 'Staff' },
] as const;

type PeopleCardProps = {
  title: string;
  people: Person[];
  /** The group or team of this card; null for the project itself. */
  place: SubgroupNode | null;
  project: Person[];
  projectId: string;
  me: string | undefined;
  canManage: boolean;
  canMakeAdmin: boolean;
  isProjectAdmin: boolean;
  wide: boolean;
  run: Run;
};

function PeopleCard(props: PeopleCardProps) {
  const { title, people, place, project, projectId, me, canManage, canMakeAdmin, isProjectAdmin, wide, run } = props;
  const theme = useTheme();
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const roleOf = new Map(project.map((p) => [p.user_id, p.role]));
  const canAdd = place ? project.filter((p) => !people.some((h) => h.user_id === p.user_id)) : [];
  const word = place?.parent_id ? 'team' : 'group';
  const Word = word[0].toUpperCase() + word.slice(1);

  return (
    <View style={wide ? styles.half : styles.full}>
      <Card style={{ gap: 10 }}>
        <View style={styles.between}>
          <ThemedText type="heading" style={styles.grow} numberOfLines={2}>
            {title}
          </ThemedText>
          <Chip text={`${people.length} ${people.length === 1 ? 'person' : 'people'}`} tone={place ? 'lavender' : 'accent'} />
        </View>
        {canManage && place && (
          <Button title="Add people" icon="plus" variant="secondary" small onPress={() => setAdding(!adding)} />
        )}
        {adding && place && (
          <View style={[styles.addBox, { backgroundColor: theme.background, borderColor: theme.border }]}>
            {canAdd.length === 0 && (
              <ThemedText type="small" themeColor="textSecondary">
                Everyone in the project is already here. Invite new people at the bottom of the project&apos;s People page.
              </ThemedText>
            )}
            {canAdd.map((person) => (
              <View key={person.user_id} style={styles.person}>
                <Avatar name={person.profile?.full_name} size={30} />
                <ThemedText style={styles.grow} numberOfLines={1}>
                  {person.profile?.full_name ?? 'Unknown'}
                </ThemedText>
                <Button
                  title="Add"
                  small
                  variant="secondary"
                  onPress={() => run(supabase.from('subgroup_members').insert({ subgroup_id: place.id, user_id: person.user_id }))}
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
            const projectAdmin = roleOf.get(person.user_id) === 'admin';
            const ownAdmin = !!place && person.role === 'admin';
            const isMe = person.user_id === me;
            return (
              <View key={person.user_id} style={[styles.row, index > 0 && { borderTopWidth: 1, borderTopColor: theme.border }]}>
                <Avatar name={person.profile?.full_name} size={38} />
                <View style={styles.grow}>
                  <ThemedText type="bold" numberOfLines={1}>
                    {person.profile?.full_name ?? 'Unknown'}
                    {isMe && <ThemedText themeColor="textSecondary"> (you)</ThemedText>}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                    {[person.profile?.position, person.profile?.company_name].filter(Boolean).join(' · ')}
                  </ThemedText>
                </View>
                {place ? (
                  canManage && (canMakeAdmin || !ownAdmin) ? (
                    <Choices
                      options={canMakeAdmin ? PLACE_ROLES : PLACE_ROLES.slice(1)}
                      value={person.role ?? 'member'}
                      onChange={(role) =>
                        run(
                          supabase
                            .from('subgroup_members')
                            .update({ role })
                            .eq('subgroup_id', place.id)
                            .eq('user_id', person.user_id),
                        )
                      }
                    />
                  ) : (
                    (ownAdmin || person.role === 'manager' || projectAdmin) && (
                      <Chip text={ownAdmin ? `${Word} admin` : person.role === 'manager' ? 'Manager' : 'Admin'} />
                    )
                  )
                ) : isProjectAdmin && !isMe && canManage ? (
                  <Button
                    title={projectAdmin ? 'Admin' : 'Make admin'}
                    icon="shield"
                    small
                    variant={projectAdmin ? 'primary' : 'secondary'}
                    onPress={() =>
                      run(
                        supabase
                          .from('project_members')
                          .update({ role: projectAdmin ? 'member' : 'admin' })
                          .eq('project_id', projectId)
                          .eq('user_id', person.user_id),
                      )
                    }
                  />
                ) : (
                  projectAdmin && <Chip text="Admin" />
                )}
                {place && isMe && (
                  <Button
                    title={`Leave this ${word}`}
                    icon="log-out"
                    small
                    variant="secondary"
                    onPress={() =>
                      run(supabase.from('subgroup_members').delete().eq('subgroup_id', place.id).eq('user_id', person.user_id))
                    }
                  />
                )}
                {canManage && !isMe && (canMakeAdmin || !ownAdmin) && (place || isProjectAdmin) && removing !== person.user_id && (
                  <IconButton
                    icon="x"
                    label={`Remove ${person.profile?.full_name}`}
                    onPress={() => setRemoving(person.user_id)}
                  />
                )}
                {removing === person.user_id && (
                  <Button
                    title="Remove"
                    small
                    variant="secondary"
                    onPress={() => {
                      setRemoving(null);
                      return run(
                        place
                          ? supabase.from('subgroup_members').delete().eq('subgroup_id', place.id).eq('user_id', person.user_id)
                          : supabase.from('project_members').delete().eq('project_id', projectId).eq('user_id', person.user_id),
                      );
                    }}
                  />
                )}
              </View>
            );
          })}
        </View>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  half: { width: '49%', flexGrow: 1, maxWidth: '49.3%' },
  full: { width: '100%' },
  grow: { flex: 1, minWidth: 0 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, flexWrap: 'wrap' },
  person: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  addBox: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 10 },
  tableCard: { padding: 12 },
  tableRow: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, paddingVertical: 8 },
  personCell: { width: 230, paddingRight: 10 },
  cell: { width: 112, alignItems: 'center', textAlign: 'center', paddingHorizontal: 4 },
  toggle: { width: 34, height: 34, borderRadius: 9, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
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
