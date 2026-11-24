// Where the phone has been in the last hour, kept ON THE PHONE ONLY (never sent anywhere except
// as the single "I was here" point attached to a "Happened recently" emergency report).
// Recorded only while the app is open (foreground location).
import * as Location from 'expo-location';
import { createContext, useCallback, useContext, useEffect, useRef, type ReactNode } from 'react';
import { distanceM } from './distance';
import { readSetting, writeSetting } from './storage';

export interface TrackPoint {
  lat: number;
  lng: number;
  accuracy: number | null;
  /** ms since epoch */
  t: number;
}

const KEY = 'location-history-v1';
const WINDOW_MS = 60 * 60_000;

function load(): TrackPoint[] {
  try {
    const raw = readSetting(KEY);
    const pts = raw ? (JSON.parse(raw) as TrackPoint[]) : [];
    const cutoff = Date.now() - WINDOW_MS;
    return pts.filter((p) => p.t >= cutoff);
  } catch {
    return [];
  }
}

interface Ctx {
  /** Points from the last hour (newest last). */
  points: () => TrackPoint[];
  /** Record a reading taken elsewhere (e.g. the report screen's fresh GPS fix). */
  add: (p: TrackPoint) => void;
}

const HistoryContext = createContext<Ctx>({ points: () => [], add: () => {} });

export function LocationHistoryProvider({ children }: { children: ReactNode }) {
  const pts = useRef<TrackPoint[]>(load());

  const add = useCallback((p: TrackPoint) => {
    const cutoff = Date.now() - WINDOW_MS;
    pts.current = [...pts.current.filter((x) => x.t >= cutoff), p].slice(-400);
    writeSetting(KEY, JSON.stringify(pts.current));
  }, []);

  useEffect(() => {
    let sub: Location.LocationSubscription | null = null;
    let cancelled = false;
    (async () => {
      const perm = await Location.getForegroundPermissionsAsync();
      if (perm.status !== 'granted' || cancelled) return;
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, distanceInterval: 25, timeInterval: 30_000 },
        (loc) => add({ lat: loc.coords.latitude, lng: loc.coords.longitude, accuracy: loc.coords.accuracy, t: loc.timestamp }),
      );
      if (cancelled) sub.remove();
    })().catch(() => {});
    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [add]);

  const points = useCallback(() => {
    const cutoff = Date.now() - WINDOW_MS;
    return pts.current.filter((p) => p.t >= cutoff);
  }, []);

  return <HistoryContext.Provider value={{ points, add }}>{children}</HistoryContext.Provider>;
}

export const useLocationHistory = () => useContext(HistoryContext);

/** Same allowance as the server: 300 m + GPS error (max +100 m). */
export const allowedDistance = (accuracy: number | null) => 300 + Math.min(Math.max(accuracy ?? 0, 0), 100);

/** The history point that best proves the user was near `spot` in the last hour (or null). */
export function bestRecentPoint(points: TrackPoint[], spot: { lat: number; lng: number }): TrackPoint | null {
  let best: TrackPoint | null = null;
  let bestD = Infinity;
  for (const p of points) {
    const d = distanceM(p.lat, p.lng, spot.lat, spot.lng);
    if (d <= allowedDistance(p.accuracy) && d < bestD) {
      best = p;
      bestD = d;
    }
  }
  return best;
}
