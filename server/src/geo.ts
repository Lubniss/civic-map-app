import { ApiError } from './errors.js';

export interface Bbox {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
}

/** Largest map area one request may ask for, in degrees (~220 km). */
export const MAX_BBOX_SPAN = 2;

/** Parses "minLng,minLat,maxLng,maxLat". */
export function parseBbox(value: unknown): Bbox {
  if (typeof value !== 'string') throw new ApiError(400, 'INVALID_BBOX', 'bbox must be "minLng,minLat,maxLng,maxLat".');
  const parts = value.split(',').map((p) => Number(p.trim()));
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
    throw new ApiError(400, 'INVALID_BBOX', 'bbox must be four numbers: minLng,minLat,maxLng,maxLat.');
  }
  const [minLng, minLat, maxLng, maxLat] = parts as [number, number, number, number];
  if (minLng < -180 || maxLng > 180 || minLat < -90 || maxLat > 90 || minLng >= maxLng || minLat >= maxLat) {
    throw new ApiError(400, 'INVALID_BBOX', 'bbox corners are out of range or in the wrong order.');
  }
  if (maxLng - minLng > MAX_BBOX_SPAN || maxLat - minLat > MAX_BBOX_SPAN) {
    throw new ApiError(400, 'BBOX_TOO_LARGE', 'Zoom in to see alerts for this area.');
  }
  return { minLng, minLat, maxLng, maxLat };
}

const METRES_PER_DEGREE_LAT = 111_320;

/** A box that fully contains a circle of radiusM around a point. */
export function bboxAround(lat: number, lng: number, radiusM: number): Bbox {
  const dLat = radiusM / METRES_PER_DEGREE_LAT;
  const dLng = radiusM / (METRES_PER_DEGREE_LAT * Math.max(Math.cos((lat * Math.PI) / 180), 0.01));
  return {
    minLat: Math.max(lat - dLat, -90),
    maxLat: Math.min(lat + dLat, 90),
    minLng: Math.max(lng - dLng, -180),
    maxLng: Math.min(lng + dLng, 180),
  };
}

/** Great-circle distance in metres. */
export function distanceM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_008.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Supabase returns geography(Point) columns as EWKB hex, e.g. "0101000020E6100000...".
 * Reads the point back as { lat, lng }.
 */
export function parsePointEwkb(hex: string): { lat: number; lng: number } {
  const buf = Buffer.from(hex, 'hex');
  if (buf.length < 21) throw new Error('Not a WKB point');
  const little = buf.readUInt8(0) === 1;
  const readU32 = (o: number) => (little ? buf.readUInt32LE(o) : buf.readUInt32BE(o));
  const readF64 = (o: number) => (little ? buf.readDoubleLE(o) : buf.readDoubleBE(o));
  const type = readU32(1);
  const hasSrid = (type & 0x20000000) !== 0;
  if ((type & 0xff) !== 1) throw new Error('Not a WKB point');
  const offset = hasSrid ? 9 : 5;
  return { lng: readF64(offset), lat: readF64(offset + 8) };
}
