import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, ErrorText, Field, Screen, Choices } from '@/components/ui';
import { cleanUsername, UsernameField } from '@/components/username-field';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { cleanEmail, cleanPhone, emailProblem, joinName, PASSWORD_RULE, passwordProblem, phoneProblem } from '@/lib/form-rules';
import { setLang, usePrefs } from '@/lib/prefs';
import { supabase } from '@/lib/supabase';

const LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'tr', label: 'Türkçe' },
] as const;

/** Google sign-in is switched off in Supabase for now. Set to true once the Google provider is turned on there. */
const GOOGLE_SIGN_IN: boolean = false;

/**
 * Doneva has no email service yet (it needs its own domain first), so everything that sends an email is
 * switched off: "Forgot your password?" is hidden. The code screens stay in the file and only open if
 * Supabase itself asks for a confirmed email. Set to true once the email service is connected in Supabase.
 */
const EMAIL_SERVICE: boolean = false;

export default function SignInScreen() {
  const { lang } = usePrefs();
  const { signInWithGoogle } = useAuth();
  const router = useRouter();
  // 'confirm': typing the code from the confirmation email. 'forgot' and 'reset': a new password with an emailed code.
  const [mode, setMode] = useState<'sign-in' | 'sign-up' | 'confirm' | 'forgot' | 'reset'>('sign-in');
  const [code, setCode] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [username, setUsername] = useState('');
  const [usernameOk, setUsernameOk] = useState(false);
  const [company, setCompany] = useState('');
  const [position, setPosition] = useState('');
  const [department, setDepartment] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState<'email' | 'google' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const creating = mode === 'sign-up';
  // Company and position are required to create an account (decided by Deniz).
  const detailsFilled =
    !!firstName.trim() && !!lastName.trim() && !!company.trim() && !!position.trim() && usernameOk && !phoneProblem(phone);
  // The rules count for new accounts; an existing account signs in with the password it has.
  const mismatch = creating && !!again && password !== again;
  const canSubmit = creating
    ? detailsFilled && !!email.trim() && !emailProblem(email) && !!password && !passwordProblem(password) && password === again
    : email.trim().length > 3 && password.length >= 6;

  async function submit() {
    setBusy('email');
    setError(null);
    setNotice(null);
    const credentials = { email: cleanEmail(email), password };
    if (creating) {
      const { data, error: failed } = await supabase.auth.signUp({
        ...credentials,
        options: {
          data: {
            full_name: joinName(firstName, lastName),
            username: cleanUsername(username),
            company_name: company.trim(),
            position: position.trim(),
            department: department.trim(),
            phone: cleanPhone(phone) ?? '',
          },
        },
      });
      if (failed) setError(failed.message);
      else if (!data.session) {
        // Email confirmation is on: the account opens after the code from the email is typed in.
        setCode('');
        setMode('confirm');
      }
    } else {
      const { error: failed } = await supabase.auth.signInWithPassword(credentials);
      if (failed && /not confirmed/i.test(failed.message)) {
        setCode('');
        setMode('confirm');
        setNotice('Your email address is not confirmed yet. Type the code from the email we sent you, or send a new one.');
      } else if (failed) setError(failed.message);
    }
    setBusy(null);
  }

  /** Runs one step of the code screens and shows what went wrong. */
  async function step(action: () => Promise<string | null>, done?: string) {
    setBusy('email');
    setError(null);
    setNotice(null);
    const failed = await action();
    setBusy(null);
    if (failed) setError(/expired|invalid/i.test(failed) ? 'This code is not right or is too old. Send a new one and try again.' : failed);
    else if (done) setNotice(done);
    return !failed;
  }

  const confirmEmail = () =>
    step(async () => (await supabase.auth.verifyOtp({ email: cleanEmail(email), token: code.trim(), type: 'email' })).error?.message ?? null);

  const sendAgain = () =>
    step(
      async () => (await supabase.auth.resend({ type: 'signup', email: cleanEmail(email) })).error?.message ?? null,
      'We sent a new code. Look in your spam folder too.',
    );

  const sendReset = async () => {
    const sent = await step(async () => (await supabase.auth.resetPasswordForEmail(cleanEmail(email))).error?.message ?? null);
    if (sent) {
      setCode('');
      setPassword('');
      setAgain('');
      setMode('reset');
    }
  };

  const saveNewPassword = () =>
    step(async () => {
      const checked = await supabase.auth.verifyOtp({ email: cleanEmail(email), token: code.trim(), type: 'recovery' });
      if (checked.error) return checked.error.message;
      // The code signs the person in; the new password is saved straight after.
      return (await supabase.auth.updateUser({ password })).error?.message ?? null;
    });

  const codeOk = /^\d{6,8}$/.test(code.trim());
  const backToSignIn = () => {
    setMode('sign-in');
    setError(null);
    setNotice(null);
    setPassword('');
    setAgain('');
  };

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

      {mode === 'confirm' && (
        <Card>
          <ThemedText type="subtitle">Confirm your email</ThemedText>
          <ThemedText themeColor="textSecondary">We sent a code to your email address. Type it here to open your account.</ThemedText>
          <ThemedText type="bold" raw>
            {cleanEmail(email)}
          </ThemedText>
          <Field
            label="Code from the email"
            required
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            maxLength={8}
            onSubmitEditing={() => codeOk && confirmEmail()}
          />
          <ErrorText>{error}</ErrorText>
          {notice && <ThemedText type="small">{notice}</ThemedText>}
          <Button title="Confirm" onPress={confirmEmail} loading={busy === 'email'} disabled={!codeOk || busy !== null} />
          <Button title="Send the code again" variant="secondary" onPress={sendAgain} disabled={busy !== null} />
          <Button title="Back to sign in" variant="plain" onPress={backToSignIn} disabled={busy !== null} />
        </Card>
      )}

      {mode === 'forgot' && (
        <Card>
          <ThemedText type="subtitle">Forgot your password?</ThemedText>
          <ThemedText themeColor="textSecondary">Write your email address. We send you a code to set a new password.</ThemedText>
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
          <ErrorText>{error ?? emailProblem(email)}</ErrorText>
          <Button title="Send me a code" onPress={sendReset} loading={busy === 'email'} disabled={!email.trim() || !!emailProblem(email) || busy !== null} />
          <Button title="Back to sign in" variant="plain" onPress={backToSignIn} disabled={busy !== null} />
        </Card>
      )}

      {mode === 'reset' && (
        <Card>
          <ThemedText type="subtitle">Set a new password</ThemedText>
          <ThemedText themeColor="textSecondary">
            If this email address has an account, a code is on its way. Type it here with your new password.
          </ThemedText>
          <Field
            label="Code from the email"
            required
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            maxLength={8}
          />
          <Field label="New password" required value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" textContentType="newPassword" />
          <ThemedText type="small" themeColor={passwordProblem(password) ? 'danger' : 'textSecondary'}>
            {PASSWORD_RULE}
          </ThemedText>
          <Field label="Password again" required value={again} onChangeText={setAgain} secureTextEntry autoComplete="new-password" textContentType="newPassword" />
          {!!again && password !== again && <ErrorText>The two passwords are not the same.</ErrorText>}
          <ErrorText>{error}</ErrorText>
          <Button
            title="Save new password"
            onPress={saveNewPassword}
            loading={busy === 'email'}
            disabled={!codeOk || !password || !!passwordProblem(password) || password !== again || busy !== null}
          />
          <Button title="Back to sign in" variant="plain" onPress={backToSignIn} disabled={busy !== null} />
        </Card>
      )}

      {(mode === 'sign-in' || mode === 'sign-up') && (
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
          <View style={{ flexDirection: 'row', gap: Spacing.two }}>
            <View style={{ flex: 1 }}>
              <Field label="Name" required value={firstName} onChangeText={setFirstName} autoComplete="given-name" textContentType="givenName" />
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Surname" required value={lastName} onChangeText={setLastName} autoComplete="family-name" textContentType="familyName" />
            </View>
          </View>
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
          <>
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
          </>
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
        {creating && <ErrorText>{emailProblem(email)}</ErrorText>}
        <Field
          label="Password"
          required
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete={creating ? 'new-password' : 'current-password'}
          textContentType={creating ? 'newPassword' : 'password'}
          onSubmitEditing={() => canSubmit && submit()}
        />
        {creating && (
          <ThemedText type="small" themeColor={passwordProblem(password) ? 'danger' : 'textSecondary'}>
            {PASSWORD_RULE}
          </ThemedText>
        )}
        {creating && (
          <Field
            label="Password again"
            required
            value={again}
            onChangeText={setAgain}
            secureTextEntry
            autoComplete="new-password"
            textContentType="newPassword"
            onSubmitEditing={() => canSubmit && submit()}
          />
        )}
        {mismatch && <ErrorText>The two passwords are not the same.</ErrorText>}

        {creating && (
          <ThemedText type="small" themeColor="textSecondary">
            {GOOGLE_SIGN_IN
              ? 'Fields with * are required. With Google, you fill in company and position on the next screen.'
              : 'Fields with * are required.'}
          </ThemedText>
        )}
        {creating && (
          <ThemedText type="small" themeColor="textSecondary">
            By creating an account you accept the terms of use and the privacy policy below.
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
        {EMAIL_SERVICE && !creating && (
          <Button
            title="Forgot your password?"
            variant="plain"
            onPress={() => {
              setMode('forgot');
              setError(null);
              setNotice(null);
            }}
            disabled={busy !== null}
          />
        )}
      </Card>
      )}

      <View style={{ flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: Spacing.three }}>
        <Button title="Privacy policy" variant="plain" small onPress={() => router.push('/privacy')} />
        <Button title="Terms of use" variant="plain" small onPress={() => router.push('/terms')} />
      </View>
    </Screen>
  );
}
