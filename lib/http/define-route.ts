/**
 * `defineRoute` — VARSAYILAN REDDEDEN route fabrikası + zarf v2 (K1, mimari-api §5.2-5.3).
 *
 *   export const POST = defineRoute(
 *     {
 *       name: 'dealer.campaigns.create',
 *       roles: ['DEALER', 'STAFF'],
 *       tenant: 'dealer',                       // ctx.tenant.dealerId (STAFF aktifliği DB'den)
 *       schema: CreateCampaignBody,             // JSON gövde (zod) → ctx.body
 *       query: z.object({ page: z.coerce.number().default(1) }),
 *       rateLimit: 'mutation',                  // ya da { max, windowMs, by }
 *       module: 'campaigns',
 *       idempotent: true,
 *     },
 *     async ({ body, tenant }) => ok({ campaign: await create(tenant.dealerId, body) }, { status: 201 })
 *   );
 *
 * Garanti edilenler (sırasıyla):
 *  1. `roles` ZORUNLU: rol listesi ya da açıkça `'public'`. Boş liste tanım anında hata fırlatır.
 *  2. `requireAuth(roles)` (token-replay + admin kapısı vb. ne eklenirse) → 401/403 zarfı.
 *  3. Rate limit (`checkRateLimitDb`, Redis öncelikli) → 429 + `Retry-After`.
 *  4. Modül kapısı (`assertModuleEnabled`) → 403 `MODULE_DISABLED`.
 *  5. Kiracı kapsamı (`resolveDealerScope`, deny-by-default; ADMIN yalnız `?dealerId=` /
 *     `X-Act-As-Dealer` ile ve varsayılan SALT-OKUNUR) → 400/403/404.
 *  6. zod: params, query, JSON gövde (Content-Type `application/json` zorunlu → 415; boyut
 *     sınırı → 413; bozuk JSON → 400) → 400 `VALIDATION` + `details`.
 *  7. İdempotency (`Idempotency-Key`) — başarılı yanıt 24 saat tekrar oynatılır.
 *  8. Merkezi catch: `ApiError` → kendi kodu; Prisma bağlantı hatası → 503 retryable;
 *     P2025 → 404; P2002 → 409; diğerleri → Sentry (`captureApiError`) + 500 `INTERNAL`.
 *  9. Her yanıtta `Cache-Control: private, no-store` ve `x-request-id`.
 *
 * Zarf v2 GERİYE UYUMLU: istemci bugün 625 yerde `data.success`, 342 yerde `data.error`
 * (metin) okuyor; bu alanlar korunur.
 *   başarı: { ok: true,  success: true,  data, requestId }
 *   hata:   { ok: false, success: false, error: '<Türkçe mesaj>', code, message, details?, retryable?, requestId }
 *
 * Mevcut `createApiRoute` (lib/api-route.ts) dokunulmadan çalışmaya devam eder.
 */
import type { NextRequest } from 'next/server';
import type { Session } from 'next-auth';
import { ZodError, type ZodTypeAny, type z } from 'zod';
import { requireAuth, type AllowedRole } from '@/lib/api-auth';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { isPrismaConnectivityError } from '@/lib/prisma';
import { captureApiError } from '@/lib/capture-api-error';
import { checkRateLimitDb } from '@/lib/rate-limit';
import { getClientIp } from '@/lib/request-metadata';
import { englishErrorMessage, requestLocale, type RequestLocale } from '@/lib/http/error-locale';
import { resolveDealerScope, type DealerScope } from '@/lib/auth/scope';
import { scheduleRouteMetric } from '@/lib/observability/route-metrics';
import { normalizePath } from '@/lib/observability/histogram';
import type { ModuleKey } from '@/lib/module-controls';

// ───────────────────────────── Hata sözleşmesi ─────────────────────────────

export type ApiErrorCode =
  | 'BAD_REQUEST'
  | 'VALIDATION'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'RATE_LIMITED'
  | 'MODULE_DISABLED'
  | 'INSUFFICIENT_POINTS'
  | 'TENANT_REQUIRED'
  | 'SERVICE_UNAVAILABLE'
  | 'INTERNAL';

