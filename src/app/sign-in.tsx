import { useState } from 'react';
import { View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, ErrorText, Field, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export default function SignInScreen() {
  const { signInWithGoogle } = useAuth();
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<'email' | 'google' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const creating = mode === 'sign-up';
  const canSubmit =
    email.trim().length > 3 && password.length >= 6 && (!creating || fullName.trim().length > 1);

  async function submit() {
    setBusy('email');
    setError(null);
    setNotice(null);
    const credentials = { email: email.trim(), password };
    if (creating) {
      const { data, error: failed } = await supabase.auth.signUp({
        ...credentials,
        options: { data: { full_name: fullName.trim() } },
      });
      if (failed) setError(failed.message);
      else if (!data.session) {
        setNotice('Check your email and open the confirmation link, then sign in here.');
        setMode('sign-in');
      }
    } else {
      const { error: failed } = await supabase.auth.signInWithPassword(credentials);
      if (failed) setError(failed.message);
    }
    setBusy(null);
  }

  async function google() {
    setBusy('google');
    setError(null);
    setError(await signInWithGoogle());
    setBusy(null);
  }

  return (
    <Screen centered>
      <View style={{ gap: Spacing.one }}>
        <ThemedText type="title">Workroom</ThemedText>
        <ThemedText themeColor="textSecondary">
          Projects, chats, tasks and solutions for your team, in one place.
        </ThemedText>
      </View>

      <Card>
        <ThemedText type="subtitle">{creating ? 'Create your account' : 'Sign in'}</ThemedText>

        <Button
          title="Continue with Google"
          variant="secondary"
          onPress={google}
          loading={busy === 'google'}
          disabled={busy !== null}
        />

        <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
          or use your email
        </ThemedText>

        {creating && (
          <Field
            label="Full name"
            required
            value={fullName}
            onChangeText={setFullName}
            autoComplete="name"
            textContentType="name"
          />
        )}
        <Field
          label="Email"
          required
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
        />
        <Field
          label="Password (at least 6 characters)"
          required
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete={creating ? 'new-password' : 'current-password'}
          textContentType={creating ? 'newPassword' : 'password'}
          onSubmitEditing={() => canSubmit && submit()}
        />

        <ErrorText>{error}</ErrorText>
        {notice && <ThemedText type="small">{notice}</ThemedText>}

        <Button
          title={creating ? 'Create account' : 'Sign in'}
          onPress={submit}
          loading={busy === 'email'}
          disabled={!canSubmit || busy !== null}
        />
        <Button
          title={creating ? 'I already have an account' : 'Create a new account'}
          variant="plain"
          onPress={() => {
            setMode(creating ? 'sign-in' : 'sign-up');
            setError(null);
          }}
          disabled={busy !== null}
        />
      </Card>
    </Screen>
  );
}
