import { CATEGORIES, type Category } from '../categories.js';

export interface SubmitResult {
  alert_id: string;
  status: 'pending' | 'red_zone' | 'verified' | 'grey_zone';
  reporter_count: number;
  report_count: number;
  is_new_alert: boolean;
  expires_at: string | null;
  hot_until: string | null;
}

/** What the app tells the reporter after submitting. */
export function reportMessage(
  r: Pick<SubmitResult, 'status' | 'reporter_count' | 'is_new_alert'>,
  category: Category,
): string {
  const hours = CATEGORIES[category].redHours ?? 48;
  switch (r.status) {
    case 'grey_zone':
      return r.reporter_count === 3
        ? "3 people have now reported this. It stays on the map as an incident area until it's made safe."
        : `Thanks! This incident area now shows as active for another ${hours} hours.`;
    case 'red_zone':
      return r.is_new_alert
        ? `Red zone created. It shows on the map for ${hours} hours unless more people report it.`
        : `Thanks! This red zone now stays for another ${hours} hours.`;
    case 'verified':
      return r.reporter_count === 3
        ? 'Thanks! 3 people have now reported this, so it shows on the map.'
        : 'Thanks! Your report was added to this alert.';
    default:
      return `Thanks! A pin appears once 3 people report this (${r.reporter_count} of 3 so far).`;
  }
}
