# Civic Map Alerting: the real mobile app

## Status
| Phase | State |
|---|---|
| 0. Setup | Done: repo, Supabase project (Gmail SMTP, OTP templates, PostGIS in `extensions` schema), .env files filled |
| 1. Database | Done: `001_init.sql` applied (plus service_role grants), `db-test.mjs` 34/34 passing |
| 2. Server | Done: Express 5 + TypeScript API, 28 unit tests and 33 smoke checks passing (summary always mentions active red zones) |
| 3. Report rules update | Done: `002_report_rules.sql` applied; db-test 56/56, smoke 41/41, unit tests 37/37 |
| 4. Mobile core app | In progress. Step 1 done (app, theme, sign-in, tab bar). Step 2 done (live map: pins, red/grey zones, heatmap, summary pill + sheet, SOS hold, locate; calmer polish). Step 3 done (report flow: category → now/recent → Call 112 → crosshair pin with 300 m check and street name → details with camera photo → result). Next: step 4, alert detail, My Reports and Profile |
| 5. Phone SMS check | Not started |
| 6. Fastest vs. Safest Route | Not started |
| 7. Deploy | Not started |
| 8. Notifications (push + zone-entry alerts) | Not started |

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

**Zone-entry alerts ("you're entering a dangerous or unhealthy area")**
- They trigger on:
  - red zones (active emergencies)
  - grey zones (worded more softly: "incidents were reported here")
  - unhealthy areas (verified Garbage and Water / Drainage alerts)
  - poorly lit streets (verified Streetlight-out alerts), only between 8 PM and 5 AM
- The same zone notifies at most **once every 6 hours**.
- Checked **on the phone** (geofencing). The user's location is never sent to the server for this.
- **Phase 4:** an in-app warning banner while the app is open (works in Expo Go).
- **Phase 8:** real notifications even when the app is closed (development build, "Allow all the time" location).

**Other**
- Keep the heatmap and the one-line area summaries from the prototype.
- Push notifications come last, because they need a development build.

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
**Libraries:** `expo-router`, `react-native-maps`, `expo-location`, `expo-image-picker` (camera only) or `expo-camera`, `expo-image-manipulator`, `@supabase/supabase-js`, `@react-native-async-storage/async-storage`, `react-native-url-polyfill`, `@tanstack/react-query`, `react-native-safe-area-context`, `expo-font` with `@expo-google-fonts/poppins` and `@expo-google-fonts/inter`. Everything runs in Expo Go.

### Look & design
**References:**
- **Image 1 (green map app):** map layout, floating search-style pill at the top, floating rounded bottom tab bar with a raised centre button, white bottom sheets with a drag handle, big full-width green action buttons.
- **Image 2 (light fitness cards):** card styling, spacing and typography. Soft off-white background, white rounded cards (radius ~20), very light shadows, large bold headings, small grey labels, pill-shaped chips and segmented tabs.
- **Prototype screenshots:** keep the content of the Area Summary sheet (headline sentence, risk / report-count / severity pills, "Most reported" box, breakdown bars, latest reports). Restyle it in the new look.
- **Plain React Native styles only:** no blur or glassmorphism, just solid colours, simple shadows (`elevation` on Android) and rounded corners, so it stays smooth in Expo Go.

**Theme (`mobile/src/theme.ts`, shared by every screen):**
- Light and dark palettes with the same token names: `bg`, `card`, `text`, `textMuted`, `border`, `accent`, `accentText`, `danger`, `grey`, `warning`, plus a colour per category. Every component takes colours from the theme only.
- **Accent: fresh green** like image 1 (safety, "all clear"), with a dark teal for the tab bar. **Red is reserved for danger** (red zones, SOS, High risk); grey for grey zones; amber for Moderate.
- **Profile → Appearance:** System (default), Light or Dark, saved on the phone.
- **Map styles:** matching light and dark map styles (`customMapStyle`) on Android with Google Maps. On iPhone in Expo Go, Apple Maps follows the light or dark choice through `userInterfaceStyle`.

**Approved theme tokens** (contrast measured with WCAG formulas; all text ≥ 4.5:1, icons and shapes ≥ 3:1):

*Base palette (light / dark):*
- bg `#F6F8F7` / `#0A1514`
- card `#FFFFFF` / `#132120`
- cardAlt `#EEF3F1` / `#1B2B29`
- border `#E3E9E6` / `#2A3C3A`
- text `#0F1F1A` / `#E6EFEC`
- textMuted `#5B6B65` / `#98ACA7`
- accent button `#15803D` with white text / `#22C55E` with `#04210F` text
- accentText `#15803D` / `#4ADE80`
- tab bar `#0F3D3A` (icons `#FFFFFF`, inactive `#8FB8B2`)

