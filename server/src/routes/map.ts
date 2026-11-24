import { Router } from 'express';
import type { Category } from '../categories.js';
import { db } from '../db.js';
import { fromDbError } from '../errors.js';
import { bboxAround, distanceM, parseBbox } from '../geo.js';
import { parse, radiusQuery } from '../schemas.js';
import { buildSummary, type SummaryReport } from '../summary.js';
import { visibleAlertsInBbox } from './alerts.js';

export const mapRouter = Router();

// GET /heatmap?bbox=minLng,minLat,maxLng,maxLat
// Includes reports on pending alerts (they add heat but have no pin).
mapRouter.get('/heatmap', async (req, res) => {
  const b = parseBbox(req.query.bbox);
  const { data, error } = await db.rpc('report_points_in_bbox', {
    min_lng: b.minLng, min_lat: b.minLat, max_lng: b.maxLng, max_lat: b.maxLat, max_rows: 5000,
  });
  if (error) throw fromDbError(error);
  const points = (data ?? []) as { lat: number; lng: number; severity: number; category: Category }[];
  res.json({ points: points.map((p) => ({ lat: p.lat, lng: p.lng, weight: p.severity / 3, category: p.category })) });
});

// GET /summary?bbox=...          (what's on screen)
// GET /summary?lat=&lng=&radius= (around a tapped spot; radius 50-2000 m, default 300)
// Uses the same alerts as the pins: verified alerts and active red zones.
mapRouter.get('/summary', async (req, res) => {
  let alerts: { id: string; status: string }[];
  let scope: string;

  if (req.query.bbox !== undefined) {
    alerts = await visibleAlertsInBbox(req.query.bbox, 200);
    scope = 'Everything currently visible on the map';
  } else {
    const q = parse(radiusQuery, req.query);
    const box = bboxAround(q.lat, q.lng, q.radius);
    const rows = await visibleAlertsInBbox(`${box.minLng},${box.minLat},${box.maxLng},${box.maxLat}`, 200);
    alerts = rows.filter((a) => distanceM(q.lat, q.lng, a.lat, a.lng) <= q.radius);
    scope = `Within ${q.radius} m of the selected spot`;
  }
  const alertIds = alerts.map((a) => a.id);
  const redZoneIds = new Set(alerts.filter((a) => a.status === 'red_zone').map((a) => a.id));

  let reports: SummaryReport[] = [];
  if (alertIds.length) {
    const { data, error } = await db
      .from('reports')
      .select('alert_id, category, severity, note, created_at')
      .in('alert_id', alertIds)
      .order('created_at', { ascending: false })
      .limit(2000);
    if (error) throw fromDbError(error);
    reports = (data ?? []).map((r) => ({
      category: r.category as Category,
      severity: r.severity,
      note: r.note,
      created_at: r.created_at,
      inRedZone: redZoneIds.has(r.alert_id),
    }));
  }

  res.json({ scope, alertCount: alertIds.length, ...buildSummary(reports) });
});
