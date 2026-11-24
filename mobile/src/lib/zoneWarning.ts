// "You're entering a dangerous or unhealthy area" (phase 4 preview: while the app is open).
// Rules (PLAN.md → Zone-entry alerts):
//   - red zones and grey zones (150 m), unhealthy areas = verified garbage / water (100 m),
//     poorly lit streets = verified streetlight-out (100 m), only 8 PM–5 AM
//   - the same zone warns at most once every 6 hours (remembered on the phone only)
import { categories } from '@/theme/tokens';
import { distanceM } from './distance';
import { timeAgo } from './geo';
import { readSetting, writeSetting } from './storage';
import type { MapAlert } from './types';

export const ZONE_RADIUS_M = 150;
export const PIN_RADIUS_M = 100;
export const COOLDOWN_MS = 6 * 60 * 60_000;
const SEEN_KEY = 'zone-warnings-seen-v1';

export type WarningTone = 'danger' | 'history' | 'unhealthy' | 'dark';

export interface ZoneWarning {
  alert: MapAlert;
  tone: WarningTone;
  message: string;
}

const isNight = (d: Date) => d.getHours() >= 20 || d.getHours() < 5;

function classify(a: MapAlert, now: Date): { tone: WarningTone; radius: number; priority: number } | null {
  if (a.status === 'red_zone' || (a.status === 'grey_zone' && a.hot)) return { tone: 'danger', radius: ZONE_RADIUS_M, priority: 0 };
  if (a.status === 'grey_zone') return { tone: 'history', radius: ZONE_RADIUS_M, priority: 1 };
  if (a.status !== 'verified') return null;
  if (a.category === 'light') return isNight(now) ? { tone: 'dark', radius: PIN_RADIUS_M, priority: 2 } : null;
  if (a.category === 'garbage' || a.category === 'water') return { tone: 'unhealthy', radius: PIN_RADIUS_M, priority: 3 };
  return null;
}

export function warningMessage(a: MapAlert, tone: WarningTone): string {
  const label = categories[a.category].label;
  switch (tone) {
    case 'danger':
      return `Heads up: ${label} reported here ${timeAgo(a.updatedAt)}`;
    case 'history':
      return `Incidents (${label.toLowerCase()}) were reported in this area`;
    case 'dark':
      return 'Poorly lit street: a streetlight is reported out here';
    case 'unhealthy':
      return a.category === 'garbage' ? 'Heavy waste reported in this area' : 'Drainage problems reported in this area';
  }
}

/** The most important zone the user is inside right now that hasn't warned in the last 6 h (pure; no side effects). */
export function findZoneWarning(
  alerts: MapAlert[],
  me: { lat: number; lng: number },
  seen: Record<string, number>,
  now = new Date(),
): ZoneWarning | null {
  let best: { a: MapAlert; tone: WarningTone; priority: number; d: number } | null = null;
  for (const a of alerts) {
    const c = classify(a, now);
    if (!c) continue;
    const d = distanceM(me.lat, me.lng, a.lat, a.lng);
    if (d > c.radius) continue;
    if ((seen[a.id] ?? 0) > now.getTime() - COOLDOWN_MS) continue;
    if (!best || c.priority < best.priority || (c.priority === best.priority && d < best.d)) {
      best = { a, tone: c.tone, priority: c.priority, d };
    }
  }
  return best ? { alert: best.a, tone: best.tone, message: warningMessage(best.a, best.tone) } : null;
}

export function readSeen(): Record<string, number> {
  try {
    const raw = readSetting(SEEN_KEY);
    const all = raw ? (JSON.parse(raw) as Record<string, number>) : {};
    const cutoff = Date.now() - COOLDOWN_MS;
    return Object.fromEntries(Object.entries(all).filter(([, t]) => t > cutoff));
  } catch {
    return {};
  }
}

export function markSeen(alertId: string): void {
  const seen = readSeen();
  seen[alertId] = Date.now();
  writeSetting(SEEN_KEY, JSON.stringify(seen));
}
