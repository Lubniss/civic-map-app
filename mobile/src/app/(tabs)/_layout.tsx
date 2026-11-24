import { router, Tabs } from 'expo-router';
import { FloatingTabBar, TabBarVisibilityProvider } from '@/components/FloatingTabBar';
import { useTheme } from '@/theme/ThemeProvider';

export default function TabsLayout() {
  const { colors } = useTheme();
  return (
    <TabBarVisibilityProvider>
      <Tabs
        screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.bg } }}
        tabBar={(props) => <FloatingTabBar {...props} onPressCreate={() => router.push('/report')} />}
      >
        <Tabs.Screen name="index" options={{ title: 'Map' }} />
        <Tabs.Screen name="routes" options={{ title: 'Routes' }} />
        <Tabs.Screen name="reports" options={{ title: 'My Reports' }} />
        <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
      </Tabs>
    </TabBarVisibilityProvider>
  );
}
