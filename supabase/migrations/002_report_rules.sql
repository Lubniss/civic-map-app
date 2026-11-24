-- =====================================================================
-- Civic Map Alerting: 002_report_rules.sql  (phase 3)
--   * Fire and Accident categories
--   * Emergency categories (unsafe, harassment, fire, accident):
--       1-2 reporters -> red_zone (48 h, or 6 h for fire/accident)
--       3+ reporters  -> grey_zone: permanent, "hot" (shown red) for 48 h / 6 h
--                        after the latest report, then shown grey
--   * "Happening now" / "Happened recently" for emergencies
--   * 300 m rule: reporter GPS must be within 300 m (+ GPS error, max +100 m)
--     of the spot, for reports and fix confirmations
--   * Photo optional for emergencies, required for everything else
--
-- Run ONCE in Supabase: SQL Editor > New query > paste all > Run.
-- Requires 001_init.sql.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- Columns and constraints
-- ---------------------------------------------------------------------
alter table public.alerts drop constraint if exists alerts_category_check;
alter table public.alerts add constraint alerts_category_check
  check (category in ('unsafe','harassment','fire','accident','garbage','road','light','water','other'));

alter table public.alerts drop constraint if exists alerts_status_check;
alter table public.alerts add constraint alerts_status_check
  check (status in ('pending','red_zone','verified','grey_zone','resolved'));

-- Grey zones show red ("hot") until this time, grey afterwards.
alter table public.alerts add column if not exists hot_until timestamptz;

alter table public.reports alter column photo_path drop not null;
alter table public.reports
  add column if not exists timing         text check (timing in ('now','recent')),
  add column if not exists reporter_lat   double precision,
  add column if not exists reporter_lng   double precision,
  add column if not exists gps_accuracy_m real,
  add column if not exists location_at    timestamptz;

alter table public.fix_confirmations
  add column if not exists reporter_lat   double precision,
  add column if not exists reporter_lng   double precision,
  add column if not exists gps_accuracy_m real,
  add column if not exists location_at    timestamptz;

-- Existing verified emergency alerts become grey zones (none expected yet).
update public.alerts
set status = 'grey_zone', hot_until = updated_at + interval '48 hours'
where status = 'verified' and category in ('unsafe','harassment');

-- ---------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------

-- Shown on the map: verified, grey zones, and red zones that haven't expired.
create or replace function public.alert_is_visible(p_status text, p_expires_at timestamptz)
returns boolean
language sql stable
as $$
  select p_status in ('verified', 'grey_zone') or (p_status = 'red_zone' and p_expires_at > now());
$$;

-- Hours an emergency stays red after its latest report; null = not an emergency.
create or replace function public.emergency_hours(p_category text)
returns integer
language sql immutable
as $$
  select case p_category
           when 'unsafe' then 48 when 'harassment' then 48
           when 'fire' then 6 when 'accident' then 6
         end;
$$;

-- The 300 m rule. Raises LOCATION_REQUIRED / INVALID_LOCATION_TIME / LOCATION_TOO_OLD / TOO_FAR.
create or replace function public.assert_reporter_near(
  p_spot        extensions.geography,
  p_lat         double precision,
  p_lng         double precision,
  p_accuracy_m  real,
  p_location_at timestamptz,
  p_max_age     interval
)
returns void
language plpgsql
set search_path = public, extensions
as $$
declare
  v_allowed double precision;
begin
  if p_lat is null or p_lng is null or p_location_at is null
     or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'LOCATION_REQUIRED' using errcode = 'P0001';
  end if;
  -- Small allowance for phone clocks running slightly ahead.
  if p_location_at > now() + interval '2 minutes' then
    raise exception 'INVALID_LOCATION_TIME' using errcode = 'P0001';
  end if;
  if p_location_at < now() - p_max_age then
    raise exception 'LOCATION_TOO_OLD' using errcode = 'P0001';
  end if;
  v_allowed := 300 + least(greatest(coalesce(p_accuracy_m, 0), 0), 100);
  if ST_Distance(p_spot, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography) > v_allowed then
    raise exception 'TOO_FAR' using errcode = 'P0001';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- submit_report (new signature)
-- ---------------------------------------------------------------------
drop function if exists public.submit_report(uuid, double precision, double precision, text, integer, text, text);

create function public.submit_report(
  p_user_id        uuid,
  p_lat            double precision,
  p_lng            double precision,
  p_category       text,
  p_severity       integer,
  p_note           text,
  p_photo_path     text,
  p_timing         text,               -- 'now' | 'recent' (emergencies only)
  p_reporter_lat   double precision,
  p_reporter_lng   double precision,
  p_gps_accuracy_m real,
  p_location_at    timestamptz
)
returns table (
  alert_id       uuid,
  status         text,
  reporter_count integer,
  report_count   integer,
  is_new_alert   boolean,
  expires_at     timestamptz,
  hot_until      timestamptz
)
language plpgsql
set search_path = public, extensions
as $$
#variable_conflict use_column
declare
  v_point     geography;
  v_hours     integer;
  v_emergency boolean;
  v_photo     text := nullif(trim(coalesce(p_photo_path, '')), '');
  v_alert_id  uuid;
  v_new       boolean := false;
  v_reporters integer;
  v_reports   integer;
  v_avg       numeric;
  v_center    geography;
  v_status    text;
  v_expires   timestamptz;
  v_hot       timestamptz;
