-- =====================================================================
-- Civic Map Alerting: 001_init.sql
-- Tables, grouping rules (3 reporters / red zones / fixes), map queries,
-- security rules and the private photo bucket.
--
-- Run ONCE in Supabase: SQL Editor > New query > paste all > Run.
-- PostGIS lives in the "extensions" schema (Supabase default).
-- =====================================================================

create extension if not exists postgis with schema extensions;

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------

-- One row per signed-in user (created automatically on sign-up).
create table public.profiles (
  id               uuid primary key references auth.users (id) on delete cascade,
  display_name     text check (char_length(display_name) <= 60),
  push_token       text,                                   -- phase 6
  last_location    extensions.geography(Point, 4326),      -- phase 6
  last_location_at timestamptz,
  created_at       timestamptz not null default now()
);

-- A group of reports of the same category within 300 m.
--   pending  : 1-2 different reporters. No pin; only adds heat.
--   red_zone : unsafe/harassment with 1-2 reporters. Shown at once; expires_at = latest report + 48 h.
--   verified : 3+ different reporters. Pin on the map, never expires.
--   resolved : 3 fix confirmations from people other than the first reporter.
create table public.alerts (
  id                uuid primary key default gen_random_uuid(),
  category          text not null check (category in ('unsafe','harassment','garbage','road','light','water','other')),
  location          extensions.geography(Point, 4326) not null,   -- center of its reports
  status            text not null default 'pending' check (status in ('pending','red_zone','verified','resolved')),
  reporter_count    integer not null default 0,                   -- different people
  report_count      integer not null default 0,                   -- all reports
  avg_severity      numeric(3,2) not null default 0,
  fix_count         integer not null default 0,
  first_reporter_id uuid references auth.users (id) on delete set null,
  expires_at        timestamptz,                                  -- red zones only
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  verified_at       timestamptz,
  resolved_at       timestamptz
);
create index alerts_location_idx on public.alerts using gist (location);
create index alerts_status_idx   on public.alerts (status);

create table public.reports (
  id          uuid primary key default gen_random_uuid(),
  alert_id    uuid not null references public.alerts (id) on delete cascade,
  user_id     uuid references auth.users (id) on delete set null,
  category    text not null,
  severity    smallint not null check (severity between 1 and 3),
  note        text check (char_length(note) <= 500),
  photo_path  text not null,                                   -- "<user_id>/<file>" in the photos bucket
  location    extensions.geography(Point, 4326) not null,
  created_at  timestamptz not null default now()
);
create index reports_alert_idx    on public.reports (alert_id);
create index reports_user_idx     on public.reports (user_id, created_at desc);
create index reports_location_idx on public.reports using gist (location);

create table public.fix_confirmations (
  id          uuid primary key default gen_random_uuid(),
  alert_id    uuid not null references public.alerts (id) on delete cascade,
  user_id     uuid references auth.users (id) on delete set null,
  photo_path  text not null,
  note        text check (char_length(note) <= 500),
  created_at  timestamptz not null default now(),
  unique (alert_id, user_id)                                   -- one confirmation per person
);

-- ---------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------

-- Is this alert shown on the map (pins, summaries, routes)?
create or replace function public.alert_is_visible(p_status text, p_expires_at timestamptz)
returns boolean
language sql stable
as $$
  select p_status = 'verified' or (p_status = 'red_zone' and p_expires_at > now());
$$;

-- Create a profile row whenever someone signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- submit_report: add a report and group it into an alert
-- ---------------------------------------------------------------------
create or replace function public.submit_report(
  p_user_id    uuid,
  p_lat        double precision,
  p_lng        double precision,
  p_category   text,
  p_severity   integer,
  p_note       text,
  p_photo_path text
)
returns table (
  alert_id       uuid,
  status         text,
  reporter_count integer,
  report_count   integer,
  is_new_alert   boolean,
  expires_at     timestamptz
)
language plpgsql
set search_path = public, extensions
as $$
#variable_conflict use_column
declare
  v_point     geography;
  v_alert_id  uuid;
  v_new       boolean := false;
  v_reporters integer;
  v_reports   integer;
  v_avg       numeric;
  v_center    geography;
  v_status    text;
  v_expires   timestamptz;
