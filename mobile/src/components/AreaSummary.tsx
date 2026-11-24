import Ionicons from '@expo/vector-icons/Ionicons';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import type { AreaSummary, RiskLevel } from '@/lib/types';
import { timeAgo } from '@/lib/geo';
import { useTheme } from '@/theme/ThemeProvider';
import { categories, radius, space, type BadgeName } from '@/theme/tokens';
import { AppText } from './AppText';
import { CategoryIcon } from './CategoryIcon';
import { Badge, Card } from './ui';

const RISK: Record<RiskLevel, { kind: BadgeName; label: string }> = {
  Low: { kind: 'riskLow', label: 'Low risk' },
  Medium: { kind: 'riskModerate', label: 'Moderate' },
  High: { kind: 'riskHigh', label: 'High risk' },
};

export type PillState =
  | { kind: 'loading' }
  | { kind: 'tooLarge' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; summary: AreaSummary };

/** Floating pill at the top of the map: risk badge + one-line headline. Tap for the full summary. */
export function SummaryPill({ state, onPress }: { state: PillState; onPress: () => void }) {
  const { colors, isDark } = useTheme();
  let badge: { kind: BadgeName; label: string } | null = null;
  let text: string;
  let tappable = false;

  switch (state.kind) {
    case 'loading':
      text = 'Checking this area…';
      break;
    case 'tooLarge':
      text = 'Zoom in to see alerts and the area summary';
      break;
    case 'error':
      text = state.message;
      badge = { kind: 'pending', label: 'Offline' };
      break;
    case 'ready':
      tappable = true;
      text = state.summary.total ? state.summary.headline : 'No active alerts in this area';
      badge = state.summary.risk ? RISK[state.summary.risk] : { kind: 'pending', label: 'No reports' };
      break;
  }

  return (
    <Pressable
      onPress={tappable ? onPress : undefined}
      accessibilityRole={tappable ? 'button' : 'text'}
      accessibilityLabel={`Area summary: ${badge ? `${badge.label}. ` : ''}${text}`}
      accessibilityHint={tappable ? 'Opens the full area summary' : undefined}
      style={({ pressed }) => [
        styles.pill,
        { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.92 : 1 },
        !isDark && { shadowColor: colors.shadow, shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
      ]}
    >
      {state.kind === 'loading' ? (
        <ActivityIndicator size="small" color={colors.textMuted} />
      ) : badge ? (
        <Badge kind={badge.kind} label={badge.label} style={{ alignSelf: 'center' }} />
      ) : null}
      <AppText variant="pillTitle" numberOfLines={1} style={{ flex: 1 }}>{text}</AppText>
      {tappable ? <Ionicons name="chevron-forward" size={18} color={colors.textMuted} /> : null}
    </Pressable>
  );
}

/** Pinned title bar for the Area Summary sheet (stays put while the content scrolls). */
export function SummaryHeader({ summary }: { summary: AreaSummary }) {
  return (
    <View style={{ gap: space.xs }}>
      <AppText variant="h2" accessibilityRole="header">Area Summary</AppText>
      <AppText variant="caption" color="muted">{summary.scope}</AppText>
    </View>
  );
}

/** Full Area Summary content (shown in a bottom sheet). Same content as the prototype, restyled. */
export function SummaryDetails({ summary }: { summary: AreaSummary }) {
  const { colors, categoryColor } = useTheme();
  const max = Math.max(1, ...summary.breakdown.map((b) => b.count));

  return (
    <>
      <AppText variant="h1">{summary.total ? summary.headline : 'No active alerts in this area.'}</AppText>

      <View style={styles.chips}>
        {summary.risk ? <Badge kind={RISK[summary.risk].kind} label={RISK[summary.risk].label} /> : null}
        <Badge kind="pending" label={`${summary.total} report${summary.total === 1 ? '' : 's'}`} />
        {summary.total ? <Badge kind="pending" label={`Avg severity ${summary.avgSeverity}/3`} /> : null}
        {summary.redZoneCategories.length ? <Badge kind="redZone" label="Active red zone" /> : null}
      </View>

      {summary.topIssue ? (
        <Card style={{ backgroundColor: colors.cardAlt, borderColor: colors.cardAlt }}>
          <AppText variant="label" color="muted" style={{ marginBottom: space.xs }}>MOST REPORTED</AppText>
          <AppText variant="body">{summary.topIssue}</AppText>
        </Card>
      ) : null}

      {summary.breakdown.length ? (
        <View style={{ gap: space.md }}>
          <AppText variant="label" color="muted">BREAKDOWN</AppText>
          {summary.breakdown.map((b) => (
            <View key={b.category} style={styles.barRow}>
              <CategoryIcon category={b.category} size={30} />
              <AppText variant="label" style={{ width: 118 }} numberOfLines={1}>{categories[b.category].label}</AppText>
              <View style={[styles.track, { backgroundColor: colors.cardAlt }]}>
                <View style={{ width: `${(b.count / max) * 100}%`, height: '100%', borderRadius: 4, backgroundColor: categoryColor(b.category).fill }} />
              </View>
              <AppText variant="bodyStrong" style={{ width: 28, textAlign: 'right' }}>{b.count}</AppText>
            </View>
          ))}
        </View>
      ) : null}

      {summary.latest.length ? (
        <View style={{ gap: space.md }}>
          <AppText variant="label" color="muted">LATEST REPORTS</AppText>
          {summary.latest.map((r, i) => (
            <View key={`${r.createdAt}-${i}`} style={styles.latestRow}>
              <CategoryIcon category={r.category} />
              <View style={{ flex: 1 }}>
                <AppText variant="body">{r.note || categories[r.category].label}</AppText>
                <AppText variant="caption" color="muted">{r.label} · {timeAgo(r.createdAt)}</AppText>
              </View>
            </View>
          ))}
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  pill: {
    minHeight: 52,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  track: { flex: 1, height: 8, borderRadius: 4, overflow: 'hidden' },
  latestRow: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
});
