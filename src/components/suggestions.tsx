import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Avatar } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import type { Suggested } from '@/lib/suggest';

/** The list that drops under a box while typing. Pressing a person picks them. */
export function Suggestions({ people, onPick }: { people: Suggested[]; onPick: (person: Suggested) => void }) {
  const theme = useTheme();
  if (people.length === 0) return null;
  return (
    <View style={[styles.box, { backgroundColor: theme.card, borderColor: theme.border }]}>
      {people.map((person, index) => (
        <Pressable
          key={person.user_id}
          accessibilityRole="button"
          accessibilityLabel={`Pick ${person.full_name}`}
          onPress={() => onPick(person)}
          style={({ pressed }) => [styles.row, index > 0 && { borderTopWidth: 1, borderTopColor: theme.border }, { opacity: pressed ? 0.6 : 1 }]}>
          <Avatar name={person.full_name} size={32} />
          <View style={styles.grow}>
            <ThemedText type="bold" raw numberOfLines={1}>
              {person.full_name}
              {!!person.username && <ThemedText themeColor="textSecondary" raw>{`  @${person.username}`}</ThemedText>}
            </ThemedText>
            {!!(person.position || person.company_name) && (
              <ThemedText type="small" themeColor="textSecondary" raw numberOfLines={1}>
                {[person.position, person.company_name].filter(Boolean).join(' · ')}
              </ThemedText>
            )}
          </View>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderWidth: 1, borderRadius: 14, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 8, minHeight: 48 },
  grow: { flex: 1, minWidth: 0 },
});
