import type { Category } from '@/theme/tokens';

export type AlertStatus = 'pending' | 'red_zone' | 'verified' | 'grey_zone' | 'resolved';

/** GET /alerts item (server/src/routes/alerts.ts → toAlertJson). */
export interface MapAlert {
  id: string;
  category: Category;
  status: AlertStatus;
  emergency: boolean;
  /** Draw red when true (red zones and recent grey zones). */
  hot: boolean;
  lat: number;
  lng: number;
  reporterCount: number;
  reportCount: number;
  avgSeverity: number;
  fixCount: number;
  expiresAt: string | null;
  hotUntil: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface HeatPoint {
  lat: number;
  lng: number;
  weight: number;
  category: Category;
}

export type RiskLevel = 'Low' | 'Medium' | 'High';

/** GET /summary (server/src/summary.ts → buildSummary). */
export interface AreaSummary {
  scope: string;
  alertCount: number;
  headline: string;
  risk: RiskLevel | null;
  redZoneCategories: Category[];
  total: number;
  avgSeverity: number;
  breakdown: { category: Category; label: string; count: number; thisWeek: number; avgSeverity: number; redZone: boolean }[];
  topIssue: string | null;
  latest: { category: Category; label: string; note: string | null; createdAt: string }[];
}

/** GET /alerts/:id */
export interface AlertDetail {
  alert: MapAlert & { verifiedAt: string | null; resolvedAt: string | null };
  /** True when the alert isn't on the map (pending / expired) and only your own report is shown. */
  onlyMine: boolean;
  reports: {
    id: string;
    category: Category;
    severity: number;
    note: string | null;
    timing: 'now' | 'recent' | null;
    createdAt: string;
    photoUrl: string | null;
    isMine: boolean;
  }[];
  fixes: {
    count: number;
    needed: number;
    proofNeeded: string;
    confirmedByMe: boolean;
    iAmFirstReporter: boolean;
    items: { note: string | null; createdAt: string; photoUrl: string | null }[];
  };
}

export type MyReportStatusKey = 'pending' | 'red_zone' | 'expired' | 'grey_zone_hot' | 'grey_zone' | 'verified' | 'resolved' | 'unknown';

/** GET /me/reports item */
export interface MyReport {
  id: string;
  alertId: string;
  category: Category;
  severity: number;
  note: string | null;
  timing: 'now' | 'recent' | null;
  lat: number;
  lng: number;
  createdAt: string;
  photoUrl: string | null;
  status: { key: MyReportStatusKey; label: string };
  reporterCount: number;
  fixCount: number;
}

export interface Bbox {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
}
