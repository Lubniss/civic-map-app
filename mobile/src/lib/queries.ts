import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from './api';
import { bboxParam, isBboxTooLarge } from './geo';
import type { AreaSummary, Bbox, HeatPoint, MapAlert } from './types';

const usable = (b: Bbox | null): b is Bbox => b !== null && !isBboxTooLarge(b);

/** Pins and zones in view. */
export function useMapAlerts(bbox: Bbox | null) {
  return useQuery({
    queryKey: ['alerts', bbox && bboxParam(bbox)],
    queryFn: () => api<{ alerts: MapAlert[] }>(`/alerts?bbox=${bboxParam(bbox!)}`).then((r) => r.alerts),
    enabled: usable(bbox),
    placeholderData: keepPreviousData,
  });
}

/** Heat points in view (only fetched while the heatmap is on). */
export function useHeatmap(bbox: Bbox | null, enabled: boolean) {
  return useQuery({
    queryKey: ['heatmap', bbox && bboxParam(bbox)],
    queryFn: () => api<{ points: HeatPoint[] }>(`/heatmap?bbox=${bboxParam(bbox!)}`).then((r) => r.points),
    enabled: enabled && usable(bbox),
    placeholderData: keepPreviousData,
  });
}

/** One-line summary of everything on screen. */
export function useAreaSummary(bbox: Bbox | null) {
  return useQuery({
    queryKey: ['summary', bbox && bboxParam(bbox)],
    queryFn: () => api<AreaSummary>(`/summary?bbox=${bboxParam(bbox!)}`),
    enabled: usable(bbox),
    placeholderData: keepPreviousData,
  });
}
