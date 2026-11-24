// Phase 2 smoke test: calls every endpoint of a RUNNING server with real logins.
//
//   Terminal 1:  npm run dev
//   Terminal 2:  npm run smoke
//
// Creates 4 throwaway users (no emails are sent), uploads tiny test photos the same way
// the app will, exercises every route at 0.5°N 0.5°E (in the ocean), then deletes everything.

const SUPABASE_URL = process.env.SUPABASE_URL?.replace(/\/+$/, '');
const SECRET = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PUBLISHABLE = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const API = (process.env.API_URL ?? `http://localhost:${process.env.PORT ?? 4000}`).replace(/\/+$/, '');

if (!SUPABASE_URL || !SECRET || !PUBLISHABLE) {
  console.error('Missing Supabase settings. Run with: npm run smoke');
  process.exit(1);
}

// 1x1 JPEG
const JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
  'base64',
);

// ---------- helpers ----------
async function http(url, { method = 'GET', headers = {}, body, raw = false } = {}) {
  const res = await fetch(url, {
    method,
    headers: raw ? headers : { 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : raw ? body : JSON.stringify(body),
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, ok: res.ok, data };
}
const admin = (path, opts = {}) =>
  http(SUPABASE_URL + path, { ...opts, headers: { apikey: SECRET, Authorization: `Bearer ${SECRET}`, ...(opts.headers ?? {}) } });
const api = (path, token, opts = {}) =>
  http(API + path, { ...opts, headers: token ? { Authorization: `Bearer ${token}` } : {} });

let passed = 0, failed = 0;
function check(name, ok, detail = '') {
  if (ok) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; console.log(`  FAIL  ${name}${detail ? `  -> ${detail}` : ''}`); }
}
const short = (r) => `HTTP ${r.status} ${JSON.stringify(r.data)?.slice(0, 300)}`;

const users = {}; // name -> { id, token }
const uploaded = [];
const alertIds = new Set();

async function signIn(name) {
  const email = `civicmap-smoke-${name.toLowerCase()}-${Date.now()}@example.com`;
  const created = await admin('/auth/v1/admin/users', { method: 'POST', body: { email, email_confirm: true } });
  if (!created.ok) throw new Error(`create user ${name}: ${short(created)}`);
  const id = created.data.id;
  users[name] = { id };
  // Same one-time code the app uses, but generated here instead of emailed.
  const link = await admin('/auth/v1/admin/generate_link', { method: 'POST', body: { type: 'magiclink', email } });
  const otp = link.data?.email_otp ?? link.data?.properties?.email_otp;
  if (!link.ok || !otp) throw new Error(`generate code for ${name}: ${short(link)}`);
  const verified = await http(`${SUPABASE_URL}/auth/v1/verify`, {
    method: 'POST', headers: { apikey: PUBLISHABLE }, body: { type: 'email', email, token: otp },
  });
  if (!verified.ok || !verified.data?.access_token) throw new Error(`sign in ${name}: ${short(verified)}`);
  users[name].token = verified.data.access_token;
}

// Upload as the user, with the public key, exactly like the app will.
async function uploadPhoto(name, folderOwner = name) {
  const path = `${users[folderOwner].id}/smoke-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  const r = await http(`${SUPABASE_URL}/storage/v1/object/photos/${path}`, {
    method: 'POST', raw: true, body: JPEG,
    headers: { apikey: PUBLISHABLE, Authorization: `Bearer ${users[name].token}`, 'Content-Type': 'image/jpeg' },
  });
  if (r.ok) uploaded.push(path);
  return { ok: r.ok, status: r.status, path };
}

const P = { lat: 0.5, lng: 0.5 };
const near = (m) => ({ lat: P.lat + m / 111_320, lng: P.lng });
const BBOX = '0.49,0.49,0.51,0.51';

async function report(name, point, category, severity = 2, note = 'smoke test') {
  const photo = await uploadPhoto(name);
  if (!photo.ok) return { status: photo.status, ok: false, data: 'upload failed' };
  const r = await api('/reports', users[name].token, {
    method: 'POST', body: { ...point, category, severity, note, photo_path: photo.path },
  });
  if (r.ok) alertIds.add(r.data.alertId);
  return r;
}

// ---------- tests ----------
async function run() {
  console.log(`\nServer: ${API}`);
  const health = await api('/health');
  check('GET /health works without signing in', health.ok && health.data?.ok === true, short(health));
  if (!health.ok) throw new Error('Server is not running. Start it with "npm run dev" in another terminal.');

  const noAuth = await api(`/alerts?bbox=${BBOX}`);
  check('other routes need a login (401)', noAuth.status === 401, short(noAuth));
  const badToken = await api(`/alerts?bbox=${BBOX}`, 'not-a-real-token');
  check('a fake login token is rejected (401)', badToken.status === 401, short(badToken));

  console.log('\nSign in 4 test users with one-time codes');
  for (const n of ['A', 'B', 'C', 'D']) await signIn(n);
  check('4 users signed in', Object.values(users).every((u) => u.token));

  console.log('\nPhoto storage rules');
  const own = await uploadPhoto('A');
  check('user can upload into their own folder', own.ok, `HTTP ${own.status}`);
  const other = await uploadPhoto('A', 'B');
  check("user cannot upload into someone else's folder", !other.ok, `HTTP ${other.status}`);

  console.log('\nReports and the 3-reporter rule');
  const r1 = await report('A', P, 'garbage', 2, 'Bins overflowing');
  check('POST /reports -> 201 pending', r1.status === 201 && r1.data.status === 'pending' && r1.data.shownOnMap === false, short(r1));
  check('message explains the 3-report rule', r1.data?.message?.includes('1 of 3'), r1.data?.message);
  const id = r1.data?.alertId;

  let list = await api(`/alerts?bbox=${BBOX}`, users.B.token);
  check('GET /alerts hides the pending alert', list.ok && !list.data.alerts.some((a) => a.id === id), short(list));
  const heat = await api(`/heatmap?bbox=${BBOX}`, users.B.token);
  check('GET /heatmap includes the pending report', heat.ok && heat.data.points.length >= 1, short(heat));
  const hidden = await api(`/alerts/${id}`, users.B.token);
  check('GET /alerts/:id is 404 while pending', hidden.status === 404, short(hidden));

  const noPhoto = await api('/reports', users.B.token, {
    method: 'POST', body: { ...P, category: 'garbage', severity: 2, photo_path: `${users.B.id}/never-uploaded.jpg` },
  });
  check('report with a photo that was never uploaded -> 400', noPhoto.status === 400 && noPhoto.data.error.code === 'PHOTO_NOT_FOUND', short(noPhoto));
  const theft = await api('/reports', users.B.token, {
    method: 'POST', body: { ...P, category: 'garbage', severity: 2, photo_path: own.path },
  });
  check("report using someone else's photo -> 400", theft.status === 400, short(theft));
  const badBody = await api('/reports', users.B.token, { method: 'POST', body: { ...P, category: 'aliens', severity: 9 } });
  check('bad report body -> 400 with a message', badBody.status === 400 && !!badBody.data.error.message, short(badBody));

  const r2 = await report('B', near(80), 'garbage', 3, 'Smells bad');
  const r3 = await report('C', near(-60), 'garbage', 2, 'Dumped near the bus stop');
  check('3rd person makes it verified', r3.data?.alertId === id && r3.data?.status === 'verified' && r3.data?.shownOnMap, short(r3));
  check('2nd report joined the same alert', r2.data?.alertId === id, short(r2));

  list = await api(`/alerts?bbox=${BBOX}`, users.D.token);
  const pin = list.data?.alerts?.find((a) => a.id === id);
  check('GET /alerts now shows the pin with counts', !!pin && pin.reporterCount === 3 && pin.status === 'verified', short(list));

  const detail = await api(`/alerts/${id}`, users.A.token);
  check('GET /alerts/:id returns 3 reports with photo links',
    detail.ok && detail.data.reports.length === 3 && detail.data.reports.every((r) => r.photoUrl?.startsWith('http')), short(detail));
  check('...marks my own report and that I am the first reporter',
    detail.data?.reports?.filter((r) => r.isMine).length === 1 && detail.data?.fixes?.iAmFirstReporter === true, short(detail));
  check('...and has the right location', Math.abs(detail.data?.alert?.lat - P.lat) < 0.001 && Math.abs(detail.data?.alert?.lng - P.lng) < 0.001,
    JSON.stringify(detail.data?.alert));
  if (detail.data?.reports?.[0]?.photoUrl) {
    const img = await fetch(detail.data.reports[0].photoUrl);
    check('photo link actually opens the image', img.ok && (img.headers.get('content-type') ?? '').includes('image'), `HTTP ${img.status}`);
  }

  console.log('\nRed zone');
  const u = await report('D', near(500), 'unsafe', 3, 'Men following people at night');
  check('one unsafe report -> red zone shown at once', u.data?.status === 'red_zone' && u.data?.shownOnMap && !!u.data?.expiresAt, short(u));

  console.log('\nArea summary');
  const sum = await api(`/summary?bbox=${BBOX}`, users.D.token);
  check('GET /summary?bbox gives a headline and risk', sum.ok && typeof sum.data.headline === 'string' && !!sum.data.risk, short(sum));
  console.log(`        headline: "${sum.data?.headline}"`);
  const sumR = await api(`/summary?lat=${P.lat}&lng=${P.lng}&radius=200`, users.D.token);
  check('GET /summary around a spot counts only nearby alerts', sumR.ok && sumR.data.alertCount === 1 && sumR.data.total === 3, short(sumR));
  const badBox = await api('/summary?bbox=70,20,80,30', users.D.token);
  check('a huge map area is refused (400)', badBox.status === 400 && badBox.data.error.code === 'BBOX_TOO_LARGE', short(badBox));

  console.log('\nFix confirmations');
  const confirm = async (n) => {
    const photo = await uploadPhoto(n);
    return api(`/alerts/${id}/confirm-fix`, users[n].token, { method: 'POST', body: { photo_path: photo.path, note: 'cleaned up' } });
  };
  const fA = await confirm('A');
  check('first reporter cannot confirm (403)', fA.status === 403, short(fA));
  const fB = await confirm('B');
  check('1st confirmation: 1 of 3', fB.ok && fB.data.fixCount === 1 && !fB.data.resolved, short(fB));
  const fB2 = await confirm('B');
  check('same person twice -> 409', fB2.status === 409, short(fB2));
  const fC = await confirm('C');
  const fD = await confirm('D');
  check('3rd confirmation resolves it', fC.data?.fixCount === 2 && fD.data?.resolved === true, short(fD));
  list = await api(`/alerts?bbox=${BBOX}`, users.A.token);
  check('resolved alert is gone from the map', list.ok && !list.data.alerts.some((a) => a.id === id), short(list));
  const after = await api(`/alerts/${id}`, users.A.token);
  check('resolved alert detail still opens, marked resolved', after.ok && after.data.alert.status === 'resolved', short(after));

  const unknown = await api('/nope', users.A.token);
  check('unknown endpoint -> 404', unknown.status === 404, short(unknown));
}

async function cleanup() {
  console.log('\nCleanup');
  if (alertIds.size) {
    const r = await admin(`/rest/v1/alerts?id=in.(${[...alertIds].join(',')})`, { method: 'DELETE' });
    console.log(r.ok ? `  deleted ${alertIds.size} test alerts` : `  could not delete alerts: ${short(r)}`);
  }
  if (uploaded.length) {
    const r = await admin('/storage/v1/object/photos', { method: 'DELETE', body: { prefixes: uploaded } });
    console.log(r.ok ? `  deleted ${uploaded.length} test photos` : `  could not delete photos: ${short(r)}`);
  }
  for (const [name, u] of Object.entries(users)) {
    const r = await admin(`/auth/v1/admin/users/${u.id}`, { method: 'DELETE' });
    console.log(r.ok ? `  deleted test user ${name}` : `  could not delete user ${name}: ${short(r)}`);
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
