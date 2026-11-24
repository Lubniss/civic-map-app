// Approved design tokens (PLAN.md → Phase 4 → "Approved theme tokens").
// Contrast was measured with WCAG formulas: text ≥ 4.5:1, icons and shapes ≥ 3:1.
// Every screen takes colours from here only. Never hard-code colours in components.

export type SchemeName = 'light' | 'dark';

export interface Palette {
  bg: string;
  card: string;
  cardAlt: string;
  border: string;
  text: string;
  textMuted: string;
  accent: string;
  onAccent: string;
  accentText: string;
  tabBar: string;
  tabIcon: string;
  tabIconOff: string;
  sos: string;
  onSos: string;
  danger: string;
  /** Pin ring: white in light mode, softer #E8F0ED at night. */
  pinRing: string;
  shadow: string;
  /** Translucent backdrop behind bottom sheets / dialogs. */
  scrim: string;
}

export const palettes: Record<SchemeName, Palette> = {
  light: {
    bg: '#F6F8F7',
    card: '#FFFFFF',
    cardAlt: '#EEF3F1',
    border: '#E3E9E6',
    text: '#0F1F1A',
    textMuted: '#5B6B65',
    accent: '#15803D',
    onAccent: '#FFFFFF',
    accentText: '#15803D',
    tabBar: '#0F3D3A',
    tabIcon: '#FFFFFF',
    tabIconOff: '#8FB8B2',
    sos: '#DC2626',
    onSos: '#FFFFFF',
    danger: '#B91C1C',
    pinRing: '#FFFFFF',
    shadow: '#0F1F1A',
    scrim: 'rgba(15, 31, 26, 0.35)',
  },
  dark: {
    bg: '#0A1514',
    card: '#132120',
    cardAlt: '#1B2B29',
    border: '#2A3C3A',
    text: '#E6EFEC',
    textMuted: '#98ACA7',
    accent: '#22C55E',
    onAccent: '#04210F',
    accentText: '#4ADE80',
    tabBar: '#0F3D3A',
    tabIcon: '#FFFFFF',
    tabIconOff: '#8FB8B2',
    sos: '#DC2626',
    onSos: '#FFFFFF',
    danger: '#FCA5A5',
    pinRing: '#E8F0ED',
    shadow: '#000000',
    scrim: 'rgba(0, 0, 0, 0.5)',
  },
};

/** Map colours (Google map style is built from these in step 2). Shares the dark teal-slate tint with cards. */
export const mapColors: Record<SchemeName, { land: string; road: string; label: string; water: string }> = {
  light: { land: '#F1F3F4', road: '#FFFFFF', label: '#6B7280', water: '#D6E6EE' },
  dark: { land: '#1A2725', road: '#283735', label: '#8FA5A0', water: '#10262B' },
};

export interface BadgeColors {
  fg: string;
  bg: string;
}

export type BadgeName = 'redZone' | 'greyZone' | 'verified' | 'pending' | 'fixed' | 'riskLow' | 'riskModerate' | 'riskHigh';

/** Text / background pairs. Green only for Safe, Fixed and primary actions; Verified is slate-blue. */
export const badges: Record<SchemeName, Record<BadgeName, BadgeColors>> = {
  light: {
    redZone: { fg: '#FFFFFF', bg: '#DC2626' },
    greyZone: { fg: '#374151', bg: '#E5E7EB' },
    verified: { fg: '#2B4A6B', bg: '#E3EBF4' },
    pending: { fg: '#57534E', bg: '#EEECE8' },
    fixed: { fg: '#166534', bg: '#DCFCE7' },
    riskLow: { fg: '#166534', bg: '#DCFCE7' },
    riskModerate: { fg: '#92400E', bg: '#FEF3C7' },
    riskHigh: { fg: '#991B1B', bg: '#FEE2E2' },
  },
  dark: {
    redZone: { fg: '#FFFFFF', bg: '#DC2626' },
    greyZone: { fg: '#D1D5DB', bg: '#262B33' },
    verified: { fg: '#A9C3DE', bg: '#182633' },
    pending: { fg: '#D6D3D1', bg: '#26302E' },
    fixed: { fg: '#4ADE80', bg: '#0F2A1C' },
    riskLow: { fg: '#4ADE80', bg: '#0F2A1C' },
    riskModerate: { fg: '#FBBF24', bg: '#33270A' },
    riskHigh: { fg: '#FCA5A5', bg: '#3B1414' },
  },
};

/** Zone circles on the map (fill opacity applied when drawing). */
export const zones: Record<SchemeName, { red: string; redFill: string; grey: string; greyFill: string }> = {
  light: { red: '#DC2626', redFill: 'rgba(220, 38, 38, 0.18)', grey: '#6B7280', greyFill: 'rgba(107, 114, 128, 0.18)' },
  dark: { red: '#F87171', redFill: 'rgba(248, 113, 113, 0.22)', grey: '#9CA3AF', greyFill: 'rgba(156, 163, 175, 0.22)' },
};

