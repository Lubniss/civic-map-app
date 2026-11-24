# Civic Map Alerting: the real mobile app

## Status
| Phase | State |
|---|---|
| 0. Setup | Done: repo, Supabase project (Gmail SMTP, OTP templates, PostGIS in `extensions` schema), .env files filled |
| 1. Database | Written (`001_init.sql`, `supabase/tests/db-test.mjs`): waiting for the user to run it in Supabase and run the test |
| 2. Server | Not started |
| 3. Mobile | Not started |
| 4. Fastest vs. Safest Route | Not started |
| 5. Deploy | Not started |
| 6. Push alerts | Not started |

## Context
The video prototype (one HTML file, live at lubniss.github.io/civic-map-alerting) proved the idea. Now we build the real app using the stack the user chose:
- Expo / React Native (TypeScript) with react-native-maps (Google Maps)
- Node + Express (TypeScript) on Render
- Supabase: Postgres with PostGIS, Auth and Storage
- Expo Push for notifications

Decisions from the user:
- Testing on Android and iPhone through Expo Go.
- I'll guide them through creating the Supabase project.
- Login with an email one-time code.
- A new GitHub repo, with Git installed on this PC.
- **3-report rule:** an alert gets a pin on the map only once **3 different people** report it. With 1–2 reporters it is `pending`: no pin, not in summaries and not used for routes, but it still adds heat to the heatmap.
- **Red-zone override:** a single report of **Unsafe area** or **Harassment** creates a `red_zone` straight away. It shows as a red 150 m circle and counts fully in Safe Route.
  - It expires 48 h after its latest report, unless more people report it; every new report restarts the 48 h.
  - Once 3 different people have reported it, it becomes `verified`, stays red and no longer expires.
- An alert is **resolved** after 3 different users confirm the fix with a photo. The original reporter doesn't count toward the 3.
- Keep the heatmap and the one-line area summaries from the prototype.
- Push alerts come last, because they need a development build.