const DEFAULT_STATUS: Readonly<Record<ApiErrorCode, number>> = {
  BAD_REQUEST: 400,
  VALIDATION: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  RATE_LIMITED: 429,
  MODULE_DISABLED: 403,
  INSUFFICIENT_POINTS: 409,
  TENANT_REQUIRED: 400,
  SERVICE_UNAVAILABLE: 503,
  INTERNAL: 500,
};

export const DEFAULT_ERROR_MESSAGES: Readonly<Record<ApiErrorCode, string>> = {
  BAD_REQUEST: 'İstek geçersiz.',
  VALIDATION: 'Girilen bilgiler geçersiz. Lütfen kontrol edip tekrar deneyin.',
  UNAUTHENTICATED: 'Oturumunuz bulunamadı. Lütfen giriş yapın.',
  FORBIDDEN: 'Bu işlem için yetkiniz yok.',
  NOT_FOUND: 'Kayıt bulunamadı.',
  CONFLICT: 'Bu işlem mevcut kayıtla çakışıyor.',
  PAYLOAD_TOO_LARGE: 'Gönderilen veri çok büyük.',
  UNSUPPORTED_MEDIA_TYPE: 'İstek JSON biçiminde gönderilmelidir.',
  RATE_LIMITED: 'Çok fazla istek gönderdiniz. Lütfen biraz sonra tekrar deneyin.',
  MODULE_DISABLED: 'Bu özellik yönetici tarafından geçici olarak kapatıldı.',
  INSUFFICIENT_POINTS: 'Puanınız bu işlem için yeterli değil.',
  TENANT_REQUIRED: 'İşletme seçilmeden bu işlem yapılamaz.',
  SERVICE_UNAVAILABLE: 'Hizmet geçici olarak ulaşılamıyor. Lütfen birazdan tekrar deneyin.',
  INTERNAL: 'Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.',
};

export interface ApiErrorDetail {
  path: string;
  message: string;
  code?: string;
}

/** Handler içinden fırlatılabilir, kodlu hata. Mesaj kullanıcıya gösterilir (Türkçe yazın). */
export class ApiError extends Error {
  readonly code: ApiErrorCode | (string & {});
  readonly status: number;
  readonly details?: ApiErrorDetail[] | Record<string, unknown>;
  readonly retryable?: boolean;
  readonly headers?: Record<string, string>;
  /** İngilizce istekte gösterilecek metin; yoksa kodun genel İngilizce metni (lib/http/error-locale). */
  readonly messageEn?: string;

  constructor(
    code: ApiErrorCode | (string & {}),
    message?: string,
    init: {
      status?: number;
      details?: ApiErrorDetail[] | Record<string, unknown>;
      retryable?: boolean;
      headers?: Record<string, string>;
      messageEn?: string;
    } = {}
  ) {
    const known = code as ApiErrorCode;
    super(message ?? DEFAULT_ERROR_MESSAGES[known] ?? DEFAULT_ERROR_MESSAGES.INTERNAL);
    this.name = 'ApiError';
    this.code = code;
    this.status = init.status ?? DEFAULT_STATUS[known] ?? 500;
    this.details = init.details;
    this.retryable = init.retryable;
    this.headers = init.headers;
    this.messageEn = init.messageEn;
  }
}

// ───────────────────────────── Zarf ─────────────────────────────

const OK_TAG = Symbol.for('qratex.api.ok');

export interface OkResult<T = unknown> {
  readonly [OK_TAG]: true;
  data: T;
  status: number;
  headers?: Record<string, string>;
  legacySpread: boolean;
}

/**
 * Başarı sonucu. `legacySpread: true` → nesne alanları kök düzeye de yayılır (eski
 * `{ success, ...alanlar }` okuyan istemciler için geçiş bayrağı).
 */
export function ok<T>(
  data: T,
  init: { status?: number; headers?: Record<string, string>; legacySpread?: boolean } = {}
): OkResult<T> {
  return { [OK_TAG]: true, data, status: init.status ?? 200, headers: init.headers, legacySpread: init.legacySpread === true };
}

