/**
 * Token replay detection: aynı JWT jti farklı IP/UA ile kullanılırsa alarm.
 * API-auth getSession sonrası çağrılır (her kimlikli istekte).
 *
 * PERFORMANS TASARIMI — Redis SICAK KATMAN, DB KAYNAK-DOĞRULUK:
 * Eskiden her istek 2 DB gidiş-dönüşü yapıyordu (findUnique + lastSeen UPDATE).
 * Tek bir panel açılışı ~15 API çağırdığı için bu ~30 gereksiz sorgu demekti.
 * Yeni akış:
 *   • Redis'te kayıt VARSA  → hash karşılaştır, DB'ye HİÇ gitme (yaygın durum).
 *   • Redis'te YOKSA        → eski DB yoluna düş (yetkili kayıt orada), sonra Redis'i doldur.
 * Böylece Redis boşalsa/kapalı olsa bile replay tespiti aynen çalışır — yalnız hızlanır.
 *
 * `lastSeen` yazımı KISILDI: cleanup cron'u 30 günden eski kayıtları sildiği için
 * alan hâlâ güncel tutulmalı, ama her istekte değil — en fazla TOUCH_INTERVAL_MS'te bir.
 */
import { prisma } from '@/lib/prisma';
import * as Sentry from '@sentry/nextjs';
import { createHash } from 'crypto';
import { redisGetJson, redisSetJson } from '@/lib/redis';

function hash(s: string): string {
  return createHash('sha256').update(s || '').digest('hex').slice(0, 16);
}

export type TokenReplayResult =
  | { ok: true }
  | { ok: false; alarm: true; message: string };

/** Redis'te tutulan sıcak kayıt. */
type HotEntry = { ipHash: string; uaHash: string; dbTouchedAt: number };

/** Oturum ömrüyle uyumlu TTL (varsayılan 24sa) — token expire olunca kayıt da düşer. */
const HOT_TTL_SECONDS = 25 * 60 * 60;
/** `lastSeen` DB yazımı en fazla bu aralıkla yapılır (her istekte değil). */
const TOUCH_INTERVAL_MS = 6 * 60 * 60 * 1000;

function keyFor(jti: string): string {
  return `trp:${jti}`;
}

function mismatchAlarm(jti: string): TokenReplayResult {
  const msg = `Token replay: jti=${jti.slice(0, 8)}... farklı IP/UA ile kullanıldı`;
  Sentry.captureMessage(msg, 'warning');
  return { ok: false, alarm: true, message: msg };
}

/**
 * Check token replay: jti + ip + userAgent ile kayıt karşılaştır.
 * İlk kullanım: kaydet. Sonraki farklı IP/UA: alarm.
 */
export async function checkTokenReplay(
  jti: string | undefined,
  ip: string,
  userAgent: string
): Promise<TokenReplayResult> {
  if (!jti) return { ok: true };
  const ipHash = hash(ip);
  const uaHash = hash(userAgent);
  const key = keyFor(jti);

  // ── HIZLI YOL: Redis'te kayıt varsa DB'ye hiç gitme ──────────────────
  const hot = await redisGetJson<HotEntry>(key); // Redis yoksa null → DB yoluna düşer
  if (hot) {
    if (hot.ipHash !== ipHash || hot.uaHash !== uaHash) return mismatchAlarm(jti);

    const now = Date.now();
    const needsTouch = now - (hot.dbTouchedAt ?? 0) > TOUCH_INTERVAL_MS;
    if (needsTouch) {
      // Kısılmış DB dokunuşu: cleanup cron'u lastSeen'e baktığı için aktif token
      // yanlışlıkla silinmesin. Hata olursa yut — güvenlik kararını etkilemez.
      await prisma.sessionTokenUsage
        .update({ where: { jti }, data: { lastSeen: new Date() } })
        .catch(() => {});
    }
    // TTL'i tazele (aktif oturum boyunca kayıt yaşasın).
    await redisSetJson(key, { ipHash, uaHash, dbTouchedAt: needsTouch ? now : hot.dbTouchedAt }, HOT_TTL_SECONDS);
    return { ok: true };
  }

  // ── YETKİLİ YOL: Redis boş/kapalı → DB (davranış eskisiyle birebir) ──
  const existing = await prisma.sessionTokenUsage.findUnique({ where: { jti } });

  if (!existing) {
    await prisma.sessionTokenUsage.upsert({
      where: { jti },
      create: { jti, ipHash, userAgentHash: uaHash },
      update: { ipHash, userAgentHash: uaHash, lastSeen: new Date() },
    });
    await redisSetJson(key, { ipHash, uaHash, dbTouchedAt: Date.now() }, HOT_TTL_SECONDS);
    return { ok: true };
  }

  if (existing.ipHash !== ipHash || existing.userAgentHash !== uaHash) {
    return mismatchAlarm(jti);
  }

  await prisma.sessionTokenUsage.update({
    where: { jti },
    data: { lastSeen: new Date() },
  });
  // Sonraki isteklerde DB'ye gitmemek için sıcak kaydı doldur.
  await redisSetJson(key, { ipHash, uaHash, dbTouchedAt: Date.now() }, HOT_TTL_SECONDS);
  return { ok: true };
}