*Dark-mode tint:* dark cards, sheets and the dark map share one teal-slate tint (map land `#1A2725`, roads `#283735`, labels `#8FA5A0`). Sheets over the map stand apart by their 1 px border and drag handle, not a colour clash.

*Badges* (text / background, light → dark):
- Red zone: white on `#DC2626` (both)
- Grey zone: `#374151`/`#E5E7EB` → `#D1D5DB`/`#262B33`
- **Verified: slate-blue** `#2B4A6B`/`#E3EBF4` → `#A9C3DE`/`#182633` (never green on danger alerts)
- Pending: stone `#57534E`/`#EEECE8` → `#D6D3D1`/`#26302E`
- **Fixed: green** `#166534`/`#DCFCE7` → `#4ADE80`/`#0F2A1C`
- Risk Low (Safe): green, same as Fixed
- Risk Moderate: `#92400E`/`#FEF3C7` → `#FBBF24`/`#33270A`
- Risk High: `#991B1B`/`#FEE2E2` → `#FCA5A5`/`#3B1414`
- Green is used only for Safe, Fixed and primary actions.

*Zone circles:*
- Red zone / hot grey zone: stroke `#DC2626` and 18% fill (light), `#F87171` and 22% fill (dark).
- Cooled grey zone: `#6B7280` (light), `#9CA3AF` (dark).

*Category pins* (fill light / dark, white icon unless noted):
- unsafe `#DC2626`/`#EF4444`
- **harassment `#BE123C`/`#E11D48`** (rose-red, matching the red zones)
- fire `#EA580C`
- accident `#7C3AED`/`#8B5CF6`
- garbage `#92400E`/`#B7791F`
- road `#0F766E`/`#0D9488` (teal)
- streetlight `#EAB308`/`#FACC15` with a **dark icon** `#1F2937`
- water `#0284C7`
- other `#475569`/`#64748B`

*Polish (after step 1):*
- **Lists and forms** use soft tinted category chips (a tinted background and a coloured icon). Solid circles are only for map pins.
- **Calmer Fire and Accident:** fire `#C2522A`/`#D9673A`, accident `#6B55C2`/`#8676D6`.
- **Tab bar:** white with a hairline border in light mode (active icon `#15803D`, inactive `#5B6B65`), dark slate `#111D1C` in dark mode. The raised "+" is 56 px, there are 4 evenly spaced slots, and screens get extra bottom padding.
- **Cards:** a 1 px border in both modes, and Android elevation 1 only.

*Visual upgrade (after step 3):*
- **Map base (Android, Google Maps), revised after phone testing:**
  - **Light** uses Google's own full-colour default style, with no overrides. Parks, water, highways and Google's colour-coded place icons all show.
  - **Dark** is a rich, higher-contrast custom style:
    - water `#173D5C`, parks `#183D2D`
    - local roads `#2D3A46`, arterials `#3A4A5A`, warm amber highways `#8A6A2E`
    - category-coloured place names: amber for food and business, teal for schools, violet for government and worship, coral for medical, blue for transit
    - Google's place icons left on
  - The earlier muted style (−15–20%) was dropped because roads blended into the land.
- **Tab bar:** a symmetric 2–1–2 layout with the **+** exactly centred: **Map · Routes · (+) · My Reports · Profile**. "Routes" is a placeholder until phase 6.

