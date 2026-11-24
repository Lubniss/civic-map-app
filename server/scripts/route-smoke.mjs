// Phase 6 live test: Fastest vs. Safest Route against a RUNNING server and the real routing provider.
//
//   Terminal 1:  npm run dev
//   Terminal 2:  npm run route-smoke
//
// Plans India Gate → Connaught Place (walking), puts 3 throwaway unsafe red zones on the fastest route,
// plans again and checks the safest route avoids them. Deletes everything it created.

const SUPABASE_URL = process.env.SUPABASE_URL?.replace(/\/+$/, '');
const SECRET = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PUBLISHABLE = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const API = (process.env.API_URL ?? `http://localhost:${process.env.PORT ?? 4000}`).replace(/\/+$/, '');

const ORIGIN = { lat: 28.6129, lng: 77.2295 }; // India Gate
const DEST = { lat: 28.6304, lng: 77.2177 }; // Connaught Place

async function http(url, { method = 'GET', headers = {}, body } = {}) {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, ok: res.ok, data };
}
const admin = (path, opts = {}) => http(SUPABASE_URL + path, { ...opts, headers: { apikey: SECRET, Authorization: `Bearer ${SECRET}` } });
let passed = 0, failed = 0;
const check = (name, ok, detail = '') => {
  if (ok) { passed++; console.log(`  PASS  ${name}`); } else { failed++; console.log(`  FAIL  ${name}${detail ? `  -> ${detail}` : ''}`); }
};
const short = (r) => `HTTP ${r.status} ${JSON.stringify(r.data)?.slice(0, 300)}`;

const userIds = [];
const alertIds = new Set();
let token;

async function run() {
  // A signed-in test user (fake confirmed phone, no SMS) to call the API.
  const email = `civicmap-route-${Date.now()}@example.com`;
  const u = await admin('/auth/v1/admin/users', { method: 'POST', body: { email, email_confirm: true, phone: `+1555${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`, phone_confirm: true } });
  userIds.push(u.data.id);
  const link = await admin('/auth/v1/admin/generate_link', { method: 'POST', body: { type: 'magiclink', email } });
  const v = await http(`${SUPABASE_URL}/auth/v1/verify`, { method: 'POST', headers: { apikey: PUBLISHABLE }, body: { type: 'email', email, token: link.data.email_otp } });
  token = v.data.access_token;
  const api = (path, opts = {}) => http(API + path, { ...opts, headers: { Authorization: `Bearer ${token}` } });

  console.log('\nSearch');
  const s = await api(`/geocode?q=${encodeURIComponent('Connaught Place')}&lat=${ORIGIN.lat}&lng=${ORIGIN.lng}`);
  check('GET /geocode finds places', s.ok && s.data.places.length > 0 && s.data.places[0].label, short(s));
  const rv = await api(`/geocode/reverse?lat=${ORIGIN.lat}&lng=${ORIGIN.lng}`);
  check('GET /geocode/reverse names the spot', rv.ok && rv.data.place?.label, short(rv));

  console.log('\nPlan before any alerts');
  const body = { origin: ORIGIN, destination: DEST, mode: 'walking', localHour: 22 };
  const p1 = await api('/routes/plan', { method: 'POST', body });
  check('POST /routes/plan returns fastest + safest', p1.ok && p1.data.fastest?.coordinates.length > 1 && p1.data.safest, short(p1));
  if (!p1.ok) return;
  console.log(`        fastest: ${Math.round(p1.data.fastest.distanceM)} m, ${Math.round(p1.data.fastest.durationS / 60)} min, risk ${p1.data.fastest.riskScore} · candidates ${p1.data.candidates}`);
  console.log(`        "${p1.data.explanation}"`);

  // Put 3 unsafe red zones on the fastest route, at 30% / 50% / 70% along it.
  const coords = p1.data.fastest.coordinates;
  const spots = [0.3, 0.5, 0.7].map((f) => coords[Math.floor(coords.length * f)]);
  for (const [i, spot] of spots.entries()) {
    const reporter = await admin('/auth/v1/admin/users', { method: 'POST', body: { email: `civicmap-route-r${i}-${Date.now()}@example.com`, email_confirm: true } });
    userIds.push(reporter.data.id);
    const r = await admin('/rest/v1/rpc/submit_report', {
      method: 'POST',
      body: {
        p_user_id: reporter.data.id, p_lat: spot.lat, p_lng: spot.lng, p_category: 'unsafe', p_severity: 3, p_note: 'route test',
        p_photo_path: null, p_timing: 'now', p_reporter_lat: spot.lat, p_reporter_lng: spot.lng, p_gps_accuracy_m: 5,
        p_location_at: new Date().toISOString(),
      },
    });
    if (r.ok) alertIds.add(r.data[0].alert_id);
  }
  check('placed 3 test red zones on the fastest route', alertIds.size === 3, `${alertIds.size}`);

  console.log('\nPlan again');
  const p2 = await api('/routes/plan', { method: 'POST', body });
  check('POST /routes/plan still works', p2.ok, short(p2));
  if (!p2.ok) return;
  const f = p2.data.fastest;
  const sf = p2.data.safest;
  console.log(`        fastest: ${Math.round(f.durationS / 60)} min, risk ${f.riskScore} (${f.riskLevel}), ${f.alerts.length} alerts`);
  console.log(`        safest:  ${Math.round(sf.durationS / 60)} min, risk ${sf.riskScore} (${sf.riskLevel}), ${sf.alerts.length} alerts · candidates ${p2.data.candidates}`);
  console.log(`        "${p2.data.explanation}"`);
  check('fastest route now passes the red zones (High risk at night)', f.alerts.filter((a) => alertIds.has(a.id)).length === 3 && f.riskLevel === 'High', JSON.stringify(f.alerts));
  check('an extra "avoid hazards" route was tried', p2.data.candidates > p1.data.candidates || p2.data.candidates >= 2, `${p2.data.candidates}`);
  check('safest route is a different, lower-risk route', !p2.data.sameRoute && sf.riskScore < f.riskScore, `${sf.riskScore} vs ${f.riskScore}`);
  check('explanation says what it avoids and the extra time', /Avoids \d+ unsafe-area alert/.test(p2.data.explanation) && /min|same time/.test(p2.data.explanation), p2.data.explanation);

  console.log('\nBad input');
  const far = await api('/routes/plan', { method: 'POST', body: { ...body, destination: { lat: 19.07, lng: 72.87 } } });
  check('a 1,000 km trip is refused (400)', far.status === 400, short(far));
  const bad = await api('/routes/plan', { method: 'POST', body: { origin: ORIGIN, mode: 'flying' } });
  check('a bad request is refused (400)', bad.status === 400, short(bad));
}

async function cleanup() {
  console.log('\nCleanup');
  if (alertIds.size) await admin(`/rest/v1/alerts?id=in.(${[...alertIds].join(',')})`, { method: 'DELETE' });
  for (const id of userIds) await admin(`/auth/v1/admin/users/${id}`, { method: 'DELETE' });
  console.log(`  deleted ${alertIds.size} test alerts and ${userIds.length} test users`);
}

try { await run(); } catch (e) { failed++; console.log(`\n  ERROR  ${e.message}`); }
finally {
  await cleanup();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
