// The categories and their wording. Must match the CHECK in the migrations.
export const CATEGORY_KEYS = [
  'unsafe', 'harassment', 'fire', 'accident',
  'garbage', 'road', 'light', 'water', 'other',
] as const;
export type Category = (typeof CATEGORY_KEYS)[number];

export interface CategoryInfo {
  label: string;
  /** "A [very] <adj> area ..." */
  adj: string;
  /** "... with <noun> and <noun>" */
  noun: string;
  /** Emergency categories: instant red zone, "happening now / recently", photo optional. */
  emergency: boolean;
  /** Hours an emergency stays red after its latest report (same as emergency_hours() in SQL). */
  redHours?: number;
}

export const CATEGORIES: Record<Category, CategoryInfo> = {
  unsafe: { label: 'Unsafe area', adj: 'unsafe', noun: 'safety concerns', emergency: true, redHours: 48 },
  harassment: { label: 'Harassment', adj: 'harassment-prone', noun: 'reports of harassment', emergency: true, redHours: 48 },
  fire: { label: 'Fire', adj: 'fire-affected', noun: 'fire incidents', emergency: true, redHours: 6 },
  accident: { label: 'Accident', adj: 'accident-prone', noun: 'accidents', emergency: true, redHours: 6 },
  garbage: { label: 'Garbage / Waste', adj: 'dirty', noun: 'a lot of waste', emergency: false },
  road: { label: 'Pothole / Road', adj: 'poorly maintained', noun: 'damaged roads', emergency: false },
  light: { label: 'Streetlight out', adj: 'poorly lit', noun: 'poor street lighting', emergency: false },
  water: { label: 'Water / Drainage', adj: 'flood-prone', noun: 'drainage problems', emergency: false },
  other: { label: 'Other', adj: 'problematic', noun: 'other issues', emergency: false },
};

export const EMERGENCY_CATEGORIES: readonly Category[] = CATEGORY_KEYS.filter((k) => CATEGORIES[k].emergency);

export const isEmergency = (category: string): boolean =>
  (CATEGORIES as Record<string, CategoryInfo | undefined>)[category]?.emergency === true;

/** What a "Confirm it's fixed" photo should show, per category. */
export function proofNeeded(category: string): string {
  switch (category) {
    case 'unsafe':
    case 'harassment':
      return 'A photo showing CCTV cameras or new street lighting installed here.';
    case 'fire':
      return 'A photo showing the fire is out and the site has been made safe.';
    case 'accident':
      return 'A photo showing the road is cleared (no vehicles, debris or rubble).';
    case 'garbage':
      return 'A photo showing the waste has been cleared.';
    case 'road':
      return 'A photo showing the road or footpath has been repaired.';
    case 'light':
      return 'A photo showing the streetlight working (taken after dark if possible).';
    case 'water':
      return 'A photo showing the drain or water problem fixed.';
    default:
      return 'A photo showing the problem has been fixed.';
  }
}

/** Same rule as public.alert_is_visible() in the database. */
export function isVisible(status: string, expiresAt: string | null, now = Date.now()): boolean {
  return status === 'verified' || status === 'grey_zone'
    || (status === 'red_zone' && expiresAt !== null && Date.parse(expiresAt) > now);
}

/** Draw in red? Red zones, and grey zones that are still recent. */
export function isHot(status: string, hotUntil: string | null, now = Date.now()): boolean {
  return status === 'red_zone' || (status === 'grey_zone' && hotUntil !== null && Date.parse(hotUntil) > now);
}
