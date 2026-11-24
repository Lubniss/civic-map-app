// Database test for Civic Map Alerting (001_init.sql + 002_report_rules.sql).
//
// Run from the civic-map-app folder:
//   node --env-file=server/.env --env-file=mobile/.env supabase/tests/db-test.mjs
//
// It creates 4 throwaway test users and some alerts in the ocean at 0.5°N 0.5°E,
// checks every rule from PLAN.md, then deletes everything it created.
// No extra packages needed (Node 20+).

const URL = process.env.SUPABASE_URL?.replace(/\/+$/, '');
const SECRET = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PUBLISHABLE = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!URL || !SECRET || !PUBLISHABLE) {
  console.error('Missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY or EXPO_PUBLIC_SUPABASE_ANON_KEY. Run with both --env-file flags.');
  process.exit(1);
}

// ---------- tiny REST helpers ----------
async function request(path, { method = 'POST', body, key = SECRET } = {}) {
  const res = await fetch(URL + path, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { ok: res.ok, status: res.status, data };
}
const rpc = (name, args, key) => request(`/rest/v1/rpc/${name}`, { body: args, key });
const errorCode = (r) => (r.data && typeof r.data === 'object' ? r.data.message : String(r.data));

// ---------- tiny test runner ----------
let passed = 0, failed = 0;
function check(name, condition, detail = '') {
  if (condition) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; console.log(`  FAIL  ${name}${detail ? `  -> ${detail}` : ''}`); }
}

// ---------- test data (all in the ocean) ----------
const P = { lat: 0.5, lng: 0.5 };                       // garbage spot
const Q = { lat: 0.52, lng: 0.5 };                      // unsafe spot (~2.2 km north)
const F = { lat: 0.5, lng: 0.53 };                      // fire spot (~3.3 km east)
const north = (p, m) => ({ lat: p.lat + m / 111_320, lng: p.lng });
const BBOX_P = { min_lng: 0.49, min_lat: 0.49, max_lng: 0.511, max_lat: 0.511 };
const BBOX_Q = { min_lng: 0.49, min_lat: 0.515, max_lng: 0.51, max_lat: 0.525 };
const BBOX_F = { min_lng: 0.52, min_lat: 0.49, max_lng: 0.54, max_lat: 0.51 };
const minutesAgo = (m) => new Date(Date.now() - m * 60_000).toISOString();

const users = {};          // name -> id
const alertIds = new Set();

async function createUser(name) {
  const email = `civicmap-test-${name.toLowerCase()}-${Date.now()}@example.com`;
  const r = await request('/auth/v1/admin/users', { body: { email, email_confirm: true } });
  if (!r.ok) throw new Error(`Could not create test user ${name}: ${r.status} ${JSON.stringify(r.data)}`);
  users[name] = r.data.id;
}

/**
 * Submit a report. By default the reporter stands on the spot with good GPS, right now.
 * opts: { severity, timing, photo (false = none), from (reporter point), accuracy, at (ISO time) }
 */
async function report(name, point, category, opts = {}) {
  const from = opts.from ?? point;
  const r = await rpc('submit_report', {
    p_user_id: users[name], p_lat: point.lat, p_lng: point.lng,
    p_category: category, p_severity: opts.severity ?? 2, p_note: 'test',
    p_photo_path: opts.photo === false ? null : `${users[name]}/test-${Date.now()}.jpg`,
    p_timing: opts.timing ?? null,
    p_reporter_lat: from.lat, p_reporter_lng: from.lng,
    p_gps_accuracy_m: opts.accuracy ?? 10,
    p_location_at: opts.at ?? new Date().toISOString(),
  });
  if (!r.ok) return { error: errorCode(r) };
  const row = r.data[0];
  alertIds.add(row.alert_id);
  return row;
}

async function confirm(name, alertId, at, opts = {}) {
  const from = opts.from ?? at;
  const r = await rpc('confirm_fix', {
    p_user_id: users[name], p_alert_id: alertId,
    p_photo_path: `${users[name]}/fix-${Date.now()}.jpg`, p_note: 'fixed',
    p_reporter_lat: from.lat, p_reporter_lng: from.lng, p_gps_accuracy_m: 10,
    p_location_at: new Date().toISOString(),
  });
  return r.ok ? r.data[0] : { error: errorCode(r) };
}

