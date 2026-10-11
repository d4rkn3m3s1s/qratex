/**
 * Panel RUM (Web Vitals) — kalıcı, örnek-bağımsız (denetim admin_observability B3/B14).
 *
 * Eski depo tek serverless örneğinin belleğindeki 800 kayıtlık diziydi (yazan ve okuyan
 * farklı örneklere düşüyordu, ortalama kullanılıyordu, istemcinin `rating`'ine güveniliyordu).
 * Şimdi:
 *  - Değer aralığı metrik başına doğrulanır; derece SUNUCUDA değerden türetilir.
 *  - Yol kimliklerden arındırılır (`/admin/users/:id`), yalnız panel yolları kırılımda tutulur.
 *  - Upstash'te saatlik histogram: obs:wv:v1:{YYYYMMDDHH}
 *      "<METRİK>|g|b<i>"          tüm örnekler
 *      "<METRİK>|p|<yol>|b<i>"    yol kırılımı
 *  - p75 histogramdan (Google CWV değerlendirmesiyle aynı yüzdelik), eşikler kova sınırı.
 */
import type { VitalName, VitalPathRow, VitalSummary, VitalsView } from './contract';
import { VITAL_META, VITAL_NAMES } from './contract';
import { bucketIndex, normalizePath, quantileFromHistogram, ratingSplit, totalCount } from './histogram';
import { getObsRedis, hourKey, recentHours, toNumberMap } from './redis';

export const VITAL_EDGES: Record<VitalName, readonly number[]> = {
  LCP: [1000, 1500, 2000, 2500, 3000, 4000, 6000, 10000],
  FCP: [600, 1000, 1400, 1800, 2400, 3000, 5000],
  TTFB: [200, 400, 600, 800, 1200, 1800, 3000],
  INP: [50, 100, 150, 200, 300, 500, 1000],
  CLS: [0.025, 0.05, 0.075, 0.1, 0.15, 0.25, 0.5],
};

/** Makul üst sınırlar: bunun üstü bozuk/zehirli örnek sayılır ve reddedilir. */
export const VITAL_MAX: Record<VitalName, number> = { LCP: 60_000, FCP: 60_000, TTFB: 60_000, INP: 30_000, CLS: 10 };

const KEY_PREFIX = 'obs:wv:v1:';
const TTL_SECONDS = 8 * 24 * 3600;
const PANEL_PREFIXES = ['/admin', '/dealer', '/customer', '/staff'];
const MIN_PATH_SAMPLES = 5;
const MAX_PATH_SEGMENTS = 4;
const SEGMENT_RE = /^[a-z][a-z0-9-]{0,31}$/;
/** Saatlik kovadaki alan sayısı üst sınırı; aşılınca yeni yollar yalnız "(diğer)"e yazılır. */
export const MAX_HOUR_FIELDS = 3000;

export type VitalSample = { name: VitalName; value: number; path?: string | null };

export function isValidVital(s: VitalSample): boolean {
  return Number.isFinite(s.value) && s.value >= 0 && s.value <= VITAL_MAX[s.name];
}

export function ratingOf(name: VitalName, value: number): 'good' | 'needs-improvement' | 'poor' {
  const m = VITAL_META[name];
  if (value <= m.good) return 'good';
  if (value > m.poor) return 'poor';
  return 'needs-improvement';
}

/** Kırılım yolu: yalnız panel yolları; diğerleri "(diğer)". */
export function vitalPath(raw: string | null | undefined): string {
  const p = normalizePath(raw ?? '');
  if (!PANEL_PREFIXES.some((x) => p === x || p.startsWith(`${x}/`))) return '(diğer)';
  // Kardinalite sınırı: en çok MAX_PATH_SEGMENTS parça, yalnız rota biçimli parçalar.
  // Uydurma/rastgele parça (büyük harf, nokta, %, uzun slug) yolu ilk geçerli öneğe indirir.
  const segs = p.split('/').filter(Boolean);
  const kept: string[] = [];
  for (const seg of segs.slice(0, MAX_PATH_SEGMENTS)) {
    if (seg !== ':id' && !SEGMENT_RE.test(seg)) break;
    kept.push(seg);
  }
  return `/${kept.join('/')}`;
}

export function rumEnabled(): boolean {
  return getObsRedis() !== null;
}

