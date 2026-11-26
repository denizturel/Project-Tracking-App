import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Field } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

const VALID = /^[a-z0-9_.]{3,20}$/;

/** Usernames are kept in small letters without spaces or an "@" in front. */
export const cleanUsername = (text: string) => text.trim().replace(/^@+/, '').toLowerCase();

type State = 'empty' | 'invalid' | 'checking' | 'free' | 'taken';

/**
 * The username box with a live "free / taken" note under it.
 * `onValid` says whether the typed name can be saved.
 */
export function UsernameField(props: { value: string; onChangeText: (text: string) => void; onValid: (ok: boolean) => void }) {
  const { value, onValid } = props;
  const name = cleanUsername(value);
  const [checked, setChecked] = useState<{ name: string; free: boolean } | null>(null);

  const state: State = !name ? 'empty' : !VALID.test(name) ? 'invalid' : checked?.name !== name ? 'checking' : checked.free ? 'free' : 'taken';

  useEffect(() => {
    if (!VALID.test(name)) return;
    let active = true;
    // Wait until the typing stops.
    const timer = setTimeout(async () => {
      const result = await supabase.rpc('username_available', { name });
      if (active) setChecked({ name, free: result.data === true });
    }, 350);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [name]);

  useEffect(() => {
    onValid(state === 'free');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <View style={{ gap: Spacing.half }}>
      <Field
        label="Username"
        required
        value={value}
        onChangeText={(text) => props.onChangeText(text.replace(/\s/g, '').toLowerCase())}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="username"
        maxLength={20}
      />
      <ThemedText type="small" themeColor={state === 'taken' || state === 'invalid' ? 'danger' : state === 'free' ? 'ok' : 'textSecondary'}>
        {state === 'taken'
          ? 'This username is taken. Try another one.'
          : state === 'free'
            ? 'This username is free.'
            : state === 'invalid'
              ? '3 to 20 characters: small letters, numbers, dot or underscore.'
              : 'Others use it to find and connect with you. 3 to 20 small letters, numbers, dot or underscore.'}
      </ThemedText>
    </View>
  );
}
