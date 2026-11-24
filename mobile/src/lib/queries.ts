import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { api } from './api';
import { bboxParam, isBboxTooLarge } from './geo';
import type { AlertDetail, AreaSummary, Bbox, HeatPoint, MapAlert, MyReport } from './types';

/** Full detail for one alert. */
export function useAlertDetail(id: string | undefined) {
  return useQuery({
    queryKey: ['alert', id],
    queryFn: () => api<AlertDetail>(`/alerts/${id}`),
    enabled: !!id,
  });
}

/** Area summary for 300 m around a point. */
export function useSummaryNear(point: { lat: number; lng: number } | null) {
  return useQuery({
    queryKey: ['summary-near', point && `${point.lat.toFixed(5)},${point.lng.toFixed(5)}`],
    queryFn: () => api<AreaSummary>(`/summary?lat=${point!.lat}&lng=${point!.lng}&radius=300`),
    enabled: !!point,
  });
}

/** The signed-in user's own reports, 20 per page. */
export function useMyReports() {
  return useInfiniteQuery({
    queryKey: ['me', 'reports'],
    queryFn: ({ pageParam }) => api<{ reports: MyReport[]; nextPage: number | null }>(`/me/reports?page=${pageParam}`),
    initialPageParam: 0,
    getNextPageParam: (last) => last.nextPage ?? undefined,
  });
}

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
