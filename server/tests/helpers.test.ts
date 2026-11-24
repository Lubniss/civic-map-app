import { describe, expect, it } from 'vitest';
import { CATEGORY_KEYS, EMERGENCY_CATEGORIES, isHot, isVisible, proofNeeded } from '../src/categories.js';
import { ApiError, fromDbError } from '../src/errors.js';
import { bboxAround, distanceM, parseBbox, parsePointEwkb } from '../src/geo.js';
import { isPhotoFresh } from '../src/photoRules.js';
import { myReportStatus } from '../src/routes/myReportStatus.js';
import { reportMessage } from '../src/routes/reportMessage.js';
import { confirmFixBody, parse, radiusQuery, reportBody } from '../src/schemas.js';

const USER = '11111111-1111-4111-8111-111111111111';

function expectApiError(fn: () => unknown, status: number, code: string) {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(ApiError);
    expect((e as ApiError).status).toBe(status);
    expect((e as ApiError).code).toBe(code);
    return;
  }
  throw new Error('expected an ApiError');
}

describe('parseBbox', () => {
  it('reads a valid box', () => {
    expect(parseBbox('77.1,28.5,77.3,28.7')).toEqual({ minLng: 77.1, minLat: 28.5, maxLng: 77.3, maxLat: 28.7 });
  });
  it('rejects missing, malformed, reversed and huge boxes', () => {
    expectApiError(() => parseBbox(undefined), 400, 'INVALID_BBOX');
    expectApiError(() => parseBbox('1,2,3'), 400, 'INVALID_BBOX');
    expectApiError(() => parseBbox('a,b,c,d'), 400, 'INVALID_BBOX');
    expectApiError(() => parseBbox('77.3,28.5,77.1,28.7'), 400, 'INVALID_BBOX');
    expectApiError(() => parseBbox('70,20,80,30'), 400, 'BBOX_TOO_LARGE');
  });
});

describe('distance helpers', () => {
  it('measures ~111 km per degree of latitude', () => {
    expect(distanceM(0, 0, 1, 0)).toBeGreaterThan(110_000);
    expect(distanceM(0, 0, 1, 0)).toBeLessThan(112_000);
  });
  it('bboxAround contains the whole circle', () => {
    const b = bboxAround(28.6, 77.2, 300);
    expect(distanceM(28.6, 77.2, b.maxLat, 77.2)).toBeGreaterThanOrEqual(299);
    expect(distanceM(28.6, 77.2, 28.6, b.maxLng)).toBeGreaterThanOrEqual(299);
  });
});

describe('parsePointEwkb', () => {
  it('reads a Supabase geography point', () => {
    const buf = Buffer.alloc(25);
    buf.writeUInt8(1, 0); // little endian
    buf.writeUInt32LE(0x20000001, 1); // point with SRID
    buf.writeUInt32LE(4326, 5);
    buf.writeDoubleLE(77.209, 9); // x = lng
    buf.writeDoubleLE(28.6139, 17); // y = lat
    expect(parsePointEwkb(buf.toString('hex'))).toEqual({ lat: 28.6139, lng: 77.209 });
  });
});

describe('categories', () => {
  it('has Fire and Accident, and 4 emergency categories', () => {
    expect(CATEGORY_KEYS).toContain('fire');
    expect(CATEGORY_KEYS).toContain('accident');
    expect([...EMERGENCY_CATEGORIES].sort()).toEqual(['accident', 'fire', 'harassment', 'unsafe']);
  });
  it('asks for the right proof of a fix', () => {
    expect(proofNeeded('harassment')).toContain('CCTV');
    expect(proofNeeded('accident')).toContain('road is cleared');
    expect(proofNeeded('fire')).toContain('fire is out');
  });
});

