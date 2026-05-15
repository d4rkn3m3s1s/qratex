/**
 * In-memory Web Vitals samples from authenticated panel clients (admin/dealer/customer/staff).
 * Best-effort; serverless instances reset between invocations.
 */

export type WebVitalName = 'CLS' | 'FCP' | 'INP' | 'LCP' | 'TTFB';

export type WebVitalRating = 'good' | 'needs-improvement' | 'poor';

export type WebVitalEntry = {
  ts: number;
  userId: string;
  role: string;
  path: string;
  name: WebVitalName;
  value: number;
  delta: number;
  rating: WebVitalRating;
  id: string;
  navigationType?: string;
};

const MAX = 800;

const store: WebVitalEntry[] = [];

export function recordWebVitalEntry(entry: Omit<WebVitalEntry, 'ts'> & { ts?: number }): void {
  store.push({ ...entry, ts: entry.ts ?? Date.now() });
  while (store.length > MAX) store.shift();
}

export type WebVitalsByName = {
  name: WebVitalName;
  count: number;
  avgValue: number;
  goodPct: number;
};

export type WebVitalsSummaryPayload = {
  success: true;
  generatedAt: string;
  windowMs: number;
  totalSamples: number;
  byName: WebVitalsByName[];
  byRole: Record<string, number>;
  recent: Pick<WebVitalEntry, 'ts' | 'role' | 'path' | 'name' | 'value' | 'rating'>[];
};

const DEFAULT_WINDOW_MS = 3_600_000;

export function getWebVitalsSummary(windowMs = DEFAULT_WINDOW_MS): WebVitalsSummaryPayload {
  const cutoff = Date.now() - windowMs;
  const recentAll = store.filter((e) => e.ts >= cutoff);
  const byRole: Record<string, number> = {};
  for (const e of recentAll) {
    byRole[e.role] = (byRole[e.role] ?? 0) + 1;
  }

  const names: WebVitalName[] = ['LCP', 'INP', 'CLS', 'FCP', 'TTFB'];
  const byName: WebVitalsByName[] = names.map((name) => {
    const rows = recentAll.filter((e) => e.name === name);
    const count = rows.length;
    const avgValue = count > 0 ? rows.reduce((s, r) => s + r.value, 0) / count : 0;
    const good = rows.filter((r) => r.rating === 'good').length;
    const goodPct = count > 0 ? Math.round((good / count) * 1000) / 10 : 0;
    return { name, count, avgValue: Math.round(avgValue * 1000) / 1000, goodPct };
  });

  const recent = recentAll
    .slice(-24)
    .map((e) => ({
      ts: e.ts,
      role: e.role,
      path: e.path,
      name: e.name,
      value: e.value,
      rating: e.rating,
    }))
    .reverse();

  return {
    success: true,
    generatedAt: new Date().toISOString(),
    windowMs,
    totalSamples: recentAll.length,
    byName,
    byRole,
    recent,
  };
}