**How we work (the user's rules):**
- `civic-map-app/PLAN.md` is the source of truth. It starts as a copy of this plan in phase 0.
- One phase or task at a time; never jump ahead or build several features at once.
- When the user suggests a feature or change, discuss how it fits into PLAN.md first, then wait for "go ahead" before editing any code.
- After each task or phase, stop and give exact steps to test it locally or in Expo Go.

The environment has Node 26 and npm 11. There's no Android SDK and no Docker, so all phone testing happens on the user's real phones in Expo Go.

## Repo layout
New folder `J:\Projects\Claude\civic-map-app\`, which becomes the GitHub repo `Lubniss/civic-map-app`:
```
civic-map-app/
  supabase/migrations/001_init.sql   database tables, functions, security rules, photo bucket
  server/                            Express API (TypeScript)
    src/index.ts, src/auth.ts, src/routes/*.ts, src/summary.ts, src/db.ts
    tests/summary.test.ts
    render.yaml, .env.example
  mobile/                            Expo app (TypeScript, expo-router)
    app/(auth)/sign-in.tsx, app/(tabs)/map.tsx, app/report.tsx,
    app/alert/[id].tsx, app/profile.tsx
    src/api.ts, src/supabase.ts, src/categories.ts, src/components/*
    .env.example
  PLAN.md                            this plan, kept up to date
  README.md                          setup steps
```

## Data model (`001_init.sql`)
**Tables:**
- `profiles`: id (= auth user), display_name, push_token, last_location (geography point), created_at.
- `alerts`: id, category, location (the group's center point), status (`pending` / `red_zone` / `verified` / `resolved`), reporter_count, avg_severity, expires_at (red zones only), created_at, updated_at, resolved_at.
  - A red zone whose `expires_at` has passed counts as expired. The queries filter it out, so no scheduled job is needed.
  - Categories: unsafe, harassment, garbage, road, light, water, other.
- `reports`: id, alert_id, user_id, category, severity (1–3), note, photo_path, location, created_at.
- `fix_confirmations`: id, alert_id, user_id, photo_path, note, created_at. Each user can confirm an alert only once.

**Postgres functions** (each runs in one transaction):
- `submit_report(...)` groups a new report. It finds the nearest unresolved alert **of the same category** within 300 m (`ST_DWithin`). If there is one, the report joins it; otherwise it creates a new alert. It then recalculates the center point, the number of different reporters and the average severity, and then sets the status:
  - 3 or more different reporters: `verified`.
  - Otherwise, if the category is unsafe or harassment: `red_zone`, with `expires_at` set to now + 48 h.
  - Otherwise: `pending`.
  - An expired red zone isn't joined. A new report there starts a fresh red zone.
  - Grouping by category keeps a garbage report from being merged into an "unsafe" alert next to it. This is my reading of the spec.
- `confirm_fix(...)` records a fix confirmation. Once 3 different users other than the original reporter have confirmed, the alert becomes `resolved`.
- `alerts_in_bbox(...)` returns only `verified` alerts and red zones that haven't expired.
- `report_points_in_bbox(...)` returns heatmap points from every report on unresolved alerts, including `pending` ones.

**Security:**
- Row-level security is on for every table. The phone app never reads the tables directly; it goes through the API, which uses the service key.
- A private storage bucket `photos`. Signed-in users can upload only into their own folder (`{user_id}/…`). The API gives out short-lived links for viewing photos.

## Server (Express + TypeScript)
- **Libraries:** `@supabase/supabase-js`, `zod` (input checks), `express-rate-limit`, `cors`, `helmet`, `vitest` (tests).
- **Auth middleware:** reads the `Authorization: Bearer <token>` header and checks it with `supabase.auth.getUser(token)`.

**Routes:**
- `GET /health`
- `GET /alerts?bbox=` lists the verified alerts and unexpired red zones in view, with their status, counts and `expires_at`.
- `GET /alerts/:id` returns one alert with its reports and fix confirmations, plus photo links.
- `POST /reports` takes `{lat, lng, category, severity, note, photo_path}`. It checks that `photo_path` is in the user's own folder and that the photo exists, then calls `submit_report`. Each user can send at most 20 reports a day.
- `POST /alerts/:id/confirm-fix` takes `{photo_path, note}` and calls `confirm_fix`.
- `GET /heatmap?bbox=` returns heatmap points weighted by severity, including reports on `pending` alerts.
- `GET /summary?bbox=` or `?lat&lng&radius=300` returns the headline sentence, risk level, breakdown by category, top issue and latest notes. It uses the same alerts as the pins: verified alerts and red zones.
- Added in phase 4: `POST /routes/plan`, `GET /geocode` and `GET /geocode/reverse` (see phase 4).
- Added in phase 6: `PUT /me/push-token` and `PUT /me/location`.

**`summary.ts`:** the prototype's `analyze()` and `headline()` from `civic_map/index.html`, rewritten in TypeScript and covered by unit tests.

**Deploy:** `render.yaml` defines a Render web service that builds from GitHub. The service key goes into Render's environment settings, never into the repo.

## Mobile app (Expo, TypeScript, expo-router)
- **Libraries:** `react-native-maps`, `expo-location`, `expo-image-picker`, `expo-image-manipulator` (shrinks photos before upload), `@supabase/supabase-js`, `@react-native-async-storage/async-storage` (keeps the login session), `react-native-url-polyfill`, `@tanstack/react-query`.
- **Sign in:** the user enters an email, then the 6-digit code (`signInWithOtp` → `verifyOtp`).
- **Map (home screen):**
  - Starts at the user's GPS location, with a toggle between Alerts and Heatmap.
  - Pins appear only for `verified` alerts and are colored by category.
  - Red zones (and verified unsafe or harassment alerts) are drawn as a red 150 m `<Circle>` with a warning marker. A red zone that isn't verified yet shows "Reported by 1 person · expires in 31 h".
  - `pending` alerts show no pin. After submitting, the reporter sees "Thanks, a pin appears once 3 people report this".
  - "+ Report" works like the prototype: tap the spot, then fill in the form.
  - "Area Summary" opens a bottom panel built from `/summary`.
- **Report form:**
  - Category chips, severity (Low / Medium / High), a note and a photo. The photo is required and taken with the camera or picked from the gallery.
  - The photo uploads straight to Supabase Storage, then the form POSTs to `/reports`.
- **Alert detail:** status, the area summary, every report with its photo, and how many fixes have been confirmed (for example 1/3). A "Confirm it's fixed" button takes a photo and submits it.
- **Profile:** email and sign out.
- **Categories:** `categories.ts` reuses the prototype's category labels, colors and summary wording.

**Heatmap:** uses react-native-maps' `<Heatmap>`, which works only with Google Maps.
- Android in Expo Go: Google Maps works with no API key.
- iPhone in Expo Go: only Apple Maps is available, so the heatmap toggle falls back to faded circles sized by report count. The real heatmap appears on iPhone once we make the development build in phase 6.

**Config:** `mobile/.env` holds `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` and `EXPO_PUBLIC_API_URL`. That last one is this PC's local network address during development and the Render URL later. The anon key is safe in the app; the service key goes only in `server/.env`.

## Phase 0: Supabase setup steps (done by the user)
1. Go to https://supabase.com and sign up (free plan, no card).
2. **New project:** name `civic-map`, set a strong database password and save it in your password manager, and pick the region closest to your users (for India: Mumbai, `ap-south-1`). Wait about 2 minutes for it to start.
3. **Turn on PostGIS:** Database → Extensions → search `postgis` → enable it.
4. **Email code login:** Authentication → Sign In / Providers → Email: make sure it's enabled. Then Authentication → Emails → Templates → **Magic Link**: replace the body with:
   ```
   <h2>Your Civic Map code</h2>
   <p>Enter this code in the app: <strong>{{ .Token }}</strong></p>
   ```
   and save. (The app asks for this 6-digit code instead of a link.)
5. **Copy keys:** Project Settings → API (or API Keys):
   - `Project URL` → put in **both** `server/.env` (`SUPABASE_URL`) and `mobile/.env` (`EXPO_PUBLIC_SUPABASE_URL`).
   - `anon` / publishable key → `mobile/.env` (`EXPO_PUBLIC_SUPABASE_ANON_KEY`).
   - `service_role` / secret key → `server/.env` only (`SUPABASE_SERVICE_ROLE_KEY`). Never share it or put it in the app.
   - Create the two `.env` files by copying the `.env.example` files next to them. Git ignores `.env`, so keys never reach GitHub.
6. Free-plan note: Supabase pauses projects after 7 days without activity; un-pause from the dashboard.

## Phases (in order)
0. **Setup:**
   - Install Git with winget and create the folder and the GitHub repo.
   - I give the user step-by-step instructions for the Supabase project: create it, turn on email OTP with `{{ .Token }}` in the email template, and copy the keys into the two `.env` files themselves.
   - The user runs `001_init.sql` in Supabase's SQL editor.
   - Before phase 4, the user creates a free OpenRouteService account (no card) and pastes the key into `server/.env` as `ORS_API_KEY`.
1. **Database:** write `001_init.sql` and test it against a few reports: grouping, pending, red zone with expiry, the switch to verified and the switch to resolved.
2. **Server:** routes, auth, summary port and tests; run it locally.
3. **Mobile:** sign in, map, report with photo, alert detail with confirm fix, heatmap, area summary; test on both phones with Expo Go.
4. **Fastest vs. Safest Route:** see the section below.
5. **Deploy:** put the server on Render and point the app at it.
6. **Push alerts:**
   - Development build through EAS (needs a free Expo account) and a Google Maps API key for the build.
   - `expo-notifications` to register push tokens, and the server keeps each user's location up to date.
   - When an alert with severity 3 is verified, the server notifies users whose last location is within 2 km, using `expo-server-sdk`.

## Phase 4: Fastest vs. Safest Route
The user picks a destination and a mode (walking or driving). The app shows two routes: the **fastest**, and the **safest** (the lowest risk from live alerts). They're compared in a bottom sheet, for example "Avoids 2 unsafe-area alerts and 1 poorly lit stretch; +4 mins".

**Providers (no billing card needed while testing):**
- **Routing: OpenRouteService (ORS).** You sign up for a free key with no credit card; the free tier allows about 2,000 route requests a day.
  - It has real `foot-walking` and `driving-car` profiles, up to 3 alternative routes, and `avoid_polygons`.
- **Fallback with no key:** OSRM through FOSSGIS (`routing.openstreetmap.de`), which has walking and driving.
  - The project's own OSRM demo server only does driving, which is why it isn't used.
  - Both are behind `server/src/routing.ts`, so Google Routes can be added later.
- **Geocoder: ORS geocoding,** which uses the same key and has search-as-you-type suggestions.
  - Nominatim is not used for the search bar, because its rules forbid autocomplete and allow only 1 request a second.
  - Tap-on-map always works as well, with ORS reverse geocoding to show the address.
- **Mobile never calls ORS directly.** All calls go through our server, so the key stays in `server/.env` only (and later in Render's settings).

**Why candidates include an "avoid hazards" route:** in a city, alternative routes for short walks often come back as just 1 route. So the server builds its candidates like this:
1. Up to 3 normal alternative routes.
2. One extra route requested with `avoid_polygons`: 60 m circles (PostGIS `ST_Buffer`) around red zones and verified high-weight alerts near the straight line between start and destination.

This means a real safer option exists even when the provider returns only one route.

**Database (`supabase/migrations/002_routes.sql`):**
- The `harassment` category already exists from `001_init.sql`.
- `alerts_near_route(route geography, buffer_m default 150)` returns the verified alerts and unexpired red zones within 150 m (pending alerts are left out) of the route (`ST_DWithin`), with their category, status, avg_severity, location and distance to the route.
- `hazard_avoid_polygons(origin, destination, ...)` returns the circles for the avoid route described above.

**Risk scoring (`server/src/risk.ts`, a pure function with Vitest tests):**
- PostGIS finds which alerts are near each route. Scoring happens in TypeScript, so the weights live in one place, can be tested and can be tuned without a database change.
- Points per alert = category weight × avg_severity × status × closeness × night boost:
  - Category weights: unsafe 10, harassment 10, streetlight 6, road 2, water 1.5, garbage 1, other 1.
  - Status: verified 1.0 and red zone 1.0 (it counts fully, as decided).
  - Closeness: 1.0 at the route, falling to 0.5 at 150 m.
  - Night boost: ×1.5 for unsafe, harassment and streetlight between 8 PM and 5 AM, using the phone's local time sent with the request.
- Risk level: Safe if the score is under 5, Moderate Risk under 15, High Risk at 15 or more.

**Route selection (`server/src/routePlanner.ts`, tested):**
- **Fastest** is the route with the lowest duration.
- **Safest** is the route with the lowest risk, with ties going to the shorter duration.
- If the same route wins both, the response says `sameRoute: true` and the app shows "The fastest route is also the safest".
- **Explanation:** lists the alerts near the fastest route but not near the safest, grouped by category and written as a sentence, for example "Avoids 2 unsafe-area alerts and 1 poorly lit stretch; +4 mins".
- **Edge cases:** if no route is found, the server returns 404 with a clear message; if the provider fails, it returns 503 with "Try again".

**Endpoint (`server/src/routes/routes.ts`):**
- `POST /routes/plan` needs a login and checks its input with zod.
  - Input: `{origin:{lat,lng}, destination:{lat,lng}, mode:'walking'|'driving', localTime}`.
  - Limits: start and destination at most 50 km apart, and at most 30 plans per hour per user.
  - Output: both routes, each with simplified coordinates, duration, distance, riskScore, riskLevel and its nearby alerts (id, category, location), plus `sameRoute` and the explanation.
- `GET /geocode?q=` and `GET /geocode/reverse?lat&lng` pass requests through to ORS, with a short cache.

**Mobile:**
- A "Safe Route" button on the Map screen opens a destination picker. It has a search bar with suggestions, a "tap on map" option, a start point (current GPS location by default, or a chosen point) and a Walking / Driving switch.
- The routes are drawn with `<Polyline>`, which works on Android and iPhone in Expo Go: Safest as a solid green line, Fastest as a dashed blue/grey line.
- Tapping a route or its card in the sheet highlights it and shows only the alert markers along it.
- The comparison sheet shows ETA, distance, a risk badge (Safe / Moderate Risk / High Risk) and the "avoids…" explanation.

**Note:** this picks between routes but does not give turn-by-turn directions. A "Open in Google/Apple Maps" button could hand off navigation later, but it can't force the safer path.

## Verification
- **Routes:**
  - `npm test` covers the scoring weights, the night boost, the tie-break, `sameRoute` and the explanation text.
  - Smoke test: seed 3 verified unsafe alerts on the fastest walking route between two real points, call `/routes/plan` and check that the safest route avoids them, the explanation lists them and `sameRoute` is false. With no alerts, check that `sameRoute` is true.
  - On both phones: search a destination, see both lines, tap each to highlight it and switch Walking / Driving.
- **Database:** an SQL test script checks:
  - A garbage report from user A is `pending` and not returned by `alerts_in_bbox`, but does show in the heatmap points.
  - A second report from A still counts as 1 reporter.
  - Reports from B and C make it `verified`.
  - A single unsafe report becomes a `red_zone` with `expires_at` 48 h ahead and is returned straight away. Once `expires_at` is moved into the past, it disappears.
  - 3 fix confirmations from users other than the original reporter make an alert `resolved`.
- **Server:** `npm test` (summary sentences, input checks), plus a smoke script that calls each route with a real test login.
- **Mobile, on both phones:**
  - Sign in with a code.
  - Report garbage with a photo: there's no pin and the "pin appears once 3 people report this" message shows, but heat appears.
  - From a second and third account, report the same spot and check that the pin appears.
  - Report Unsafe area once: a red circle with "expires in 48 h" appears at once.
  - Confirm the fix from 3 other accounts and check that the alert disappears as resolved.
  - Check that the heatmap and summary sentences match the prototype's behavior.
- **Deploy:** `GET /health` on the Render URL, then the same phone flow against Render.
