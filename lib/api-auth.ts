/**
 * Server-side auth helpers for API routes.
 * All routes under /api/admin, /api/dealer, /api/customer MUST use requireAuth(allowedRoles)
 * and enforce resource ownership (requireDealerResource / requireUserResource) where applicable.
 */
import { getServerSession } from 'next-auth';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { checkTokenReplay, type TokenReplayResult } from '@/lib/token-replay';
import { loadSessionState, evaluateSessionState, type SessionState } from '@/lib/auth/session-state';
import { checkAdminElevation } from '@/lib/admin-gate';
import { getClientIp, getUserAgent } from '@/lib/request-metadata';
import type { Session } from 'next-auth';

export type AllowedRole = 'ADMIN' | 'DEALER' | 'CUSTOMER' | 'STAFF';

/**
 * Oturumlu HER rol (hesap uçları: şifre, profil, veri dışa aktarma …). `requireAuth()`'ı rol
 * listesiz çağırmak yerine bunu verin: niyet açık olur ve yapı testi (route-auth-guard) rol
 * listesiz çağrıyı yakalar.
 */
export const ANY_SIGNED_IN_ROLE: AllowedRole[] = ['ADMIN', 'DEALER', 'STAFF', 'CUSTOMER'];

const UNAUTHENTICATED_MESSAGE = 'Oturumunuz bulunamadı. Lütfen giriş yapın.';
const FORBIDDEN_MESSAGE = 'Bu işlem için yetkiniz yok.';

/**
 * Get session or return 401. Use in API routes for server-side auth.
 */
