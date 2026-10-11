/**
 * Kiracı (bayi) ve AI kapsamı çözümleyicileri — VARSAYILAN REDDET (P0-05, K1).
 *
 * Eski desen: rol listesiz `requireAuth()` + "CUSTOMER ve DEALER'ı daralt, gerisi her şeyi
 * görsün" → STAFF hesabı ADMIN gibi bütün kiracıları okuyordu; `dealerScopeWhere` /
 * `userScopeWhere` bilinmeyen rolde `{}` (filtre yok = hepsi) dönüyordu.
 *
 * Bu modülün sözleşmesi:
 *  - DEALER  → kendi id'si.
 *  - STAFF   → DB'deki AKTİF `DealerStaff.dealerId` (JWT'deki `dealerId`'ye güvenilmez; işten
 *              çıkarılan/pasif personel 403 alır). Redis sıcak katmanı ≤ 30 sn.
 *  - ADMIN   → yalnız AÇIK `dealerId` parametresiyle (ve hedef gerçekten DEALER ise).
 *  - CUSTOMER / bilinmeyen / oturumsuz → yetkisiz.
 *  - `*ScopeWhere` yardımcıları bilinmeyen rolde İMKÂNSIZ filtre döner (hiç satır eşleşmez).
 */
import type { Session } from 'next-auth';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { redisGetJson, redisSetJson } from '@/lib/redis';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { recordAdminTenantAccess } from '@/lib/auth/admin-tenant-audit';

export type ScopeRole = 'ADMIN' | 'DEALER' | 'STAFF' | 'CUSTOMER';

/** Hiçbir gerçek satırla eşleşmeyen kimlik (cuid biçiminde değil, boş da değil). */
export const IMPOSSIBLE_SCOPE_ID = '__qx_scope_denied__';

export type ScopeErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'STAFF_INACTIVE'
  | 'DEALER_ID_REQUIRED'
  | 'DEALER_NOT_FOUND';

export interface ScopeDenied {
  ok: false;
  status: 400 | 401 | 403 | 404;
  code: ScopeErrorCode;
  message: string;
}

export interface DealerScope {
  ok: true;
  /** Sorgularda kullanılacak bayi kimliği. */
  dealerId: string;
  /** İsteği yapan kullanıcı. */
  actorId: string;
  actorRole: Exclude<ScopeRole, 'CUSTOMER'>;
  /** Kapsamın nasıl elde edildiği: kendisi, personel bağı ya da admin'in açık seçimi. */
  via: 'self' | 'staff' | 'admin';
}

export type DealerScopeResult = DealerScope | ScopeDenied;

export interface ResolveDealerScopeOptions {
  /**
   * ADMIN'in hedeflediği bayi (`?dealerId=` / gövde). ADMIN için ZORUNLU; diğer rollerde
   * verilirse kendi bayileriyle aynı olmalıdır (aksi hâlde 403).
   */
  dealerId?: string | null;
  /** İzinli roller (varsayılan: ADMIN, DEALER, STAFF). Ör. yazma uçları için ['DEALER']. */
  allowRoles?: ReadonlyArray<Exclude<ScopeRole, 'CUSTOMER'>>;
  /** ADMIN hedefinin DB'de DEALER olduğunu doğrula (varsayılan: true). */
  verifyAdminTarget?: boolean;
  /**
   * ADMIN kiracılar arası erişim denetim kaydının bağlamı (uç adı / sayfa) ve HTTP yöntemi
   * (guvenlik-bayi-api O6). Verilmezse bağlam `unknown` yazılır; kayıt her durumda yazılır.
   */
  auditContext?: string;
  auditMethod?: string;
}

const DEFAULT_DEALER_ROLES: ReadonlyArray<Exclude<ScopeRole, 'CUSTOMER'>> = ['ADMIN', 'DEALER', 'STAFF'];
const STAFF_CACHE_TTL_SECONDS = 30;
const MAX_ID_LENGTH = 191;

function deny(status: ScopeDenied['status'], code: ScopeErrorCode, message: string): ScopeDenied {
  return { ok: false, status, code, message };
}

function sessionIdentity(session: Session | null | undefined): { userId: string; role: string } | null {
  const userId = session?.user?.id;
  const role = session?.user?.role as string | undefined;
  if (!userId || typeof userId !== 'string' || !role || typeof role !== 'string') return null;
  return { userId, role };
}

