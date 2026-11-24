// Phase 1 database test for Civic Map Alerting.
//
// Run from the civic-map-app folder AFTER pasting 001_init.sql into Supabase:
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

// ---------- test data ----------
const P = { lat: 0.5, lng: 0.5 };                      // garbage spot
const near = (p, metresNorth) => ({ lat: p.lat + metresNorth / 111_320, lng: p.lng });
const Q = { lat: 0.52, lng: 0.5 };                     // unsafe spot, ~2.2 km away
const BBOX_P = { min_lng: 0.49, min_lat: 0.49, max_lng: 0.511, max_lat: 0.511 };
const BBOX_Q = { min_lng: 0.49, min_lat: 0.515, max_lng: 0.51, max_lat: 0.525 };

const users = {};          // name -> id
const alertIds = new Set();

async function createUser(name) {
  const email = `civicmap-test-${name.toLowerCase()}-${Date.now()}@example.com`;
  const r = await request('/auth/v1/admin/users', { body: { email, email_confirm: true } });
  if (!r.ok) throw new Error(`Could not create test user ${name}: ${r.status} ${JSON.stringify(r.data)}`);
  users[name] = r.data.id;
}

async function report(name, point, category, severity = 2, note = 'test') {
  const r = await rpc('submit_report', {
    p_user_id: users[name], p_lat: point.lat, p_lng: point.lng,
    p_category: category, p_severity: severity, p_note: note,
    p_photo_path: `${users[name]}/test-${Date.now()}.jpg`,
  });
  if (!r.ok) return { error: errorCode(r) };
  const row = r.data[0];
  alertIds.add(row.alert_id);
  return row;
}

async function confirm(name, alertId) {
  const r = await rpc('confirm_fix', {
    p_user_id: users[name], p_alert_id: alertId,
    p_photo_path: `${users[name]}/fix-${Date.now()}.jpg`, p_note: 'fixed',
  });
  return r.ok ? r.data[0] : { error: errorCode(r) };
}

const visibleIds = async (bbox) => {
  const r = await rpc('alerts_in_bbox', bbox);
  if (!r.ok) throw new Error(`alerts_in_bbox failed: ${errorCode(r)}`);
  return r.data.map((a) => a.id);
};
const heatCount = async (bbox) => {
  const r = await rpc('report_points_in_bbox', bbox);
  if (!r.ok) throw new Error(`report_points_in_bbox failed: ${errorCode(r)}`);
  return r.data.length;
};