export async function getSessionOr401(): Promise<Session | NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json(
      { success: false, error: UNAUTHENTICATED_MESSAGE, code: 'UNAUTHENTICATED' },
      { status: 401, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
  return session;
}

/**
 * Enforce role(s). Call after getSessionOr401. Returns 403 response if role not allowed.
 */
export function requireRole(
  session: Session,
  allowedRoles: AllowedRole[]
): NextResponse | null {
  const role = session.user?.role as string | undefined;
  if (!role || !allowedRoles.includes(role as AllowedRole)) {
    return NextResponse.json(
      { success: false, error: FORBIDDEN_MESSAGE, code: 'FORBIDDEN' },
      { status: 403, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
  return null;
}

export interface RequireAuthOptions {
  /**
   * ADMIN için gizli kapı (elevation) doğrulaması — varsayılan AÇIK (P0-01).
   * Yalnız kapı ucunun kendisi (`/api/admin/gate`) ve ekip modülü (`requireTeamAccess`)
   * `false` geçer. Başka bir yerde kapatmak, kapıyı API'de yeniden süse çevirir.
   */
  adminGate?: boolean;
}

export const ADMIN_GATE_REQUIRED_CODE = 'ADMIN_GATE_REQUIRED';
export const STAFF_INACTIVE_CODE = 'STAFF_INACTIVE';

function authError(status: number, error: string, code: string): NextResponse {
  return NextResponse.json({ success: false, error, code }, { status, headers: PRIVATE_NO_STORE_HEADERS });
}

/**
 * Require session and role in one call. Returns { session } or { error: NextResponse }.
 *
 * Sıra (hepsi sunucuda, varsayılan reddet):
 *  1. Oturum (JWT) yoksa 401.
 *  2. DB oturum durumu (P0-07) + token replay paralel: `sessionVersion` ↔ JWT `sv`,
 *     askı, anonimleştirme/silinme, GÜNCEL rol ve personel bağı (Redis 60 sn sıcak katman,
 *     DB kaynak-doğruluk). DB'ye ulaşılamazsa 503 — yetki tahminle verilmez.
 *     `session.user.role` / `dealerId` DB'deki değerle EZİLİR; sonraki bütün kontroller
 *     (requireRole, getStaffDealerId, kapsam yardımcıları) güncel veriyle çalışır.
 *  3. Token replay: aynı JWT farklı IP/UA ile kullanılırsa 403 + alarm.
 *  4. Rol kontrolü (DB rolüyle).
 *  5. Pasif personel: STAFF'a açık iş uçlarında (`STAFF` var, `CUSTOMER` yok) 403.
 *  6. ADMIN gizli kapı: imzalı + süreli + güncel sürümlü kapı çerezi ZORUNLU (P0-01).
 */
export async function requireAuth(
  allowedRoles?: AllowedRole[],
  options: RequireAuthOptions = {}
): Promise<
  | { session: Session }
  | { error: NextResponse }
> {
  const session = await getSessionOr401();
  if (session instanceof NextResponse) return { error: session };
  const userId = session.user.id;
  const jti = (session as { jti?: string }).jti;

  let state: SessionState;
  let replay: TokenReplayResult = { ok: true };
  try {
    const replayPromise: Promise<TokenReplayResult> = jti
      ? headers().then((headersList) =>
          checkTokenReplay(
            jti,
            getClientIp({ headers: headersList }) || 'unknown',
            getUserAgent({ headers: headersList }) || ''
          )
        )
      : Promise.resolve({ ok: true });
    [state, replay] = await Promise.all([loadSessionState(userId), replayPromise]);
  } catch {
    return {
      error: authError(503, 'Oturum şu anda doğrulanamıyor. Lütfen birazdan tekrar deneyin.', 'SERVICE_UNAVAILABLE'),
    };
  }

  if (!replay.ok) {
    return {
      error: NextResponse.json(
        { success: false, error: 'Oturum güvenlik ihlali tespit edildi. Lütfen tekrar giriş yapın.', code: 'SESSION_REPLAY' },
        { status: 403, headers: PRIVATE_NO_STORE_HEADERS }
      ),
    };
  }

  const tokenSv = (session as { sv?: unknown }).sv;
  let verdict = evaluateSessionState(state, tokenSv);
  if (!verdict.ok && verdict.code === 'SESSION_REVOKED') {
    // Önbellek bayat olabilir (ör. 2FA değişince bu tarayıcıya yeni `sv`'li çerez verildi):
    // kararı DB'den TAZE okuyarak yeniden ver. Eski token ise güncel sürümle yine reddedilir.
    try {
      verdict = evaluateSessionState(await loadSessionState(userId, { bypassCache: true }), tokenSv);
    } catch {
      return {
        error: authError(503, 'Oturum şu anda doğrulanamıyor. Lütfen birazdan tekrar deneyin.', 'SERVICE_UNAVAILABLE'),
      };
    }
  }
  if (!verdict.ok) return { error: authError(verdict.status, verdict.message, verdict.code) };

  // Yetki kararı DB'deki GÜNCEL rol ve personel bağıyla verilir (token bayat olabilir).
  session.user.role = verdict.role;
  const mutableUser = session.user as { dealerId?: string; staffActive?: boolean | null };
  if (verdict.role === 'STAFF' && verdict.dealerId) mutableUser.dealerId = verdict.dealerId;
  else delete mutableUser.dealerId;
  mutableUser.staffActive = verdict.staffActive;

  if (allowedRoles?.length) {
    const forbidden = requireRole(session, allowedRoles);
    if (forbidden) return { error: forbidden };
    if (
      verdict.role === 'STAFF' &&
      verdict.staffActive === false &&
      allowedRoles.includes('STAFF') &&
      !allowedRoles.includes('CUSTOMER')
    ) {
      return {
        error: authError(403, 'Personel hesabınız pasif durumda. İşletme yöneticinizle iletişime geçin.', STAFF_INACTIVE_CODE),
      };
    }
  }

  if (verdict.role === 'ADMIN' && options.adminGate !== false) {
    const elevation = await checkAdminElevation(userId, jti);
    if (!elevation.ok) {
      if (elevation.reason === 'unavailable') {
        return {
          error: authError(
            503,
            'Yönetici kapısı şu anda doğrulanamıyor. Lütfen birazdan tekrar deneyin.',
            'SERVICE_UNAVAILABLE'
          ),
        };
      }
      return {
        error: authError(403, 'Bu işlem için önce yönetici kapısından geçmelisiniz.', ADMIN_GATE_REQUIRED_CODE),
      };
    }
  }

  return { session };
}

/**
 * Kimliği İSTEĞE BAĞLI uçlar için (public sayfa, oturumluysa kişiselleştirir): geçerli oturum
 * ya da `null`. Asla 401/403 dönmez — ama çıplak `getServerSession` gibi de DEĞİL:
 * `requireAuth`'un bütün denetimleri (askı/silinme, `sessionVersion`, güncel DB rolü, token
 * replay, ADMIN gizli kapısı) uygulanır; geçmeyen oturum ANONİM sayılır (varsayılan reddet).
 * DB'ye ulaşılamazsa da anonim döner (public akış çalışmaya devam eder).
 *
 * `app/api/**` altında `next-auth`'tan `getServerSession` içe aktarmak yasaktır
 * (eslint + __tests__/api/route-auth-guard.test.ts); onun yerine bu ya da `requireAuth`.
 */
export async function getOptionalSession(): Promise<Session | null> {
  try {
    const auth = await requireAuth(ANY_SIGNED_IN_ROLE);
    return 'error' in auth ? null : auth.session;
  } catch {
    return null;
  }
}

/**
 * Dealer resource check: only ADMIN or the owning dealer can access.
 */
export function requireDealerResource(
  session: Session,
  resourceDealerId: string
): NextResponse | null {
  const role = session.user?.role as string | undefined;
  const userId = session.user?.id;
  if (!userId)
    return NextResponse.json(
      { success: false, error: FORBIDDEN_MESSAGE, code: 'FORBIDDEN' },
      { status: 403, headers: PRIVATE_NO_STORE_HEADERS }
    );
  if (role === 'ADMIN') return null;
  if (role === 'DEALER' && resourceDealerId === userId) return null;
  return NextResponse.json(
    { success: false, error: FORBIDDEN_MESSAGE, code: 'FORBIDDEN' },
    { status: 403, headers: PRIVATE_NO_STORE_HEADERS }
  );
}

/**
 * User resource check: only ADMIN or the owning user can access.
 */
export function requireUserResource(
  session: Session,
  resourceUserId: string
): NextResponse | null {
  const role = session.user?.role as string | undefined;
  const userId = session.user?.id;
  if (!userId)
    return NextResponse.json(
      { success: false, error: FORBIDDEN_MESSAGE, code: 'FORBIDDEN' },
      { status: 403, headers: PRIVATE_NO_STORE_HEADERS }
    );
  if (role === 'ADMIN') return null;
  if (resourceUserId === userId) return null;
  return NextResponse.json(
    { success: false, error: FORBIDDEN_MESSAGE, code: 'FORBIDDEN' },
    { status: 403, headers: PRIVATE_NO_STORE_HEADERS }
  );
}

/**
 * Senkron kapsam filtreleri (P0-05, VARSAYILAN REDDET). Tek kaynak `lib/auth/scope`;
 * eski içe aktarımlar kırılmasın diye buradan yeniden dışa aktarılır.
 *  - ADMIN → `{}`; DEALER → `{ dealerId }` / CUSTOMER → `{ userId }`
 *  - STAFF / bilinmeyen rol / kimliksiz oturum → hiçbir satırla eşleşmeyen filtre
 * Personel kapsamı için `resolveDealerScope` (aktiflik DB'den).
 */
export { dealerScopeWhere, userScopeWhere } from '@/lib/auth/scope';

/**
 * Staff: get dealerId from session. STAFF must have dealerId (employer).
 * Returns dealerId or 403 response.
 */
export function getStaffDealerId(session: Session): string | NextResponse {
  const role = session.user?.role as string | undefined;
  const dealerId = (session.user as { dealerId?: string }).dealerId;
  if (role !== 'STAFF' || !dealerId) {
    return NextResponse.json(
      { success: false, error: role === 'STAFF' ? 'Personel bu işletmeye bağlı değil' : FORBIDDEN_MESSAGE, code: 'FORBIDDEN' },
      { status: 403, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
  return dealerId;
}
