/**
 * Token replay tespiti: aynı JWT `jti` BAŞKA BİR TARAYICIDAN kullanılırsa alarm + iptal.
 * `requireAuth` her kimlikli istekte çağırır.
 *
 * PERFORMANS TASARIMI — Redis SICAK KATMAN, DB KAYNAK-DOĞRULUK:
 *   • Redis'te kayıt VARSA  → hash karşılaştır, DB'ye HİÇ gitme (yaygın durum).
 *   • Redis'te YOKSA        → DB yoluna düş (yetkili kayıt orada), sonra Redis'i doldur.
 * Redis boşalsa/kapalı olsa bile tespit aynen çalışır — yalnız hızlanır.
 * `lastSeen` yazımı kısılmıştır (TOUCH_INTERVAL_MS'te bir; cleanup cron'u 30 gün eskiyi siler).
 *
 * BAĞLAMA KURALI (guvenlik-admin-api B8):
 *  - Tarayıcı kimliği = User-Agent'ın SÜRÜMSÜZ biçimi (rakamlar atılır). Tarayıcı güncellemesi
 *    (Chrome 129 → 130) oturumu düşürmez; başka tarayıcı/işletim sistemi ise ALARM.
 *  - IP değişimi tek başına alarm DEĞİL ("dolaşım"): mobilde Wi-Fi ↔ hücresel, kurumsal NAT ve
 *    IPv6 gizlilik adresleri meşru kullanıcıyı eskiden kalıcı 403'e kilitliyordu (aynı jti
 *    yaşadıkça her istek "Session güvenlik ihlali"). Dolaşımda bağ yeni IP'ye taşınır; ancak
 *    24 saatte ROAM_MAX'tan fazla IP değişimi (çalınan çerezin iki ağdan dönüşümlü kullanımı)
 *    ALARM'dır.
 *  - Alarm = token GERÇEKTEN İPTAL: kayıt `revoked` işaretlenir; o jti ile gelen SONRAKİ HER
 *    istek (saldırgan da meşru sahip de) reddedilir, kullanıcı yeniden giriş yapar (yeni jti).
 *    Eskiden yalnız o istek reddediliyor, token yaşamaya devam ediyordu.
 */
import { prisma } from '@/lib/prisma';
import { captureApiMessage } from '@/lib/capture-api-error';
import { checkRateLimitDb } from '@/lib/rate-limit';
import { createHash } from 'crypto';
import { redisGetJson, redisSetJson } from '@/lib/redis';

function hash(s: string): string {
  return createHash('sha256').update(s || '').digest('hex').slice(0, 16);
}

/** User-Agent'ı sürümden arındırır: "Chrome/129.0.6668.89" → "chrome/". Tarayıcı + OS ailesi kalır. */
export function normalizeUserAgent(userAgent: string): string {
  return (userAgent || '')
    .toLowerCase()
    .replace(/\d+(?:[._]\d+)*/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 512);
}

export type TokenReplayResult =
  | { ok: true }
  | { ok: false; alarm: true; message: string };

/** Redis'te tutulan sıcak kayıt. */
type HotEntry = { ipHash: string; uaHash: string; dbTouchedAt: number };

/** İptal edilmiş jti işareti (hash alanlarına yazılır; gerçek hash 16 hex olduğundan çakışmaz). */
export const REVOKED_MARK = 'revoked';
/** Oturum ömrüyle uyumlu TTL (varsayılan 24sa) — token expire olunca kayıt da düşer. */
const HOT_TTL_SECONDS = 25 * 60 * 60;
/** `lastSeen` DB yazımı en fazla bu aralıkla yapılır (her istekte değil). */
const TOUCH_INTERVAL_MS = 6 * 60 * 60 * 1000;
/** Bir jti için 24 saatte izin verilen en fazla IP değişimi (dolaşım). */
export const ROAM_MAX = 20;
const ROAM_WINDOW_MS = 24 * 60 * 60 * 1000;

function keyFor(jti: string): string {
  return `trp:${jti}`;
}

type Verdict = 'same' | 'roam' | 'ua_mismatch' | 'revoked';

function classify(
  stored: { ipHash: string; uaHash: string },
  ipHash: string,
  uaHash: string,
  legacyUaHash: string
): Verdict {
  if (stored.ipHash === REVOKED_MARK || stored.uaHash === REVOKED_MARK) return 'revoked';
  // Geçiş: eski kayıtlar ham UA'nın özetini tutar → o da kabul edilir, kayıt yeni biçime yükseltilir.
  if (stored.uaHash !== uaHash && stored.uaHash !== legacyUaHash) return 'ua_mismatch';
  return stored.ipHash === ipHash ? 'same' : 'roam';
}

