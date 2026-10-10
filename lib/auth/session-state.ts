/**
 * OTURUM DURUMU — yetki kararını TOKEN'daki rolden değil DB'den verir (P0-07).
 *
 * Eski sorun: JWT içindeki rol yalnız girişte yazılıyordu; şifre sıfırlama, rol değişikliği,
 * askıya alma, anonimleştirme ya da personelin pasife alınması mevcut oturumları
 * düşürmüyordu. Çalınan oturum süresiz yaşıyor, işten çıkarılan personel ekip verisini
 * okumaya devam ediyordu.
 *
 * Model:
 *   - `User.sessionVersion` ↔ JWT `sv` claim'i. Eşleşmezse oturum İPTAL (401).
 *     JWT'de `sv` yoksa 0 sayılır (geçiş dönemi; bütün satırlar 0 ile başlar).
 *   - `suspendedAt` doluysa 403, `anonymizedAt` doluysa / kullanıcı silinmişse 401.
 *   - Rol ve personel bağı (`DealerStaff.dealerId` + `isActive`) DB'den okunur.
 *
 * PERFORMANS — token-replay ile aynı desen: Redis SICAK KATMAN (60 sn), DB KAYNAK-DOĞRULUK.
 * Redis yoksa/boşsa DB'ye düşülür (tek `findUnique`, birincil anahtar). Değişiklik yapan
 * kod `invalidateSessionState` çağırarak sıcak kaydı anında bayatlatabilir; aksi hâlde en geç
 * 60 sn içinde yeni durum devreye girer.
 *
 * `sessionVersion` ARTIRMA tek yerden: `lib/auth/session-version.ts#bumpSessionVersion`.
 * Token `sv` ile önbellekteki sürüm uyuşmazsa `requireAuth` DB'den TAZE okuyup yeniden karar
 * verir — böylece `reissueSessionCookie` ile yeni `sv` alan tarayıcı 60 sn boyunca bayat
 * önbellek yüzünden düşmez; eski token ise DB'deki güncel sürümle reddedilir.
 */
import { prisma } from '@/lib/prisma';
import { redisGetJson, redisSetJson } from '@/lib/redis';
import { readTokenSessionVersion } from '@/lib/auth/session-version';

export const SESSION_STATE_TTL_SECONDS = 60;
const STALE_MARKER_TTL_SECONDS = 120;

export type KnownRole = 'ADMIN' | 'DEALER' | 'CUSTOMER' | 'STAFF';
const KNOWN_ROLES: ReadonlySet<string> = new Set<KnownRole>(['ADMIN', 'DEALER', 'CUSTOMER', 'STAFF']);

export interface SessionState {
  exists: boolean;
  role: string | null;
  sessionVersion: number;
  suspended: boolean;
  anonymized: boolean;
  /** Kullanıcının personel bağı (yoksa null). */
  staff: { dealerId: string; isActive: boolean } | null;
}

type HotEntry = { s: SessionState } | { stale: true };

function keyFor(userId: string): string {
  return `ss:v1:${userId}`;
}

const MISSING_STATE: SessionState = {
  exists: false,
  role: null,
  sessionVersion: 0,
  suspended: false,
  anonymized: false,
  staff: null,
};

/** DB'den taze durum okur (Redis'e bakmaz). DB hatası FIRLATILIR (çağıran fail-closed). */
export async function readSessionStateFromDb(userId: string): Promise<SessionState> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      sessionVersion: true,
      suspendedAt: true,
      anonymizedAt: true,
      staffProfile: { select: { dealerId: true, isActive: true } },
    },
  });
  if (!user) return { ...MISSING_STATE };
  return {
    exists: true,
    role: String(user.role),
    sessionVersion: typeof user.sessionVersion === 'number' ? user.sessionVersion : 0,
    suspended: !!user.suspendedAt,
    anonymized: !!user.anonymizedAt,
    staff: user.staffProfile
      ? { dealerId: user.staffProfile.dealerId, isActive: user.staffProfile.isActive !== false }
      : null,
  };
}