function isOkResult(v: unknown): v is OkResult {
  return typeof v === 'object' && v !== null && (v as Record<symbol, unknown>)[OK_TAG] === true;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;
}

export function successBody(data: unknown, requestId: string, legacySpread = false): Record<string, unknown> {
  const spread = legacySpread && isPlainObject(data) ? data : {};
  return { ...spread, ok: true, success: true, data: data === undefined ? null : data, requestId };
}

export function errorBody(
  code: string,
  message: string,
  requestId: string,
  extra: { details?: unknown; retryable?: boolean } = {}
): Record<string, unknown> {
  return {
    ok: false,
    success: false,
    error: message,
    code,
    message,
    ...(extra.details !== undefined ? { details: extra.details } : {}),
    ...(extra.retryable !== undefined ? { retryable: extra.retryable } : {}),
    requestId,
  };
}

function baseHeaders(requestId: string, extra?: Record<string, string>): Record<string, string> {
  return { ...PRIVATE_NO_STORE_HEADERS, 'x-request-id': requestId, ...(extra ?? {}) };
}

function jsonResponse(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
  });
}

/**
 * Hata yanıtı. `locale` 'en' ise insan-okur metin İngilizce (B1: API locale-kör idi — EN arayüzde
 * Türkçe hata gösteriliyordu); kod ve ayrıntılar dilden bağımsız aynen gider.
 */
export function errorResponse(err: ApiError, requestId: string, locale: RequestLocale = 'tr'): Response {
  const message = locale === 'en' ? englishErrorMessage(String(err.code), err.status, err.messageEn) : err.message;
  return jsonResponse(
    errorBody(String(err.code), message, requestId, { details: err.details, retryable: err.retryable }),
    err.status,
    baseHeaders(requestId, err.headers)
  );
}

// ───────────────────────────── Rate limit politikaları ─────────────────────────────

export type RateLimitKeyBy = 'user' | 'ip' | 'user-or-ip';
export interface RateLimitPolicy {
  max: number;
  windowMs: number;
  by?: RateLimitKeyBy;
}

/** Adlandırılmış politikalar (mimari-api B7). Hepsi Redis öncelikli `checkRateLimitDb`. */
export const RATE_LIMIT_POLICIES = {
  /** LLM çağıran uçlar. */
  ai: { max: 10, windowMs: 60_000, by: 'user-or-ip' },
  /** Oturumlu yazma işlemleri. */
  mutation: { max: 60, windowMs: 60_000, by: 'user-or-ip' },
  /** Oturumsuz yazma (form, kayıt, geri bildirim). */
  'public-write': { max: 10, windowMs: 60_000, by: 'ip' },
  /** Okuma uçları (kötüye kullanım tavanı). */
  read: { max: 300, windowMs: 60_000, by: 'user-or-ip' },
  /** Hassas işlemler (şifre, e-posta, DSR). */
  sensitive: { max: 5, windowMs: 15 * 60_000, by: 'user-or-ip' },
} as const satisfies Record<string, RateLimitPolicy>;

export type RateLimitPolicyName = keyof typeof RATE_LIMIT_POLICIES;

// ───────────────────────────── Tanım tipleri ─────────────────────────────

type MaybeSchema = ZodTypeAny | undefined;
type Infer<S extends MaybeSchema, Fallback> = S extends ZodTypeAny ? z.infer<S> : Fallback;

export type RouteRoles = ReadonlyArray<AllowedRole> | 'public';

export interface DealerTenantOptions {
  kind: 'dealer';
  /** Kiracı çözümünde izinli roller (varsayılan: `roles` ile kesişim). */
  allowRoles?: ReadonlyArray<Exclude<AllowedRole, 'CUSTOMER'>>;
  /** ADMIN'in bayi adına YAZMASINA izin ver (varsayılan: salt-okunur). */
  allowAdminWrite?: boolean;
}

export type TenantOption = 'dealer' | DealerTenantOptions;

export interface RouteUser {
  id: string;
  role: string;
}

export interface RouteContext<
  R extends RouteRoles,
  B extends MaybeSchema,
  Q extends MaybeSchema,
  P extends MaybeSchema,
  T extends TenantOption | undefined,
