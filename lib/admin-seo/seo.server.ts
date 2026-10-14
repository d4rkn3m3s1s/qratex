import { envAppUrl, envAuthUrl } from '@/lib/env-url';
/**
 * Admin → SEO Motoru sunucu mantığı.
 *
 * - Okuma önbelleği ATLAR (doğrudan `prisma.settings`), `updatedAt` döner → iyimser kilit (bulgu 8).
 * - Yazma: tek zod şeması, `updatedAt` koşullu `updateMany` (409), tehlikeli değişiklik açık
 *   onay ister (428), denetim izi aktör anlık görüntüsüyle, önbellek ANINDA sona erer.
 * - Geçmiş: ham JSON yerine alan bazlı fark; "sürümü geri yükle" (`newData`) ve eski
 *   "değişikliği geri al" (`oldData`, /admin/audit yüzeyi kullanır) ayrı modlar.
 * - Sağlık: genişletilmiş kontrol seti; dış istek yalnız uygulamanın kendi host'una (SSRF);
 *   son sonuç `Settings('seo.health.last')`'ta kalıcı.
 */
import { revalidateTag } from 'next/cache';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/http/define-route';
import { auditEntry, type AuditActor } from '@/lib/data-safety/audit';
import { SEO_CACHE_TAG, SEO_DEFAULTS, SEO_SETTINGS_KEY } from '@/lib/seo-settings';
import { isHttpUrl, normalizeOgImageUrl, resolveSeoBaseUrl } from '@/lib/seo-url';
import { siteUrl as envSiteUrl } from '@/lib/site-config';
import {
  actionLabel,
  dangerousFlags,
  diffSeoPayload,
  newlyDangerous,
  seoGlobalSchema,
  seoOverrideSchema,
  seoPayloadSchema,
  type HealthCheck,
  type HealthReport,
  type SeoGlobal,
  type SeoHistoryPage,
  type SeoOverride,
  type SeoPayload,
  type SeoPutBody,
  type SeoState,
} from './contract';

export const SEO_HEALTH_KEY = 'seo.health.last';

export interface SeoCtx {
  actor: AuditActor;
  request: { headers: { get(name: string): string | null } } | null;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);

// ───────────────────────────── Normalize (saf) ─────────────────────────────

function defaultGlobal(): SeoGlobal {
  const r = seoGlobalSchema.safeParse({ ...SEO_DEFAULTS, extraSitemapUrls: SEO_DEFAULTS.extraSitemapUrls ?? [] });
  if (r.success) return r.data;
  // Ortam siteUrl'i bozuksa bile geçerli bir varsayılan üret.
  return seoGlobalSchema.parse({
    ...SEO_DEFAULTS,
    siteUrl: 'http://localhost:3000',
    ogImageUrl: '/logo/logo.png',
    extraSitemapUrls: [],
  });
}

/**
 * DB'deki (eski biçimli olabilecek) yükü şemaya oturtur. Geçersiz alan varsayılana çekilir,
 * desteklenmeyen/boş override satırı düşer; hangi anahtarların onarıldığı raporlanır.
 */
export function normalizeStoredPayload(raw: unknown): { payload: SeoPayload; repairedKeys: string[] } {
  const defaults = defaultGlobal();
  const repaired: string[] = [];
  const src = isObj(raw) ? (isObj(raw.global) ? raw.global : raw) : {};
  const shape = seoGlobalSchema.shape;
  const global = { ...defaults } as Record<string, unknown>;
  for (const key of Object.keys(shape) as Array<keyof typeof shape>) {
    if (!(key in src)) continue;
    let value = (src as Obj)[key];
    if (key === 'ogImageUrl' && typeof value === 'string') value = normalizeOgImageUrl(value, '') || '';
    if ((key === 'ogImageWidth' || key === 'ogImageHeight') && typeof value === 'string') value = Number(value);
    const r = (shape[key] as typeof shape.siteUrl).safeParse(value);
    if (r.success) global[key] = r.data;
    else repaired.push(key);
  }
  const overridesRaw = isObj(raw) && Array.isArray(raw.pageOverrides) ? raw.pageOverrides : [];
  const pageOverrides: SeoOverride[] = [];
  const seen = new Set<string>();
  for (const row of overridesRaw) {
    if (!isObj(row)) continue;
    const p = typeof row.path === 'string' ? `/${row.path.trim().replace(/^\/+|\/+$/g, '')}` : '';
    const r = seoOverrideSchema.safeParse({
      path: p,
      title: typeof row.title === 'string' ? row.title : undefined,
      description: typeof row.description === 'string' ? row.description : undefined,
      canonical: typeof row.canonical === 'string' ? row.canonical : undefined,
    });
    if (!r.success || seen.has(r.data.path) || (!r.data.title && !r.data.description && !r.data.canonical)) {
      if (!repaired.includes('pageOverrides')) repaired.push('pageOverrides');
      continue;
    }
    seen.add(r.data.path);
    pageOverrides.push(r.data);
  }
  return { payload: { global: global as SeoGlobal, pageOverrides }, repairedKeys: repaired };
}