describe('isVisible / isHot (same rules as the database)', () => {
  const now = Date.parse('2026-11-24T12:00:00Z');
  it('shows verified alerts, grey zones and active red zones only', () => {
    expect(isVisible('verified', null, now)).toBe(true);
    expect(isVisible('grey_zone', null, now)).toBe(true);
    expect(isVisible('red_zone', '2026-11-25T12:00:00Z', now)).toBe(true);
    expect(isVisible('red_zone', '2026-11-24T11:00:00Z', now)).toBe(false);
    expect(isVisible('pending', null, now)).toBe(false);
    expect(isVisible('resolved', null, now)).toBe(false);
  });
  it('draws red zones and recent grey zones in red', () => {
    expect(isHot('red_zone', null, now)).toBe(true);
    expect(isHot('grey_zone', '2026-11-24T13:00:00Z', now)).toBe(true);
    expect(isHot('grey_zone', '2026-11-24T11:00:00Z', now)).toBe(false);
    expect(isHot('verified', null, now)).toBe(false);
  });
});

describe('photo freshness', () => {
  const now = Date.parse('2026-11-24T12:00:00Z');
  it('accepts photos uploaded in the last 15 minutes', () => {
    expect(isPhotoFresh('2026-11-24T11:50:00Z', now)).toBe(true);
    expect(isPhotoFresh('2026-11-24T12:00:30Z', now)).toBe(true); // small clock difference
  });
  it('refuses old, missing or nonsense times', () => {
    expect(isPhotoFresh('2026-11-24T11:40:00Z', now)).toBe(false);
    expect(isPhotoFresh(null, now)).toBe(false);
    expect(isPhotoFresh('yesterday', now)).toBe(false);
  });
});

describe('input validation', () => {
  const where = { reporter_lat: 28.6, reporter_lng: 77.2, gps_accuracy_m: 12, location_at: '2026-11-24T12:00:00.000Z' };
  const good = { lat: 28.6, lng: 77.2, category: 'garbage', severity: 2, note: 'bins', photo_path: `${USER}/a.jpg`, ...where };
  it('accepts a good report', () => {
    expect(parse(reportBody, good)).toMatchObject({ category: 'garbage', severity: 2 });
  });
  it('rejects bad reports with readable messages', () => {
    expectApiError(() => parse(reportBody, { ...good, category: 'aliens' }), 400, 'INVALID_INPUT');
    expectApiError(() => parse(reportBody, { ...good, severity: 4 }), 400, 'INVALID_INPUT');
    expectApiError(() => parse(reportBody, { ...good, lat: 95 }), 400, 'INVALID_INPUT');
    expectApiError(() => parse(reportBody, { ...good, note: 'x'.repeat(501) }), 400, 'INVALID_INPUT');
  });
  it('needs a photo for normal categories but not for emergencies', () => {
    expectApiError(() => parse(reportBody, { ...good, photo_path: undefined }), 400, 'INVALID_INPUT');
    expect(parse(reportBody, { ...good, category: 'fire', timing: 'now', photo_path: undefined }).category).toBe('fire');
  });
  it('needs "now" or "recent" for emergencies, and allows "recent" only for emergencies', () => {
    expectApiError(() => parse(reportBody, { ...good, category: 'harassment' }), 400, 'INVALID_INPUT');
    expect(parse(reportBody, { ...good, category: 'harassment', timing: 'recent' }).timing).toBe('recent');
    expectApiError(() => parse(reportBody, { ...good, timing: 'recent' }), 400, 'INVALID_INPUT');
  });
  it("needs the reporter's location and time", () => {
    expectApiError(() => parse(reportBody, { ...good, reporter_lat: undefined }), 400, 'INVALID_INPUT');
    expectApiError(() => parse(reportBody, { ...good, location_at: 'today' }), 400, 'INVALID_INPUT');
    expectApiError(() => parse(confirmFixBody, { photo_path: `${USER}/b.jpg` }), 400, 'INVALID_INPUT');
    expect(parse(confirmFixBody, { photo_path: `${USER}/b.jpg`, ...where }).reporter_lat).toBe(28.6);
  });
  it('defaults the summary radius to 300 m and caps it at 2 km', () => {
    expect(parse(radiusQuery, { lat: '28.6', lng: '77.2' }).radius).toBe(300);
    expectApiError(() => parse(radiusQuery, { lat: '28.6', lng: '77.2', radius: '5000' }), 400, 'INVALID_INPUT');
  });
});