*Proposed, waiting for the user's OK: zoomed-in place icons*
- **Data:** OpenStreetMap through our server. A new `GET /places?bbox=` route fetches ~1 km tiles from the free Overpass service, at most 1 request a second.
- **Cache:** a new `places_cache` table (migration `003_places_cache.sql`; Safe Route's SQL moves to `004`), kept 7 days.
- **Place types:** bus/train stops, cafés/restaurants, colleges/schools, parks, hospitals/clinics, police and fire stations.
- **In the app:**
  - only when zoomed in closer than street level (map width under ~1.2 km)
  - at most 30 icons, nearest first, with `tracksViewChanges={false}`
  - 24 px two-tone rounded-square icons drawn under the alert pins
  - names only at the closest zoom
  - Apple's built-in place icons hidden on iPhone (`showsPointsOfInterests={false}`)
  - a "© OpenStreetMap contributors" note while place icons are shown
- **Artwork:** icons in the reference's style, drawn with our MIT-licensed icon set (Streamline's icons are paid, so they aren't copied).

*Pin rings:* a 2 px ring on every pin, **white in light mode and `#E8F0ED` in dark mode** (less glare at night), plus a soft shadow in light mode.

**Typography and layout:**
- One locked font pairing loaded with `expo-font`: **Poppins** for headings and numbers (as in image 2), **Inter** for body text. Text never falls back to random system fonts.
- Text respects the phone's accessibility size up to a cap (`maxFontSizeMultiplier` ~1.3), so large system font settings can't push buttons off screen.
- All screens use safe-area insets (`react-native-safe-area-context`), so nothing sits under the notch, the status bar or the home bar.
- A fixed spacing scale (4 / 8 / 12 / 16 / 24 / 32) and minimum 44 px touch targets. Floating buttons have reserved positions so they never overlap.

### Screens
**Navigation:** a floating rounded bottom tab bar (image 1) with **Map**, **My Reports** and **Profile**, plus a raised round **"+"** centre button that starts a report.

**Sign in:**
- A clean card with the app name: enter your email, then the 6-digit code.

**Map (home):**
- **Top, always visible:** a floating **Area Summary pill** showing the risk badge (Low / Moderate / High) and the one-line headline, for example "A dirty area with safety concerns". It updates as the map moves. Tapping it opens the full Area Summary bottom sheet.
- **Right side (reserved column):** Alerts / Heatmap toggle and the "my location" button.
- **SOS / 112 button, kept apart from the map controls:**
  - It sits **on the left, under the summary pill**, away from the controls people tap often.
  - It needs a **press-and-hold of 1.5 seconds**, with a red ring filling up as feedback.
  - A single tap only shows "Hold to call 112". Releasing early cancels.
  - After the hold, the dialer opens with 112 ready.
- **Tab bar and sheets:** the floating tab bar slides away when any bottom sheet opens (Area Summary, alert detail, report form) and comes back when the sheet closes, so it never covers sheet content or buttons.
- **Bottom-left: reserved empty slot for the phase 6 "Safe Route" button**, so nothing has to move later.
- **What's drawn on the map:**
  - Pins only for verified alerts, as category-coloured pins in the image 1 style.
  - Red zones and hot grey zones: a red 150 m circle. Cooled grey zones: a grey circle labelled "Incidents reported here".
  - Unverified red zones show "Reported by 1 person · expires in 31 h".
- **Zone warning banner (preview):**
  - While the app is open, it watches the user's location. When they walk into a red zone, grey zone, unhealthy area or (at night) a poorly lit street, a banner slides in under the summary pill, for example "Heads up: Harassment reported here 2 h ago".
  - At most once per zone every 6 hours. It's remembered on the phone only.

**Report flow** (started with the centre "+" button). *As built in step 3, the category comes first, then the pin*, so "Happening now" emergencies reach the Call 112 step immediately, and "recent" reports can use the 1-hour location history when placing the pin. The planned order was:
1. **Place the pin with a fixed centre crosshair.** The pin stays in the middle of the screen and the user drags the map under it.
   - The map starts at the user's location and shows a faint 300 m circle. The "Use this spot" button is disabled outside it ("Move closer: you must be within 300 m").
   - The spot's **street or area name** shows under the pin, via `Location.reverseGeocodeAsync`. It's debounced and cached, and falls back to "Near <area>" if the lookup fails.
2. **Pick a category** from big chips with icons.
3. **Emergency categories ask Happening now / Happened recently.** "Happening now" shows the full-screen **Call 112** step, with the street name to read out, before the form.
4. **Form:** severity (Low / Medium / High), a note and a photo (camera only; optional for emergencies). Then **Submit**, a full-width green button.
5. The app checks the 300 m rule before sending (current GPS, or for "recent" the 1-hour location history). After sending it shows the server's message, for example "A pin appears once 3 people report this (1 of 3)".

**Alert detail** (bottom sheet, image 1 style):
- A photo carousel at the top, then the category, status chip, **street name** (never raw coordinates), and "Reported by 3 people · 2 h ago".
- The area summary for 300 m around the alert, every report with its photo, and fix progress (1/3).
- A "Confirm it's fixed" button with the proof checklist for grey zones, a camera photo and the 300 m check.
- **Share button:** the phone's native share sheet (`Share.share`) with text like "⚠️ Harassment reported near Raisina Road · Civic Map", plus a Google Maps link to the spot (`https://maps.google.com/?q=lat,lng`). It contains no personal information. A link that opens the alert inside our app comes later, with the development build.

**My Reports (tab):**
- A list of cards (image 2 "Recent Activities" style): category icon, street name, date and status. Statuses include "Waiting for 2 more reports", "Red zone · 31 h left", "On the map", "Grey zone", "Fixed".
- Tapping a card opens the alert. A pending one shows only the user's own report.
- **Server addition:** `GET /me/reports` returns the signed-in user's reports with their alert status, newest first, 20 per page. It's the only route that shows pending alerts, and only your own.

**Profile:**
- Email, Appearance (System / Light / Dark), sign out, and the "In an emergency, call 112 first" notice.

**Street names everywhere:** the map pill, alert detail, My Reports and the 112 step all use `reverseGeocodeAsync` (on the phone, free, no key), with a small cache so the same spot isn't looked up twice.

### Notes
**Heatmap:** react-native-maps' `<Heatmap>` works only with Google Maps.
- Android in Expo Go: works with no API key.
- iPhone in Expo Go: Apple Maps only, so the app falls back to faded circles. The real heatmap comes in the phase 8 development build.

**Config:** `mobile/.env` holds `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` and `EXPO_PUBLIC_API_URL` (this PC's Wi-Fi address while developing, the Render URL later).

### Phase 4 checklist
- [ ] Expo app set up (TypeScript, expo-router), `.env` read, API client that sends the Supabase login token.
- [ ] `theme.ts`: light and dark palettes, Appearance setting, Poppins + Inter fonts, spacing scale, capped font scaling, safe-area layout.
- [ ] Light and dark map styles (Android); Apple Maps follows the theme (iPhone).
- [ ] Sign in with an email code; the session stays after closing the app.
- [ ] Floating bottom tab bar (Map / My Reports / Profile) with the raised "+" button.
- [ ] Map: verified pins, red and grey zone circles, Alerts / Heatmap toggle (iPhone fallback), my-location button, SOS / 112 button, reserved Safe Route slot.
- [ ] Floating Area Summary pill (risk + headline) that opens the full summary sheet.
- [ ] Report flow: crosshair pin with the 300 m circle, street name under the pin, category chips, Happening now / recently, Call 112 step, camera photo upload, submit and result message.
- [ ] Alert detail sheet: photos, street name, reports, fix progress, Confirm it's fixed with the proof checklist, native Share.
- [ ] My Reports tab, plus the server `GET /me/reports` route with a test.
- [ ] Profile: email, Appearance, sign out, 112 notice.
- [ ] Zone warning banner while the app is open, at most once per zone per 6 hours.
- [ ] Tested on Android and iPhone in Expo Go, in light and dark mode and with large system text.

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
- `hazard_avoid_polygons(origin, destination, ...)` returns the circles for the avoid route, with these safeguards:
  - **It skips any 60 m circle that contains the origin or the destination.** Otherwise the routing provider can't start or finish the route at all.
  - **Simple circles:** `ST_Buffer(..., 60, 'quad_segs=4')` gives 16-sided circles, so the request stays small.
  - **It caps how many circles are sent**, keeping only the highest-risk ones (default 20; ORS also limits total polygon size). Overlapping circles are merged first.
- **Fallback:** if the "avoid hazards" request fails or returns no route, the server quietly continues with the normal alternative routes. A broken avoid-route never breaks route planning, and the server logs the failure.

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

## Phase 8: Notifications (push + zone-entry alerts)
- **Development build** through EAS (free Expo account), with a Google Maps API key for the build. This also gives the real heatmap on iPhone.
- **New-alert push:**
  - `expo-notifications` registers push tokens, and the server keeps each user's last location up to date (`PUT /me/push-token`, `PUT /me/location`).
  - When a high-severity emergency alert appears, the server notifies users within 2 km using `expo-server-sdk`.
- **Zone-entry alerts (geofencing, on the phone):**
  - `expo-location` geofencing with `expo-task-manager` and local notifications.
  - The app downloads the nearest zones and registers them as geofences: up to 20 on iPhone and 100 on Android, nearest first. It refreshes them as the user moves (on app open and on significant location change).
  - Triggers and the 6-hour limit per zone are the same as the Phase 4 banner. Streetlight zones only alert between 8 PM and 5 AM.
  - Needs "Allow location all the time". The app explains why first, and the feature is optional; without it, only the in-app banner works.
  - Google Play needs a background-location declaration and a short demo video, using this safety feature as the reason.
- **Notification settings** in Profile: turn each type on or off (new alerts nearby, red zones, grey zones, unhealthy areas, dark streets), plus quiet hours.
- Possible extra: detect mock-location apps on Android.

## Parked ideas (not scheduled)
- Emergency contacts and sharing live location by SMS or WhatsApp.
- An optional DigiLocker "Verified reporter" badge through a licensed provider (we never store Aadhaar).
- A "flag a fake report" button with a moderator list.
- New accounts waiting 24 h before they can create red zones.
- Other languages (Hindi etc.). Dark mode and My Reports moved into phase 4.

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
  - Walk into a red zone with the app open: the warning banner shows once, and not again within 6 hours.
- **Notifications (phase 8):** with the app closed, walk into a red zone, an unhealthy area and (at night) a dark street. Each notifies once. A new high-severity alert within 2 km sends a push.
- **Routes:**
  - Unit tests cover weights, the night boost, the tie-break, `sameRoute` and the explanation.
  - Smoke test: seeded alerts on the fastest route are avoided by the safest.
  - On the phones, search a destination and compare the two routes.
- **Deploy:** `GET /health` on the Render URL, then the same phone flow against Render.
