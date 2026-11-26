import { Stack, useGlobalSearchParams, usePathname } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MiniRail, Sidebar } from '@/components/sidebar';
import { ThemedText } from '@/components/themed-text';
import { IconButton } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { WIDE_SCREEN, WorkspaceProvider } from '@/lib/workspace';

export default function AppLayout() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const wide = useWindowDimensions().width >= WIDE_SCREEN;
  const pathname = usePathname();
  const { tab } = useGlobalSearchParams<{ tab?: string }>();
  const page = `${pathname}?${typeof tab === 'string' ? tab : ''}`;

  // Wide screens: the menu stays open until it is closed with its button.
  const [pinned, setPinned] = useState(true);
  // Phones: the menu slides over the page, and closes by itself when another page opens.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const drawerOpen = !wide && openOn === page;

  const menuHeader = (onClose: () => void) => (
    <View style={[styles.menuHeader, { backgroundColor: theme.rail, borderBottomColor: theme.border }]}>
      <ThemedText type="subtitle">Doneva</ThemedText>
      <IconButton icon="chevrons-left" label="Close menu" onPress={onClose} />
    </View>
  );

  return (
    <WorkspaceProvider>
      <View style={{ flex: 1, flexDirection: 'row', backgroundColor: theme.background }}>
        {wide && pinned && (
          <View style={{ width: 312, borderRightWidth: 1, borderRightColor: theme.border }}>
            {menuHeader(() => setPinned(false))}
            <Sidebar />
          </View>
        )}
        {wide && !pinned && (
          <View style={[styles.closedRail, { borderRightColor: theme.border }]}>
            <MiniRail onOpen={() => setPinned(true)} />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Stack
            screenOptions={{
              // Wide screens have the side menu and each page's own title instead.
              headerShown: !wide,
              contentStyle: { backgroundColor: theme.background },
              // Our own top bar on phones: buttons placed in the built-in iPhone bar do not show up.
              header: ({ options, back, navigation }) => (
                <View
                  style={[
                    styles.topBar,
                    { paddingTop: insets.top + 6, backgroundColor: theme.card, borderBottomColor: theme.border },
                  ]}>
                  <IconButton icon="menu" label="Open menu" onPress={() => setOpenOn(page)} />
                  {back && <IconButton icon="chevron-left" label="Back" onPress={navigation.goBack} />}
                  <ThemedText type="heading" numberOfLines={1} style={styles.topBarTitle}>
                    {options.title}
                  </ThemedText>
                  <View style={{ width: back ? 84 : 38 }} />
                </View>
              ),
            }}>
            <Stack.Screen name="index" options={{ title: 'Projects' }} />
            <Stack.Screen name="project/[id]" options={{ title: 'Project' }} />
            <Stack.Screen name="group/[id]" options={{ title: 'Group' }} />
          </Stack>
        </View>
      </View>

      <Modal visible={drawerOpen} transparent animationType="fade" onRequestClose={() => setOpenOn(null)}>
        <View style={styles.drawerRow}>
          <View
            style={[
              styles.drawer,
              { backgroundColor: theme.rail, paddingTop: insets.top, paddingBottom: insets.bottom },
            ]}>
            {menuHeader(() => setOpenOn(null))}
            <Sidebar />
          </View>
          <Pressable
            accessibilityLabel="Close menu"
            style={styles.backdrop}
            onPress={() => setOpenOn(null)}
          />
        </View>
      </Modal>
    </WorkspaceProvider>
  );
}

const styles = StyleSheet.create({
  menuHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderBottomWidth: 1,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.two,
    paddingBottom: 6,
    borderBottomWidth: 1,
  },
  topBarTitle: { flex: 1, textAlign: 'center' },
  closedRail: { width: 64, borderRightWidth: 1 },
  drawerRow: { flex: 1, flexDirection: 'row' },
  drawer: { width: '84%', maxWidth: 340 },
  backdrop: { flex: 1, backgroundColor: 'rgba(60, 40, 30, 0.35)' },
});