> {
  request: NextRequest;
  session: R extends 'public' ? Session | null : Session;
  user: R extends 'public' ? RouteUser | null : RouteUser;
  body: Infer<B, undefined>;
  query: Infer<Q, URLSearchParams>;
  params: Infer<P, Record<string, string | string[]>>;
  tenant: T extends TenantOption ? DealerScope : undefined;
  requestId: string;
  ip: string | null;
}

export interface RouteDefinition<
  R extends RouteRoles,
  B extends MaybeSchema,
  Q extends MaybeSchema,
  P extends MaybeSchema,
  T extends TenantOption | undefined,
> {
  /** Kararlı ad (rate-limit kovası, idempotency ve katalog için). Verilmezse METOD:yol. */
  name?: string;
  /** ZORUNLU: izinli roller ya da açıkça 'public'. */
  roles: R;
  /** JSON gövde şeması (POST/PUT/PATCH/DELETE). */
  schema?: B;
  /** Sorgu parametresi şeması (çok değerli anahtarlar dizi olarak gelir). */
  query?: Q;
  /** Dinamik segment şeması. */
  params?: P;
  tenant?: T;
  rateLimit?: RateLimitPolicyName | RateLimitPolicy;
  /** `MODULE_CATALOG` anahtarı (`ModuleKey`, katalog dışı derlenmez); kapalıysa 403 MODULE_DISABLED. */
  module?: ModuleKey;
  /** `Idempotency-Key` başlığı ile tekrar korumalı. */
  idempotent?: boolean;
  /** Gövde boyut sınırı (bayt). Varsayılan 1 MB. */
  maxBodyBytes?: number;
}

export type RouteHandler<
  R extends RouteRoles,
  B extends MaybeSchema,
  Q extends MaybeSchema,
  P extends MaybeSchema,
  T extends TenantOption | undefined,
> = (ctx: RouteContext<R, B, Q, P, T>) => unknown | Promise<unknown>;

export interface RouteMeta {
  name?: string;
  roles: RouteRoles;
  tenant: 'dealer' | null;
  module: string | null;
  rateLimit: RateLimitPolicyName | RateLimitPolicy | null;
  hasBodySchema: boolean;
  hasQuerySchema: boolean;
  idempotent: boolean;
}

// ───────────────────────────── Yardımcılar ─────────────────────────────

const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const DEFAULT_MAX_BODY_BYTES = 1_000_000;
const REQUEST_ID_RE = /^[A-Za-z0-9._:-]{8,128}$/;

function newRequestId(request: NextRequest): string {
  const incoming = request.headers.get('x-request-id');
  if (incoming && REQUEST_ID_RE.test(incoming)) return incoming;
  try {
    return globalThis.crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

function zodDetails(error: ZodError): ApiErrorDetail[] {
  return error.issues.slice(0, 50).map((issue) => ({
    path: issue.path.map(String).join('.'),
    message: issue.message,
    code: issue.code,
  }));
}

function searchParamsToObject(sp: URLSearchParams): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const key of new Set(sp.keys())) {
    const all = sp.getAll(key);
    out[key] = all.length > 1 ? all : (all[0] ?? '');
  }
  return out;
}

async function readJsonBody(request: NextRequest, maxBytes: number): Promise<unknown> {
  const contentType = request.headers.get('content-type') ?? '';
  const declared = Number(request.headers.get('content-length') ?? '');
  if (Number.isFinite(declared) && declared > maxBytes) throw new ApiError('PAYLOAD_TOO_LARGE');
  const text = await request.text();
  if (text.length === 0) return undefined;
  if (!/^application\/(?:[\w.+-]+\+)?json\b/i.test(contentType.trim())) throw new ApiError('UNSUPPORTED_MEDIA_TYPE');
  if (new TextEncoder().encode(text).length > maxBytes) throw new ApiError('PAYLOAD_TOO_LARGE');
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError('BAD_REQUEST', 'Gönderilen veri geçerli JSON değil.');
  }
}