function alarm(jti: string, reason: string): TokenReplayResult {
  const msg = `Token replay: jti=${jti.slice(0, 8)}... ${reason}`;
  captureApiMessage(msg, 'warning');
  return { ok: false, alarm: true, message: msg };
}

/** jti'yi kalıcı olarak iptal eder (DB + Redis). Hata yutulur; çağıran zaten reddeder. */
async function revoke(jti: string): Promise<void> {
  await prisma.sessionTokenUsage
    .update({ where: { jti }, data: { ipHash: REVOKED_MARK, userAgentHash: REVOKED_MARK, lastSeen: new Date() } })
    .catch(() => {});
  await redisSetJson(keyFor(jti), { ipHash: REVOKED_MARK, uaHash: REVOKED_MARK, dbTouchedAt: Date.now() }, HOT_TTL_SECONDS);
}

/** Dolaşım bütçesi: false → bu jti 24 saatte çok fazla IP değiştirdi. Sayaç çökerse izin verilir. */
async function roamAllowed(jti: string): Promise<boolean> {
  try {
    const r = await checkRateLimitDb(`trp_roam:${jti}`, ROAM_MAX, ROAM_WINDOW_MS);
    return r.ok;
  } catch {
    return true;
  }
}

/**
 * Check token replay: jti + ip + userAgent ile kayıt karşılaştır.
 * İlk kullanım: kaydet. Aynı tarayıcıdan farklı IP: dolaşım (bütçeli). Farklı tarayıcı: alarm + iptal.
 */
export async function checkTokenReplay(
  jti: string | undefined,
  ip: string,
  userAgent: string
): Promise<TokenReplayResult> {
  if (!jti) return { ok: true };
  const ipHash = hash(ip);
  const uaHash = hash(normalizeUserAgent(userAgent));
  const legacyUaHash = hash(userAgent);
  const key = keyFor(jti);
  const now = Date.now();

  const handle = async (
    stored: { ipHash: string; uaHash: string },
    touchedAt: number | null
  ): Promise<TokenReplayResult> => {
    const verdict = classify(stored, ipHash, uaHash, legacyUaHash);
    if (verdict === 'revoked') return alarm(jti, 'iptal edilmiş oturum yeniden kullanıldı');
    if (verdict === 'ua_mismatch') {
      await revoke(jti);
      return alarm(jti, 'farklı tarayıcıdan kullanıldı; oturum iptal edildi');
    }
    if (verdict === 'roam' && !(await roamAllowed(jti))) {
      await revoke(jti);
      return alarm(jti, `24 saatte ${ROAM_MAX}+ ağ değişimi; oturum iptal edildi`);
    }
    const rebind = verdict === 'roam' || stored.uaHash !== uaHash;
    const needsTouch = touchedAt === null || now - touchedAt > TOUCH_INTERVAL_MS;
    if (rebind || needsTouch) {
      // Bağ yeni IP'ye / yeni UA biçimine taşınır; lastSeen aynı yazımda tazelenir.
      // Hata yutulur — güvenlik kararı verildi, kayıt bir sonraki istekte tekrar denenir.
      await prisma.sessionTokenUsage
        .update({
          where: { jti },
          data: rebind ? { ipHash, userAgentHash: uaHash, lastSeen: new Date() } : { lastSeen: new Date() },
        })
        .catch(() => {});
    }
    await redisSetJson(key, { ipHash, uaHash, dbTouchedAt: rebind || needsTouch ? now : touchedAt ?? now }, HOT_TTL_SECONDS);
    return { ok: true };
  };

  // ── HIZLI YOL: Redis'te kayıt varsa DB'ye hiç gitme ──────────────────
  const hot = await redisGetJson<HotEntry>(key); // Redis yoksa null → DB yoluna düşer
  if (hot) return handle({ ipHash: hot.ipHash, uaHash: hot.uaHash }, hot.dbTouchedAt ?? 0);

  // ── YETKİLİ YOL: Redis boş/kapalı → DB ──
  const existing = await prisma.sessionTokenUsage.findUnique({ where: { jti } });
  if (!existing) {
    await prisma.sessionTokenUsage.upsert({
      where: { jti },
      create: { jti, ipHash, userAgentHash: uaHash },
      update: { ipHash, userAgentHash: uaHash, lastSeen: new Date() },
    });
    await redisSetJson(key, { ipHash, uaHash, dbTouchedAt: now }, HOT_TTL_SECONDS);
    return { ok: true };
  }
  // DB yolunda lastSeen her zaman tazelenir (touchedAt = null).
  return handle({ ipHash: existing.ipHash, uaHash: existing.userAgentHash }, null);
}
