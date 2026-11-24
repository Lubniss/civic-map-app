import { describe, expect, it } from 'vitest';
import type { Category } from '../src/categories.js';
import { analyze, buildSummary, headline, type SummaryReport } from '../src/summary.js';

const NOW = Date.parse('2026-11-24T12:00:00Z');
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();
const r = (category: Category, severity = 2, age = 1, note: string | null = null): SummaryReport =>
  ({ category, severity, note, created_at: daysAgo(age) });
const many = (n: number, category: Category, severity = 2) => Array.from({ length: n }, () => r(category, severity));

describe('headline', () => {
  it('says so when there are no reports', () => {
    expect(headline(analyze([], NOW))).toBe('No issues reported in this area yet.');
  });

  it('describes a single mild report as "slightly"', () => {
    expect(headline(analyze([r('garbage', 1)], NOW))).toBe('A slightly dirty area.');
  });

  it('combines the top issue with the other big ones', () => {
    const reports = [...many(5, 'unsafe', 2), ...many(3, 'garbage'), ...many(2, 'light')];
    expect(headline(analyze(reports, NOW))).toBe('A very unsafe area with a lot of waste and poor street lighting.');
  });

  it('uses "An" before a vowel and no intensity word in the middle range', () => {
    // 2 unsafe reports at severity 2 -> strength 4 (between 3 and 8)
    expect(headline(analyze(many(2, 'unsafe', 2), NOW))).toBe('An unsafe area.');
  });

  it('leaves out categories with only 1 report or under 15%', () => {
    const reports = [...many(10, 'garbage'), r('light'), r('light'), r('water')];
    // light = 2/13 = 15.4% (kept), water = 1 report (dropped)
    expect(headline(analyze(reports, NOW))).toBe('A very dirty area with poor street lighting.');
  });

  it('handles harassment wording', () => {
    const reports = [...many(3, 'harassment', 3), ...many(2, 'unsafe', 3)];
    expect(headline(analyze(reports, NOW))).toBe('A very harassment-prone area with safety concerns.');
  });

  it('lists up to three extra issues with commas', () => {
    const reports = [...many(6, 'garbage'), ...many(3, 'water'), ...many(3, 'road'), ...many(3, 'light'), ...many(2, 'other')];
    expect(headline(analyze(reports, NOW))).toBe(
      'A very dirty area with drainage problems, damaged roads and poor street lighting.',
    );
  });
});

describe('analyze risk level', () => {
  it('is Low, Medium or High from count x average severity', () => {
    expect(analyze(many(2, 'garbage', 2), NOW).risk).toBe('Low'); // 4
    expect(analyze(many(3, 'garbage', 2), NOW).risk).toBe('Medium'); // 6
    expect(analyze(many(5, 'garbage', 3), NOW).risk).toBe('High'); // 15
  });
});

describe('buildSummary', () => {
  it('builds the breakdown, top issue and latest notes', () => {
    const reports = [
      r('garbage', 2, 1, 'bins overflowing'),
      r('garbage', 3, 10, 'old dump'),
      r('light', 1, 0.5, 'dark corner'),
    ];
    const s = buildSummary(reports, NOW);
    expect(s.total).toBe(3);
    expect(s.breakdown[0]).toMatchObject({ category: 'garbage', count: 2, thisWeek: 1, avgSeverity: 2.5, label: 'Garbage / Waste' });
    expect(s.topIssue).toBe('Garbage / Waste is the most reported issue here (2 reports, 1 this week).');
    expect(s.latest.map((l) => l.note)).toEqual(['dark corner', 'bins overflowing', 'old dump']);
  });

  it('returns an empty summary with no risk when nothing is reported', () => {
    const s = buildSummary([], NOW);
    expect(s).toMatchObject({ total: 0, risk: null, topIssue: null, breakdown: [], latest: [] });
  });
});
