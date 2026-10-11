/**
 * API uç metrikleri — gerçek trafik, örnek-bağımsız (denetim admin_observability B1).
 *
 * Eski `lib/metrics.ts` tek serverless örneğinin belleğinde yalnız gözlem sayfasının kendi
 * isteklerini sayıyordu. Burada `defineRoute` ile tanımlı HER uç, yanıt döndükten sonra
 * Upstash'te saatlik bir hash'e yazılır:
 *
 *   obs:rt:v1:{YYYYMMDDHH}   alan  "<route>|n"  istek
 *                                  "<route>|e5" 5xx · "<route>|e4" 4xx
 *                                  "<route>|b<i>" gecikme kovası (LATENCY_EDGES_MS)
 *
 * Kayıt: tek pipeline (3-4 komut), istek yolunu bekletmez (`after`), asla fırlatmaz.
 * Redis yoksa ya da `OBS_ROUTE_METRICS=off` ise kapalıdır ve okuma tarafı bunu açıkça söyler.
 * Kapsam: yalnız `defineRoute` uçları (eski elle yazılmış uçlar ölçülmez; arayüz bunu belirtir).
 */
import { after } from 'next/server';
import type { RouteRow, TrafficView, ObsWindow } from './contract';
import { OBS_WINDOW_HOURS } from './contract';
import { bucketIndex, quantileFromHistogram, addInto } from './histogram';
import { getObsRedis, hourKey, recentHours, toNumberMap } from './redis';

export const LATENCY_EDGES_MS = [50, 100, 250, 500, 1000, 2500, 5000, 10000] as const;
const KEY_PREFIX = 'obs:rt:v1:';
const TTL_SECONDS = 49 * 3600;
/** Ölçülmeyen (gürültü/maliyet) uçlar: RUM toplayıcı sayfa başına bir kez çağrılır. */
const SKIP = new Set(['user.web_vitals.ingest']);

export function routeMetricsEnabled(): boolean {
  if (String(process.env.OBS_ROUTE_METRICS ?? '').toLowerCase() === 'off') return false;
  return getObsRedis() !== null;
}

function safeRoute(route: string): string {
  return String(route || 'bilinmeyen').replace(/\|/g, '/').slice(0, 120);
}

/** Bir isteği kaydet. Hata yutulur. */
export async function recordRouteMetric(route: string, status: number, ms: number, now: Date = new Date()): Promise<void> {
  if (SKIP.has(route) || !routeMetricsEnabled()) return;
  const r = getObsRedis();
  if (!r) return;
  try {
    const key = `${KEY_PREFIX}${hourKey(now)}`;
    const name = safeRoute(route);
    const p = r.pipeline();
    p.hincrby(key, `${name}|n`, 1);
    p.hincrby(key, `${name}|b${bucketIndex(LATENCY_EDGES_MS, Math.max(0, ms))}`, 1);
    if (status >= 500) p.hincrby(key, `${name}|e5`, 1);
    else if (status >= 400) p.hincrby(key, `${name}|e4`, 1);
    p.expire(key, TTL_SECONDS);
    await p.exec();
  } catch {
    /* ölçüm hatası isteği etkilemez */
  }
}

/**
 * İsteğin bitişinde kaydı planla: `after()` varsa yanıt gönderildikten sonra, yoksa
 * (test/edge) arka planda. Senkron yolda hiçbir şey beklenmez.
 */
export function scheduleRouteMetric(route: string, status: number, ms: number): void {
  if (SKIP.has(route) || !routeMetricsEnabled()) return;
  const task = () => recordRouteMetric(route, status, ms);
  try {
    after(task);
    return;
  } catch {
    /* istek bağlamı dışında: düş */
  }
  void task();
}

type Agg = { n: number; e5: number; e4: number; buckets: number[] };

function emptyAgg(): Agg {
  return { n: 0, e5: 0, e4: 0, buckets: new Array(LATENCY_EDGES_MS.length + 1).fill(0) };
}

