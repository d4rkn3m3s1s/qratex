/**
 * Admin API kataloğu — `scripts/generate-admin-api-catalog.mjs` her derlemede (prebuild)
 * `lib/data/admin-api-catalog.json` üretir. Bu modül ham kaydı normalize eder (eski
 * üretimlerde `auth`/`usedBy` alanı yoktur → "bilinmiyor" olarak dürüstçe işaretlenir).
 * Saf: istemci de import eder.
 */

export type CatalogAuthKind = 'role' | 'team' | 'cron' | 'public' | 'none' | 'unknown';
export type CatalogAuth = { kind: CatalogAuthKind; roles?: string[] };

export type CatalogRoute = {
  path: string;
  methods: string[];
  file: string;
  domain: string;
  /** Üretici yöntemi tespit edemedi (boş liste). */
  undetected: boolean;
  auth: CatalogAuth;
  /** Bu ucu çağıran admin sayfaları (üretici ters indeksi; eski üretimde boş). */
  usedBy: string[];
  /** Politika özeti (mimari-api B14); eski üretimde yok → null. */
  policy: CatalogPolicy | null;
};

export type CatalogPolicy = { rateLimited: boolean; modules: string[]; bodySchema: boolean; retired: boolean };

export type CatalogPayload = {
  generatedAt: string;
  routes: CatalogRoute[];
  /** Üretim `auth` alanını içeriyor mu (yeni üretici). */
  hasAuthInfo: boolean;
  hasUsageInfo: boolean;
};

type RawRoute = { path?: unknown; methods?: unknown; file?: unknown; auth?: unknown; usedBy?: unknown; policy?: unknown };

function toPolicy(raw: unknown): CatalogPolicy | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  return {
    rateLimited: o.rateLimited === true,
    modules: Array.isArray(o.modules) ? o.modules.filter((m): m is string => typeof m === 'string') : [],
    bodySchema: o.bodySchema === true,
    retired: o.retired === true,
  };
}

export function domainOf(path: string): string {
  const seg = path.replace(/^\/api\/admin\/?/, '').split('/')[0];
  return seg || 'kök';
}

function toAuth(raw: unknown): CatalogAuth {
  if (!raw || typeof raw !== 'object') return { kind: 'unknown' };
  const o = raw as { kind?: unknown; roles?: unknown };
  const kinds: CatalogAuthKind[] = ['role', 'team', 'cron', 'public', 'none'];
  const kind = kinds.includes(o.kind as CatalogAuthKind) ? (o.kind as CatalogAuthKind) : 'unknown';
  const roles = Array.isArray(o.roles) ? o.roles.filter((r): r is string => typeof r === 'string') : undefined;
  return roles?.length ? { kind, roles } : { kind };
}

export function normalizeCatalog(raw: { generatedAt?: unknown; routes?: unknown }): CatalogPayload {
  const list = Array.isArray(raw.routes) ? (raw.routes as RawRoute[]) : [];
  const routes: CatalogRoute[] = list
    .filter((r) => typeof r.path === 'string')
    .map((r) => {
      const methods = Array.isArray(r.methods) ? r.methods.filter((m): m is string => typeof m === 'string') : [];
      return {
        path: r.path as string,
        methods,
        file: typeof r.file === 'string' ? r.file : '',
        domain: domainOf(r.path as string),
        undetected: methods.length === 0,
        auth: toAuth(r.auth),
        usedBy: Array.isArray(r.usedBy) ? r.usedBy.filter((u): u is string => typeof u === 'string') : [],
        policy: toPolicy(r.policy),
      };
    });
  return {
    generatedAt: typeof raw.generatedAt === 'string' ? raw.generatedAt : '',
    routes,
    hasAuthInfo: list.some((r) => r.auth !== undefined),
    hasUsageInfo: list.some((r) => r.usedBy !== undefined),
  };
}

export const AUTH_LABEL: Record<CatalogAuthKind, string> = {
  role: 'Rol',
  team: 'Ekip erişimi',
  cron: 'Cron sırrı',
  public: 'Herkese açık',
  none: 'Korumasız',
  unknown: 'Bilinmiyor',
};
