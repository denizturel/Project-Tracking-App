import { useState } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Avatar, Button, Card, ErrorText, Field } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { WIDE_SCREEN } from '@/lib/workspace';
import { supabase } from '@/lib/supabase';

/** Your own details, as teammates see them next to your name. */
export default function ProfileScreen() {
  const { session, profile, refreshProfile } = useAuth();
  const wide = useWindowDimensions().width >= WIDE_SCREEN;
  const [fullName, setFullName] = useState(profile?.full_name ?? '');
  const [company, setCompany] = useState(profile?.company_name ?? '');
  const [position, setPosition] = useState(profile?.position ?? '');
  const [department, setDepartment] = useState(profile?.department ?? '');
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const changed =
    fullName.trim() !== (profile?.full_name ?? '') ||
    company.trim() !== (profile?.company_name ?? '') ||
    position.trim() !== (profile?.position ?? '') ||
    department.trim() !== (profile?.department ?? '') ||
    phone.trim() !== (profile?.phone ?? '');
  const canSave = changed && !!fullName.trim() && !!company.trim() && !!position.trim();

  async function save() {
    if (!session) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    const { error: failed } = await supabase
      .from('profiles')
      .update({
        full_name: fullName.trim(),
        company_name: company.trim(),
        position: position.trim(),
        department: department.trim() || null,
        phone: phone.trim() || null,
      })
      .eq('id', session.user.id);
    if (failed) setError(failed.message);
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
              {[profile?.position, profile?.company_name].filter(Boolean).join(' at ')}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {session?.user.email}
            </ThemedText>
          </View>
        </Card>

        <Card>
          <ThemedText type="heading">Your details</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Teammates see these next to your name. Fields with * are required.
          </ThemedText>
          <Field label="Full name" required value={fullName} onChangeText={setFullName} autoComplete="name" />
          <Field label="Company" required value={company} onChangeText={setCompany} autoComplete="organization" />
          <Field label="Position" required value={position} onChangeText={setPosition} autoComplete="organization-title" />
          <Field label="Department" value={department} onChangeText={setDepartment} />
          <Field label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" />
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
