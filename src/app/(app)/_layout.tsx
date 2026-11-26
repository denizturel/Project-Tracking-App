import { Stack } from 'expo-router';
import { useWindowDimensions, View } from 'react-native';

import { Sidebar } from '@/components/sidebar';
import { useTheme } from '@/hooks/use-theme';
import { WIDE_SCREEN, WorkspaceProvider } from '@/lib/workspace';

export default function AppLayout() {
  const theme = useTheme();
  const wide = useWindowDimensions().width >= WIDE_SCREEN;

  return (
    <WorkspaceProvider>
      <View style={{ flex: 1, flexDirection: 'row', backgroundColor: theme.background }}>
        {wide && (
          <View style={{ width: 312, borderRightWidth: 1, borderRightColor: theme.border }}>
            <Sidebar />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Stack
            screenOptions={{
              // Wide screens have the side menu and each page's own title instead.
              headerShown: !wide,
              headerStyle: { backgroundColor: theme.card },
              headerTintColor: theme.text,
              headerTitleStyle: { fontSize: 19, fontFamily: 'Sora_600SemiBold' },
              contentStyle: { backgroundColor: theme.background },
            }}>
            <Stack.Screen name="index" options={{ title: 'Workroom' }} />
            <Stack.Screen name="project/[id]" options={{ title: 'Project' }} />
            <Stack.Screen name="group/[id]" options={{ title: 'Group' }} />
          </Stack>
        </View>
      </View>
    </WorkspaceProvider>
  );
}