export const CATEGORY_KEYS = [
  'unsafe', 'harassment', 'fire', 'accident',
  'garbage', 'road', 'light', 'water', 'other',
] as const;
export type Category = (typeof CATEGORY_KEYS)[number];

export interface CategoryStyle {
  label: string;
  emergency: boolean;
  /** Ionicons name (from @expo/vector-icons). */
  icon: string;
  light: { fill: string; icon: string };
  dark: { fill: string; icon: string };
}

const W = '#FFFFFF';
const DARK_ICON = '#1F2937';

export const categories: Record<Category, CategoryStyle> = {
  unsafe: { label: 'Unsafe area', emergency: true, icon: 'warning', light: { fill: '#DC2626', icon: W }, dark: { fill: '#EF4444', icon: W } },
  harassment: { label: 'Harassment', emergency: true, icon: 'hand-left', light: { fill: '#BE123C', icon: W }, dark: { fill: '#E11D48', icon: W } },
  fire: { label: 'Fire', emergency: true, icon: 'flame', light: { fill: '#EA580C', icon: W }, dark: { fill: '#EA580C', icon: W } },
  accident: { label: 'Accident', emergency: true, icon: 'car', light: { fill: '#7C3AED', icon: W }, dark: { fill: '#8B5CF6', icon: W } },
  garbage: { label: 'Garbage / Waste', emergency: false, icon: 'trash', light: { fill: '#92400E', icon: W }, dark: { fill: '#B7791F', icon: W } },
  road: { label: 'Pothole / Road', emergency: false, icon: 'construct', light: { fill: '#0F766E', icon: W }, dark: { fill: '#0D9488', icon: W } },
  light: { label: 'Streetlight out', emergency: false, icon: 'bulb', light: { fill: '#EAB308', icon: DARK_ICON }, dark: { fill: '#FACC15', icon: DARK_ICON } },
  water: { label: 'Water / Drainage', emergency: false, icon: 'water', light: { fill: '#0284C7', icon: W }, dark: { fill: '#0284C7', icon: W } },
  other: { label: 'Other', emergency: false, icon: 'ellipsis-horizontal', light: { fill: '#475569', icon: W }, dark: { fill: '#64748B', icon: W } },
};

/** Font family names, registered with useFonts in the root layout. */
export const fonts = {
  headingBold: 'Poppins-Bold',
  heading: 'Poppins-SemiBold',
  body: 'Inter-Regular',
  bodyMedium: 'Inter-Medium',
  bodySemi: 'Inter-SemiBold',
  bodyBold: 'Inter-Bold',
} as const;

export interface TypeStyle {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  letterSpacing?: number;
  textTransform?: 'uppercase';
  /** Cap on the phone's accessibility text size for this style. */
  maxScale: number;
}

export const type = {
  display: { fontFamily: fonts.headingBold, fontSize: 28, lineHeight: 34, maxScale: 1.3 },
  h1: { fontFamily: fonts.heading, fontSize: 22, lineHeight: 28, maxScale: 1.3 },
  h2: { fontFamily: fonts.heading, fontSize: 18, lineHeight: 24, maxScale: 1.3 },
  stat: { fontFamily: fonts.heading, fontSize: 24, lineHeight: 28, maxScale: 1.3 },
  pillTitle: { fontFamily: fonts.bodySemi, fontSize: 14, lineHeight: 18, maxScale: 1.15 },
  pillBadge: { fontFamily: fonts.bodyBold, fontSize: 11, lineHeight: 14, letterSpacing: 0.4, textTransform: 'uppercase', maxScale: 1.15 },
  body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, maxScale: 1.3 },
  bodyStrong: { fontFamily: fonts.bodySemi, fontSize: 15, lineHeight: 22, maxScale: 1.3 },
  button: { fontFamily: fonts.bodySemi, fontSize: 16, lineHeight: 20, maxScale: 1.3 },
  label: { fontFamily: fonts.bodyMedium, fontSize: 13, lineHeight: 18, maxScale: 1.3 },
  tabLabel: { fontFamily: fonts.bodyMedium, fontSize: 11, lineHeight: 14, maxScale: 1.15 },
  caption: { fontFamily: fonts.body, fontSize: 12, lineHeight: 16, maxScale: 1.3 },
} satisfies Record<string, TypeStyle>;
export type TypeName = keyof typeof type;

export const radius = {
  pill: 999,
  button: 16,
  input: 14,
  card: 20,
  sheet: 28,
  tabBar: 28,
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 } as const;

export const size = {
  touch: 44,
  mapButton: 48,
  fab: 64,
  fabLift: 16,
  tabBarHeight: 64,
} as const;