async function inBbox(bbox) {
  const r = await rpc('alerts_in_bbox', bbox);
  if (!r.ok) throw new Error(`alerts_in_bbox failed: ${errorCode(r)}`);
  return r.data;
}
const visibleIds = async (bbox) => (await inBbox(bbox)).map((a) => a.id);
const heatCount = async (bbox) => {
  const r = await rpc('report_points_in_bbox', bbox);
  if (!r.ok) throw new Error(`report_points_in_bbox failed: ${errorCode(r)}`);
  return r.data.length;
};
const patchAlert = (id, body) => request(`/rest/v1/alerts?id=eq.${id}`, { method: 'PATCH', body });
const hoursUntil = (iso) => (new Date(iso) - Date.now()) / 3_600_000;

// ---------- the tests ----------
async function run() {
  console.log('\nSetup');
  for (const n of ['A', 'B', 'C', 'D']) await createUser(n);
  check('created 4 test users', true);
  const prof = await request(`/rest/v1/profiles?select=id&id=in.(${Object.values(users).join(',')})`, { method: 'GET' });
  check('a profile row exists for each new user', prof.ok && prof.data.length === 4, JSON.stringify(prof.data));

  console.log('\n3-reporter rule (garbage)');
  const g1 = await report('A', P, 'garbage');
  check('first garbage report is pending', g1.status === 'pending' && g1.is_new_alert, JSON.stringify(g1));
  check('pending alert has NO pin', !(await visibleIds(BBOX_P)).includes(g1.alert_id));
  check('pending alert still adds heat', (await heatCount(BBOX_P)) >= 1);
  const g2 = await report('A', north(P, 50), 'garbage');
  check('same person again joins the alert and still counts as 1 reporter',
    g2.alert_id === g1.alert_id && g2.reporter_count === 1 && g2.report_count === 2, JSON.stringify(g2));
  const g3 = await report('B', north(P, 120), 'garbage');
  check('2nd person: still pending', g3.alert_id === g1.alert_id && g3.status === 'pending' && g3.reporter_count === 2, JSON.stringify(g3));
  const g4 = await report('C', north(P, -100), 'garbage', { severity: 3 });
  check('3rd person: verified', g4.alert_id === g1.alert_id && g4.status === 'verified', JSON.stringify(g4));
  check('verified alert has a pin', (await visibleIds(BBOX_P)).includes(g1.alert_id));
  const far = await report('D', north(P, 1000), 'garbage');
  check('report 1 km away starts a separate alert', far.alert_id !== g1.alert_id && far.is_new_alert, JSON.stringify(far));
  const road = await report('D', north(P, 30), 'road');
  check('different category at the same spot is separate', road.alert_id !== g1.alert_id && road.status === 'pending', JSON.stringify(road));

  console.log('\n300 m rule');
  check('reporter 500 m away is refused', (await report('B', P, 'road', { from: north(P, 500) })).error === 'TOO_FAR');
  check('350 m away with 80 m GPS error is allowed (300 + 80)',
    !(await report('B', north(P, 2000), 'water', { from: north(P, 2350), accuracy: 80 })).error);
  check('350 m away with 20 m GPS error is refused',
    (await report('C', north(P, 2000), 'water', { from: north(P, 2350), accuracy: 20 })).error === 'TOO_FAR');
  check('GPS error allowance is capped at 100 m (420 m away, 500 m error)',
    (await report('C', north(P, 2000), 'water', { from: north(P, 2420), accuracy: 500 })).error === 'TOO_FAR');
  check('location from 10 minutes ago is refused for a normal report',
    (await report('B', P, 'road', { at: minutesAgo(10) })).error === 'LOCATION_TOO_OLD');
  check('location time in the future is refused',
    (await report('B', P, 'road', { at: new Date(Date.now() + 10 * 60_000).toISOString() })).error === 'INVALID_LOCATION_TIME');
  const noLoc = await rpc('submit_report', {
    p_user_id: users.B, p_lat: P.lat, p_lng: P.lng, p_category: 'road', p_severity: 2, p_note: 'x',
    p_photo_path: `${users.B}/x.jpg`, p_timing: null, p_reporter_lat: null, p_reporter_lng: null,
    p_gps_accuracy_m: null, p_location_at: null,
  });
  check('report without the reporter location is refused', errorCode(noLoc) === 'LOCATION_REQUIRED', errorCode(noLoc));

  console.log('\nPhotos and timing');
  check('normal category without a photo is refused', (await report('B', P, 'road', { photo: false })).error === 'PHOTO_REQUIRED');
  check('normal category cannot be reported "recently"', (await report('B', P, 'road', { timing: 'recent' })).error === 'TIMING_NOT_ALLOWED');
  check('emergency without now/recent is refused', (await report('A', Q, 'unsafe')).error === 'TIMING_REQUIRED');

  console.log('\nRed zones (Unsafe, 48 h)');
  const u1 = await report('A', Q, 'unsafe', { severity: 3, timing: 'now', photo: false });
  check('one unsafe report, no photo -> red zone', u1.status === 'red_zone', JSON.stringify(u1));
  check('expires in about 48 h', Math.abs(hoursUntil(u1.expires_at) - 48) < 0.05, `${hoursUntil(u1.expires_at).toFixed(2)} h`);
  const qRow = (await inBbox(BBOX_Q)).find((a) => a.id === u1.alert_id);
  check('red zone is shown at once, marked hot', qRow?.hot === true, JSON.stringify(qRow));
  const h1 = await report('B', north(Q, 400), 'harassment', { timing: 'now', photo: false });
  check('one harassment report is also a red zone', h1.status === 'red_zone', JSON.stringify(h1));

  await patchAlert(u1.alert_id, { expires_at: minutesAgo(1) });
  check('expired red zone disappears', !(await visibleIds(BBOX_Q)).includes(u1.alert_id));
  const u2 = await report('B', Q, 'unsafe', { timing: 'now', photo: false });
  check('new report there starts a fresh red zone', u2.alert_id !== u1.alert_id && u2.status === 'red_zone', JSON.stringify(u2));

  console.log('\n"Happened recently" (report from a safe place within 1 hour)');
  const r40 = await report('C', north(Q, 20), 'unsafe', { timing: 'recent', from: north(Q, 20), at: minutesAgo(40), photo: false });
  check('location from 40 min ago is accepted for "recent"', r40.alert_id === u2.alert_id, JSON.stringify(r40));
  check('location from 70 min ago is refused',
    (await report('D', Q, 'harassment', { timing: 'recent', at: minutesAgo(70), photo: false })).error === 'LOCATION_TOO_OLD');
  check('"recent" still needs to have been within 300 m',
    (await report('D', Q, 'harassment', { timing: 'recent', from: north(Q, 900), at: minutesAgo(20), photo: false })).error === 'TOO_FAR');

  console.log('\nGrey zones');
  const u4 = await report('D', north(Q, -20), 'unsafe', { timing: 'now', photo: false });
  check('3rd person turns the red zone into a grey zone', u4.alert_id === u2.alert_id && u4.status === 'grey_zone', JSON.stringify(u4));
  check('grey zone has no expiry, is hot for ~48 h',
    u4.expires_at === null && Math.abs(hoursUntil(u4.hot_until) - 48) < 0.05, JSON.stringify(u4));
  let gz = (await inBbox(BBOX_Q)).find((a) => a.id === u2.alert_id);
  check('recent grey zone is shown hot (red)', gz?.status === 'grey_zone' && gz?.hot === true, JSON.stringify(gz));
  await patchAlert(u2.alert_id, { hot_until: minutesAgo(1) });
  gz = (await inBbox(BBOX_Q)).find((a) => a.id === u2.alert_id);
  check('after it cools it stays on the map, shown grey', gz?.status === 'grey_zone' && gz?.hot === false, JSON.stringify(gz));
  const u5 = await report('A', north(Q, 10), 'unsafe', { timing: 'now', photo: false });
  check('a new report makes the grey zone hot again', u5.alert_id === u2.alert_id && u5.status === 'grey_zone' && hoursUntil(u5.hot_until) > 47, JSON.stringify(u5));

  console.log('\nFire and Accident (6 h)');
  const f1 = await report('A', F, 'fire', { severity: 3, timing: 'now', photo: false });
  check('one fire report -> red zone for about 6 h', f1.status === 'red_zone' && Math.abs(hoursUntil(f1.expires_at) - 6) < 0.05, JSON.stringify(f1));
  const a1 = await report('B', north(F, 600), 'accident', { timing: 'recent', at: minutesAgo(15) });
  check('accident reported "recently", with a photo -> red zone for about 6 h',
    a1.status === 'red_zone' && Math.abs(hoursUntil(a1.expires_at) - 6) < 0.05, JSON.stringify(a1));
  await report('B', north(F, 30), 'fire', { timing: 'now', photo: false });
  const f3 = await report('C', north(F, -30), 'fire', { timing: 'now', photo: false });
  check('3 fire reporters -> grey zone, hot for about 6 h',
    f3.alert_id === f1.alert_id && f3.status === 'grey_zone' && Math.abs(hoursUntil(f3.hot_until) - 6) < 0.05, JSON.stringify(f3));
  check('fire grey zone is visible', (await visibleIds(BBOX_F)).includes(f1.alert_id));

  console.log('\nFix confirmations');
  check('pending alert cannot be confirmed', (await confirm('B', far.alert_id, north(P, 1000))).error === 'ALERT_NOT_ACTIVE');
  check('first reporter cannot confirm', (await confirm('A', g1.alert_id, P)).error === 'REPORTER_CANNOT_CONFIRM');
  check('confirming from 600 m away is refused', (await confirm('B', g1.alert_id, P, { from: north(P, 600) })).error === 'TOO_FAR');
  const fB = await confirm('B', g1.alert_id, P);
  check('1st confirmation: 1/3', fB.fix_count === 1 && fB.status === 'verified', JSON.stringify(fB));
  check('same person cannot confirm twice', (await confirm('B', g1.alert_id, P)).error === 'ALREADY_CONFIRMED');
  await confirm('C', g1.alert_id, P);
  const fD = await confirm('D', g1.alert_id, P);
  check('3rd confirmation resolves the alert', fD.resolved && fD.status === 'resolved', JSON.stringify(fD));
  check('resolved alert disappears from the map', !(await visibleIds(BBOX_P)).includes(g1.alert_id));
  check('resolved alert cannot be confirmed again', (await confirm('B', g1.alert_id, P)).error === 'ALREADY_RESOLVED');

  // Grey zone (fire, first reporter A): B and C reported it too; they may still confirm the fix.
  const gzB = await confirm('B', f1.alert_id, F);
  const gzC = await confirm('C', f1.alert_id, F);
  const gzD = await confirm('D', f1.alert_id, F);
  check('grey zone resolves after 3 proof photos', gzB.fix_count === 1 && gzC.fix_count === 2 && gzD.resolved === true, JSON.stringify(gzD));
  check('resolved grey zone disappears', !(await visibleIds(BBOX_F)).includes(f1.alert_id));

  console.log('\nBad input is rejected');
  check("photo in someone else's folder",
    (await rpc('submit_report', {
      p_user_id: users.A, p_lat: P.lat, p_lng: P.lng, p_category: 'garbage', p_severity: 2, p_note: 'x',
      p_photo_path: `${users.B}/x.jpg`, p_timing: null, p_reporter_lat: P.lat, p_reporter_lng: P.lng,
      p_gps_accuracy_m: 5, p_location_at: new Date().toISOString(),
    })).data?.message === 'INVALID_PHOTO_PATH');
  check('unknown category', (await report('A', P, 'aliens')).error === 'INVALID_CATEGORY');
  check('severity outside 1-3', (await report('A', P, 'garbage', { severity: 5 })).error === 'INVALID_SEVERITY');

  console.log('\nSecurity (using the public app key)');
  const pubRpc = await rpc('submit_report', {
    p_user_id: users.A, p_lat: P.lat, p_lng: P.lng, p_category: 'garbage', p_severity: 2, p_note: 'x',
    p_photo_path: `${users.A}/x.jpg`, p_timing: null, p_reporter_lat: P.lat, p_reporter_lng: P.lng,
    p_gps_accuracy_m: 5, p_location_at: new Date().toISOString(),
  }, PUBLISHABLE);
  check('app key cannot call submit_report', !pubRpc.ok, `HTTP ${pubRpc.status}`);
  const pubBbox = await rpc('alerts_in_bbox', BBOX_P, PUBLISHABLE);
  check('app key cannot call alerts_in_bbox', !pubBbox.ok, `HTTP ${pubBbox.status}`);
  const pubRead = await request('/rest/v1/alerts?select=id&limit=1', { method: 'GET', key: PUBLISHABLE });
  check('app key cannot read the alerts table', !pubRead.ok || (Array.isArray(pubRead.data) && pubRead.data.length === 0), `HTTP ${pubRead.status}`);
  const bucket = await request('/storage/v1/bucket/photos', { method: 'GET' });
  check('private "photos" bucket exists', bucket.ok && bucket.data.public === false, JSON.stringify(bucket.data));
}

async function cleanup() {
  console.log('\nCleanup');
  if (alertIds.size) {
    const r = await request(`/rest/v1/alerts?id=in.(${[...alertIds].join(',')})`, { method: 'DELETE' });
    console.log(r.ok ? `  deleted ${alertIds.size} test alerts (and their reports)` : `  could not delete test alerts: ${JSON.stringify(r.data)}`);
  }
  for (const [name, id] of Object.entries(users)) {
    const r = await request(`/auth/v1/admin/users/${id}`, { method: 'DELETE' });
    console.log(r.ok ? `  deleted test user ${name}` : `  could not delete test user ${name}: ${JSON.stringify(r.data)}`);
  }
}

try {
  await run();
} catch (e) {
  failed++;
  console.log(`\n  ERROR  ${e.message}`);
} finally {
  await cleanup();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
