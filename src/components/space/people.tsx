import { useEffect, useState } from 'react';
import { ActivityIndicator, Switch, View } from 'react-native';

import { type SpaceInfo } from '@/components/space/space';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, ErrorText, Field, TextButton } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

type Person = {
  user_id: string;
  role?: 'admin' | 'member';
  profile: { full_name: string; position: string | null; company_name: string | null } | null;
};

type Invitation = { id: string; email: string; token: string; project_role: 'admin' | 'member' };

type Loaded = {
  /** Everyone in the project. */
  project: Person[];
  /** Everyone in this group or team; empty at project level. */
  here: Person[];
  invitations: Invitation[];
  error: string | null;
};

const PROFILE = 'profile:profiles!user_id(full_name, position, company_name)';

async function fetchPeople(info: SpaceInfo): Promise<Loaded> {
  const [project, here, invitations] = await Promise.all([
    supabase.from('project_members').select(`user_id, role, ${PROFILE}`).eq('project_id', info.project.id),
    info.subgroup
      ? supabase.from('subgroup_members').select(`user_id, role, ${PROFILE}`).eq('subgroup_id', info.subgroup.id)
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
    here: ((here?.data ?? []) as unknown as Person[]).sort(byName),
    invitations: (invitations?.data ?? []) as Invitation[],
    error: (project.error ?? here?.error ?? invitations?.error)?.message ?? null,
  };
}

/** Who is here. Admins add and remove people and make others admin. */
export function People({ info }: { info: SpaceInfo }) {
  const theme = useTheme();
  const { session } = useAuth();
  const me = session?.user.id;
  const { project, subgroup, level, isAdmin } = info;

  const [data, setData] = useState<Loaded | null>(null);
  const [version, setVersion] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const refresh = () => setVersion((v) => v + 1);

  useEffect(() => {
    let active = true;
    fetchPeople(info).then((result) => {
      if (active) setData(result);
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [info.project.id, info.subgroup?.id, info.isAdmin, version]);

  async function run(action: PromiseLike<{ error: { message: string } | null }>) {
    const { error: failed } = await action;
    setError(failed?.message ?? null);
    refresh();
  }

  if (!data) return <ActivityIndicator color={theme.primary} size="large" />;

  const people = subgroup ? data.here : data.project;
  const roleOf = new Map(data.project.map((p) => [p.user_id, p.role]));
  const canAdd = subgroup ? data.project.filter((p) => !data.here.some((h) => h.user_id === p.user_id)) : [];

  return (
    <>
      <ThemedText type="subtitle">
        {people.length} {people.length === 1 ? 'person' : 'people'} in this {level}
      </ThemedText>
      <ErrorText>{error ?? data.error}</ErrorText>

      {level !== 'project' && people.length === 0 && (
        <ThemedText themeColor="textSecondary">
          Nobody has been added to this {level} yet. Project and company admins can always see it.
        </ThemedText>
      )}

      {people.map((person) => {
        const role = roleOf.get(person.user_id);
        const ownAdmin = !!subgroup && person.role === 'admin';
        return (
          <Card key={person.user_id} style={{ gap: Spacing.one }}>
            <ThemedText type="bold">
              {person.profile?.full_name ?? 'Unknown'}
              {person.user_id === me ? ' (you)' : ''}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {[person.profile?.position, person.profile?.company_name].filter(Boolean).join(' at ')}
              {role === 'admin' ? ' · Project admin' : ''}
              {ownAdmin ? ` · Admin of this ${level}` : ''}
            </ThemedText>
            {isAdmin && (
              <View style={{ flexDirection: 'row', gap: Spacing.four, flexWrap: 'wrap' }}>
                {!subgroup && person.user_id !== me && (
                  <TextButton
                    title={role === 'admin' ? 'Remove admin rights' : 'Make admin'}
                    onPress={() =>
                      run(
                        supabase
                          .from('project_members')
                          .update({ role: role === 'admin' ? 'member' : 'admin' })
                          .eq('project_id', project.id)
                          .eq('user_id', person.user_id),
                      )
                    }
                  />
                )}
                {subgroup && (
                  <TextButton
                    title={ownAdmin ? `Remove as admin of this ${level}` : `Make admin of this ${level}`}
                    onPress={() =>
                      run(
                        supabase
                          .from('subgroup_members')
                          .update({ role: ownAdmin ? 'member' : 'admin' })
                          .eq('subgroup_id', subgroup.id)
                          .eq('user_id', person.user_id),
                      )
                    }
                  />
                )}
                {subgroup ? (
                  <TextButton
                    title={`Remove from this ${level}`}
                    danger
                    onPress={() =>
                      run(
                        supabase
                          .from('subgroup_members')
                          .delete()
                          .eq('subgroup_id', subgroup.id)
                          .eq('user_id', person.user_id),
                      )
                    }
                  />
                ) : (
                  person.user_id !== me && (
                    <TextButton
                      title="Remove from the project"
                      danger
                      onPress={() =>
                        run(
                          supabase
                            .from('project_members')
                            .delete()
                            .eq('project_id', project.id)
                            .eq('user_id', person.user_id),
                        )
                      }
                    />
                  )
                )}
              </View>
            )}
          </Card>
        );
      })}

      {isAdmin && subgroup && (
        <Card tint="mint">
          <ThemedText type="bold">Add people from the project</ThemedText>
          {canAdd.length === 0 && (
            <ThemedText type="small" themeColor="textSecondary">
              Everyone in the project is already in this {level}. Invite new people from the project&apos;s
              People tab.
            </ThemedText>
          )}
          {canAdd.map((person) => (
            <View key={person.user_id} style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.three }}>
              <ThemedText style={{ flex: 1 }}>{person.profile?.full_name ?? 'Unknown'}</ThemedText>
              <TextButton
                title="Add"
                onPress={() =>
                  run(supabase.from('subgroup_members').insert({ subgroup_id: subgroup.id, user_id: person.user_id }))
                }
              />
            </View>
          ))}
        </Card>
      )}

      {isAdmin && !subgroup && (
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
