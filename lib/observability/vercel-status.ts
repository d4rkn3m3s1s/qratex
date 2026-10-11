/**
 * Vercel platform durumu (Statuspage summary.json) — denetim admin_observability B5.
 * Tüm Statuspage değerleri tip güvenli tona ve Türkçe etikete çevrilir; olaylar `impact`
 * ve son güncelleme metniyle gelir. 60 sn Redis önbelleği (her admin sekmesi ayrı ayrı
 * dış servise gitmesin). Hata fırlatır → bölüm hatası olarak görünür.
 */
import { redisGetJson, redisSetJson } from '@/lib/redis';
import type { PlatformView } from './contract';
import { incidentStatusLabel, platformLabel, platformTone } from './contract';

const URL_SUMMARY = 'https://www.vercel-status.com/api/v2/summary.json';
const TIMEOUT_MS = 6000;
const CACHE_KEY = 'obs:vercel-status:v1';

type Raw = {
  status?: { indicator?: string; description?: string };
  components?: Array<{ id?: string; name?: string; status?: string; group?: boolean; group_id?: string | null }>;
  incidents?: Array<{
    id?: string;
    name?: string;
    status?: string;
    impact?: string;
    updated_at?: string;
    shortlink?: string;
    incident_updates?: Array<{ body?: string; created_at?: string }>;
  }>;
  scheduled_maintenances?: Array<{ id?: string; name?: string; status?: string; scheduled_for?: string; shortlink?: string }>;
};

/** Saf eşleme (test edilir). */
export function mapStatusSummary(raw: Raw, fetchedAt: string): PlatformView {
  const ind = String(raw.status?.indicator ?? 'unknown').toLowerCase();
  const components = (Array.isArray(raw.components) ? raw.components : [])
    .filter((c) => !c.group)
    .map((c) => {
      const status = String(c.status ?? 'unknown').toLowerCase();
      return { id: String(c.id ?? c.name ?? ''), name: String(c.name ?? ''), status, tone: platformTone(status), label: platformLabel(status) };
    });
  const incidents = (Array.isArray(raw.incidents) ? raw.incidents : []).map((i) => {
    const impact = String(i.impact ?? 'none').toLowerCase();
    const latest = Array.isArray(i.incident_updates) && i.incident_updates.length ? i.incident_updates[0] : null;
    return {
      id: String(i.id ?? i.name ?? ''),
      name: String(i.name ?? 'Adsız olay'),
      status: String(i.status ?? '').toLowerCase(),
      statusLabel: incidentStatusLabel(i.status),
      impact,
      impactTone: platformTone(impact === 'none' ? 'minor' : impact),
      updatedAt: i.updated_at ?? null,
      latestUpdate: latest?.body ? String(latest.body).slice(0, 400) : null,
      shortlink: safeLink(i.shortlink),
    };
  });
  const maintenances = (Array.isArray(raw.scheduled_maintenances) ? raw.scheduled_maintenances : [])
    .filter((m) => String(m.status ?? '').toLowerCase() !== 'completed')
    .map((m) => ({ id: String(m.id ?? m.name ?? ''), name: String(m.name ?? 'Planlı bakım'), scheduledFor: m.scheduled_for ?? null, shortlink: safeLink(m.shortlink) }));
  return {
    indicator: { tone: platformTone(ind), label: platformLabel(ind), description: String(raw.status?.description ?? '') },
    incidents,
    maintenances,
    components,
    operationalCount: components.filter((c) => c.tone === 'ok').length,
    fetchedAt,
  };
}

function safeLink(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  try {
    const u = new URL(v);
    return u.protocol === 'https:' ? u.toString() : null;
  } catch {
    return null;
  }
}

export async function loadPlatformStatus(opts: { fresh?: boolean } = {}): Promise<PlatformView> {
  if (!opts.fresh) {
    const hit = await redisGetJson<PlatformView>(CACHE_KEY);
    if (hit && hit.indicator) return hit;
  }
  let res: Response;
  try {
    res = await fetch(URL_SUMMARY, { signal: AbortSignal.timeout(TIMEOUT_MS), cache: 'no-store' });
  } catch {
    throw new Error('Vercel durum sayfasına ulaşılamadı (zaman aşımı ya da ağ hatası).');
  }
  if (!res.ok) throw new Error(`Vercel durum sayfası ${res.status} döndürdü.`);
  let raw: Raw;
  try {
    raw = (await res.json()) as Raw;
  } catch {
    throw new Error('Vercel durum sayfası okunamayan bir yanıt döndürdü.');
  }
  const view = mapStatusSummary(raw, new Date().toISOString());
  await redisSetJson(CACHE_KEY, view, 60);
  return view;
}
