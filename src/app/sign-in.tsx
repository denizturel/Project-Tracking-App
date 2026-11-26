import { useState } from 'react';
import * as Linking from 'expo-linking';
import { Platform, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, ErrorText, Field, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export default function SignInScreen() {
  const { signInWithGoogle } = useAuth();
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [fullName, setFullName] = useState('');
  const [company, setCompany] = useState('');
  const [position, setPosition] = useState('');
  const [department, setDepartment] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // Sign-in with a one-time link sent by email, for accounts that already exist.
  const [useCode, setUseCode] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState<'email' | 'google' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const creating = mode === 'sign-up';
  // Company and position are required to create an account (decided by Deniz).
  const detailsFilled = fullName.trim().length > 1 && !!company.trim() && !!position.trim();
  const withCode = useCode && !creating;
  const emailFilled = email.trim().length > 3;
  const canSubmit = withCode
    ? emailFilled && !codeSent
    : emailFilled && password.length >= 6 && (!creating || detailsFilled);

  // The email holds a sign-in link. A typed 6-digit code needs our own email
  // service in Supabase first (its built-in sender does not allow changing the email).
  async function submitCode() {
    setBusy('email');
    setError(null);
    setNotice(null);
    const { error: failed } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        shouldCreateUser: false,
        emailRedirectTo:
          Platform.OS === 'web' ? window.location.origin : Linking.createURL('sign-in'),
      },
    });
    if (failed) {
      setError(
        /signups not allowed/i.test(failed.message)
          ? 'There is no account with this email yet. Create an account first.'
          : failed.message,
      );
    } else {
      setCodeSent(true);
      setNotice(
        'We sent a sign-in link to your email. Open it on this device, in this same browser, and you are signed in.',
      );
    }
    setBusy(null);
  }

  function resetCode() {
    setCodeSent(false);
    setError(null);
    setNotice(null);
  }

  async function submit() {
    if (withCode) return submitCode();
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
          onChangeText={(value) => {
            setEmail(value);
            if (codeSent) resetCode();
          }}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
        />
        {!withCode && (
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
        )}
        {creating && (
          <ThemedText type="small" themeColor="textSecondary">
            Fields with * are required. With Google, you fill in company and position on the next
            screen.
          </ThemedText>
        )}

        <ErrorText>{error}</ErrorText>
        {notice && <ThemedText type="small">{notice}</ThemedText>}

        <Button
          title={
            creating ? 'Create account' : withCode && !codeSent ? 'Email me a code' : 'Sign in'
          }
          onPress={submit}
          loading={busy === 'email'}
          disabled={!canSubmit || busy !== null}
        />
        {withCode && codeSent && (
          <Button
            title="Send a new link"
            variant="plain"
            onPress={resetCode}
            disabled={busy !== null}
          />
        )}
        {!creating && (
          <Button
            title={useCode ? 'Use my password instead' : 'Sign in with a code by email'}
            variant="plain"
            onPress={() => {
              setUseCode(!useCode);
              resetCode();
            }}
            disabled={busy !== null}
          />
        )}
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
