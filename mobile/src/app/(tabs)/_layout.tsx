import { Tabs } from 'expo-router';
import { Alert } from 'react-native';
import { FloatingTabBar, TabBarVisibilityProvider } from '@/components/FloatingTabBar';
import { useTheme } from '@/theme/ThemeProvider';

export default function TabsLayout() {
  const { colors } = useTheme();
  return (
    <TabBarVisibilityProvider>
      <Tabs
        screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.bg } }}
        tabBar={(props) => (
          <FloatingTabBar
            {...props}
            // The report flow arrives in phase 4 step 3.
            onPressCreate={() => Alert.alert('Coming soon', 'Reporting a problem arrives in the next steps.')}
          />
        )}
      >
        <Tabs.Screen name="index" options={{ title: 'Map' }} />
        <Tabs.Screen name="reports" options={{ title: 'My Reports' }} />
        <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
      </Tabs>
    </TabBarVisibilityProvider>
  );
}
