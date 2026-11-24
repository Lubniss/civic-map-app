import { Router } from 'express';
import { me } from '../auth.js';
import { isEmergency, isHot, isVisible, proofNeeded } from '../categories.js';
import { db } from '../db.js';
import { ApiError, fromDbError } from '../errors.js';
import { parseBbox, parsePointEwkb } from '../geo.js';
import { assertOwnPhoto, signedPhotoUrls } from '../photos.js';
import { alertIdParam, confirmFixBody, parse } from '../schemas.js';

export const FIXES_NEEDED = 3;
export const alertsRouter = Router();

interface AlertRow {
  id: string;
  category: string;
  status: string;
  lat: number;
  lng: number;
  reporter_count: number;
  report_count: number;
  avg_severity: number | string;
  fix_count: number;
  expires_at: string | null;
  hot_until: string | null;
  hot?: boolean;
  created_at: string;
  updated_at: string;
}

export const toAlertJson = (a: AlertRow) => ({
  id: a.id,
  category: a.category,
  status: a.status,
  emergency: isEmergency(a.category),
  /** Draw red when true (red zones and recent grey zones), grey when a grey zone has cooled. */
  hot: a.hot ?? isHot(a.status, a.hot_until),
  lat: a.lat,
  lng: a.lng,
  reporterCount: a.reporter_count,
  reportCount: a.report_count,
  avgSeverity: Number(a.avg_severity),
  fixCount: a.fix_count,
  expiresAt: a.expires_at,
  hotUntil: a.hot_until,
  createdAt: a.created_at,
  updatedAt: a.updated_at,
});

/** Visible alerts (verified, grey zones, active red zones) in the map area. */
export async function visibleAlertsInBbox(bboxParam: unknown, maxRows = 500): Promise<AlertRow[]> {
  const b = parseBbox(bboxParam);
  const { data, error } = await db.rpc('alerts_in_bbox', {
    min_lng: b.minLng, min_lat: b.minLat, max_lng: b.maxLng, max_lat: b.maxLat, max_rows: maxRows,
  });
  if (error) throw fromDbError(error);
  return (data ?? []) as AlertRow[];
}

// GET /alerts?bbox=minLng,minLat,maxLng,maxLat
alertsRouter.get('/', async (req, res) => {
  const rows = await visibleAlertsInBbox(req.query.bbox);
  res.json({ alerts: rows.map(toAlertJson) });
});

// GET /alerts/:id
alertsRouter.get('/:id', async (req, res) => {
  const { id } = parse(alertIdParam, req.params);
  const user = me(req);

  const { data: alert, error } = await db
    .from('alerts')
    .select('id, category, status, location, reporter_count, report_count, avg_severity, fix_count, first_reporter_id, expires_at, hot_until, created_at, updated_at, verified_at, resolved_at')
    .eq('id', id)
    .maybeSingle();
  if (error) throw fromDbError(error);
  if (!alert) throw new ApiError(404, 'ALERT_NOT_FOUND', 'This alert does not exist or is no longer shown.');

  // Pending alerts and expired red zones are hidden from everyone, except that people who
  // reported them can still open them (from My Reports) and see only their own report.
  let onlyMine = false;
  if (alert.status !== 'resolved' && !isVisible(alert.status, alert.expires_at)) {
    const { count, error: mineErr } = await db
      .from('reports')
      .select('id', { count: 'exact', head: true })
      .eq('alert_id', id)
      .eq('user_id', user.id);
    if (mineErr) throw fromDbError(mineErr);
    if (!count) throw new ApiError(404, 'ALERT_NOT_FOUND', 'This alert does not exist or is no longer shown.');
    onlyMine = true;
  }

  let reportsQuery = db.from('reports').select('id, user_id, category, severity, note, photo_path, timing, created_at')
    .eq('alert_id', id).order('created_at', { ascending: false }).limit(50);
  if (onlyMine) reportsQuery = reportsQuery.eq('user_id', user.id);

  const [reportsRes, fixesRes] = await Promise.all([
    reportsQuery,
    db.from('fix_confirmations').select('user_id, photo_path, note, created_at')
      .eq('alert_id', id).order('created_at', { ascending: false }),
  ]);
  if (reportsRes.error) throw fromDbError(reportsRes.error);
  if (fixesRes.error) throw fromDbError(fixesRes.error);
  const reports = reportsRes.data ?? [];
  const fixes = fixesRes.data ?? [];

  const urls = await signedPhotoUrls([...reports.map((r) => r.photo_path), ...fixes.map((f) => f.photo_path)]);
  const point = parsePointEwkb(alert.location as string);

  res.json({
    alert: {
      ...toAlertJson({ ...alert, lat: point.lat, lng: point.lng }),
      verifiedAt: alert.verified_at,
      resolvedAt: alert.resolved_at,
    },
    /** True when the alert isn't on the map (pending / expired) and only your own report is shown. */
    onlyMine,
    reports: reports.map((r) => ({
      id: r.id,
      category: r.category,
      severity: r.severity,
      note: r.note,
      timing: r.timing,
      createdAt: r.created_at,
      photoUrl: r.photo_path ? urls.get(r.photo_path) ?? null : null,
      isMine: r.user_id === user.id,
    })),
    fixes: {
      count: alert.fix_count,
      needed: FIXES_NEEDED,
      proofNeeded: proofNeeded(alert.category),
      confirmedByMe: fixes.some((f) => f.user_id === user.id),
      iAmFirstReporter: alert.first_reporter_id === user.id,
      items: fixes.map((f) => ({ note: f.note, createdAt: f.created_at, photoUrl: urls.get(f.photo_path) ?? null })),
    },
  });
});

// POST /alerts/:id/confirm-fix  { photo_path, note?, reporter_lat, reporter_lng, gps_accuracy_m?, location_at }
alertsRouter.post('/:id/confirm-fix', async (req, res) => {
  const { id } = parse(alertIdParam, req.params);
  const body = parse(confirmFixBody, req.body);
  const user = me(req);

  await assertOwnPhoto(user.id, body.photo_path);
  const { data, error } = await db.rpc('confirm_fix', {
    p_user_id: user.id,
    p_alert_id: id,
    p_photo_path: body.photo_path,
    p_note: body.note ?? null,
    p_reporter_lat: body.reporter_lat,
    p_reporter_lng: body.reporter_lng,
    p_gps_accuracy_m: body.gps_accuracy_m ?? null,
    p_location_at: body.location_at,
  });
  if (error) throw fromDbError(error);
  const row = (data as { status: string; fix_count: number; resolved: boolean }[])[0]!;

  res.json({
    status: row.status,
    fixCount: row.fix_count,
    needed: FIXES_NEEDED,
    resolved: row.resolved,
    message: row.resolved
      ? 'Thanks! 3 people confirmed it, so this problem is now marked as fixed.'
      : `Thanks! ${row.fix_count} of ${FIXES_NEEDED} confirmations so far.`,
  });
});