begin
  if p_user_id is null then
    raise exception 'USER_REQUIRED' using errcode = 'P0001';
  end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'INVALID_LOCATION' using errcode = 'P0001';
  end if;
  if p_category is null or p_category not in ('unsafe','harassment','fire','accident','garbage','road','light','water','other') then
    raise exception 'INVALID_CATEGORY' using errcode = 'P0001';
  end if;
  if p_severity is null or p_severity not between 1 and 3 then
    raise exception 'INVALID_SEVERITY' using errcode = 'P0001';
  end if;

  v_hours := public.emergency_hours(p_category);
  v_emergency := v_hours is not null;

  if v_emergency and (p_timing is null or p_timing not in ('now', 'recent')) then
    raise exception 'TIMING_REQUIRED' using errcode = 'P0001';
  end if;
  if not v_emergency and p_timing is not null and p_timing <> 'now' then
    raise exception 'TIMING_NOT_ALLOWED' using errcode = 'P0001';
  end if;

  if v_photo is null and not v_emergency then
    raise exception 'PHOTO_REQUIRED' using errcode = 'P0001';
  end if;
  if v_photo is not null and v_photo not like p_user_id::text || '/%' then
    raise exception 'INVALID_PHOTO_PATH' using errcode = 'P0001';
  end if;

  v_point := ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography;

  -- 300 m rule: current location (last 2 min), or the last hour for "recent" emergencies.
  perform public.assert_reporter_near(
    v_point, p_reporter_lat, p_reporter_lng, p_gps_accuracy_m, p_location_at,
    case when p_timing = 'recent' then interval '60 minutes' else interval '2 minutes' end
  );

  perform pg_advisory_xact_lock(hashtext('submit_report:' || p_category));

  -- Nearest open alert of the same category within 300 m. Expired red zones are not joined.
  select a.id into v_alert_id
  from alerts a
  where a.category = p_category
    and (a.status in ('pending', 'verified', 'grey_zone') or (a.status = 'red_zone' and a.expires_at > now()))
    and ST_DWithin(a.location, v_point, 300)
  order by ST_Distance(a.location, v_point)
  limit 1;

  if v_alert_id is null then
    insert into alerts (category, location, first_reporter_id)
    values (p_category, v_point, p_user_id)
    returning id into v_alert_id;
    v_new := true;
  end if;

  insert into reports (alert_id, user_id, category, severity, note, photo_path, location,
                       timing, reporter_lat, reporter_lng, gps_accuracy_m, location_at)
  values (v_alert_id, p_user_id, p_category, p_severity, nullif(trim(p_note), ''), v_photo, v_point,
          case when v_emergency then p_timing end, p_reporter_lat, p_reporter_lng, p_gps_accuracy_m, p_location_at);

  select count(distinct r.user_id), count(*), avg(r.severity),
         ST_Centroid(ST_Collect(r.location::geometry))::geography
    into v_reporters, v_reports, v_avg, v_center
  from reports r
  where r.alert_id = v_alert_id;

  v_expires := null;
  v_hot := null;
  if v_emergency then
    if v_reporters >= 3 then
      v_status := 'grey_zone';  v_hot := now() + make_interval(hours => v_hours);
    else
      v_status := 'red_zone';   v_expires := now() + make_interval(hours => v_hours);
    end if;
  else
    v_status := case when v_reporters >= 3 then 'verified' else 'pending' end;
  end if;

  update alerts a
  set reporter_count = v_reporters,
      report_count   = v_reports,
      avg_severity   = round(v_avg, 2),
      location       = v_center,
      status         = v_status,
      expires_at     = v_expires,
      hot_until      = v_hot,
      updated_at     = now(),
      verified_at    = case when v_status in ('verified', 'grey_zone') then coalesce(a.verified_at, now()) else a.verified_at end
  where a.id = v_alert_id;

  return query select v_alert_id, v_status, v_reporters, v_reports, v_new, v_expires, v_hot;
end;
$$;

-- ---------------------------------------------------------------------
-- confirm_fix (new signature: adds the 300 m rule)
-- ---------------------------------------------------------------------
drop function if exists public.confirm_fix(uuid, uuid, text, text);

create function public.confirm_fix(
  p_user_id        uuid,
  p_alert_id       uuid,
  p_photo_path     text,
  p_note           text,
  p_reporter_lat   double precision,
  p_reporter_lng   double precision,
  p_gps_accuracy_m real,
  p_location_at    timestamptz
)
returns table (
  alert_id  uuid,
  status    text,
  fix_count integer,
  resolved  boolean
)
language plpgsql
set search_path = public, extensions
as $$
#variable_conflict use_column
declare
  v_alert alerts%rowtype;
  v_count integer;