async function authErrorToApiError(res: Response): Promise<ApiError> {
  let upstream: { error?: unknown; code?: unknown } = {};
  try {
    upstream = (await res.clone().json()) as typeof upstream;
  } catch {
    /* gövdesiz */
  }
  const code: ApiErrorCode = res.status === 401 ? 'UNAUTHENTICATED' : 'FORBIDDEN';
  const raw = typeof upstream.error === 'string' ? upstream.error : '';
  // Eski İngilizce mesajlar Türkçe varsayılana çevrilir; Türkçe/özel mesajlar korunur.
  const message = !raw || /^(unauthorized|forbidden)$/i.test(raw) ? DEFAULT_ERROR_MESSAGES[code] : raw;
  const upstreamCode = typeof upstream.code === 'string' && upstream.code ? upstream.code : code;
  return new ApiError(upstreamCode, message, { status: res.status === 401 ? 401 : res.status || 403 });
}

function prismaErrorCode(err: unknown): string | null {
  if (!err || typeof err !== 'object') return null;
  const code = (err as { code?: unknown }).code;
  const name = (err as { name?: unknown }).name;
  if (typeof code === 'string' && /^P\d{4}$/.test(code) && typeof name === 'string' && name.startsWith('PrismaClient')) {
    return code;
  }
  return null;
}

function toApiError(err: unknown): { apiError: ApiError; unexpected: boolean } {
  if (err instanceof ApiError) return { apiError: err, unexpected: false };
  if (err instanceof ZodError) {
    return { apiError: new ApiError('VALIDATION', undefined, { details: zodDetails(err) }), unexpected: false };
  }
  if (isPrismaConnectivityError(err)) {
    return {
      apiError: new ApiError('SERVICE_UNAVAILABLE', 'Veritabanı geçici olarak ulaşılamıyor', {
        retryable: true,
        headers: { 'Retry-After': '8' },
      }),
      unexpected: false,
    };
  }
  const prismaCode = prismaErrorCode(err);
  if (prismaCode === 'P2025') return { apiError: new ApiError('NOT_FOUND'), unexpected: false };
  if (prismaCode === 'P2002') return { apiError: new ApiError('CONFLICT'), unexpected: false };
  return { apiError: new ApiError('INTERNAL', undefined, { retryable: true }), unexpected: true };
}

function resolvePolicy(rl: RateLimitPolicyName | RateLimitPolicy): RateLimitPolicy {
  return typeof rl === 'string' ? RATE_LIMIT_POLICIES[rl] : rl;
}

function rateLimitIdentity(by: RateLimitKeyBy, userId: string | null, ip: string | null): string {
  if (by === 'user' && userId) return `u:${userId}`;
  if (by === 'ip') return `ip:${ip ?? 'unknown'}`;
  return userId ? `u:${userId}` : `ip:${ip ?? 'unknown'}`;
}

// ───────────────────────────── Fabrika ─────────────────────────────

/**
 * Route tanımla. Dönen fonksiyon doğrudan `export const GET = defineRoute(...)` olarak
 * kullanılır; `.routeMeta` katalog/CI raporu içindir.
 */
export function defineRoute<
  R extends RouteRoles,
  B extends MaybeSchema = undefined,
  Q extends MaybeSchema = undefined,
  P extends MaybeSchema = undefined,
  T extends TenantOption | undefined = undefined,
