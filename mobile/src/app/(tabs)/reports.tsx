import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { ActivityIndicator, FlatList, Image, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { CategoryIcon } from '@/components/CategoryIcon';
import { useTabBarSpace } from '@/components/FloatingTabBar';
import { Badge, Button, Card } from '@/components/ui';
import { timeAgo } from '@/lib/geo';
import { useMyReports } from '@/lib/queries';
import { useStreetName } from '@/lib/streetName';
import type { MyReport, MyReportStatusKey } from '@/lib/types';
import { useTheme } from '@/theme/ThemeProvider';
import { categories, radius, space, type BadgeName } from '@/theme/tokens';

const STATUS_BADGE: Record<MyReportStatusKey, BadgeName> = {
  pending: 'pending',
  red_zone: 'redZone',
  grey_zone_hot: 'redZone',
  grey_zone: 'greyZone',
  verified: 'verified',
  resolved: 'fixed',
  expired: 'pending',
  unknown: 'pending',
};

export default function MyReportsScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const bottomSpace = useTabBarSpace();
  const q = useMyReports();
  const reports = q.data?.pages.flatMap((p) => p.reports) ?? [];

  return (
    <FlatList
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={{ paddingTop: insets.top + space.lg, paddingHorizontal: space.xl, paddingBottom: bottomSpace, gap: space.md }}
      data={reports}
      keyExtractor={(r) => r.id}
      renderItem={({ item }) => <ReportCard report={item} />}
      onEndReachedThreshold={0.4}
      onEndReached={() => { if (q.hasNextPage && !q.isFetchingNextPage) q.fetchNextPage(); }}
      refreshControl={<RefreshControl refreshing={q.isRefetching && !q.isFetchingNextPage} onRefresh={() => { q.refetch(); }} tintColor={colors.textMuted} />}
      ListHeaderComponent={
        <View style={{ gap: space.xs, marginBottom: space.sm }}>
          <AppText variant="display" accessibilityRole="header">My Reports</AppText>
          <AppText variant="body" color="muted">Everything you've reported, newest first.</AppText>
        </View>
      }
      ListEmptyComponent={
        q.isPending ? (
          <ActivityIndicator color={colors.textMuted} style={{ marginTop: space.xxl }} />
        ) : q.isError ? (
          <Card style={{ gap: space.md }}>
            <AppText variant="bodyStrong">Couldn't load your reports</AppText>
            <AppText variant="caption" color="muted">{q.error instanceof Error ? q.error.message : 'Try again.'}</AppText>
            <Button title="Try again" variant="secondary" onPress={() => q.refetch()} />
          </Card>
        ) : (
          <Card style={{ gap: space.md, alignItems: 'flex-start' }}>
            <Ionicons name="document-text-outline" size={28} color={colors.textMuted} />
            <AppText variant="bodyStrong">No reports yet</AppText>
            <AppText variant="body" color="muted">When you report a problem, it shows up here with its status.</AppText>
            <Button title="Report a problem" onPress={() => router.push('/report')} />
          </Card>
        )
      }
      ListFooterComponent={q.isFetchingNextPage ? <ActivityIndicator color={colors.textMuted} /> : undefined}
    />
  );
}

/** "Recent Activities" style card (image 2). */
function ReportCard({ report }: { report: MyReport }) {
  const { colors } = useTheme();
  const street = useStreetName({ lat: report.lat, lng: report.lng }, 0);
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/alert/[id]', params: { id: report.alertId } })}
      accessibilityRole="button"
      accessibilityLabel={`${categories[report.category].label}, ${report.status.label}`}
    >
      {({ pressed }) => (
        <Card style={[styles.card, { opacity: pressed ? 0.85 : 1 }]}>
          {report.photoUrl ? (
            <Image source={{ uri: report.photoUrl }} style={[styles.thumb, { borderColor: colors.border }]} accessibilityLabel="Report photo" />
          ) : (
            <CategoryIcon category={report.category} size={56} />
          )}
          <View style={{ flex: 1, gap: 4 }}>
            <AppText variant="bodyStrong" numberOfLines={1}>{categories[report.category].label}</AppText>
            <AppText variant="caption" color="muted" numberOfLines={1}>{street.name ?? 'Finding street…'} · {timeAgo(report.createdAt)}</AppText>
            <Badge kind={STATUS_BADGE[report.status.key] ?? 'pending'} label={report.status.label} />
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </Card>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  thumb: { width: 56, height: 56, borderRadius: radius.input, borderWidth: 1 },
});