// ---------- the tests ----------
async function run() {
  console.log('\nSetup');
  for (const n of ['A', 'B', 'C', 'D']) await createUser(n);
  check('created 4 test users (profiles made by trigger)', true);
  const prof = await request(`/rest/v1/profiles?select=id&id=in.(${Object.values(users).join(',')})`, { method: 'GET' });
  check('a profile row exists for each new user', prof.ok && prof.data.length === 4, JSON.stringify(prof.data));

  console.log('\n3-reporter rule (garbage)');
  const g1 = await report('A', P, 'garbage');
  check('first garbage report is pending', g1.status === 'pending' && g1.is_new_alert, JSON.stringify(g1));
  check('pending alert has NO pin', !(await visibleIds(BBOX_P)).includes(g1.alert_id));
  check('pending alert still adds heat', (await heatCount(BBOX_P)) >= 1);

  const g2 = await report('A', near(P, 50), 'garbage');
  check('second report from same person joins the same alert', g2.alert_id === g1.alert_id, JSON.stringify(g2));
  check('...and still counts as 1 reporter (2 reports)', g2.reporter_count === 1 && g2.report_count === 2, JSON.stringify(g2));

  const g3 = await report('B', near(P, 120), 'garbage');
  check('2nd person: still pending', g3.alert_id === g1.alert_id && g3.status === 'pending' && g3.reporter_count === 2, JSON.stringify(g3));

  const g4 = await report('C', near(P, -100), 'garbage', 3);
  check('3rd person: verified', g4.alert_id === g1.alert_id && g4.status === 'verified' && g4.reporter_count === 3, JSON.stringify(g4));
  check('verified alert now has a pin', (await visibleIds(BBOX_P)).includes(g1.alert_id));

  const far = await report('D', near(P, 1000), 'garbage');
  check('report 1 km away starts a separate alert', far.alert_id !== g1.alert_id && far.is_new_alert, JSON.stringify(far));
  const road = await report('D', near(P, 30), 'road');
  check('different category at the same spot is a separate alert', road.alert_id !== g1.alert_id && road.status === 'pending', JSON.stringify(road));

  console.log('\nRed-zone override');
  const u1 = await report('A', Q, 'unsafe', 3);
  const hoursLeft = (new Date(u1.expires_at) - Date.now()) / 3_600_000;
  check('one unsafe report becomes a red zone', u1.status === 'red_zone', JSON.stringify(u1));
  check('red zone expires in about 48 h', hoursLeft > 47.9 && hoursLeft <= 48.01, `${hoursLeft.toFixed(2)} h`);
  check('red zone is shown straight away', (await visibleIds(BBOX_Q)).includes(u1.alert_id));

  const h1 = await report('B', near(Q, 400), 'harassment', 2);
  check('one harassment report is also a red zone', h1.status === 'red_zone', JSON.stringify(h1));

  // Pretend 48 h have passed.
  const expire = await request(`/rest/v1/alerts?id=eq.${u1.alert_id}`, {
    method: 'PATCH', body: { expires_at: new Date(Date.now() - 60_000).toISOString() },
  });
  check('(moved red zone expiry into the past)', expire.ok, JSON.stringify(expire.data));
  check('expired red zone disappears from the map', !(await visibleIds(BBOX_Q)).includes(u1.alert_id));
  const u2 = await report('B', Q, 'unsafe', 2);
  check('new unsafe report there starts a fresh red zone', u2.alert_id !== u1.alert_id && u2.status === 'red_zone', JSON.stringify(u2));

  const u3 = await report('C', near(Q, 20), 'unsafe');
  const u4 = await report('D', near(Q, -20), 'unsafe');
  check('red zone with 3 people becomes verified', u4.alert_id === u2.alert_id && u4.status === 'verified' && u4.expires_at === null, JSON.stringify(u4));

  console.log('\nFix confirmations (garbage alert, first reporter = A)');
  check('pending alert cannot be confirmed', (await confirm('B', far.alert_id)).error === 'ALERT_NOT_ACTIVE');
  check('first reporter cannot confirm', (await confirm('A', g1.alert_id)).error === 'REPORTER_CANNOT_CONFIRM');
  const f1 = await confirm('B', g1.alert_id);
  check('1st confirmation: 1/3, still verified', f1.fix_count === 1 && f1.status === 'verified', JSON.stringify(f1));
  check('same person cannot confirm twice', (await confirm('B', g1.alert_id)).error === 'ALREADY_CONFIRMED');
  const f2 = await confirm('C', g1.alert_id);
  check('2nd confirmation: 2/3', f2.fix_count === 2 && !f2.resolved, JSON.stringify(f2));
  const f3 = await confirm('D', g1.alert_id);
  check('3rd confirmation resolves the alert', f3.fix_count === 3 && f3.resolved && f3.status === 'resolved', JSON.stringify(f3));
  check('resolved alert disappears from the map', !(await visibleIds(BBOX_P)).includes(g1.alert_id));
  check('resolved alert cannot be confirmed again', (await confirm('A', g1.alert_id)).error === 'ALREADY_RESOLVED');

  console.log('\nBad input is rejected');
  const bad = await rpc('submit_report', {
    p_user_id: users.A, p_lat: P.lat, p_lng: P.lng, p_category: 'garbage', p_severity: 2, p_note: 'x',
    p_photo_path: `${users.B}/someone-elses-folder.jpg`,
  });
  check("photo path in someone else's folder", errorCode(bad) === 'INVALID_PHOTO_PATH', errorCode(bad));
  const badCat = await rpc('submit_report', {
    p_user_id: users.A, p_lat: P.lat, p_lng: P.lng, p_category: 'aliens', p_severity: 2, p_note: 'x',
    p_photo_path: `${users.A}/x.jpg`,
  });
  check('unknown category', errorCode(badCat) === 'INVALID_CATEGORY', errorCode(badCat));
  const badSev = await rpc('submit_report', {
    p_user_id: users.A, p_lat: P.lat, p_lng: P.lng, p_category: 'garbage', p_severity: 5, p_note: 'x',
    p_photo_path: `${users.A}/x.jpg`,
  });
  check('severity outside 1-3', errorCode(badSev) === 'INVALID_SEVERITY', errorCode(badSev));

  console.log('\nSecurity (using the public app key)');
  const pubRpc = await rpc('submit_report', {
    p_user_id: users.A, p_lat: P.lat, p_lng: P.lng, p_category: 'garbage', p_severity: 2, p_note: 'x',
    p_photo_path: `${users.A}/x.jpg`,
  }, PUBLISHABLE);
  check('app key cannot call submit_report', !pubRpc.ok, `HTTP ${pubRpc.status}`);
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
