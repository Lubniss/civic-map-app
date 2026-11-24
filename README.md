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
3. **Database:** in Supabase, open **SQL Editor → New query**, paste all of `supabase/migrations/001_init.sql` and click **Run** (once only).
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
| `GET /alerts?bbox=minLng,minLat,maxLng,maxLat` | Pins: verified alerts and active red zones in view |
| `GET /alerts/:id` | One alert with its reports, photo links and fix progress |
| `POST /reports` | `{lat, lng, category, severity, note?, photo_path}`; max 20 a day per user |
| `POST /alerts/:id/confirm-fix` | `{photo_path, note?}`; 3 people (not the first reporter) resolve it |
| `GET /heatmap?bbox=...` | Heat points, including pending reports |
| `GET /summary?bbox=...` or `?lat=&lng=&radius=` | Area headline, risk, breakdown, top issue, latest notes |

Photos are uploaded by the app straight to the private `photos` bucket at `<user_id>/<file>.jpg`, then the path is sent to the API.
