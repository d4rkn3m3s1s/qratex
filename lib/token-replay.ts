/**
 * Token replay detection: aynı JWT jti farklı IP/UA ile kullanılırsa alarm.
 * API-auth getSession sonrası çağrılır.
 */
import { prisma } from '@/lib/prisma';
import * as Sentry from '@sentry/nextjs';
import { createHash } from 'crypto';

function hash(s: string): string {
  return createHash('sha256').update(s || '').digest('hex').slice(0, 16);
}

export type TokenReplayResult =
  | { ok: true }
  | { ok: false; alarm: true; message: string };

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

  const existing = await prisma.sessionTokenUsage.findUnique({
    where: { jti },
  });

  if (!existing) {
    await prisma.sessionTokenUsage.upsert({
      where: { jti },
      create: { jti, ipHash, userAgentHash: uaHash },
      update: { ipHash, userAgentHash: uaHash, lastSeen: new Date() },
    });
    return { ok: true };
  }

  if (existing.ipHash !== ipHash || existing.userAgentHash !== uaHash) {
    const msg = `Token replay: jti=${jti.slice(0, 8)}... farklı IP/UA ile kullanıldı`;
    Sentry.captureMessage(msg, 'warning');
    return { ok: false, alarm: true, message: msg };
  }

  await prisma.sessionTokenUsage.update({
    where: { jti },
    data: { lastSeen: new Date() },
  });
  return { ok: true };
}
