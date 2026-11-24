import { Router } from 'express';
import { me } from '../auth.js';
import { db } from '../db.js';
import { ApiError, fromDbError } from '../errors.js';
import { assertOwnPhoto } from '../photos.js';
import { parse, reportBody } from '../schemas.js';
import { reportMessage, type SubmitResult } from './reportMessage.js';

export const DAILY_REPORT_LIMIT = 20;
export const reportsRouter = Router();

// POST /reports
// { lat, lng, category, severity, note?, photo_path?, timing?, reporter_lat, reporter_lng, gps_accuracy_m?, location_at }
// photo_path is required except for emergencies; timing ('now' | 'recent') is required for emergencies.
reportsRouter.post('/', async (req, res) => {
  const body = parse(reportBody, req.body);
  const user = me(req);

  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { count, error: countError } = await db
    .from('reports')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .gte('created_at', since);
  if (countError) throw fromDbError(countError);
  if ((count ?? 0) >= DAILY_REPORT_LIMIT) {
    throw new ApiError(429, 'DAILY_LIMIT', `You can send up to ${DAILY_REPORT_LIMIT} reports a day. Try again tomorrow.`);
  }

  if (body.photo_path) await assertOwnPhoto(user.id, body.photo_path);

  const { data, error } = await db.rpc('submit_report', {
    p_user_id: user.id,
    p_lat: body.lat,
    p_lng: body.lng,
    p_category: body.category,
    p_severity: body.severity,
    p_note: body.note ?? null,
    p_photo_path: body.photo_path ?? null,
    p_timing: body.timing ?? null,
    p_reporter_lat: body.reporter_lat,
    p_reporter_lng: body.reporter_lng,
    p_gps_accuracy_m: body.gps_accuracy_m ?? null,
    p_location_at: body.location_at,
  });
  if (error) throw fromDbError(error);
  const row = (data as SubmitResult[])[0]!;

  res.status(201).json({
    alertId: row.alert_id,
    status: row.status,
    reporterCount: row.reporter_count,
    reportCount: row.report_count,
    isNewAlert: row.is_new_alert,
    expiresAt: row.expires_at,
    hotUntil: row.hot_until,
    shownOnMap: row.status !== 'pending',
    message: reportMessage(row, body.category),
  });
});
