// Area summary: ported from the prototype's analyze() / headline() (civic_map/index.html).
import { CATEGORIES, type Category } from './categories.js';

export interface SummaryReport {
  category: Category;
  severity: number;
  note: string | null;
  created_at: string;
  /** True if this report belongs to an active red zone (unsafe/harassment with 1-2 reporters). */
  inRedZone?: boolean;
}

export type RiskLevel = 'Low' | 'Medium' | 'High';

export interface CategoryStat {
  category: Category;
  count: number;
  thisWeek: number;
  avgSeverity: number;
  /** Has at least one active red zone in this area. */
  redZone: boolean;
}

/** Most extra issues the headline lists after the main one. */
const MAX_EXTRA_ISSUES = 3;

export interface Analysis {
  total: number;
  avgSeverity: number;
  risk: RiskLevel;
  ranked: CategoryStat[];
}

const DAY_MS = 86_400_000;

export function analyze(reports: SummaryReport[], now = Date.now()): Analysis {
  const by = new Map<Category, { count: number; sev: number; thisWeek: number; redZone: boolean }>();
  for (const r of reports) {
    const s = by.get(r.category) ?? { count: 0, sev: 0, thisWeek: 0, redZone: false };
    s.count++;
    s.sev += r.severity;
    if (now - Date.parse(r.created_at) < 7 * DAY_MS) s.thisWeek++;
    if (r.inRedZone) s.redZone = true;
    by.set(r.category, s);
  }
  const ranked = [...by.entries()]
    .map(([category, s]) => ({
      category, count: s.count, thisWeek: s.thisWeek, avgSeverity: s.sev / s.count, redZone: s.redZone,
    }))
    .sort((a, b) => b.count - a.count || b.avgSeverity - a.avgSeverity);

  const total = reports.length;
  const avgSeverity = total ? reports.reduce((sum, r) => sum + r.severity, 0) / total : 0;
  const score = total * avgSeverity;
  const risk: RiskLevel = score >= 15 ? 'High' : score >= 6 ? 'Medium' : 'Low';
  return { total, avgSeverity, risk, ranked };
}

/** e.g. "A very unsafe area with a lot of waste and poor street lighting." */
export function headline(a: Analysis): string {
  const top = a.ranked[0];
  if (!top) return 'No issues reported in this area yet.';

  const strength = top.count * top.avgSeverity;
  const intensity = strength < 3 ? 'slightly ' : strength >= 8 ? 'very ' : '';
  let text = `${intensity}${CATEGORIES[top.category].adj} area`;
  text = (/^[aeiou]/i.test(text) ? 'An ' : 'A ') + text;

  // Active red zones are always mentioned (first), even with a single report.
  // Other categories join only if they're a real part of the picture.
  const others = a.ranked.slice(1);
  const redZones = others.filter((c) => c.redZone);
  const significant = others.filter((c) => !c.redZone && c.count > 1 && c.count / a.total >= 0.15);
  const rest = [...redZones, ...significant.slice(0, Math.max(0, MAX_EXTRA_ISSUES - redZones.length))]
    .map((c) => CATEGORIES[c.category].noun);
  if (rest.length) {
    const joined = rest.length === 1 ? rest[0] : `${rest.slice(0, -1).join(', ')} and ${rest[rest.length - 1]}`;
    text += ` with ${joined}`;
  }
  return `${text}.`;
}

export interface AreaSummary {
  headline: string;
  risk: RiskLevel | null;
  /** Categories with an active red zone here, e.g. ["unsafe"]. */
  redZoneCategories: Category[];
  total: number;
  avgSeverity: number;
  breakdown: (CategoryStat & { label: string })[];
  topIssue: string | null;
  latest: { category: Category; label: string; note: string | null; createdAt: string }[];
}

export function buildSummary(reports: SummaryReport[], now = Date.now()): AreaSummary {
  const a = analyze(reports, now);
  const top = a.ranked[0];
  const latest = [...reports]
    .sort((x, y) => Date.parse(y.created_at) - Date.parse(x.created_at))
    .slice(0, 5)
    .map((r) => ({ category: r.category, label: CATEGORIES[r.category].label, note: r.note, createdAt: r.created_at }));

  return {
    headline: headline(a),
    risk: a.total ? a.risk : null,
    redZoneCategories: a.ranked.filter((c) => c.redZone).map((c) => c.category),
    total: a.total,
    avgSeverity: Math.round(a.avgSeverity * 10) / 10,
    breakdown: a.ranked.map((c) => ({
      ...c,
      avgSeverity: Math.round(c.avgSeverity * 10) / 10,
      label: CATEGORIES[c.category].label,
    })),
    topIssue: top
      ? `${CATEGORIES[top.category].label} is the most reported issue here (${top.count} report${top.count === 1 ? '' : 's'}, ${top.thisWeek} this week).`
      : null,
    latest,
  };
}