function actorLabel(row: { actorSnapshot?: unknown; user?: { name: string | null; email: string } | null }): string | null {
  if (row.user) return row.user.name || row.user.email;
  const snap = row.actorSnapshot as { name?: string | null; email?: string | null } | null | undefined;
  return snap?.name || snap?.email || null;
}

// ───────────────────────────── Okuma ─────────────────────────────

export async function getSeoState(): Promise<SeoState> {
  const row = await prisma.settings.findUnique({
    where: { key: SEO_SETTINGS_KEY },
    select: { id: true, value: true, updatedAt: true },
  });
  const { payload, repairedKeys } = normalizeStoredPayload(row?.value ?? null);
  let lastChange: SeoState['lastChange'] = null;
  if (row) {
    const last = await prisma.auditLog.findFirst({
      where: { entity: 'settings', entityId: row.id },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true, actorSnapshot: true, user: { select: { name: true, email: true } } },
    });
    if (last) lastChange = { at: last.createdAt.toISOString(), actor: actorLabel(last) };
  }
  return {
    payload,
    updatedAt: row ? row.updatedAt.toISOString() : null,
    repairedKeys: row ? repairedKeys : [],
    lastChange,
    demoSite: process.env.NEXT_PUBLIC_DEMO_SITE === 'true',
  };
}

// ───────────────────────────── Yazma ─────────────────────────────

function assertNotDangerous(prev: SeoGlobal | null, next: SeoGlobal, confirmed: boolean | undefined) {
  const flags = newlyDangerous(prev, next);
  if (flags.length && !confirmed) {
    throw new ApiError('DANGEROUS_CHANGE', 'Bu değişiklik sitenin arama görünürlüğünü düşürür; açık onay gerekiyor.', {
      status: 428,
      details: { flags },
    });
  }
}

async function writePayload(
  ctx: SeoCtx,
  next: SeoPayload,
  baseUpdatedAt: string | null | undefined,
  action: string,
  extra?: Obj
): Promise<SeoState> {
  await prisma.$transaction(async (tx) => {
    const existing = await tx.settings.findUnique({
      where: { key: SEO_SETTINGS_KEY },
      select: { id: true, value: true, updatedAt: true },
    });
    let id: string;
    if (existing) {
      if (baseUpdatedAt === null) {
        throw new ApiError('CONFLICT', 'SEO ayarları siz düzenlerken kaydedildi. Güncel sürümü yükleyip tekrar deneyin.');
      }
      const where: Prisma.SettingsWhereInput = { key: SEO_SETTINGS_KEY };
      if (baseUpdatedAt) where.updatedAt = new Date(baseUpdatedAt);
      const res = await tx.settings.updateMany({
        where,
        data: { value: next as unknown as Prisma.InputJsonValue, category: 'seo' },
      });
      if (res.count === 0) {
        throw new ApiError('CONFLICT', 'SEO ayarları siz düzenlerken başka biri tarafından değiştirildi. Güncel sürümü yükleyip tekrar deneyin.');
      }
      id = existing.id;
    } else {
      if (baseUpdatedAt) throw new ApiError('CONFLICT', 'Okunan sürüm artık yok. Sayfayı yenileyin.');
      const created = await tx.settings.create({
        data: { key: SEO_SETTINGS_KEY, value: next as unknown as Prisma.InputJsonValue, category: 'seo' },
        select: { id: true },
      });
      id = created.id;
    }
    await tx.auditLog.create({
      data: auditEntry(
        ctx.actor,
        {
          action: existing ? action : 'create',
          entity: 'settings',
          entityId: id,
          oldData: existing?.value ?? null,
          newData: extra ? { ...next, ...extra } : next,
        },
        ctx.request
      ),
    });
  });
  revalidateTag(SEO_CACHE_TAG, { expire: 0 });
  return getSeoState();
}

export async function saveSeo(ctx: SeoCtx, body: SeoPutBody): Promise<SeoState> {
  const next = seoPayloadSchema.parse(body.payload);
  const current = await getSeoState();
  assertNotDangerous(current.updatedAt ? current.payload.global : null, next.global, body.confirmDangerous);
  return writePayload(ctx, next, body.baseUpdatedAt, 'update');
}