>(
  definition: RouteDefinition<R, B, Q, P, T>,
  handler: RouteHandler<R, B, Q, P, T>
  // Next 16 route tip-jeneratörü ikinci argümanı katı denetler (opsiyonel/dar tip kabul etmez);
  // `context: any` onu tatmin eder (lib/api-route.ts ile aynı gerekçe).
   
): ((request: NextRequest, context: any) => Promise<Response>) & { routeMeta: RouteMeta } {
  const { roles } = definition;
  if (roles !== 'public' && (!Array.isArray(roles) || roles.length === 0)) {
    // Tanım anında patla: rol listesiz kimlik doğrulama yasak (varsayılan reddet).
    throw new Error('defineRoute: `roles` boş olamaz — rol listesi verin ya da açıkça "public" yazın.');
  }
  const tenantOpts: DealerTenantOptions | null =
    definition.tenant === undefined ? null : definition.tenant === 'dealer' ? { kind: 'dealer' } : definition.tenant;
  if (tenantOpts && roles === 'public') {
    throw new Error('defineRoute: kiracı kapsamlı route public olamaz.');
  }
  const maxBodyBytes = definition.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;

   
  const innerHandler = async (request: NextRequest, context: any): Promise<Response> => {
    const requestId = newRequestId(request);
    const method = (request.method || 'GET').toUpperCase();
    const pathname = request.nextUrl?.pathname ?? '';
    const routeKey = definition.name ?? `${method}:${pathname}`;
    const ip = getClientIp(request);

    try {
      // 1-2) Kimlik + rol
      let session: Session | null = null;
      if (roles !== 'public') {
        const auth = await requireAuth([...(roles as ReadonlyArray<AllowedRole>)]);
        if ('error' in auth) throw await authErrorToApiError(auth.error);
        session = auth.session;
      }
      const userId = (session?.user?.id as string | undefined) ?? null;
      const user: RouteUser | null = userId ? { id: userId, role: String(session?.user?.role ?? '') } : null;

      // 3) Rate limit
      if (definition.rateLimit) {
        const policy = resolvePolicy(definition.rateLimit);
        const bucket = `route:${routeKey}:${rateLimitIdentity(policy.by ?? 'user-or-ip', userId, ip)}`;
        let result: Awaited<ReturnType<typeof checkRateLimitDb>> | null = null;
        try {
          result = await checkRateLimitDb(bucket, policy.max, policy.windowMs);
        } catch (rlError) {
          // Sayaç altyapısı çökerse isteği kesme (fail-open), ama görünür kıl.
          console.warn('[defineRoute] rate limit kontrolü başarısız:', routeKey, rlError);
        }
        if (result && !result.ok) {
          const retryAfterSec = Math.max(1, Math.ceil((result.retryAfterMs ?? policy.windowMs) / 1000));
          throw new ApiError('RATE_LIMITED', undefined, {
            retryable: true,
            headers: { 'Retry-After': String(retryAfterSec) },
          });
        }
      }

      // 4) Modül kapısı
      if (definition.module) {
        const { assertModuleEnabled } = await import('@/lib/module-gate');
        const blocked = await assertModuleEnabled(definition.module, {
          userId: userId ?? undefined,
          request,
          routeKey,
        });
        if (blocked) throw new ApiError('MODULE_DISABLED');
      }

      // 5) Kiracı kapsamı
      let tenant: DealerScope | undefined;
      if (tenantOpts) {
        const requested =
          request.nextUrl?.searchParams.get('dealerId') ?? request.headers.get('x-act-as-dealer') ?? null;
        const allowRoles =
          tenantOpts.allowRoles ??
          ((roles as ReadonlyArray<AllowedRole>).filter((r) => r !== 'CUSTOMER') as Array<
            Exclude<AllowedRole, 'CUSTOMER'>
          >);
        const scope = await resolveDealerScope(session, {
          dealerId: requested,
          allowRoles,
          // Yönetici kiracılar arası erişimi uç adıyla denetime yazılır (guvenlik-bayi-api O6).
          auditContext: routeKey,
          auditMethod: method,
        });
        if (!scope.ok) {
          const code: ApiErrorCode =
            scope.status === 401
              ? 'UNAUTHENTICATED'
              : scope.code === 'DEALER_ID_REQUIRED'
                ? 'TENANT_REQUIRED'
                : scope.status === 404
                  ? 'NOT_FOUND'
                  : 'FORBIDDEN';
          throw new ApiError(code, scope.message, { status: scope.status });
        }
        if (scope.via === 'admin' && WRITE_METHODS.has(method) && !tenantOpts.allowAdminWrite) {
          throw new ApiError('FORBIDDEN', 'Yönetici, işletme adına yalnız görüntüleme yapabilir.');
        }
        tenant = scope;
      }

      // 6) Girdi doğrulama
      let params: unknown = context?.params ? await context.params : {};
      if (definition.params) {
        const parsed = definition.params.safeParse(params);
        if (!parsed.success) throw new ApiError('NOT_FOUND', 'Kayıt bulunamadı.', { details: zodDetails(parsed.error) });
        params = parsed.data;
      }

      const searchParams = request.nextUrl?.searchParams ?? new URLSearchParams();
      let query: unknown = searchParams;
      if (definition.query) {
        const parsed = definition.query.safeParse(searchParamsToObject(searchParams));
        if (!parsed.success) throw new ApiError('VALIDATION', undefined, { details: zodDetails(parsed.error) });
        query = parsed.data;
      }

      let body: unknown = undefined;
      if (definition.schema) {
        const raw = BODY_METHODS.has(method) ? await readJsonBody(request, maxBodyBytes) : undefined;
        const parsed = definition.schema.safeParse(raw);
        if (!parsed.success) throw new ApiError('VALIDATION', undefined, { details: zodDetails(parsed.error) });
        body = parsed.data;
      }

      // 7) İdempotency
      let idempotencyKey = '';
      if (definition.idempotent) {
        const { checkIdempotency } = await import('@/lib/idempotency');
        const idem = await checkIdempotency(request, `${routeKey}:${userId ?? ip ?? 'anon'}`);
        if ('error' in idem) return idem.error;
        if (idem.cached) {
          idem.response.headers.set('x-request-id', requestId);
          idem.response.headers.set('idempotent-replay', 'true');
          return idem.response;
        }
        idempotencyKey = idem.key;
      }

      // 8) İş mantığı
      const result = await handler({
        request,
        session,
        user,
        body,
        query,
        params,
        tenant,
        requestId,
        ip,
      } as RouteContext<R, B, Q, P, T>);

      if (result instanceof Response) {
        try {
          if (!result.headers.has('x-request-id')) result.headers.set('x-request-id', requestId);
        } catch {
          /* değişmez başlıklar */
        }
        return result;
      }

      const okResult = isOkResult(result) ? result : ok(result);
      const payload = successBody(okResult.data, requestId, okResult.legacySpread);
      if (idempotencyKey && okResult.status >= 200 && okResult.status < 300) {
        try {
          const { storeIdempotency } = await import('@/lib/idempotency');
          await storeIdempotency(idempotencyKey, `${routeKey}:${userId ?? ip ?? 'anon'}`, okResult.status, payload);
        } catch (storeError) {
          console.warn('[defineRoute] idempotency kaydı yazılamadı:', routeKey, storeError);
        }
      }
      return jsonResponse(payload, okResult.status, baseHeaders(requestId, okResult.headers));
    } catch (err) {
      const { apiError, unexpected } = toApiError(err);
      if (unexpected) {
        console.error('[defineRoute]', requestId, method, pathname, err);
        captureApiError(err, { route: routeKey, status: 500, requestId, method });
      }
      return errorResponse(apiError, requestId, requestLocale(request.headers));
    }
  };

  // Gözlemlenebilirlik (/admin/observability): durum + süre, yanıttan SONRA Upstash'e
  // saatlik kovaya yazılır (`after`); Redis yoksa no-op, asla fırlatmaz, yanıtı bekletmez.
  const routeHandler = async (request: NextRequest, context: any): Promise<Response> => {
    const t0 = Date.now();
    const res = await innerHandler(request, context);
    try {
      const metricKey =
        definition.name ?? `${(request.method || 'GET').toUpperCase()}:${normalizePath(request.nextUrl?.pathname ?? '')}`;
      scheduleRouteMetric(metricKey, res.status, Date.now() - t0);
    } catch {
      /* ölçüm hatası yanıtı etkilemez */
    }
    return res;
  };

  const routeMeta: RouteMeta = {
    name: definition.name,
    roles,
    tenant: tenantOpts ? 'dealer' : null,
    module: definition.module ?? null,
    rateLimit: definition.rateLimit ?? null,
    hasBodySchema: Boolean(definition.schema),
    hasQuerySchema: Boolean(definition.query),
    idempotent: definition.idempotent === true,
  };
  return Object.assign(routeHandler, { routeMeta });
}