begin
  if p_user_id is null then
    raise exception 'USER_REQUIRED' using errcode = 'P0001';
  end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'INVALID_LOCATION' using errcode = 'P0001';
  end if;
  if p_category is null or p_category not in ('unsafe','harassment','garbage','road','light','water','other') then
    raise exception 'INVALID_CATEGORY' using errcode = 'P0001';
  end if;
  if p_severity is null or p_severity not between 1 and 3 then
    raise exception 'INVALID_SEVERITY' using errcode = 'P0001';
  end if;
  if p_photo_path is null or p_photo_path not like p_user_id::text || '/%' then
    raise exception 'INVALID_PHOTO_PATH' using errcode = 'P0001';
  end if;

  v_point := ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography;

  -- One report of a category at a time, so two people reporting the same
  -- spot at the same moment can't create two separate alerts.
  perform pg_advisory_xact_lock(hashtext('submit_report:' || p_category));

  -- Nearest open alert of the same category within 300 m.
  -- Expired red zones are not joined; a new report there starts a fresh one.
  select a.id into v_alert_id
  from alerts a
  where a.category = p_category
    and (a.status in ('pending', 'verified') or (a.status = 'red_zone' and a.expires_at > now()))
    and ST_DWithin(a.location, v_point, 300)
  order by ST_Distance(a.location, v_point)
  limit 1;

  if v_alert_id is null then
    insert into alerts (category, location, first_reporter_id)
    values (p_category, v_point, p_user_id)
    returning id into v_alert_id;
    v_new := true;
  end if;

  insert into reports (alert_id, user_id, category, severity, note, photo_path, location)
  values (v_alert_id, p_user_id, p_category, p_severity, nullif(trim(p_note), ''), p_photo_path, v_point);

  select count(distinct r.user_id), count(*), avg(r.severity),
         ST_Centroid(ST_Collect(r.location::geometry))::geography
    into v_reporters, v_reports, v_avg, v_center
  from reports r
  where r.alert_id = v_alert_id;

  if v_reporters >= 3 then
    v_status := 'verified';  v_expires := null;
  elsif p_category in ('unsafe', 'harassment') then
    v_status := 'red_zone';  v_expires := now() + interval '48 hours';
  else
    v_status := 'pending';   v_expires := null;
  end if;

  update alerts a
  set reporter_count = v_reporters,
      report_count   = v_reports,
      avg_severity   = round(v_avg, 2),
      location       = v_center,
      status         = v_status,
      expires_at     = v_expires,
      updated_at     = now(),
      verified_at    = case when v_status = 'verified' then coalesce(a.verified_at, now()) else a.verified_at end
  where a.id = v_alert_id;

  return query select v_alert_id, v_status, v_reporters, v_reports, v_new, v_expires;
end;
$$;

-- ---------------------------------------------------------------------
-- confirm_fix: record "it's fixed" with a photo; 3 confirmations resolve it
-- ---------------------------------------------------------------------
create or replace function public.confirm_fix(
  p_user_id    uuid,
  p_alert_id   uuid,
  p_photo_path text,
  p_note       text
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

  begin
    insert into fix_confirmations (alert_id, user_id, photo_path, note)
    values (p_alert_id, p_user_id, p_photo_path, nullif(trim(p_note), ''));
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
-- Map queries
-- ---------------------------------------------------------------------

-- Pins and red zones on screen: verified alerts + unexpired red zones only.
create or replace function public.alerts_in_bbox(
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
  created_at     timestamptz,
  updated_at     timestamptz
)
language sql stable
set search_path = public, extensions
as $$
  select a.id, a.category, a.status,
         ST_Y(a.location::geometry), ST_X(a.location::geometry),
         a.reporter_count, a.report_count, a.avg_severity, a.fix_count,
         a.expires_at, a.created_at, a.updated_at
  from alerts a
  where public.alert_is_visible(a.status, a.expires_at)
    and a.location && ST_MakeEnvelope(min_lng, min_lat, max_lng, max_lat, 4326)::geography
  order by a.updated_at desc
  limit least(greatest(max_rows, 1), 1000);
$$;

-- Heatmap points: every report on pending, verified or unexpired red-zone alerts.
create or replace function public.report_points_in_bbox(
  min_lng double precision,
  min_lat double precision,
  max_lng double precision,
  max_lat double precision,
  max_rows integer default 5000
)
returns table (
  lat      double precision,
  lng      double precision,
  severity smallint,
  category text
)
language sql stable
set search_path = public, extensions
as $$
  select ST_Y(r.location::geometry), ST_X(r.location::geometry), r.severity, r.category
  from reports r
  join alerts a on a.id = r.alert_id
  where (a.status = 'pending' or public.alert_is_visible(a.status, a.expires_at))
    and r.location && ST_MakeEnvelope(min_lng, min_lat, max_lng, max_lat, 4326)::geography
  order by r.created_at desc
  limit least(greatest(max_rows, 1), 10000);
$$;

-- ---------------------------------------------------------------------
-- Security
-- The phone app never touches these tables directly: everything goes
-- through our Express server, which uses the secret (service_role) key.
-- ---------------------------------------------------------------------
alter table public.profiles          enable row level security;
alter table public.alerts            enable row level security;
alter table public.reports           enable row level security;
alter table public.fix_confirmations enable row level security;
-- No policies on purpose: anon/authenticated users can read or write nothing.

revoke all on public.profiles, public.alerts, public.reports, public.fix_confirmations from anon, authenticated;

-- Newer Supabase projects no longer grant new tables to service_role automatically.
grant usage on schema public to service_role;
grant select, insert, update, delete on public.profiles, public.alerts, public.reports, public.fix_confirmations to service_role;

-- Only the server may call the functions (submit_report takes a user id,
-- so it must never be callable from the app).
revoke execute on function public.submit_report(uuid, double precision, double precision, text, integer, text, text) from public, anon, authenticated;
revoke execute on function public.confirm_fix(uuid, uuid, text, text)                                              from public, anon, authenticated;
revoke execute on function public.alerts_in_bbox(double precision, double precision, double precision, double precision, integer)        from public, anon, authenticated;
revoke execute on function public.report_points_in_bbox(double precision, double precision, double precision, double precision, integer) from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

grant execute on function public.submit_report(uuid, double precision, double precision, text, integer, text, text) to service_role;
grant execute on function public.confirm_fix(uuid, uuid, text, text)                                              to service_role;
grant execute on function public.alerts_in_bbox(double precision, double precision, double precision, double precision, integer)        to service_role;
grant execute on function public.report_points_in_bbox(double precision, double precision, double precision, double precision, integer) to service_role;

-- ---------------------------------------------------------------------
-- Photo storage: private bucket, 5 MB images only.
-- Signed-in users may upload only into their own folder "<user_id>/...".
-- The server hands out short-lived links for viewing.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do nothing;

create policy "Users upload photos to their own folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
