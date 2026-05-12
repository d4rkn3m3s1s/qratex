/**
 * In-memory request metrics for observability dashboard.
 * Best-effort per instance; serverless may reset between invocations.
 */

const MAX_ENTRIES = 2000;
const WINDOW_MS = 60_000;

type Entry = { path: string; ok: boolean; ms: number; ts: number };

const store: Entry[] = [];

function prune(): void {
  const cutoff = Date.now() - WINDOW_MS;
  while (store.length > 0 && store[0].ts < cutoff) store.shift();
  while (store.length > MAX_ENTRIES) store.shift();
}

export function trackRequest(path: string, ok: boolean, ms: number): void {
  store.push({ path, ok, ms, ts: Date.now() });
  prune();
}

export type Snapshot = {
  last60s: { requests: number; errors: number; avgMs: number };
  topPaths: Array<{ path: string; requests: number; errors: number; avgMs: number }>;
};

export function getSnapshot(): Snapshot {
  const cutoff = Date.now() - WINDOW_MS;
  const recent = store.filter((e) => e.ts >= cutoff);
  const requests = recent.length;
  const errors = recent.filter((e) => !e.ok).length;
  const avgMs = requests > 0 ? recent.reduce((s, e) => s + e.ms, 0) / requests : 0;

  const byPath = new Map<string, { requests: number; errors: number; totalMs: number }>();
  for (const e of recent) {
    const cur = byPath.get(e.path) ?? { requests: 0, errors: 0, totalMs: 0 };
    cur.requests += 1;
    if (!e.ok) cur.errors += 1;
    cur.totalMs += e.ms;
    byPath.set(e.path, cur);
  }
  const topPaths = Array.from(byPath.entries())
    .map(([path, v]) => ({
      path,
      requests: v.requests,
      errors: v.errors,
      avgMs: v.requests > 0 ? v.totalMs / v.requests : 0,
    }))
    .sort((a, b) => b.requests - a.requests)
    .slice(0, 15);

  return {
    last60s: { requests, errors, avgMs: Math.round(avgMs * 10) / 10 },
    topPaths,
  };
}
