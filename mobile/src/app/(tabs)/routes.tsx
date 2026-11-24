import Ionicons from '@expo/vector-icons/Ionicons';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { useTabBarSpace } from '@/components/FloatingTabBar';
import { Badge, Card } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

// Placeholder until phase 6 (Fastest vs. Safest Route).
export default function RoutesScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const bottomSpace = useTabBarSpace();

  const row = (icon: React.ComponentProps<typeof Ionicons>['name'], title: string, body: string) => (
    <View style={styles.row}>
      <View style={[styles.icon, { backgroundColor: colors.cardAlt }]}>
        <Ionicons name={icon} size={20} color={colors.accentText} />
      </View>
      <View style={{ flex: 1 }}>
        <AppText variant="bodyStrong">{title}</AppText>
        <AppText variant="caption" color="muted">{body}</AppText>
      </View>
    </View>
  );

  return (
    <ScrollView
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={{ paddingTop: insets.top + space.lg, paddingHorizontal: space.xl, paddingBottom: bottomSpace, gap: space.lg }}
    >
      <AppText variant="display" accessibilityRole="header">Routes</AppText>
      <Card style={{ gap: space.lg }}>
        <Badge kind="pending" label="Coming soon" />
        <AppText variant="h2">Fastest vs. Safest route</AppText>
        <AppText variant="body" color="muted">
          Pick where you're going and compare two routes: the quickest one, and the one that avoids reported
          danger, especially useful late at night.
        </AppText>
        {row('walk', 'Walking or driving', 'Choose how you travel.')}
        {row('shield-checkmark', 'Avoids red zones', 'Steers around unsafe areas, harassment reports and dark streets.')}
        {row('time', 'Honest trade-off', 'e.g. "Avoids 2 unsafe areas · +4 min".')}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.md, alignItems: 'center' },
  icon: { width: 36, height: 36, borderRadius: radius.input, alignItems: 'center', justifyContent: 'center' },
});