function isHotState(v: unknown): v is { s: SessionState } {
  if (!v || typeof v !== 'object') return false;
  const s = (v as { s?: unknown }).s;
  return !!s && typeof s === 'object' && typeof (s as SessionState).sessionVersion === 'number';
}

/**
 * Oturum durumunu getirir: Redis (≤ 60 sn) → yoksa DB → Redis'i doldur.
 * DB hatası fırlatılır; `requireAuth` bunu 503 olarak döndürür (yetki kararı tahminle verilmez).
 */
export async function loadSessionState(
  userId: string,
  options: { bypassCache?: boolean } = {}
): Promise<SessionState> {
  const key = keyFor(userId);
  if (!options.bypassCache) {
    const hot = await redisGetJson<HotEntry>(key);
    if (isHotState(hot)) return hot.s;
  }
  const fresh = await readSessionStateFromDb(userId);
  await redisSetJson(key, { s: fresh }, SESSION_STATE_TTL_SECONDS);
  return fresh;
}

/**
 * Sıcak kaydı bayatlatır → sonraki istek DB'den okur. Değişiklik yapan işlem (rol, askı,
 * personel pasifleştirme, anonimleştirme…) COMMIT'ten SONRA çağırmalıdır.
 */
export async function invalidateSessionState(userId: string): Promise<void> {
  await redisSetJson(keyFor(userId), { stale: true }, STALE_MARKER_TTL_SECONDS);
}

// ───────────────────────────── Karar ─────────────────────────────

export type SessionDenyCode = 'SESSION_REVOKED' | 'ACCOUNT_SUSPENDED' | 'ACCOUNT_CLOSED' | 'FORBIDDEN';

export type SessionVerdict =
  | {
      ok: true;
      /** Yetki kararında kullanılacak GÜNCEL rol (DB). */
      role: KnownRole;
      /** STAFF için DB'deki AKTİF işveren; pasif/bağsızsa null. */
      dealerId: string | null;
      /** STAFF için personel kaydı aktif mi (STAFF değilse null). */
      staffActive: boolean | null;
    }
  | { ok: false; status: 401 | 403; code: SessionDenyCode; message: string };

export const SESSION_DENY_MESSAGES: Readonly<Record<SessionDenyCode, string>> = {
  SESSION_REVOKED: 'Oturumunuz sonlandırıldı. Lütfen yeniden giriş yapın.',
  ACCOUNT_CLOSED: 'Bu hesap artık kullanılamıyor. Lütfen yeniden giriş yapın.',
  ACCOUNT_SUSPENDED: 'Hesabınız askıya alındı. Destek ekibiyle iletişime geçin.',
  FORBIDDEN: 'Bu işlem için yetkiniz yok.',
};

function deny(status: 401 | 403, code: SessionDenyCode): SessionVerdict {
  return { ok: false, status, code, message: SESSION_DENY_MESSAGES[code] };
}

/** Saf karar fonksiyonu (test edilebilir): DB durumu + token `sv` → izin/ret. */
export function evaluateSessionState(state: SessionState, tokenSv: unknown): SessionVerdict {
  if (!state.exists || state.anonymized) return deny(401, state.exists ? 'ACCOUNT_CLOSED' : 'SESSION_REVOKED');
  if (readTokenSessionVersion({ sv: tokenSv }) !== state.sessionVersion) return deny(401, 'SESSION_REVOKED');
  if (state.suspended) return deny(403, 'ACCOUNT_SUSPENDED');
  if (!state.role || !KNOWN_ROLES.has(state.role)) return deny(403, 'FORBIDDEN');
  const role = state.role as KnownRole;
  if (role === 'STAFF') {
    const active = !!state.staff && state.staff.isActive;
    return { ok: true, role, dealerId: active ? state.staff!.dealerId : null, staffActive: active };
  }
  return { ok: true, role, dealerId: null, staffActive: null };
}
