import { useState } from 'react';
import { View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, ErrorText, Field, Screen } from '@/components/ui';
import { cleanUsername, UsernameField } from '@/components/username-field';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

/**
 * Shown after sign-in (including Google) until company, position and a username are filled in.
 * The typed company is profile text only; access comes from memberships.
 */
export default function WorkDetailsScreen() {
  const { session, profile, refreshProfile, signOut } = useAuth();
  const [fullName, setFullName] = useState(profile?.full_name ?? '');
  const [company, setCompany] = useState(profile?.company_name ?? '');
  const [position, setPosition] = useState(profile?.position ?? '');
  const [department, setDepartment] = useState(profile?.department ?? '');
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [username, setUsername] = useState(profile?.username ?? '');
  const [usernameOk, setUsernameOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSave = !!fullName.trim() && !!company.trim() && !!position.trim() && usernameOk;

  async function save() {
    if (!session) return;
    setBusy(true);
    setError(null);
    const { error: failed } = await supabase
      .from('profiles')
      .update({
        full_name: fullName.trim(),
        username: cleanUsername(username),
        company_name: company.trim(),
        position: position.trim(),
        department: department.trim() || null,
        phone: phone.trim() || null,
      })
      .eq('id', session.user.id);
    if (failed) setError(failed.code === '23505' ? 'This username is taken. Try another one.' : failed.message);
    else await refreshProfile();
    setBusy(false);
  }

  return (
    <Screen centered>
      <View style={{ gap: Spacing.one }}>
        <ThemedText type="title">Your work details</ThemedText>
        <ThemedText themeColor="textSecondary">
          Your teammates see these next to your name. Fields with * are required.
        </ThemedText>
      </View>

      <Card>
        <Field label="Full name" required value={fullName} onChangeText={setFullName} autoComplete="name" />
        <UsernameField value={username} onChangeText={setUsername} onValid={setUsernameOk} />
        <Field label="Company" required value={company} onChangeText={setCompany} autoComplete="organization" />
        <Field
          label="Position"
          required
          value={position}
          onChangeText={setPosition}
          autoComplete="organization-title"
        />
        <Field label="Department" value={department} onChangeText={setDepartment} />
        <Field label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" />

        <ErrorText>{error}</ErrorText>

        <Button title="Continue" onPress={save} loading={busy} disabled={!canSave} />
        <Button title="Sign out" variant="plain" onPress={signOut} disabled={busy} />
      </Card>
    </Screen>
  );
}