/** Saatlik hash alanlarını uç bazında toplar (saf; test edilir). */
export function aggregateHour(fields: Record<string, number>, into: Map<string, Agg>): Agg {
  const hourTotal = emptyAgg();
  for (const [field, value] of Object.entries(fields)) {
    const sep = field.lastIndexOf('|');
    if (sep <= 0) continue;
    const route = field.slice(0, sep);
    const kind = field.slice(sep + 1);
    const agg = into.get(route) ?? emptyAgg();
    if (kind === 'n') {
      agg.n += value;
      hourTotal.n += value;
    } else if (kind === 'e5') {
      agg.e5 += value;
      hourTotal.e5 += value;
    } else if (kind === 'e4') {
      agg.e4 += value;
      hourTotal.e4 += value;
    } else if (kind.startsWith('b')) {
      const i = Number(kind.slice(1));
      if (Number.isInteger(i) && i >= 0 && i <= LATENCY_EDGES_MS.length) {
        agg.buckets[i] += value;
        hourTotal.buckets[i] += value;
      }
    } else continue;
    into.set(route, agg);
  }
  return hourTotal;
}

function toRow(route: string, a: Agg): RouteRow {
  const p95 = quantileFromHistogram(LATENCY_EDGES_MS, a.buckets, 0.95);
  const p50 = quantileFromHistogram(LATENCY_EDGES_MS, a.buckets, 0.5);
  return {
    route,
    requests: a.n,
    errors5xx: a.e5,
    errors4xx: a.e4,
    errorRatePct: a.n > 0 ? Math.round((a.e5 / a.n) * 1000) / 10 : 0,
    p50Ms: p50.value == null ? null : Math.round(p50.value),
    p95Ms: p95.value == null ? null : Math.round(p95.value),
    p95AtLeast: p95.atLeast,
  };
}

/** Toplanmış saatlerden görünüm üretir (saf; test edilir). */
export function buildTrafficView(window: ObsWindow, hours: Array<{ start: Date; fields: Record<string, number> }>): TrafficView {
  const byRoute = new Map<string, Agg>();
  const total = emptyAgg();
  const series: Array<{ hourStart: string; requests: number; errors5xx: number }> = [];
  for (const h of hours) {
    const t = aggregateHour(h.fields, byRoute);
    total.n += t.n;
    total.e5 += t.e5;
    total.e4 += t.e4;
    addInto(total.buckets, t.buckets);
    series.push({ hourStart: h.start.toISOString(), requests: t.n, errors5xx: t.e5 });
  }
  const rows = [...byRoute.entries()].filter(([, a]) => a.n > 0).map(([route, a]) => toRow(route, a));
  const topErrors = rows
    .filter((r) => r.errors5xx > 0)
    .sort((a, b) => b.errors5xx - a.errors5xx || b.errorRatePct - a.errorRatePct || a.route.localeCompare(b.route))
    .slice(0, 10);
  // Yavaş uçlar: tek istekle sıralama yanıltır → en az 5 istek.
  const slowest = rows
    .filter((r) => r.requests >= 5 && r.p95Ms != null)
    .sort((a, b) => (b.p95Ms ?? 0) - (a.p95Ms ?? 0) || b.requests - a.requests)
    .slice(0, 10);
  const p95 = quantileFromHistogram(LATENCY_EDGES_MS, total.buckets, 0.95);
  return {
    collecting: true,
    window,
    totals: {
      requests: total.n,
      errors5xx: total.e5,
      errors4xx: total.e4,
      errorRatePct: total.n > 0 ? Math.round((total.e5 / total.n) * 1000) / 10 : null,
      p95Ms: p95.value == null ? null : Math.round(p95.value),
      p95AtLeast: p95.atLeast,
    },
    series,
    topErrors,
    slowest,
    routeCount: rows.length,
  };
}

export async function loadTrafficView(window: ObsWindow, now: Date = new Date()): Promise<TrafficView> {
  if (String(process.env.OBS_ROUTE_METRICS ?? '').toLowerCase() === 'off') {
    return { collecting: false, reason: 'Uç metrikleri OBS_ROUTE_METRICS=off ile kapatılmış.' };
  }
  const r = getObsRedis();
  if (!r) {
    return { collecting: false, reason: 'Redis (Upstash) yapılandırılmadığı için uç metrikleri toplanmıyor.' };
  }
  const hours = recentHours(now, OBS_WINDOW_HOURS[window]);
  const p = r.pipeline();
  for (const h of hours) p.hgetall(`${KEY_PREFIX}${h.key}`);
  const raw = (await p.exec()) as unknown[];
  return buildTrafficView(
    window,
    hours.map((h, i) => ({ start: h.start, fields: toNumberMap(raw[i]) }))
  );
}