export async function restoreSeoVersion(
  ctx: SeoCtx,
  input: { auditLogId: string; mode: 'restore' | 'undo'; baseUpdatedAt?: string | null; confirmDangerous?: boolean }
): Promise<SeoState> {
  const row = await prisma.settings.findUnique({ where: { key: SEO_SETTINGS_KEY }, select: { id: true } });
  if (!row) throw new ApiError('NOT_FOUND', 'SEO ayarları henüz kaydedilmemiş.');
  const log = await prisma.auditLog.findFirst({
    where: { id: input.auditLogId, entity: 'settings', entityId: row.id },
    select: { id: true, oldData: true, newData: true },
  });
  const source = input.mode === 'restore' ? log?.newData : log?.oldData;
  if (!log || !isObj(source) || !isObj(source.global)) {
    throw new ApiError('NOT_FOUND', input.mode === 'restore' ? 'Bu kayıtta geri yüklenecek sürüm yok.' : 'Bu kayıttan önceki sürüm yok (ilk kayıt).');
  }
  const { payload } = normalizeStoredPayload(source);
  if (!isHttpUrl((source.global as Obj).siteUrl)) {
    throw new ApiError('VALIDATION', 'Bu sürümün Site URL alanı geçersiz; geri yüklenirse siteyi bozardı.');
  }
  if (input.mode === 'restore') {
    const current = await getSeoState();
    assertNotDangerous(current.payload.global, payload.global, input.confirmDangerous);
  }
  return writePayload(ctx, payload, input.baseUpdatedAt, input.mode === 'restore' ? 'restore' : 'rollback', { restoredFromId: log.id });
}

// ───────────────────────────── Geçmiş ─────────────────────────────

export async function listSeoHistory(opts: { cursor?: string; limit: number }): Promise<SeoHistoryPage> {
  const row = await prisma.settings.findUnique({ where: { key: SEO_SETTINGS_KEY }, select: { id: true } });
  if (!row) return { entries: [], nextCursor: null };
  const rows = await prisma.auditLog.findMany({
    where: { entity: 'settings', entityId: row.id },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: opts.limit + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    select: {
      id: true,
      action: true,
      createdAt: true,
      oldData: true,
      newData: true,
      actorSnapshot: true,
      user: { select: { name: true, email: true } },
    },
  });
  const page = rows.slice(0, opts.limit);
  return {
    entries: page.map((r) => {
      const nd = isObj(r.newData) ? r.newData : null;
      const ng = nd && isObj(nd.global) ? normalizeStoredPayload(nd).payload.global : null;
      const og = isObj(r.oldData) && isObj(r.oldData.global) ? normalizeStoredPayload(r.oldData).payload.global : null;
      const dangerous = ng ? newlyDangerous(og, ng).map((d) => d.message) : [];
      return {
        id: r.id,
        action: r.action,
        actionLabel: actionLabel(r.action),
        createdAt: r.createdAt.toISOString(),
        actor: actorLabel(r),
        changes: diffSeoPayload(r.oldData, r.newData),
        dangerous,
        canRestore: !!(nd && isObj(nd.global) && isHttpUrl((nd.global as Obj).siteUrl)),
      };
    }),
    nextCursor: rows.length > opts.limit ? page[page.length - 1]?.id ?? null : null,
  };
}

// ───────────────────────────── Sağlık ─────────────────────────────

const WEIGHT = { critical: 3, warning: 2, info: 1 } as const;

/** Sağlık skoru: test edilmiş kontrollerin önem ağırlıklı başarı oranı (saf). */
export function scoreChecks(checks: HealthCheck[]): number {
  const tested = checks.filter((c) => c.tested);
  const total = tested.reduce((s, c) => s + WEIGHT[c.severity], 0);
  if (!total) return 0;
  const passed = tested.filter((c) => c.passed).reduce((s, c) => s + WEIGHT[c.severity], 0);
  return Math.round((passed / total) * 100);
}

function hostOf(u: string): string | null {
  try {
    return new URL(u).host.toLowerCase();
  } catch {
    return null;
  }
}

/** Sunucudan istek atılabilecek host'lar: uygulamanın kendi adresleri (SSRF sınırı). */
function allowedHosts(): Set<string> {
  const hosts = [envSiteUrl, envAppUrl(), envAuthUrl()]
    .filter((x): x is string => typeof x === 'string' && isHttpUrl(x))
    .map(hostOf)
    .filter((x): x is string => !!x);
  return new Set(hosts);
}

