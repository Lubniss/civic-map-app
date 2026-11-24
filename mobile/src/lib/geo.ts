import type { Region } from 'react-native-maps';
import type { Bbox } from './types';

/** The server refuses boxes wider than 2 degrees (server/src/geo.ts → MAX_BBOX_SPAN). */
export const MAX_BBOX_SPAN = 2;

/** Used before we know where the phone is (central New Delhi). */
export const FALLBACK_REGION: Region = { latitude: 28.6139, longitude: 77.209, latitudeDelta: 0.05, longitudeDelta: 0.05 };

export function regionToBbox(r: Region): Bbox {
  // Round to ~10 m so tiny camera wiggles don't trigger new requests.
  const round = (n: number) => Math.round(n * 10_000) / 10_000;
  return {
    minLng: round(Math.max(r.longitude - r.longitudeDelta / 2, -180)),
    minLat: round(Math.max(r.latitude - r.latitudeDelta / 2, -90)),
    maxLng: round(Math.min(r.longitude + r.longitudeDelta / 2, 180)),
    maxLat: round(Math.min(r.latitude + r.latitudeDelta / 2, 90)),
  };
}

export const bboxParam = (b: Bbox) => `${b.minLng},${b.minLat},${b.maxLng},${b.maxLat}`;

export const isBboxTooLarge = (b: Bbox) => b.maxLng - b.minLng > MAX_BBOX_SPAN || b.maxLat - b.minLat > MAX_BBOX_SPAN;

/** "just now", "5 min ago", "3 h ago", "2 days ago". */
export function timeAgo(iso: string, now = Date.now()): string {
  const mins = Math.round((now - Date.parse(iso)) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

/** "31 h" / "45 min" until a time; null if it has passed. */
export function timeLeft(iso: string | null, now = Date.now()): string | null {
  if (!iso) return null;
  const mins = Math.round((Date.parse(iso) - now) / 60_000);
  if (mins <= 0) return null;
  if (mins < 60) return `${mins} min`;
  return `${Math.round(mins / 60)} h`;
}
