# Civic Map Alerting

A mobile app for reporting local civic problems (unsafe areas, harassment, garbage, potholes, broken streetlights, drainage) on a map. It shows hotspots as a heatmap, summarizes each area in one sentence, and suggests a safer route between two points.

The build plan and current status are in [PLAN.md](PLAN.md).

## Stack
- **Mobile:** Expo / React Native (TypeScript), react-native-maps
- **Server:** Node.js + Express (TypeScript), hosted on Render
- **Database:** Supabase Postgres with PostGIS, Supabase Auth (email one-time code), Supabase Storage (photos)
- **Notifications:** Expo Push

## Folders
| Folder | What's in it |
|---|---|
| `supabase/migrations/` | Database tables, functions and security rules |
| `server/` | Express API |
| `mobile/` | Expo app |

## Setup
1. Create a Supabase project (steps in PLAN.md, phase 0).
2. Copy `server/.env.example` to `server/.env` and `mobile/.env.example` to `mobile/.env`, then fill in the keys.
3. **Database:** in Supabase, open **SQL Editor → New query**, paste all of `supabase/migrations/001_init.sql` and click **Run**. Then do the same with `002_report_rules.sql`. Run each file once, in order.
4. **Test the database** from this folder:
   ```
   node --env-file=server/.env --env-file=mobile/.env supabase/tests/db-test.mjs
   ```
   It uses 4 throwaway users at 0.5°N 0.5°E (in the ocean), checks every rule, then deletes them.
5. **Server** (in `server/`):
   ```
   npm install
   npm test          # unit tests
   npm run dev       # starts the API on port 4000 and prints the Wi-Fi address for phones
   npm run smoke     # in a second terminal, while dev is running: calls every endpoint with real logins
   ```
6. Further steps are added as each phase is built.

## API (server)
All routes except `/health` need `Authorization: Bearer <Supabase access token>`. Errors look like `{ "error": { "code", "message" } }`.

| Method & path | What it does |
|---|---|
| `GET /health` | Server is up |
| `GET /alerts?bbox=minLng,minLat,maxLng,maxLat` | Verified alerts, active red zones and grey zones in view. `hot: true` means draw red |
| `GET /alerts/:id` | One alert with its reports, photo links, fix progress and the proof a fix needs |
| `POST /reports` | `{lat, lng, category, severity, note?, photo_path?, timing?, reporter_lat, reporter_lng, gps_accuracy_m?, location_at}`; max 20 a day |
| `POST /alerts/:id/confirm-fix` | `{photo_path, note?, reporter_lat, reporter_lng, gps_accuracy_m?, location_at}`; 3 people (not the first reporter) resolve it |
| `GET /heatmap?bbox=...` | Heat points, including pending reports |
| `GET /summary?bbox=...` or `?lat=&lng=&radius=` | Area headline, risk, breakdown, top issue, latest notes, `redZoneCategories` |

**Report rules:**
- **Emergency categories** (`unsafe`, `harassment`, `fire`, `accident`):
  - `timing` must be `now` or `recent`, and the photo is optional.
  - One report makes a red zone (48 h, or 6 h for fire / accident). 3 people make it a permanent grey zone.
- **Other categories:** a photo is required, and 3 people make a pin.
- **300 m rule:** the reporter's location must be within 300 m (+ GPS error, max +100 m) of the spot. The location must be from the last 2 minutes, or the last 60 minutes for `timing: recent`.
- **Photos** are uploaded by the app straight to the private `photos` bucket at `<user_id>/<file>.jpg`, then the path is sent to the API. They must be uploaded in the last 15 minutes.