type FetchResult = { ok: boolean; status: number; body: string; contentType: string };
async function safeFetch(url: string, method: 'GET' | 'HEAD' = 'GET'): Promise<FetchResult> {
  try {
    const res = await fetch(url, { method, redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(5000) });
    const body = method === 'GET' ? (await res.text()).slice(0, 200_000) : '';
    return { ok: res.ok, status: res.status, body, contentType: res.headers.get('content-type') ?? '' };
  } catch {
    return { ok: false, status: 0, body: '', contentType: '' };
  }
}

/** Kontrol listesini üretir. `fetcher` testte değiştirilebilir. */
export async function buildHealthChecks(
  state: Pick<SeoState, 'payload' | 'repairedKeys' | 'demoSite'>,
  fetcher: (url: string, method?: 'GET' | 'HEAD') => Promise<FetchResult> = safeFetch,
  hosts: Set<string> = allowedHosts()
): Promise<HealthCheck[]> {
  const g = state.payload.global;
  const checks: HealthCheck[] = [];
  const push = (c: Omit<HealthCheck, 'tested'> & { tested?: boolean }) => checks.push({ tested: true, ...c });

  const siteOk = isHttpUrl(g.siteUrl);
  push({ key: 'siteUrl', label: 'Site URL geçerli', passed: siteOk, detail: siteOk ? g.siteUrl : 'Site URL geçersiz', severity: 'critical', fix: { tab: 'genel', field: 'siteUrl' } });

  const danger = new Map(dangerousFlags(g).map((d) => [d.key, d.message]));
  push({ key: 'robotsIndex', label: 'Site indekslenebilir', passed: !danger.has('robotsIndex'), detail: danger.get('robotsIndex') ?? 'index açık', severity: 'critical', fix: { tab: 'tarama', field: 'robotsIndex' } });
  push({ key: 'robotsFollow', label: 'Bağlantılar izlenebilir', passed: !danger.has('robotsFollow'), detail: danger.get('robotsFollow') ?? 'follow açık', severity: 'warning', fix: { tab: 'tarama', field: 'robotsFollow' } });
  push({ key: 'disallowRoot', label: 'robots.txt tüm siteyi engellemiyor', passed: !danger.has('robotsDisallow'), detail: danger.get('robotsDisallow') ?? `${g.robotsDisallow.length} engellenen yol`, severity: 'critical', fix: { tab: 'tarama', field: 'robotsDisallow' } });
  push({ key: 'sitemapEnabled', label: 'Sitemap açık', passed: g.sitemapEnabled, detail: g.sitemapEnabled ? 'Açık' : 'Kapalı', severity: 'warning', fix: { tab: 'tarama', field: 'sitemapEnabled' } });
  if (state.demoSite) {
    push({ key: 'demoSite', label: 'Demo ortamı', passed: false, detail: 'NEXT_PUBLIC_DEMO_SITE açık: robots.txt bu ortamda tüm siteyi engeller (ayarlardan bağımsız).', severity: 'info' });
  }

  const tl = g.defaultTitle.trim().length;
  push({ key: 'metaTitle', label: 'Başlık uzunluğu (10–60)', passed: tl >= 10 && tl <= 60, detail: `${tl} karakter`, severity: 'warning', fix: { tab: 'genel', field: 'defaultTitle' } });
  const dl = g.defaultDescription.trim().length;
  push({ key: 'metaDescription', label: 'Açıklama uzunluğu (70–160)', passed: dl >= 70 && dl <= 160, detail: `${dl} karakter`, severity: 'warning', fix: { tab: 'genel', field: 'defaultDescription' } });

  const ratio = g.ogImageHeight ? g.ogImageWidth / g.ogImageHeight : 0;
  push({ key: 'ogRatio', label: 'OG görsel oranı ~1.91:1', passed: Math.abs(ratio - 1.91) < 0.12, detail: `${g.ogImageWidth}×${g.ogImageHeight}`, severity: 'info', fix: { tab: 'sosyal', field: 'ogImageWidth' } });

  push({
    key: 'storedValid',
    label: 'Kayıtlı ayarlar geçerli',
    passed: state.repairedKeys.length === 0,
    detail: state.repairedKeys.length ? `Varsayılana çekilen alanlar: ${state.repairedKeys.join(', ')} — kaydederek kalıcı düzeltin.` : 'Tüm alanlar şemaya uygun',
    severity: 'warning',
  });

  const base = resolveSeoBaseUrl(g, envSiteUrl);
  const baseHost = hostOf(base);
  const canFetch = !!baseHost && hosts.has(baseHost);
  const notTested = (key: string, label: string, severity: HealthCheck['severity']) =>
    push({ key, label, passed: false, tested: false, detail: `Test edilmedi: ${baseHost ?? 'adres'} bu sunucunun kendi adresi değil (güvenlik gereği yalnız kendi alan adımıza istek atılır).`, severity });

  // OG görseli
  const ogAbs = g.ogImageUrl ? (isHttpUrl(g.ogImageUrl) ? g.ogImageUrl : `${base}${g.ogImageUrl}`) : '';
  if (!ogAbs) {
    push({ key: 'ogImage', label: 'OG görseli erişilebilir', passed: false, detail: 'OG görseli tanımlı değil', severity: 'warning', fix: { tab: 'sosyal', field: 'ogImageUrl' } });
  } else if (hostOf(ogAbs) && hosts.has(hostOf(ogAbs) as string)) {
    const r = await fetcher(ogAbs, 'HEAD');
    const isImg = r.contentType.startsWith('image/');
    push({ key: 'ogImage', label: 'OG görseli erişilebilir', passed: r.ok && isImg, detail: r.ok ? (isImg ? `HTTP ${r.status}, ${r.contentType}` : `Görsel değil (${r.contentType || 'tür yok'})`) : `Erişilemiyor (HTTP ${r.status || 'bağlantı yok'})`, severity: 'warning', fix: { tab: 'sosyal', field: 'ogImageUrl' } });
  } else {
    push({ key: 'ogImage', label: 'OG görseli erişilebilir', passed: false, tested: false, detail: 'Harici alan adındaki görsel sunucudan test edilmez; paylaşım hata ayıklayıcısıyla kontrol edin.', severity: 'warning' });
  }

  if (!siteOk) {
    push({ key: 'robots', label: 'robots.txt erişimi', passed: false, detail: 'Site URL geçersiz olduğu için test edilemedi', severity: 'critical', fix: { tab: 'genel', field: 'siteUrl' } });
  } else if (!canFetch) {
    notTested('robots', 'robots.txt erişimi', 'critical');
    if (g.sitemapEnabled) notTested('sitemap', 'sitemap.xml doğrulama', 'critical');
  } else {
    const [robots, sitemap] = await Promise.all([
      fetcher(`${base}/robots.txt`),
      g.sitemapEnabled ? fetcher(`${base}/sitemap.xml`) : Promise.resolve(null),
    ]);
    push({ key: 'robots', label: 'robots.txt erişimi', passed: robots.ok, detail: robots.ok ? `HTTP ${robots.status}` : `Erişilemiyor (HTTP ${robots.status || 'bağlantı yok'})`, severity: 'critical' });
    if (g.sitemapEnabled) {
      push({ key: 'robotsSitemap', label: 'robots.txt sitemap satırı', passed: /sitemap:/i.test(robots.body), detail: /sitemap:/i.test(robots.body) ? 'Bulundu' : 'Bulunamadı', severity: 'warning' });
    }
    if (sitemap) {
      const xml = /<urlset|<sitemapindex/i.test(sitemap.body);
      const count = (sitemap.body.match(/<loc>/gi) ?? []).length;
      push({ key: 'sitemap', label: 'sitemap.xml doğrulama', passed: sitemap.ok && xml, detail: sitemap.ok ? (xml ? `${count} adres` : 'XML biçiminde değil') : `Erişilemiyor (HTTP ${sitemap.status || 'bağlantı yok'})`, severity: 'critical' });
    }
  }
  return checks;
}

export async function runSeoHealth(ctx: SeoCtx): Promise<HealthReport> {
  const state = await getSeoState();
  const checks = await buildHealthChecks(state);
  const report: HealthReport = {
    score: scoreChecks(checks),
    checks,
    passedCount: checks.filter((c) => c.tested && c.passed).length,
    failedCount: checks.filter((c) => c.tested && !c.passed).length,
    checkedAt: new Date().toISOString(),
    checkedBy: ctx.actor.name || ctx.actor.email || null,
  };
  await prisma.settings.upsert({
    where: { key: SEO_HEALTH_KEY },
    create: { key: SEO_HEALTH_KEY, value: report as unknown as Prisma.InputJsonValue, category: 'seo' },
    update: { value: report as unknown as Prisma.InputJsonValue },
  });
  return report;
}

export async function getLastSeoHealth(): Promise<HealthReport | null> {
  const row = await prisma.settings.findUnique({ where: { key: SEO_HEALTH_KEY }, select: { value: true } });
  const v = row?.value;
  if (!isObj(v) || !Array.isArray(v.checks) || typeof v.score !== 'number') return null;
  return v as unknown as HealthReport;
}

