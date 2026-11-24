import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { useTabBarSpace } from '@/components/FloatingTabBar';
import { Badge, Button, Card } from '@/components/ui';
import { getHealth } from '@/lib/api';
import { env } from '@/lib/env';
import { useTheme } from '@/theme/ThemeProvider';
import { CATEGORY_KEYS, categories, space } from '@/theme/tokens';

// Step 1 placeholder: the real map arrives in phase 4 step 2.
// For now this screen proves the theme works and the phone can reach the server.
export default function MapScreen() {
  const { colors, categoryColor } = useTheme();
  const insets = useSafeAreaInsets();
  const bottomSpace = useTabBarSpace();
  const health = useQuery({ queryKey: ['health'], queryFn: getHealth, retry: 0 });

  return (
    <ScrollView
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={{ paddingTop: insets.top + space.lg, paddingHorizontal: space.xl, paddingBottom: bottomSpace, gap: space.lg }}
    >
      <AppText variant="display" accessibilityRole="header">Map</AppText>
      <AppText variant="body" color="muted">The live map arrives in the next step. Here's a preview of the look.</AppText>

      <Card style={{ gap: space.md }}>
        <AppText variant="h2">Server connection</AppText>
        {health.isPending ? (
          <AppText variant="body" color="muted">Checking {env.apiUrl || '(no server address set)'}…</AppText>
        ) : health.isSuccess ? (
          <View style={styles.row}>
            <Badge kind="fixed" label="Connected" />
            <AppText variant="caption" color="muted">{env.apiUrl}</AppText>
          </View>
        ) : (
          <>
            <Badge kind="riskHigh" label="Not reachable" />
            <AppText variant="caption" color="muted">
              {health.error instanceof Error ? health.error.message : 'Unknown error'}{'\n'}
              Is the server running (npm run dev in server/) and is this phone on the same Wi-Fi as the PC?
            </AppText>
          </>
        )}
        <Button title="Check again" variant="secondary" onPress={() => health.refetch()} loading={health.isFetching} />
      </Card>

      <Card style={{ gap: space.md }}>
        <AppText variant="h2">Status badges</AppText>
        <View style={styles.wrap}>
          <Badge kind="redZone" label="Red zone" />
          <Badge kind="greyZone" label="Grey zone" />
          <Badge kind="verified" label="Verified" />
          <Badge kind="pending" label="Pending" />
          <Badge kind="fixed" label="Fixed" />
        </View>
        <View style={styles.wrap}>
          <Badge kind="riskLow" label="Safe" />
          <Badge kind="riskModerate" label="Moderate" />
          <Badge kind="riskHigh" label="High risk" />
        </View>
      </Card>

      <Card style={{ gap: space.md }}>
        <AppText variant="h2">Categories</AppText>
        {CATEGORY_KEYS.map((key) => {
          const c = categoryColor(key);
          return (
            <View key={key} style={styles.row}>
              <View style={[styles.pin, { backgroundColor: c.fill, borderColor: colors.pinRing }]}>
                <Ionicons name={categories[key].icon as never} size={16} color={c.icon} />
              </View>
              <AppText variant="bodyStrong">{categories[key].label}</AppText>
              {categories[key].emergency ? <AppText variant="caption" color="muted">· emergency</AppText> : null}
            </View>
          );
        })}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  pin: { width: 34, height: 34, borderRadius: 17, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
});
