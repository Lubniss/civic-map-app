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
3. Further steps are added as each phase is built.