describe('database error mapping', () => {
  it('turns database codes into friendly API errors', () => {
    expect(fromDbError({ message: 'REPORTER_CANNOT_CONFIRM' })).toMatchObject({ status: 403, code: 'REPORTER_CANNOT_CONFIRM' });
    expect(fromDbError({ message: 'ALREADY_CONFIRMED' })).toMatchObject({ status: 409 });
    expect(fromDbError({ message: 'ALERT_NOT_FOUND' })).toMatchObject({ status: 404 });
    expect(fromDbError({ message: 'TOO_FAR' })).toMatchObject({ status: 403, message: expect.stringContaining('300 m') });
    expect(fromDbError({ message: 'LOCATION_TOO_OLD' })).toMatchObject({ status: 400 });
    expect(fromDbError({ message: 'PHOTO_REQUIRED' })).toMatchObject({ status: 400 });
  });
  it('hides unknown database errors behind a 500', () => {
    const original = console.error;
    console.error = () => {};
    expect(fromDbError({ message: 'relation "x" does not exist' })).toMatchObject({ status: 500, code: 'SERVER_ERROR' });
    console.error = original;
  });
});

describe('myReportStatus (My Reports labels)', () => {
  const now = Date.parse('2026-11-24T12:00:00Z');
  const a = (status: string, extra: Partial<{ reporter_count: number; expires_at: string | null; hot_until: string | null }> = {}) =>
    ({ status, reporter_count: 1, expires_at: null, hot_until: null, ...extra });
  it('explains every state in plain words', () => {
    expect(myReportStatus(a('pending'), now).label).toBe('Waiting for 2 more reports');
    expect(myReportStatus(a('pending', { reporter_count: 2 }), now).label).toBe('Waiting for 1 more report');
    expect(myReportStatus(a('red_zone', { expires_at: '2026-11-25T19:00:00Z' }), now).label).toBe('Red zone · 31 h left');
    expect(myReportStatus(a('red_zone', { expires_at: '2026-11-24T11:00:00Z' }), now)).toEqual({ key: 'expired', label: 'Expired' });
    expect(myReportStatus(a('grey_zone', { hot_until: '2026-11-24T13:00:00Z' }), now).key).toBe('grey_zone_hot');
    expect(myReportStatus(a('grey_zone', { hot_until: '2026-11-24T11:00:00Z' }), now).label).toBe('Incident area');
    expect(myReportStatus(a('verified'), now).label).toBe('On the map');
    expect(myReportStatus(a('resolved'), now).label).toBe('Fixed');
  });
});

describe('reportMessage', () => {
  it('explains what happens next', () => {
    expect(reportMessage({ status: 'pending', reporter_count: 1, is_new_alert: true }, 'garbage'))
      .toBe('Thanks! A pin appears once 3 people report this (1 of 3 so far).');
    expect(reportMessage({ status: 'red_zone', reporter_count: 1, is_new_alert: true }, 'unsafe'))
      .toBe('Red zone created. It shows on the map for 48 hours unless more people report it.');
    expect(reportMessage({ status: 'red_zone', reporter_count: 1, is_new_alert: true }, 'fire'))
      .toContain('6 hours');
    expect(reportMessage({ status: 'grey_zone', reporter_count: 3, is_new_alert: false }, 'harassment'))
      .toContain('incident area');
    expect(reportMessage({ status: 'verified', reporter_count: 3, is_new_alert: false }, 'garbage'))
      .toContain('shows on the map');
  });
});
