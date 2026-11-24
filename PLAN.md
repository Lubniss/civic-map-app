# Civic Map Alerting: the real mobile app

## Status
| Phase | State |
|---|---|
| 0. Setup | Done: repo, Supabase project (Gmail SMTP, OTP templates, PostGIS in `extensions` schema), .env files filled |
| 1. Database | Done: `001_init.sql` applied (plus service_role grants), `db-test.mjs` 34/34 passing |
| 2. Server | Done: Express 5 + TypeScript API, 28 unit tests and 33 smoke checks passing (summary always mentions active red zones) |
| 3. Report rules update | Not started |
| 4. Mobile core app | Not started (waiting for the user's look & design ideas) |
| 5. Phone SMS check | Not started |
| 6. Fastest vs. Safest Route | Not started |
| 7. Deploy | Not started |
| 8. Push alerts | Not started |

## Context
The video prototype (one HTML file, live at lubniss.github.io/civic-map-alerting) proved the idea. Now we build the real app using the stack the user chose:
- Expo / React Native (TypeScript) with react-native-maps (Google Maps)
- Node + Express (TypeScript) on Render
- Supabase: Postgres with PostGIS, Auth and Storage
- Expo Push for notifications

**How we work (the user's rules):**
- This file is the source of truth.
- One phase or task at a time; never jump ahead or build several features at once.
- When the user suggests a feature or change, discuss how it fits into PLAN.md first, then wait for "go ahead" before editing any code.
- After each task or phase, stop and give exact steps to test it locally or in Expo Go.

The environment has Node 26 and npm 11. There's no Android SDK and no Docker, so all phone testing happens on the user's real phones (Android and iPhone) in Expo Go.

## Decisions
**Accounts**
- Login with an email one-time code (Supabase Auth, sent through the project's Gmail SMTP sender).
- Phase 5 adds a required phone number check (SMS code) before someone can report or confirm fixes: one account per phone number.
- **No Aadhaar or ID documents.** Private apps can't require Aadhaar, and storing ID images is a large legal risk (DPDP Act 2023). Indian SIMs are already ID-verified by the telecom company, so the phone check is the identity signal.
- Reports are always anonymous to other users.

**Categories**
- Emergency categories: **Unsafe area, Harassment, Fire, Accident** (Fire and Accident are added in phase 3).
- Normal categories: Garbage / Waste, Pothole / Road, Streetlight out, Water / Drainage, Other.

**Grouping and visibility**
- Reports of the same category within 300 m join one alert.
- **Normal categories:** 1–2 different reporters = `pending` (no pin, adds heat only). 3 different reporters = `verified` (pin).
- **Emergency categories:**
  - 1–2 reporters = `red_zone`, shown at once. It expires after the latest report: **48 h** for Unsafe and Harassment, **6 h** for Fire and Accident. Each new report restarts the clock.
  - 3 different reporters = **permanent `grey_zone`**. It shows **red while recent** (same 48 h or 6 h after the latest report) and **grey afterwards**, as "incidents happened here".
- **Resolving:** 3 different people, not counting the first reporter, confirm with a photo. For grey zones the app asks for the right proof: CCTV or new lighting installed (Unsafe, Harassment), road cleared (Accident), site made safe (Fire).
- The area summary always mentions active red zones, even with a single report.

**Anti-fake rules**
- **300 m rule:** the reporter's GPS must be within 300 m of the reported spot, plus the phone's reported GPS error, up to 100 m extra. The same rule applies to "Confirm it's fixed".
- **"Happened recently" reports** (emergency categories only) may use the phone's location from the last hour instead of right now, so people can report from somewhere safe. The app keeps a 1-hour location history while it's open, on the phone only.
- **Photos:** normal categories need a photo taken with the camera in the app (no gallery), and the server checks it was uploaded in the last 15 minutes. Emergency categories: the photo is optional.
- At most 20 reports a day per user.
- Known limit: GPS can be faked with mock-location apps. These rules stop casual fake reports. The 3-reporter rule, phone check and red-zone expiry are the main defence.

**Emergencies and 112**
- An emergency report asks first: **"Happening now"** or **"Happened recently (within 1 hour)"**.
- **Happening now:** a full-screen **"Call 112 now"** step with the person's address shown to read to the operator. The report form opens only after they tap Call 112, which opens the dialer.
  - Apps can't place the call by themselves or prove a call happened (iPhone gives no call history; on Android it needs a permission Google Play restricts). This is a required prompt, not proof.
- **Happened recently:** no call step.
- An always-visible **SOS / 112** button sits on the map screen.
- The app states: "In an emergency, call 112 first. Reports are not sent to 112."
- The number is 112 only (India / EU).

**Other**
- Keep the heatmap and the one-line area summaries from the prototype.
- Push alerts come last, because they need a development build.

## Repo layout
```
civic-map-app/
  supabase/migrations/   001_init.sql (done), 002_report_rules.sql (phase 3), 003_routes.sql (phase 6)
  supabase/tests/        db-test.mjs
  server/                Express API (TypeScript): src/, tests/, scripts/smoke.mjs
  mobile/                Expo app (TypeScript, expo-router), phase 4
  PLAN.md                this plan
  README.md              setup steps and API list
```

## Data model (`001_init.sql`, done)
- `profiles`: id (= auth user), display_name, push_token, last_location, created_at.
- `alerts`: id, category, location (center of its reports), status, reporter_count, report_count, avg_severity, fix_count, first_reporter_id, expires_at, created_at, updated_at, verified_at, resolved_at.
- `reports`: id, alert_id, user_id, category, severity (1–3), note, photo_path, location, created_at.
- `fix_confirmations`: id, alert_id, user_id, photo_path, note, created_at; one per person per alert.
- Functions: `submit_report`, `confirm_fix`, `alerts_in_bbox`, `report_points_in_bbox`. Only the server (service_role) can call them.
- Row-level security is on for every table with no policies, so the app can't read or write tables directly.
- A private `photos` bucket (5 MB, images): users upload only to `<user_id>/…`.

## Server (done in phase 2)
Routes: `GET /health`, `GET /alerts?bbox=`, `GET /alerts/:id`, `POST /reports`, `POST /alerts/:id/confirm-fix`, `GET /heatmap?bbox=`, `GET /summary?bbox=` or `?lat&lng&radius=`. The details are in README.md.

---

## Phase 3: Report rules update (database + server only)
Done before the phone app, so the app is built on the final rules and no data needs migrating later.

**Database (`002_report_rules.sql`):**
- Categories gain `fire` and `accident`.
- `alerts.status` gains `grey_zone`, and alerts gain `hot_until` (when a grey zone stops showing red).
- `reports` gain `timing` (`now` / `recent`, emergencies only), `reporter_lat`, `reporter_lng`, `gps_accuracy_m` and `location_at` (when the GPS reading was taken). `photo_path` becomes optional for emergency categories.
- `fix_confirmations` gain the same reporter location fields.
- `submit_report` changes:
  - Emergency categories with 1–2 reporters become `red_zone`, with `expires_at` 48 h or 6 h ahead.
  - With 3+ reporters they become `grey_zone`, with `hot_until` 48 h or 6 h after the latest report.
  - Normal categories stay `pending` or `verified`.
- `alerts_in_bbox` also returns grey zones, with a `hot` flag, so the app knows whether to draw red or grey.
- `confirm_fix` works on grey zones the same way (3 confirmations resolve).

**Server:**
- **300 m check** in `POST /reports` and `POST /alerts/:id/confirm-fix`:
  - The distance from `{reporterLat, reporterLng}` to the spot must be at most 300 m + min(accuracy, 100 m).
  - `location_at` must be in the last 2 minutes, or in the last 60 minutes for `timing: recent`.
- Photo required for normal categories, and its upload time must be within the last 15 minutes.
- The summary treats hot grey zones like red zones (always mentioned).
- Messages explain each refusal, for example "You need to be within 300 m of the problem to report it".

**Tests:** extend `db-test.mjs`, the unit tests and `smoke.mjs` to cover Fire and Accident, the 6 h and 48 h expiry, red → grey zone, hot → grey, the 300 m rule (inside, outside, accuracy allowance), the recent-report window, optional emergency photos and stale photos.

## Phase 4: Mobile core app (Expo)
**Libraries:** `react-native-maps`, `expo-location`, `expo-camera` or `expo-image-picker` (camera only), `expo-image-manipulator`, `@supabase/supabase-js`, `@react-native-async-storage/async-storage`, `react-native-url-polyfill`, `@tanstack/react-query`.

**Screens:**
- **Sign in:** email, then the 6-digit code.
- **Map (home):**
  - Starts at the user's GPS location, with an Alerts / Heatmap toggle and an always-visible **SOS / 112** button.
  - Pins only for verified alerts, colored by category.
  - Red zones and hot grey zones: a red 150 m circle. Cooled grey zones: a grey circle labelled "Incidents reported here".
  - Unverified red zones show "Reported by 1 person · expires in 31 h".
  - "+ Report": tap the spot (it must be within 300 m of you), then fill in the form.
  - "Area Summary" opens a bottom panel built from `/summary`.
- **Report flow:**
  - Pick a category.
  - Emergency categories ask **Happening now / Happened recently**. "Now" shows the **Call 112** step (with the address) before the form.
  - The form has severity, a note and a photo (camera only; optional for emergencies).
  - The app checks the 300 m rule before sending, using current GPS or, for "recent", the 1-hour location history.
  - After sending, it shows the server's message, for example "A pin appears once 3 people report this (1 of 3)".
- **Alert detail:**
  - Status, the area summary, every report with its photo, and fix progress (1/3).
  - A "Confirm it's fixed" button with the proof checklist for grey zones, a camera photo and the 300 m check.
- **Profile:** email and sign out.
- The "In an emergency, call 112 first" notice appears on the SOS screen and the report flow.

**Heatmap:** react-native-maps' `<Heatmap>` works only with Google Maps.
- Android in Expo Go: works with no API key.
- iPhone in Expo Go: Apple Maps only, so the app falls back to faded circles. The real heatmap comes in the phase 8 development build.

**Config:** `mobile/.env` holds `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` and `EXPO_PUBLIC_API_URL` (this PC's Wi-Fi address while developing, the Render URL later).

**Look & design:** the user's ideas are added here before phase 4 starts.

## Phase 5: Phone SMS check
- **Provider: Twilio Verify** through Supabase's phone sign-in settings. Twilio handles India's DLT SMS rules, so we don't need our own sender registration.
  - Cost is roughly ₹4–6 per verification. The user creates the Twilio account.
- **Flow:** after email sign-in, the app asks for a phone number once. It sends an SMS code, confirms it, and the phone is saved on the account. Supabase allows each phone number on only one account.
- **Server:** `POST /reports` and `POST /alerts/:id/confirm-fix` refuse users without a confirmed phone ("Verify your phone number to report"). Viewing the map doesn't need it.
- **Tests:** a smoke test with unverified and verified test users.

## Phase 6: Fastest vs. Safest Route
The user picks a destination and a mode (walking or driving). The app shows two routes: the **fastest**, and the **safest** (lowest risk from live alerts), compared in a bottom sheet, for example "Avoids 2 unsafe-area alerts and 1 poorly lit stretch; +4 mins".

**Providers (no billing card needed while testing):**
- **Routing: OpenRouteService (ORS).** A free key with no card, about 2,000 route requests a day, real `foot-walking` and `driving-car` profiles, up to 3 alternatives, and `avoid_polygons`.
- **Fallback with no key:** OSRM through FOSSGIS (`routing.openstreetmap.de`). Both sit behind `server/src/routing.ts`, so Google Routes can be added later.
- **Geocoder:** ORS geocoding (same key, search-as-you-type). Nominatim isn't used for search because its rules forbid autocomplete. Tap-on-map also works, with reverse geocoding.
- **The app never calls ORS directly;** the key stays on the server.
- **Before this phase,** the user creates a free ORS account and puts the key in `server/.env` as `ORS_API_KEY`.

**Candidate routes:** up to 3 normal alternatives, plus one "avoid hazards" route requested with `avoid_polygons` (60 m circles around red zones, hot grey zones and verified high-weight alerts near the straight line between start and destination). A safer option then exists even when the provider returns only one route.

**Database (`003_routes.sql`):**
- `alerts_near_route(route, buffer_m = 150)` returns visible alerts (verified, red zones, grey zones) within 150 m of the route, with category, status, hot flag, avg_severity, location and distance.
- `hazard_avoid_polygons(origin, destination, ...)` returns the circles for the avoid route.

**Risk scoring (`server/src/risk.ts`, a pure function with tests):**
- Points per alert = category weight × avg_severity × status × closeness × night boost.
- Category weights: unsafe 10, harassment 10, fire 10, accident 6, streetlight 6, road 2, water 1.5, garbage 1, other 1.
- Status: verified 1.0, red zone 1.0, hot grey zone 1.0, cooled grey zone 0.5.
- Closeness: 1.0 at the route, falling to 0.5 at 150 m.
- Night boost: ×1.5 for unsafe, harassment and streetlight between 8 PM and 5 AM, using the phone's local time.
- Risk level: Safe under 5, Moderate Risk under 15, High Risk at 15 or more.

**Route selection (`server/src/routePlanner.ts`, tested):**
- The fastest route has the lowest duration. The safest has the lowest risk, with ties going to the shorter one.
- If they're the same, the response says `sameRoute: true` ("The fastest route is also the safest").
- The explanation lists the alerts near the fastest route but not the safest, for example "Avoids 2 unsafe-area alerts and 1 poorly lit stretch; +4 mins".
- If no route is found, the server returns 404 with a clear message; if the provider fails, 503 "Try again".

**Endpoint:**
- `POST /routes/plan` takes `{origin, destination, mode, localTime}`.
  - Limits: start and destination at most 50 km apart, at most 30 plans an hour.
  - Returns both routes with simplified coordinates, duration, distance, riskScore, riskLevel and nearby alerts, plus `sameRoute` and the explanation.
- `GET /geocode?q=` and `GET /geocode/reverse` pass through to ORS, with a short cache.

**Mobile:**
- A "Safe Route" button opens a destination picker (search, tap-on-map, start point, Walking / Driving).
- Routes are drawn with `<Polyline>` (works in Expo Go on both phones): Safest as solid green, Fastest as dashed blue/grey.
- Tapping a route highlights it and shows the alerts along it.
- The comparison sheet shows ETA, distance, a risk badge and the "avoids…" explanation.
- It picks between routes but doesn't give turn-by-turn directions.

## Phase 7: Deploy
- Put the server on Render with `render.yaml`, building from GitHub. The secret key goes only into Render's environment settings.
- Point the app at the Render URL.

## Phase 8: Push alerts
- Development build through EAS (free Expo account), with a Google Maps API key for the build. This also gives the real heatmap on iPhone.
- `expo-notifications` registers push tokens, and the server keeps each user's last location up to date (`PUT /me/push-token`, `PUT /me/location`).
- When a high-severity emergency alert appears, the server notifies users within 2 km using `expo-server-sdk`.
- Possible extra: detect mock-location apps on Android.

## Parked ideas (not scheduled)
- Emergency contacts and sharing live location by SMS or WhatsApp.
- An optional DigiLocker "Verified reporter" badge through a licensed provider (we never store Aadhaar).
- A "flag a fake report" button with a moderator list.
- New accounts waiting 24 h before they can create red zones.
- Dark mode, a "My reports" history, other languages.

## Verification
- **Database:** `node --env-file=server/.env --env-file=mobile/.env supabase/tests/db-test.mjs` checks every grouping, red, grey, fix and security rule with throwaway users in the ocean at 0.5°N 0.5°E, then deletes them.
- **Server:**
  - `npm test` runs the unit tests (summary sentences, validation, error mapping, and later risk and route selection).
  - `npm run smoke` calls every endpoint of a running server with real logins and photo uploads.
- **Mobile, on both phones:**
  - Sign in with a code.
  - Report garbage with a camera photo: no pin, and the "pin appears once 3 people report this" message shows, but heat appears.
  - From a second and third account, report the same spot and check that the pin appears.
  - Try reporting a spot 1 km away: it's refused by the 300 m rule.
  - Report Unsafe "Happening now": the 112 step comes first, then a red circle "expires in 48 h" appears.
  - Report Fire "Happened recently" from a safe place within an hour: it's accepted, with a 6 h red zone.
  - Have 3 people report the same emergency: it stays red, then turns grey later.
  - Confirm a fix from 3 other accounts at the spot: the alert disappears as resolved.
  - Check that the heatmap and summary sentences match the prototype's behavior.
- **Routes:**
  - Unit tests cover weights, the night boost, the tie-break, `sameRoute` and the explanation.
  - Smoke test: seeded alerts on the fastest route are avoided by the safest.
  - On the phones, search a destination and compare the two routes.
- **Deploy:** `GET /health` on the Render URL, then the same phone flow against Render.
