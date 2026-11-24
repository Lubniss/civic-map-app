import { describe, expect, it } from 'vitest';
import { isVisible } from '../src/categories.js';
import { ApiError, fromDbError } from '../src/errors.js';
import { bboxAround, distanceM, parseBbox, parsePointEwkb } from '../src/geo.js';
import { reportMessage } from '../src/routes/reportMessage.js';
import { parse, radiusQuery, reportBody } from '../src/schemas.js';

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

describe('isVisible (same rule as the database)', () => {
  const now = Date.parse('2026-11-24T12:00:00Z');
  it('shows verified alerts and active red zones only', () => {
    expect(isVisible('verified', null, now)).toBe(true);
    expect(isVisible('red_zone', '2026-11-25T12:00:00Z', now)).toBe(true);
    expect(isVisible('red_zone', '2026-11-24T11:00:00Z', now)).toBe(false);
    expect(isVisible('pending', null, now)).toBe(false);
    expect(isVisible('resolved', null, now)).toBe(false);
  });
});

describe('input validation', () => {
  const good = { lat: 28.6, lng: 77.2, category: 'garbage', severity: 2, note: 'bins', photo_path: `${USER}/a.jpg` };
  it('accepts a good report', () => {
    expect(parse(reportBody, good)).toMatchObject({ category: 'garbage', severity: 2 });
  });
  it('rejects bad reports with readable messages', () => {
    expectApiError(() => parse(reportBody, { ...good, category: 'aliens' }), 400, 'INVALID_INPUT');
    expectApiError(() => parse(reportBody, { ...good, severity: 4 }), 400, 'INVALID_INPUT');
    expectApiError(() => parse(reportBody, { ...good, lat: 95 }), 400, 'INVALID_INPUT');
    expectApiError(() => parse(reportBody, { ...good, note: 'x'.repeat(501) }), 400, 'INVALID_INPUT');
    expectApiError(() => parse(reportBody, { ...good, photo_path: undefined }), 400, 'INVALID_INPUT');
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
  });
  it('hides unknown database errors behind a 500', () => {
    const original = console.error;
    console.error = () => {};
    expect(fromDbError({ message: 'relation "x" does not exist' })).toMatchObject({ status: 500, code: 'SERVER_ERROR' });
    console.error = original;
  });
});

describe('reportMessage', () => {
  it('explains what happens next', () => {
    expect(reportMessage({ status: 'pending', reporter_count: 1, is_new_alert: true }))
      .toBe('Thanks! A pin appears once 3 people report this (1 of 3 so far).');
    expect(reportMessage({ status: 'red_zone', reporter_count: 1, is_new_alert: true }))
      .toContain('Red zone created');
    expect(reportMessage({ status: 'verified', reporter_count: 3, is_new_alert: false }))
      .toContain('shows on the map');
  });
});
