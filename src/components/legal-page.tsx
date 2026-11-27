import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, Choices, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { type LegalDoc } from '@/lib/legal';
import { setLang, usePrefs } from '@/lib/prefs';

const LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'tr', label: 'Türkçe' },
] as const;

/** A public page of plain text (privacy policy, terms), readable without signing in. */
export function LegalPage({ doc }: { doc: Record<'en' | 'tr', LegalDoc> }) {
  const router = useRouter();
  const { lang } = usePrefs();
  const text = doc[lang === 'tr' ? 'tr' : 'en'];

  return (
    <Screen>
      <View style={{ gap: Spacing.two }}>
        <ThemedText type="title" raw>
          {text.title}
        </ThemedText>
        <Choices options={LANGUAGES} value={lang} onChange={setLang} />
        <ThemedText themeColor="textSecondary" raw>
          {text.intro}
        </ThemedText>
      </View>
      {text.sections.map((section) => (
        <Card key={section.heading}>
          <ThemedText type="heading" raw>
            {section.heading}
          </ThemedText>
          {section.body.map((paragraph) => (
            <ThemedText key={paragraph} raw>
              {paragraph}
            </ThemedText>
          ))}
        </Card>
      ))}
      <Button title="Back" variant="plain" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
    </Screen>
  );
}
