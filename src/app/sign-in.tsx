import { useState } from 'react';
import { View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, ErrorText, Field, Screen, Choices } from '@/components/ui';
import { cleanUsername, UsernameField } from '@/components/username-field';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { setLang, usePrefs } from '@/lib/prefs';
import { supabase } from '@/lib/supabase';

const LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'tr', label: 'Türkçe' },
] as const;

/** Google sign-in is switched off in Supabase for now. Set to true once the Google provider is turned on there. */
const GOOGLE_SIGN_IN: boolean = false;

export default function SignInScreen() {
  const { lang } = usePrefs();
  const { signInWithGoogle } = useAuth();
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [usernameOk, setUsernameOk] = useState(false);
  const [company, setCompany] = useState('');
  const [position, setPosition] = useState('');
  const [department, setDepartment] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<'email' | 'google' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const creating = mode === 'sign-up';
  // Company and position are required to create an account (decided by Deniz).
  const detailsFilled = fullName.trim().length > 1 && !!company.trim() && !!position.trim() && usernameOk;
  const canSubmit = email.trim().length > 3 && password.length >= 6 && (!creating || detailsFilled);

  async function submit() {
    setBusy('email');
    setError(null);
    setNotice(null);
    const credentials = { email: email.trim(), password };
    if (creating) {
      const { data, error: failed } = await supabase.auth.signUp({
        ...credentials,
        options: {
          data: {
            full_name: fullName.trim(),
            username: cleanUsername(username),
            company_name: company.trim(),
            position: position.trim(),
            department: department.trim(),
            phone: phone.trim(),
          },
        },
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
        <ThemedText type="title">Doneva</ThemedText>
        <ThemedText themeColor="textSecondary">
          Projects, chats, tasks and solutions for your team, in one place.
        </ThemedText>
        <Choices options={LANGUAGES} value={lang} onChange={setLang} />
      </View>

      <Card>
        <ThemedText type="subtitle">{creating ? 'Create your account' : 'Sign in'}</ThemedText>

        {GOOGLE_SIGN_IN && (
          <>
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
          </>
        )}

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
        {creating && <UsernameField value={username} onChangeText={setUsername} onValid={setUsernameOk} />}
        {creating && (
          <Field
            label="Company"
            required
            value={company}
            onChangeText={setCompany}
            autoComplete="organization"
            textContentType="organizationName"
          />
        )}
        {creating && (
          <Field
            label="Position"
            required
            value={position}
            onChangeText={setPosition}
            autoComplete="organization-title"
            textContentType="jobTitle"
          />
        )}
        {creating && <Field label="Department" value={department} onChangeText={setDepartment} />}
        {creating && (
          <Field
            label="Phone"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            autoComplete="tel"
            textContentType="telephoneNumber"
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

        {creating && (
          <ThemedText type="small" themeColor="textSecondary">
            {GOOGLE_SIGN_IN
              ? 'Fields with * are required. With Google, you fill in company and position on the next screen.'
              : 'Fields with * are required.'}
          </ThemedText>
        )}

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
