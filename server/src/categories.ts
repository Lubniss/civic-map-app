// The categories and their wording. Must match the CHECK in 001_init.sql.
export const CATEGORY_KEYS = ['unsafe', 'harassment', 'garbage', 'road', 'light', 'water', 'other'] as const;
export type Category = (typeof CATEGORY_KEYS)[number];

export interface CategoryInfo {
  label: string;
  /** "A [very] <adj> area ..." */
  adj: string;
  /** "... with <noun> and <noun>" */
  noun: string;
}

export const CATEGORIES: Record<Category, CategoryInfo> = {
  unsafe: { label: 'Unsafe area', adj: 'unsafe', noun: 'safety concerns' },
  harassment: { label: 'Harassment', adj: 'harassment-prone', noun: 'reports of harassment' },
  garbage: { label: 'Garbage / Waste', adj: 'dirty', noun: 'a lot of waste' },
  road: { label: 'Pothole / Road', adj: 'poorly maintained', noun: 'damaged roads' },
  light: { label: 'Streetlight out', adj: 'poorly lit', noun: 'poor street lighting' },
  water: { label: 'Water / Drainage', adj: 'flood-prone', noun: 'drainage problems' },
  other: { label: 'Other', adj: 'problematic', noun: 'other issues' },
};

/** Categories where a single report creates a red zone. */
export const RED_ZONE_CATEGORIES: readonly Category[] = ['unsafe', 'harassment'];

/** Same rule as public.alert_is_visible() in the database. */
export function isVisible(status: string, expiresAt: string | null, now = Date.now()): boolean {
  return status === 'verified' || (status === 'red_zone' && expiresAt !== null && Date.parse(expiresAt) > now);
}
