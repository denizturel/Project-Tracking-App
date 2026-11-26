import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, ErrorText, Field } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/lib/supabase';
import { type CompanyNode, useWorkspace } from '@/lib/workspace';

/** The form that starts a project in one of the given company spaces. */
export function NewProject({ companies, onClose }: { companies: CompanyNode[]; onClose: () => void }) {
  const router = useRouter();
  const theme = useTheme();
  const { reload } = useWorkspace();
  const [companyId, setCompanyId] = useState(companies[0]?.id);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    setError(null);
    const { data, error: failed } = await supabase
      .from('projects')
      .insert({ company_id: companyId, name: name.trim(), description: description.trim() || null })
      .select('id')
      .single();
    setBusy(false);
    if (failed) {
      setError(failed.message);
      return;
    }
    reload();
    onClose();
    // Straight into the new project's workspace.
    router.push({ pathname: '/project/[id]', params: { id: data.id } });
  }

  return (
    <Card>
      <ThemedText type="subtitle">New project</ThemedText>
      {companies.length > 1 && (
        <View style={{ gap: Spacing.one }}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            Company space
          </ThemedText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {companies.map((company) => (
              <Pressable
                key={company.id}
                accessibilityRole="radio"
                accessibilityState={{ selected: company.id === companyId }}
                onPress={() => setCompanyId(company.id)}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: company.id === companyId ? theme.primary : theme.border,
                  backgroundColor: company.id === companyId ? theme.backgroundSelected : theme.card,
                }}>
                <ThemedText type="bold">{company.name}</ThemedText>
              </Pressable>
            ))}
          </View>
        </View>
      )}
      <Field label="Project name" required value={name} onChangeText={setName} />
      <Field label="Description" value={description} onChangeText={setDescription} multiline />
      <ErrorText>{error}</ErrorText>
      <Button title="Create project" onPress={create} loading={busy} disabled={!name.trim() || !companyId} />
      <Button title="Cancel" variant="plain" onPress={onClose} disabled={busy} />
    </Card>
  );
}