begin
  if p_user_id is null then
    raise exception 'USER_REQUIRED' using errcode = 'P0001';
  end if;
  if p_photo_path is null or p_photo_path not like p_user_id::text || '/%' then
    raise exception 'INVALID_PHOTO_PATH' using errcode = 'P0001';
  end if;

  select * into v_alert from alerts a where a.id = p_alert_id for update;

  if not found then
    raise exception 'ALERT_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_alert.status = 'resolved' then
    raise exception 'ALREADY_RESOLVED' using errcode = 'P0001';
  end if;
  if not public.alert_is_visible(v_alert.status, v_alert.expires_at) then
    raise exception 'ALERT_NOT_ACTIVE' using errcode = 'P0001';
  end if;
  if v_alert.first_reporter_id = p_user_id then
    raise exception 'REPORTER_CANNOT_CONFIRM' using errcode = 'P0001';
  end if;

  perform public.assert_reporter_near(
    v_alert.location, p_reporter_lat, p_reporter_lng, p_gps_accuracy_m, p_location_at, interval '2 minutes'
  );

  begin
    insert into fix_confirmations (alert_id, user_id, photo_path, note, reporter_lat, reporter_lng, gps_accuracy_m, location_at)
    values (p_alert_id, p_user_id, p_photo_path, nullif(trim(p_note), ''), p_reporter_lat, p_reporter_lng, p_gps_accuracy_m, p_location_at);
  exception when unique_violation then
    raise exception 'ALREADY_CONFIRMED' using errcode = 'P0001';
  end;

  select count(*) into v_count
  from fix_confirmations f
  where f.alert_id = p_alert_id
    and f.user_id is distinct from v_alert.first_reporter_id;

  update alerts a
  set fix_count   = v_count,
      updated_at  = now(),
      status      = case when v_count >= 3 then 'resolved' else a.status end,
      resolved_at = case when v_count >= 3 then now() else a.resolved_at end
  where a.id = p_alert_id;

  return query
    select p_alert_id,
           case when v_count >= 3 then 'resolved' else v_alert.status end,
           v_count,
           v_count >= 3;
end;
$$;

-- ---------------------------------------------------------------------
-- alerts_in_bbox (adds hot_until and a "hot" flag: draw red when true)
-- ---------------------------------------------------------------------
drop function if exists public.alerts_in_bbox(double precision, double precision, double precision, double precision, integer);

create function public.alerts_in_bbox(
  min_lng double precision,
  min_lat double precision,
  max_lng double precision,
  max_lat double precision,
  max_rows integer default 500
)
returns table (
  id             uuid,
  category       text,
  status         text,
  lat            double precision,
  lng            double precision,
  reporter_count integer,
  report_count   integer,
  avg_severity   numeric,
  fix_count      integer,
  expires_at     timestamptz,
  hot_until      timestamptz,
  hot            boolean,
  created_at     timestamptz,
  updated_at     timestamptz
)
language sql stable
set search_path = public, extensions
as $$
  select a.id, a.category, a.status,
         ST_Y(a.location::geometry), ST_X(a.location::geometry),
         a.reporter_count, a.report_count, a.avg_severity, a.fix_count,
         a.expires_at, a.hot_until,
         (a.status = 'red_zone' or (a.status = 'grey_zone' and a.hot_until > now())),
         a.created_at, a.updated_at
  from alerts a
  where public.alert_is_visible(a.status, a.expires_at)
    and a.location && ST_MakeEnvelope(min_lng, min_lat, max_lng, max_lat, 4326)::geography
  order by a.updated_at desc
  limit least(greatest(max_rows, 1), 1000);
$$;

-- ---------------------------------------------------------------------
-- Security: only the server may call these.
-- ---------------------------------------------------------------------
revoke execute on function public.submit_report(uuid, double precision, double precision, text, integer, text, text, text, double precision, double precision, real, timestamptz) from public, anon, authenticated;
revoke execute on function public.confirm_fix(uuid, uuid, text, text, double precision, double precision, real, timestamptz) from public, anon, authenticated;
revoke execute on function public.alerts_in_bbox(double precision, double precision, double precision, double precision, integer) from public, anon, authenticated;
revoke execute on function public.assert_reporter_near(extensions.geography, double precision, double precision, real, timestamptz, interval) from public, anon, authenticated;

grant execute on function public.submit_report(uuid, double precision, double precision, text, integer, text, text, text, double precision, double precision, real, timestamptz) to service_role;
grant execute on function public.confirm_fix(uuid, uuid, text, text, double precision, double precision, real, timestamptz) to service_role;
grant execute on function public.alerts_in_bbox(double precision, double precision, double precision, double precision, integer) to service_role;
grant execute on function public.assert_reporter_near(extensions.geography, double precision, double precision, real, timestamptz, interval) to service_role;

commit;
