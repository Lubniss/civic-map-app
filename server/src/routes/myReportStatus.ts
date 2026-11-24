import { isHot, isVisible } from '../categories.js';

export interface MyAlertInfo {
  status: string;
  reporter_count: number;
  expires_at: string | null;
  hot_until: string | null;
}

/** Plain-words status for "My Reports". */
export function myReportStatus(a: MyAlertInfo | null, now = Date.now()): { key: string; label: string } {
  if (!a) return { key: 'unknown', label: 'Unknown' };
  switch (a.status) {
    case 'pending': {
      const more = Math.max(0, 3 - a.reporter_count);
      return { key: 'pending', label: `Waiting for ${more} more report${more === 1 ? '' : 's'}` };
    }
    case 'red_zone': {
      if (!isVisible(a.status, a.expires_at, now)) return { key: 'expired', label: 'Expired' };
      const h = Math.max(1, Math.round((Date.parse(a.expires_at!) - now) / 3_600_000));
      return { key: 'red_zone', label: `Red zone · ${h} h left` };
    }
    case 'grey_zone':
      return isHot(a.status, a.hot_until, now)
        ? { key: 'grey_zone_hot', label: 'Incident area · active' }
        : { key: 'grey_zone', label: 'Incident area' };
    case 'verified':
      return { key: 'verified', label: 'On the map' };
    case 'resolved':
      return { key: 'resolved', label: 'Fixed' };
    default:
      return { key: a.status, label: a.status };
  }
}
