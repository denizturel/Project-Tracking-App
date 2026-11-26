import { Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MenuClose, MiniRail, Sidebar } from '@/components/sidebar';
import { ThemedText } from '@/components/themed-text';
import { IconButton } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useIsDark, useTheme } from '@/hooks/use-theme';
import { WIDE_SCREEN, WorkspaceProvider } from '@/lib/workspace';

/** The same project or group is the same page, whichever of its tabs is asked for. */
const onePerPage = (name: string, params: Record<string, unknown>) => `${name}:${String(params.id ?? '')}`;

export default function AppLayout() {
  const theme = useTheme();
  const dark = useIsDark();
  const insets = useSafeAreaInsets();
  const wide = useWindowDimensions().width >= WIDE_SCREEN;
  // Wide screens: the menu stays open until it is closed with its button.
  const [pinned, setPinned] = useState(true);
  // Phones: the menu lies over the page, and closes when a page is picked from it.
  const [open, setOpen] = useState(false);
  const drawerOpen = !wide && open;

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
              statusBarStyle: dark ? 'light' : 'dark',
              contentStyle: { backgroundColor: theme.background },
              // Pages change at once: a slide showed an empty strip while the next page loaded, and a fade felt slow.
              animation: 'none',
              // Our own top bar on phones: buttons placed in the built-in iPhone bar do not show up.
              header: ({ options, back, navigation }) => (
                <View
                  style={[
                    styles.topBar,
                    { paddingTop: insets.top + 6, backgroundColor: theme.card, borderBottomColor: theme.border },
                  ]}>
                  <IconButton icon="menu" label="Open menu" onPress={() => setOpen(true)} />
                  {back && <IconButton icon="chevron-left" label="Back" onPress={navigation.goBack} />}
                  <ThemedText type="heading" numberOfLines={1} style={styles.topBarTitle}>
                    {options.title}
                  </ThemedText>
                  <View style={{ width: back ? 84 : 38 }} />
                </View>
              ),
            }}>
            {/* One copy of each page: opening a page that is already open goes back to it instead of stacking another. */}
            <Stack.Screen name="index" options={{ title: 'Projects' }} dangerouslySingular={onePerPage} />
            <Stack.Screen name="project/[id]" options={{ title: 'Project' }} dangerouslySingular={onePerPage} />
            <Stack.Screen name="group/[id]" options={{ title: 'Group' }} dangerouslySingular={onePerPage} />
            <Stack.Screen name="company/[id]" options={{ title: 'Company' }} dangerouslySingular={onePerPage} />
            <Stack.Screen name="messages/index" options={{ title: 'Messages' }} dangerouslySingular={onePerPage} />
            <Stack.Screen name="messages/[id]" options={{ title: 'Messages' }} dangerouslySingular={onePerPage} />
            <Stack.Screen name="connections" options={{ title: 'Connections' }} dangerouslySingular={onePerPage} />
            <Stack.Screen name="profile" options={{ title: 'Profile' }} dangerouslySingular={onePerPage} />
            <Stack.Screen name="settings" options={{ title: 'Settings' }} dangerouslySingular={onePerPage} />
          </Stack>
        </View>
      </View>

      {/* A plain layer over the page, not a system pop-up: those can leave the iPhone screen frozen. */}
      {drawerOpen && (
        <View style={[StyleSheet.absoluteFill, styles.drawerRow]}>
          <View
            style={[
              styles.drawer,
              { backgroundColor: theme.rail, paddingTop: insets.top, paddingBottom: insets.bottom },
            ]}>
            {menuHeader(() => setOpen(false))}
            <MenuClose value={() => setOpen(false)}>
              <Sidebar />
            </MenuClose>
          </View>
          <Pressable accessibilityLabel="Close menu" style={styles.backdrop} onPress={() => setOpen(false)} />
        </View>
      )}
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
  drawerRow: { flexDirection: 'row', zIndex: 10 },
  drawer: { width: '84%', maxWidth: 340 },
  backdrop: { flex: 1, backgroundColor: 'rgba(60, 40, 30, 0.35)' },
});