/** Geçerli örnekleri tek pipeline'da yazar. Yazılan örnek sayısını döner. */
export async function recordVitals(samples: VitalSample[], now: Date = new Date()): Promise<number> {
  const r = getObsRedis();
  if (!r) return 0;
  const valid = samples.filter(isValidVital);
  if (valid.length === 0) return 0;
  const key = `${KEY_PREFIX}${hourKey(now)}`;
  let full = false;
  try {
    full = Number(await r.hlen(key)) >= MAX_HOUR_FIELDS;
  } catch {
    full = true; // sayılamıyorsa kırılımı kapat (fail-closed), global histogram yine yazılır
  }
  const p = r.pipeline();
  for (const s of valid) {
    const b = bucketIndex(VITAL_EDGES[s.name], s.value);
    p.hincrby(key, `${s.name}|g|b${b}`, 1);
    const path = full ? '(diğer)' : vitalPath(s.path).replace(/\|/g, '/');
    p.hincrby(key, `${s.name}|p|${path}|b${b}`, 1);
  }
  p.expire(key, TTL_SECONDS);
  try {
    await p.exec();
    return valid.length;
  } catch {
    return 0;
  }
}

/** Saatlik alanları metrik/yol histogramlarına toplar ve görünüm üretir (saf). */
export function buildVitalsView(windowHours: number, hours: Array<Record<string, number>>): VitalsView {
  const global = new Map<VitalName, number[]>();
  const byPath = new Map<string, number[]>(); // key: METRİK|yol
  const size = (n: VitalName) => VITAL_EDGES[n].length + 1;
  for (const fields of hours) {
    for (const [field, value] of Object.entries(fields)) {
      const parts = field.split('|');
      const name = parts[0] as VitalName;
      if (!VITAL_NAMES.includes(name)) continue;
      const bPart = parts[parts.length - 1];
      if (!bPart?.startsWith('b')) continue;
      const i = Number(bPart.slice(1));
      if (!Number.isInteger(i) || i < 0 || i >= size(name)) continue;
      if (parts[1] === 'g' && parts.length === 3) {
        const arr = global.get(name) ?? new Array(size(name)).fill(0);
        arr[i] += value;
        global.set(name, arr);
      } else if (parts[1] === 'p' && parts.length >= 4) {
        const path = parts.slice(2, -1).join('|');
        const k = `${name}|${path}`;
        const arr = byPath.get(k) ?? new Array(size(name)).fill(0);
        arr[i] += value;
        byPath.set(k, arr);
      }
    }
  }

  const metrics: VitalSummary[] = VITAL_NAMES.map((name) => {
    const counts = global.get(name) ?? new Array(size(name)).fill(0);
    const n = totalCount(counts);
    const q = quantileFromHistogram(VITAL_EDGES[name], counts, 0.75);
    const split = ratingSplit(VITAL_EDGES[name], counts, VITAL_META[name].good, VITAL_META[name].poor);
    return {
      name,
      n,
      p75: q.value == null ? null : roundVital(name, q.value),
      p75AtLeast: q.atLeast,
      ...split,
      rating: q.value == null ? null : q.atLeast ? 'poor' : ratingOf(name, q.value),
    };
  });

  const worst = (name: 'LCP' | 'INP'): VitalPathRow[] =>
    [...byPath.entries()]
      .filter(([k]) => k.startsWith(`${name}|`))
      .map(([k, counts]) => {
        const q = quantileFromHistogram(VITAL_EDGES[name], counts, 0.75);
        return {
          path: k.slice(name.length + 1),
          n: totalCount(counts),
          p75: q.value == null ? null : roundVital(name, q.value),
          p75AtLeast: q.atLeast,
          rating: q.value == null ? null : q.atLeast ? ('poor' as const) : ratingOf(name, q.value),
        };
      })
      .filter((r) => r.n >= MIN_PATH_SAMPLES && r.p75 != null)
      .sort((a, b) => (b.p75 ?? 0) - (a.p75 ?? 0) || b.n - a.n)
      .slice(0, 5);

  return { collecting: true, windowHours, metrics, worstPaths: { LCP: worst('LCP'), INP: worst('INP') } };
}

function roundVital(name: VitalName, v: number): number {
  return name === 'CLS' ? Math.round(v * 1000) / 1000 : Math.round(v);
}

export async function loadVitalsView(windowHours = 24, now: Date = new Date()): Promise<VitalsView> {
  const r = getObsRedis();
  if (!r) return { collecting: false, reason: 'Redis (Upstash) yapılandırılmadığı için Web Vitals örnekleri saklanmıyor.' };
  const hours = recentHours(now, windowHours);
  const p = r.pipeline();
  for (const h of hours) p.hgetall(`${KEY_PREFIX}${h.key}`);
  const raw = (await p.exec()) as unknown[];
  return buildVitalsView(windowHours, raw.map(toNumberMap));
}
