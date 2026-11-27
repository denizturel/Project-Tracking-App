import { useState } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Avatar, Button, Card, ErrorText, Field } from '@/components/ui';
import { cleanUsername, UsernameField } from '@/components/username-field';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { jobText } from '@/lib/i18n';
import { WIDE_SCREEN } from '@/lib/workspace';
import { cleanPhone, joinName, phoneProblem, splitName } from '@/lib/form-rules';
import { supabase } from '@/lib/supabase';

/** Your own details, as teammates see them next to your name. */
export default function ProfileScreen() {
  const { session, profile, refreshProfile } = useAuth();
  const wide = useWindowDimensions().width >= WIDE_SCREEN;
  const [firstName, setFirstName] = useState(splitName(profile?.full_name).first);
  const [lastName, setLastName] = useState(splitName(profile?.full_name).last);
  const fullName = joinName(firstName, lastName);
  const [company, setCompany] = useState(profile?.company_name ?? '');
  const [position, setPosition] = useState(profile?.position ?? '');
  const [department, setDepartment] = useState(profile?.department ?? '');
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [username, setUsername] = useState(profile?.username ?? '');
  const [usernameOk, setUsernameOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const changed =
    fullName !== (profile?.full_name ?? '') ||
    cleanUsername(username) !== (profile?.username ?? '') ||
    company.trim() !== (profile?.company_name ?? '') ||
    position.trim() !== (profile?.position ?? '') ||
    department.trim() !== (profile?.department ?? '') ||
    (cleanPhone(phone) ?? phone.trim()) !== (profile?.phone ?? '');
  const canSave = changed && !!firstName.trim() && !!lastName.trim() && !!company.trim() && !!position.trim() && usernameOk && !phoneProblem(phone);

  async function save() {
    if (!session) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    const { error: failed } = await supabase
      .from('profiles')
      .update({
        full_name: fullName,
        username: cleanUsername(username),
        company_name: company.trim(),
        position: position.trim(),
        department: department.trim() || null,
        phone: cleanPhone(phone),
      })
      .eq('id', session.user.id);
    if (failed) setError(failed.code === '23505' ? 'This username is taken. Try another one.' : failed.message);
    else {
      await refreshProfile();
      setSaved(true);
    }
    setBusy(false);
  }

  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <View style={styles.column}>
        {wide && <ThemedText type="title">Profile</ThemedText>}
        <Card style={styles.top}>
          <Avatar name={fullName || profile?.full_name} size={72} />
          <View style={styles.grow}>
            <ThemedText type="subtitle">{profile?.full_name}</ThemedText>
            <ThemedText themeColor="textSecondary">
              {jobText(profile?.position, profile?.company_name)}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {session?.user.email}
            </ThemedText>
            {!!profile?.username && (
              <ThemedText type="smallBold" themeColor="primary" raw selectable>
                @{profile.username}
              </ThemedText>
            )}
          </View>
        </Card>

        <Card>
          <ThemedText type="heading">Your details</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Teammates see these next to your name. Fields with * are required.
          </ThemedText>
          <View style={{ flexDirection: 'row', gap: Spacing.two }}>
            <View style={{ flex: 1 }}>
              <Field label="Name" required value={firstName} onChangeText={setFirstName} autoComplete="given-name" textContentType="givenName" />
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Surname" required value={lastName} onChangeText={setLastName} autoComplete="family-name" textContentType="familyName" />
            </View>
          </View>
          <UsernameField value={username} onChangeText={setUsername} onValid={setUsernameOk} />
          <Field label="Company" required value={company} onChangeText={setCompany} autoComplete="organization" />
          <Field label="Position" required value={position} onChangeText={setPosition} autoComplete="organization-title" />
          <Field label="Department" value={department} onChangeText={setDepartment} />
          <Field
            label="Phone"
            value={phone}
            onChangeText={setPhone}
            onBlur={() => setPhone(cleanPhone(phone) ?? phone)}
            placeholder="+90 532 123 45 67"
            keyboardType="phone-pad"
            autoComplete="tel"
            textContentType="telephoneNumber"
          />
          <ErrorText>{phoneProblem(phone)}</ErrorText>
          <ErrorText>{error}</ErrorText>
          {saved && !changed && (
            <ThemedText type="small" themeColor="textSecondary">
              Saved.
            </ThemedText>
          )}
          <Button title="Save changes" onPress={save} loading={busy} disabled={!canSave} />
        </Card>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: Spacing.three, alignItems: 'center' },
  column: { width: '100%', maxWidth: 640, gap: Spacing.three },
  top: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  grow: { flex: 1, minWidth: 0 },
});
