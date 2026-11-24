// Demo data for trying the app: realistic alerts around a spot you choose.
//
//   npm run demo -- seed <lat> <lng>     e.g. npm run demo -- seed 28.6139 77.2090
//   npm run demo -- clear                removes every demo alert and demo account
//
// Uses throwaway accounts named civicmap-demo-N@example.com (no emails are sent).
// Photos are not uploaded, so demo reports show no photo.

const URL = process.env.SUPABASE_URL?.replace(/\/+$/, '');
const SECRET = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !SECRET) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. Run with: npm run demo -- seed <lat> <lng>');
  process.exit(1);
}
const PREFIX = 'civicmap-demo-';

async function call(path, { method = 'GET', body } = {}) {
  const res = await fetch(URL + path, {
    method,
    headers: { apikey: SECRET, Authorization: `Bearer ${SECRET}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${typeof data === 'string' ? data : JSON.stringify(data)}`);
  return data;
}

async function demoUsers() {
  const data = await call('/auth/v1/admin/users?per_page=1000');
  return (data.users ?? []).filter((u) => u.email?.startsWith(PREFIX));
}

async function ensureUsers(n) {
  const existing = await demoUsers();
  const byEmail = new Map(existing.map((u) => [u.email, u.id]));
  const ids = [];
  for (let i = 1; i <= n; i++) {
    const email = `${PREFIX}${i}@example.com`;
    if (byEmail.has(email)) { ids.push(byEmail.get(email)); continue; }
    const u = await call('/auth/v1/admin/users', { method: 'POST', body: { email, email_confirm: true } });
    ids.push(u.id);
  }
  return ids;
}

/** Offset a point by metres north / east. */
const at = (c, north, east) => ({
  lat: c.lat + north / 111_320,
  lng: c.lng + east / (111_320 * Math.cos((c.lat * Math.PI) / 180)),
});

async function report(userId, p, category, severity, note, timing = null, minutesAgo = 0) {
  const when = new Date(Date.now() - minutesAgo * 60_000).toISOString();
  const rows = await call('/rest/v1/rpc/submit_report', {
    method: 'POST',
    body: {
      p_user_id: userId, p_lat: p.lat, p_lng: p.lng, p_category: category, p_severity: severity, p_note: note,
      p_photo_path: ['unsafe', 'harassment', 'fire', 'accident'].includes(category) ? null : `${userId}/demo.jpg`,
      p_timing: timing, p_reporter_lat: p.lat, p_reporter_lng: p.lng, p_gps_accuracy_m: 10, p_location_at: when,
    },
  });
  return rows[0];
}

async function seed(lat, lng) {
  const c = { lat, lng };
  const [u1, u2, u3, u4] = await ensureUsers(4);
  const three = [u1, u2, u3];
  const out = [];

  // Verified (3 people) normal issues -> pins
  for (const [i, u] of three.entries()) await report(u, at(c, 300 + i * 20, 80), 'garbage', 2 + (i === 2), ['Bins overflowing for days', 'Garbage dumped on the footpath', 'Strong smell from open dumping'][i]);
  out.push('Garbage / Waste: verified pin, ~300 m north');
  for (const [i, u] of three.entries()) await report(u, at(c, -150, 350 + i * 15), 'light', 2, ['Streetlight not working for a week', 'Whole stretch is dark at night', 'Flickering light near the corner'][i]);
  out.push('Streetlight out: verified pin, ~350 m east');
  for (const [i, u] of three.entries()) await report(u, at(c, 120, -320 - i * 10), 'road', 2, ['Large pothole in the middle of the road', 'Road caved in after rain', 'Broken speed breaker'][i]);
  out.push('Pothole / Road: verified pin, ~320 m west');

  // Pending (1 person) -> heat only, no pin
  await report(u4, at(c, -280, -60), 'water', 2, 'Drain overflowing onto the street');
  out.push('Water / Drainage: pending (heatmap only, no pin), ~280 m south');

  // Red zones (1 person)
  await report(u4, at(c, -450, 250), 'unsafe', 3, 'Men following people near the bus stop at night', 'now');
  out.push('Unsafe area: red zone (48 h), ~500 m south-east');
  await report(u1, at(c, 550, 450), 'fire', 3, 'Shop on fire, smoke on the road', 'now');
  out.push('Fire: red zone (6 h), ~700 m north-east');

  // Grey zone, still active (3 people) -> red circle
  for (const [i, u] of three.entries()) await report(u, at(c, 520 + i * 15, -380), 'harassment', 3, ['Group harassing women near the market', 'Catcalling every evening here', 'Felt followed walking home'][i], 'now');
  out.push('Harassment: grey zone, still active (red circle), ~640 m north-west');

  // Grey zone that has cooled down (3 people) -> grey circle
  let accident;
  for (const [i, u] of three.entries()) accident = await report(u, at(c, -600, -420 + i * 15), 'accident', 2, ['Bike crash at the junction', 'Car hit a divider', 'Another accident at this blind turn'][i], 'recent', 20);
  await call(`/rest/v1/alerts?id=eq.${accident.alert_id}`, { method: 'PATCH', body: { hot_until: new Date(Date.now() - 60_000).toISOString() } });
  out.push('Accident: cooled grey zone (grey circle), ~730 m south-west');

  console.log(`\nDemo alerts added around ${lat}, ${lng}:`);
  for (const line of out) console.log(`  - ${line}`);
  console.log('\nRemove them later with: npm run demo -- clear\n');
}

async function clear() {
  const users = await demoUsers();
  if (!users.length) { console.log('No demo data found.'); return; }
  const ids = users.map((u) => u.id).join(',');
  const reports = await call(`/rest/v1/reports?select=alert_id&user_id=in.(${ids})`);
  const alertIds = [...new Set(reports.map((r) => r.alert_id))];
  if (alertIds.length) await call(`/rest/v1/alerts?id=in.(${alertIds.join(',')})`, { method: 'DELETE' });
  for (const u of users) await call(`/auth/v1/admin/users/${u.id}`, { method: 'DELETE' });
  console.log(`Removed ${alertIds.length} demo alerts and ${users.length} demo accounts.`);
}

const [cmd, a, b] = process.argv.slice(2);
try {
  if (cmd === 'seed') {
    const lat = Number(a), lng = Number(b);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      console.error('Usage: npm run demo -- seed <lat> <lng>   (e.g. 28.6139 77.2090)');
      process.exit(1);
    }
    await seed(lat, lng);
  } else if (cmd === 'clear') {
    await clear();
  } else {
    console.error('Usage: npm run demo -- seed <lat> <lng>   |   npm run demo -- clear');
    process.exit(1);
  }
} catch (e) {
  console.error(`Failed: ${e.message}`);
  process.exit(1);
}
