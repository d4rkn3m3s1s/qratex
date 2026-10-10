/**
 * Admin gizli kapı — PROXY tarafı yardımcıları (edge/Node uyumlu; Node `crypto` YOK).
 *
 * Asıl imza doğrulaması `lib/admin-elevation.ts` içinde (Web Crypto, izomorfik); proxy ve
 * API aynı fonksiyonu kullanır. ESKİ `gateCookieBelongsTo` (yalnız biçim + userId kontrolü)
 * KALDIRILDI: imzayı doğrulamadığı için `admin_gate=<id>.<64 hex>` yazan herkes kapıyı
 * geçiyordu (P0-01).
 */
import {
  ADMIN_GATE_COOKIE,
  ADMIN_GATE_CFGVER_REDIS_KEY,
  verifyElevation,
  type ElevationCheck,
} from '@/lib/admin-elevation';
import { redisGetJson } from '@/lib/redis';

export {
  ADMIN_GATE_COOKIE,
  ADMIN_GATE_CFGVER_REDIS_KEY,
  verifyElevation,
  type ElevationCheck,
};
export { ELEVATION_TTL_SECONDS, parseElevation, type ElevationFailure } from '@/lib/admin-elevation';

/**
 * Kapıdan MUAF API yolları: kapı ucunun kendisi (soru/cevap) ve ekip modülü (müşteri/bayi
 * ekip üyeleri de kullanır; tasarım gereği). Diğer bütün `/api/admin/*` yolları ADMIN
 * oturumunda geçerli kapı çerezi ister.
 */
export function isGateExemptApiPath(pathname: string): boolean {
  const p = pathname.replace(/\/+$/, '');
  return p === '/api/admin/gate' || p === '/api/admin/team' || p.startsWith('/api/admin/team/');
}

/** Kapı uygulanacak sayfa yolu mu? (`/admin` ve altı; `/admin-gate` soru ekranı hariç.) */
export function isGatedAdminPage(pathname: string): boolean {
  if (pathname === '/admin-gate' || pathname.startsWith('/admin-gate/')) return false;
  return pathname === '/admin' || pathname.startsWith('/admin/');
}

/** Redis'te yayınlanmış güncel kapı sürümü; yoksa/erişilemezse `undefined` (API zaten yetkili). */
export async function readPublishedGateCfgVer(): Promise<number | undefined> {
  const hot = await redisGetJson<{ cfgVer?: unknown }>(ADMIN_GATE_CFGVER_REDIS_KEY);
  return hot && typeof hot.cfgVer === 'number' && Number.isSafeInteger(hot.cfgVer) ? hot.cfgVer : undefined;
}

/**
 * Proxy kontrolü: çerez bu kullanıcıya + bu oturuma ait, imzası geçerli, süresi dolmamış ve
 * (Redis'te yayınlanmışsa) güncel sürümde mi? `cfgVer` verilmezse Redis'ten okunur.
 */
export async function checkGateCookieForToken(
  cookieValue: string | undefined,
  token: { id?: unknown; sub?: unknown; jti?: unknown } | null | undefined,
  cfgVer?: number
): Promise<ElevationCheck> {
  const userId = String(token?.id || token?.sub || '');
  const jti = typeof token?.jti === 'string' ? token.jti : null;
  const ver = cfgVer ?? (await readPublishedGateCfgVer());
  return verifyElevation(cookieValue, { userId, jti, cfgVer: ver });
}

// ───────────────────────────── Permissions-Policy ─────────────────────────────

/** Kamera açan tarama sayfaları (P0-36): kasa taraması ve müşteri QR taraması. */
export const CAMERA_ROUTES: ReadonlyArray<string> = ['/dealer/scan', '/customer/scan'];

export function isCameraRoute(pathname: string): boolean {
  return CAMERA_ROUTES.some((r) => pathname === r || pathname.startsWith(`${r}/`));
}

/**
 * Belge (sayfa) yanıtlarının Permissions-Policy'si. `config/security-headers.js`
 * `PERMISSIONS_POLICY` ile BİREBİR aynı olmalı (test eşitliği doğrular).
 *
 * Neden tarama sayfalarına özel değil? Permissions-Policy BELGEYE bağlıdır; /dealer'dan
 * /dealer/scan'a geçiş yumuşak (client-side) navigasyondur ve belge değişmez. Proxy panel
 * sayfalarına `camera=()` yazsaydı, panelden açılan tarama ekranında kamera yine engellenirdi
 * (P0-36'nın kök nedeni). Kamera yalnız KENDİ origin'imize (`self`) açılır; üçüncü taraf
 * iframe'ler engelli kalır ve tarayıcı izin istemi kullanıcıyı korur.
 */
export const DOCUMENT_PERMISSIONS_POLICY = 'camera=(self), microphone=(), geolocation=(self), payment=(), usb=()';
/** API (JSON) yanıtları belge açmaz → bütün güçlü özellikler kapalı. */
export const API_PERMISSIONS_POLICY = 'camera=(), microphone=(), geolocation=(), payment=(), usb=()';

/** Yola göre Permissions-Policy: tarama sayfaları dahil bütün belgelerde `camera=(self)`, API'de kapalı. */
export function permissionsPolicyFor(pathname: string): string {
  return pathname === '/api' || pathname.startsWith('/api/') ? API_PERMISSIONS_POLICY : DOCUMENT_PERMISSIONS_POLICY;
}