function cleanId(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!s || s.length > MAX_ID_LENGTH || !/^[A-Za-z0-9_-]+$/.test(s)) return null;
  return s;
}

function staffCacheKey(userId: string): string {
  return `scope:staff:${userId}`;
}

/**
 * Personelin AKTİF bağlı olduğu bayi (DB kaynak-doğruluk; Redis ≤ 30 sn sıcak katman).
 * Pasif/silinmiş personelde null.
 */
export async function getActiveStaffDealerId(userId: string): Promise<string | null> {
  const cached = await redisGetJson<{ dealerId: string | null }>(staffCacheKey(userId));
  if (cached && typeof cached.dealerId === 'string' && cached.dealerId) return cached.dealerId;

  const row = await prisma.dealerStaff.findFirst({
    where: { userId, isActive: true },
    select: { dealerId: true },
  });
  const dealerId = row?.dealerId ?? null;
  // Yalnız olumlu sonuç önbelleğe alınır: yeniden etkinleştirilen personel anında erişir.
  if (dealerId) await redisSetJson(staffCacheKey(userId), { dealerId }, STAFF_CACHE_TTL_SECONDS);
  return dealerId;
}

/**
 * Personel pasifleştirildiğinde/silindiğinde/başka bayiye taşındığında ÇAĞIRIN: sıcak katmanı
 * geçersiz kılar (bir sonraki istek DB'den okur).
 */
export async function invalidateStaffScope(userId: string): Promise<void> {
  await redisSetJson(staffCacheKey(userId), { dealerId: null }, STAFF_CACHE_TTL_SECONDS);
}

/**
 * Bayi kapsamını çözer. Bayi verisine dokunan her uç bunu kullanmalı:
 *
 *   const scope = await resolveDealerScope(session, { dealerId: searchParams.get('dealerId') });
 *   if (!scope.ok) return scopeErrorResponse(scope);
 *   prisma.feedback.findMany({ where: { qrCode: { dealerId: scope.dealerId }, deletedAt: null } });
 */
export async function resolveDealerScope(
  session: Session | null | undefined,
  options: ResolveDealerScopeOptions = {}
): Promise<DealerScopeResult> {
  const identity = sessionIdentity(session);
  if (!identity) return deny(401, 'UNAUTHENTICATED', 'Oturum bulunamadı. Lütfen giriş yapın.');
  const { userId, role } = identity;
  const allowRoles = options.allowRoles ?? DEFAULT_DEALER_ROLES;

  if (!(allowRoles as ReadonlyArray<string>).includes(role)) {
    return deny(403, 'FORBIDDEN', 'Bu işlem için yetkiniz yok.');
  }

  const requested = options.dealerId == null || options.dealerId === '' ? null : cleanId(options.dealerId);
  if (options.dealerId != null && options.dealerId !== '' && !requested) {
    return deny(400, 'DEALER_ID_REQUIRED', 'Geçersiz işletme kimliği.');
  }

  if (role === 'DEALER') {
    if (requested && requested !== userId) return deny(403, 'FORBIDDEN', 'Bu işletmenin verisine erişemezsiniz.');
    return { ok: true, dealerId: userId, actorId: userId, actorRole: 'DEALER', via: 'self' };
  }

  if (role === 'STAFF') {
    const dealerId = await getActiveStaffDealerId(userId);
    if (!dealerId) return deny(403, 'STAFF_INACTIVE', 'Personel hesabınız aktif bir işletmeye bağlı değil.');
    if (requested && requested !== dealerId) return deny(403, 'FORBIDDEN', 'Bu işletmenin verisine erişemezsiniz.');
    return { ok: true, dealerId, actorId: userId, actorRole: 'STAFF', via: 'staff' };
  }

  if (role === 'ADMIN') {
    if (!requested) return deny(400, 'DEALER_ID_REQUIRED', 'İşletme seçilmeden bu işlem yapılamaz.');
    if (options.verifyAdminTarget !== false) {
      const target = await prisma.user.findUnique({ where: { id: requested }, select: { role: true } });
      if (!target || target.role !== 'DEALER') return deny(404, 'DEALER_NOT_FOUND', 'İşletme bulunamadı.');
    }
    // O6: kiracılar arası yönetici erişimi denetime yazılır (yönetici × bayi × bağlam, 30 dk'da bir).
    await recordAdminTenantAccess({
      adminId: userId,
      dealerId: requested,
      context: options.auditContext,
      method: options.auditMethod,
    });
    return { ok: true, dealerId: requested, actorId: userId, actorRole: 'ADMIN', via: 'admin' };
  }

  // CUSTOMER ve tanınmayan her rol.
  return deny(403, 'FORBIDDEN', 'Bu işlem için yetkiniz yok.');
}

