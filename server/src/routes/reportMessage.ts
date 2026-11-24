export interface SubmitResult {
  alert_id: string;
  status: 'pending' | 'red_zone' | 'verified';
  reporter_count: number;
  report_count: number;
  is_new_alert: boolean;
  expires_at: string | null;
}

/** What the app tells the reporter after submitting. */
export function reportMessage(r: Pick<SubmitResult, 'status' | 'reporter_count' | 'is_new_alert'>): string {
  if (r.status === 'verified') {
    return r.reporter_count === 3
      ? 'Thanks! 3 people have now reported this, so it shows on the map.'
      : 'Thanks! Your report was added to this alert.';
  }
  if (r.status === 'red_zone') {
    return r.is_new_alert
      ? 'Red zone created. It shows on the map for 48 hours unless more people report it.'
      : 'Thanks! This red zone now stays for another 48 hours.';
  }
  return `Thanks! A pin appears once 3 people report this (${r.reporter_count} of 3 so far).`;
}
