-- =====================================================================
-- Civic Map Alerting: 003_routes.sql  (phase 6: Fastest vs. Safest Route)
--   * alerts_near_route: visible alerts within 150 m of a route line
--   * hazard_avoid_polygons: 60 m circles around hazards near the trip,
--     for the routing provider's "avoid_polygons" (with safeguards)
--
-- Run ONCE in Supabase: SQL Editor > New query > paste all > Run.
-- Requires 001_init.sql and 002_report_rules.sql.
-- =====================================================================

begin;

-- Visible alerts (verified, grey zones, active red zones) within p_buffer_m of a route.
-- p_route is a GeoJSON LineString in lng/lat (as returned by the routing provider).
create or replace function public.alerts_near_route(
  p_route    text,
  p_buffer_m double precision default 150
)
returns table (
  id             uuid,
  category       text,
  status         text,
  hot            boolean,
  avg_severity   numeric,
  reporter_count integer,
  lat            double precision,
  lng            double precision,
  distance_m     double precision
)
language sql stable
set search_path = public, extensions
as $$
  with route as (
    select ST_SetSRID(ST_GeomFromGeoJSON(p_route), 4326)::geography as g
  )
  select a.id, a.category, a.status,
         (a.status = 'red_zone' or (a.status = 'grey_zone' and a.hot_until > now())),
         a.avg_severity, a.reporter_count,
         ST_Y(a.location::geometry), ST_X(a.location::geometry),
         ST_Distance(a.location, route.g)
  from alerts a, route
  where public.alert_is_visible(a.status, a.expires_at)
    and ST_DWithin(a.location, route.g, least(greatest(p_buffer_m, 10), 500));
$$;

-- Circles to steer an "avoid hazards" route around. Safeguards:
--   * only hazards near the straight line between start and destination (p_corridor_m)
--   * skips any circle that contains the start or destination (the route could not start/finish)
--   * simple 16-sided circles (quad_segs=4), overlapping circles merged, at most p_max of them
-- Hazards = red zones, active grey zones, and verified unsafe / harassment / fire / accident /
-- streetlight-out alerts. Returns a GeoJSON (Multi)Polygon, or null if there is nothing to avoid.
create or replace function public.hazard_avoid_polygons(
  p_origin_lng double precision,
  p_origin_lat double precision,
  p_dest_lng   double precision,
  p_dest_lat   double precision,
  p_corridor_m double precision default 1500,
  p_radius_m   double precision default 60,
  p_max        integer default 20
)
returns text
language sql stable
set search_path = public, extensions
as $$
  with ends as (
    select ST_SetSRID(ST_MakePoint(p_origin_lng, p_origin_lat), 4326)::geography as o,
           ST_SetSRID(ST_MakePoint(p_dest_lng, p_dest_lat), 4326)::geography as d,
           ST_SetSRID(ST_MakeLine(ST_MakePoint(p_origin_lng, p_origin_lat), ST_MakePoint(p_dest_lng, p_dest_lat)), 4326)::geography as line
  ),
  hazards as (
    select a.location,
           case a.category when 'unsafe' then 10 when 'harassment' then 10 when 'fire' then 10
                           when 'accident' then 6 when 'light' then 6 else 1 end * a.avg_severity as weight
    from alerts a, ends
    where public.alert_is_visible(a.status, a.expires_at)
      and (a.status = 'red_zone'
           or (a.status = 'grey_zone' and a.hot_until > now())
           or (a.status in ('verified', 'grey_zone') and a.category in ('unsafe', 'harassment', 'fire', 'accident', 'light')))
      and ST_DWithin(a.location, ends.line, least(greatest(p_corridor_m, 100), 5000))
      and not ST_DWithin(a.location, ends.o, p_radius_m)
      and not ST_DWithin(a.location, ends.d, p_radius_m)
    order by weight desc
    limit least(greatest(p_max, 1), 50)
  ),
  merged as (
    select ST_Union(ST_Buffer(h.location, least(greatest(p_radius_m, 20), 200), 'quad_segs=4')::geometry) as g
    from hazards h
  )
  select case when g is null then null else ST_AsGeoJSON(g, 6) end from merged;
$$;

revoke execute on function public.alerts_near_route(text, double precision) from public, anon, authenticated;
revoke execute on function public.hazard_avoid_polygons(double precision, double precision, double precision, double precision, double precision, double precision, integer) from public, anon, authenticated;
grant execute on function public.alerts_near_route(text, double precision) to service_role;
grant execute on function public.hazard_avoid_polygons(double precision, double precision, double precision, double precision, double precision, double precision, integer) to service_role;

commit;