// ───────────────────────────── AI kapsamı ─────────────────────────────

export type AiScope =
  | (DealerScope & { kind: 'dealer' })
  | { ok: true; kind: 'platform'; dealerId: null; actorId: string; actorRole: 'ADMIN'; via: 'admin' };

export type AiScopeResult = AiScope | ScopeDenied;

export interface ResolveAiScopeOptions extends ResolveDealerScopeOptions {
  /**
   * ADMIN `dealerId` vermediğinde platform geneli (kiracılar üstü) AI işine izin ver.
   * Varsayılan: false — kiracı karışması yaşanmasın diye açıkça istenmeli.
   */
  allowPlatform?: boolean;
}

/**
 * AI çağrıları için kapsam. AI öğrenme profili, analiz yazma ve öneri uçları bu kapsamla
 * sınırlanır; CUSTOMER bu uçları hiç çağıramaz (müşteri sohbeti ayrı, kendi kapsamlı yoldur).
 */
export async function resolveAiScope(
  session: Session | null | undefined,
  options: ResolveAiScopeOptions = {}
): Promise<AiScopeResult> {
  const identity = sessionIdentity(session);
  const noDealerGiven = options.dealerId == null || options.dealerId === '';
  if (identity?.role === 'ADMIN' && noDealerGiven && options.allowPlatform) {
    const allowRoles = options.allowRoles ?? DEFAULT_DEALER_ROLES;
    if (!(allowRoles as ReadonlyArray<string>).includes('ADMIN')) {
      return deny(403, 'FORBIDDEN', 'Bu işlem için yetkiniz yok.');
    }
    return { ok: true, kind: 'platform', dealerId: null, actorId: identity.userId, actorRole: 'ADMIN', via: 'admin' };
  }
  const scope = await resolveDealerScope(session, options);
  if (!scope.ok) return scope;
  return { ...scope, kind: 'dealer' };
}

// ───────────────────────────── Yanıt + Prisma filtreleri ─────────────────────────────

/** Reddedilmiş kapsamı standart JSON yanıtına çevirir (eski istemcilerle uyumlu `error` metni). */
export function scopeErrorResponse(denied: ScopeDenied): NextResponse {
  return NextResponse.json(
    { success: false, ok: false, error: denied.message, code: denied.code, message: denied.message },
    { status: denied.status, headers: PRIVATE_NO_STORE_HEADERS }
  );
}

/**
 * Senkron bayi filtresi (oturumdan; DB'ye gitmez). VARSAYILAN REDDET:
 *  - ADMIN → `{}` (her şey; admin uçları için)
 *  - DEALER → `{ dealerId: kendi id }`
 *  - STAFF / CUSTOMER / bilinmeyen / oturumsuz → imkânsız filtre
 * STAFF'ın bayi verisine erişmesi gerekiyorsa `resolveDealerScope` kullanın (aktiflik DB'den).
 */
export function dealerScopeWhere(session: Session | null | undefined): { dealerId: string } | Record<string, never> {
  const identity = sessionIdentity(session);
  if (!identity) return { dealerId: IMPOSSIBLE_SCOPE_ID };
  if (identity.role === 'ADMIN') return {};
  if (identity.role === 'DEALER') return { dealerId: identity.userId };
  return { dealerId: IMPOSSIBLE_SCOPE_ID };
}

/**
 * Senkron müşteri filtresi. VARSAYILAN REDDET:
 *  - ADMIN → `{}`; CUSTOMER → `{ userId: kendi id }`; diğer her şey → imkânsız filtre.
 */
export function userScopeWhere(session: Session | null | undefined): { userId: string } | Record<string, never> {
  const identity = sessionIdentity(session);
  if (!identity) return { userId: IMPOSSIBLE_SCOPE_ID };
  if (identity.role === 'ADMIN') return {};
  if (identity.role === 'CUSTOMER') return { userId: identity.userId };
  return { userId: IMPOSSIBLE_SCOPE_ID };
}

/** Çözülmüş bayi kapsamından Prisma filtresi (`{ dealerId }`). */
export function whereForDealerScope(scope: DealerScope): { dealerId: string } {
  return { dealerId: scope.dealerId };
}
