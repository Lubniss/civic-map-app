import { ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { useTabBarSpace } from '@/components/FloatingTabBar';
import { Card } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

// Placeholder: the My Reports list arrives in phase 4 step 4.
export default function MyReportsScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const bottomSpace = useTabBarSpace();
  return (
    <ScrollView
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={{ paddingTop: insets.top + space.lg, paddingHorizontal: space.xl, paddingBottom: bottomSpace, gap: space.lg }}
    >
      <AppText variant="display" accessibilityRole="header">My Reports</AppText>
      <Card>
        <AppText variant="bodyStrong">No reports yet</AppText>
        <AppText variant="body" color="muted">Reports you send will be listed here with their status.</AppText>
      </Card>
    </ScrollView>
  );
}
