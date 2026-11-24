import { View } from 'react-native';
import { timeAgo, timeLeft } from '@/lib/geo';
import type { MapAlert } from '@/lib/types';
import { categories, space, type BadgeName } from '@/theme/tokens';
import { AppText } from './AppText';
import { CategoryIcon } from './CategoryIcon';
import { Badge, Card } from './ui';

export function alertBadge(a: MapAlert): { kind: BadgeName; label: string } {
  if (a.status === 'red_zone') return { kind: 'redZone', label: 'Red zone' };
  if (a.status === 'grey_zone') return a.hot ? { kind: 'redZone', label: 'Active incident area' } : { kind: 'greyZone', label: 'Incident area' };
  if (a.status === 'resolved') return { kind: 'fixed', label: 'Fixed' };
  return { kind: 'verified', label: 'Verified' };
}

/** e.g. "Reported by 1 person · expires in 31 h" */
export function alertInfoLine(a: MapAlert): string {
  const people = `Reported by ${a.reporterCount} ${a.reporterCount === 1 ? 'person' : 'people'}`;
  if (a.status === 'red_zone') {
    const left = timeLeft(a.expiresAt);
    return left ? `${people} · expires in ${left}` : people;
  }
  if (a.status === 'grey_zone') {
    const left = timeLeft(a.hotUntil);
    return left ? `${people} · active for ${left} more` : `${people} · incidents happened here`;
  }
  return people;
}

/** Pinned title bar for the alert sheet. */
export function AlertPreviewHeader({ alert }: { alert: MapAlert }) {
  const badge = alertBadge(alert);
  return (
    <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'center' }}>
      <CategoryIcon category={alert.category} size={44} />
      <View style={{ flex: 1, gap: space.xs }}>
        <AppText variant="h2" accessibilityRole="header">{categories[alert.category].label}</AppText>
        <Badge kind={badge.kind} label={badge.label} />
      </View>
    </View>
  );
}

/** Short preview shown when a pin is tapped. Full detail (photos, Confirm it's fixed) comes in step 4. */
export function AlertPreview({ alert }: { alert: MapAlert }) {
  return (
    <>
      <AppText variant="body">{alertInfoLine(alert)}</AppText>
      <AppText variant="caption" color="muted">
        First reported {timeAgo(alert.createdAt)} · last update {timeAgo(alert.updatedAt)}
        {alert.fixCount ? ` · ${alert.fixCount}/3 fix confirmations` : ''}
      </AppText>
      <Card>
        <AppText variant="caption" color="muted">Photos, every report and "Confirm it's fixed" arrive in a later step.</AppText>
      </Card>
    </>
  );
}
