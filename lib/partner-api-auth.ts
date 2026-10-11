import { createHash } from 'crypto';
import { NextResponse } from 'next/server';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { prisma } from '@/lib/prisma';
import { redisIncrWithTtl } from '@/lib/redis';
import { checkRateLimitDb } from '@/lib/rate-limit';
import { FULL_ACCESS_SCOPE } from '@/lib/integrations/contract';
import { ipAllowed, keyLifecycle, parsePartnerMeta, parseKeyMeta } from '@/lib/integrations/meta';
import { istanbulDayKey } from '@/lib/integrations/time';

export function hashApiKey(key: string): string {
  return createHash('sha256').update(key, 'utf8').digest('hex');
}

export type PartnerAuthOk = {
  ok: true;
  apiKeyId: string;
  /** Anahtar tek bir bayiye bağlıysa o bayi; null = platform geneli. */
  dealerId: string | null;
  partnerId: string | null;
  /** Partnere bağlı bayiler (boş = kısıt yok). */
  partnerDealerIds: string[];
  scopes: string[];
};
export type PartnerAuthFail = { ok: false; status: number; error: string; retryAfterSec?: number };

/** Anahtar başına oran sınırı (mimari-api B13): dakikada en fazla bu kadar başarılı istek. */
export const PARTNER_RATE_LIMIT_PER_MINUTE = 120;

const PARTNER_ERROR_CODES: Record<number, string> = {
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  429: 'RATE_LIMITED',
  503: 'SERVICE_UNAVAILABLE',
};

/** Partner kimlik hatasının tek yanıt biçimi (zarf v2 alanları + 429'da `Retry-After`). */
export function partnerAuthFailure(fail: PartnerAuthFail): NextResponse {
  return NextResponse.json(
    {
      ok: false,
      success: false,
      code: PARTNER_ERROR_CODES[fail.status] ?? 'FORBIDDEN',
      error: fail.error,
      ...(fail.status === 429 || fail.status === 503 ? { retryable: true } : {}),
    },
    {
      status: fail.status,
      headers: {
        ...PRIVATE_NO_STORE_HEADERS,
        ...(fail.retryAfterSec ? { 'Retry-After': String(fail.retryAfterSec) } : {}),
      },
    }
  );
}

/** Günlük kullanım sayacı (Redis; yoksa sessizce atlanır). 35 gün saklanır. */
export const usageKey = (keyId: string, day: string, kind: 'ok' | 'denied') => `apikey:usage:${keyId}:${day}:${kind}`;

async function countUsage(keyId: string, kind: 'ok' | 'denied'): Promise<void> {
  await redisIncrWithTtl(usageKey(keyId, istanbulDayKey(new Date()), kind), 35 * 86_400);
}

/**
 * Authorization: Bearer qrx_... ile ApiKey doğrula. İsteğe bağlı kapsam.
 *
 * Sıra: dış API modül anahtarı (kill-switch) → biçim → hash → iptal/süre → IP izin listesi →
 * partner aktifliği → kapsam. `lastUsedAt` dakikada en fazla bir kez yazılır (Redis kısma;
 * Redis yoksa her istekte). Dönüş geriye uyumludur (`ok`, `apiKeyId`).
 */
export async function authenticatePartnerApiKey(
  authHeader: string | null,
  requiredScope?: string,
  opts: { ip?: string | null } = {}
): Promise<PartnerAuthOk | PartnerAuthFail> {
  try {
    const { getModuleControls } = await import('@/lib/module-gate');
    const controls = (await getModuleControls()) as Record<string, boolean | undefined>;
    if (controls.api_keys === false) {
      return { ok: false, status: 503, error: 'Dış API erişimi geçici olarak kapalı.' };
    }
  } catch (err) {
    // Modül ayarı okunamazsa kapalı varsayma (DB zaten aşağıda denenecek); görünür kıl.
    console.warn('[partner-api-auth] modül kontrolü okunamadı:', err);
  }

  if (!authHeader?.startsWith('Bearer ')) {
    return { ok: false, status: 401, error: 'Bearer token gerekli' };
  }
  const raw = authHeader.slice(7).trim();
  if (!raw.startsWith('qrx_')) {
    return { ok: false, status: 401, error: 'Geçersiz anahtar biçimi' };
  }
  const key = await prisma.apiKey.findFirst({
    where: { keyHash: hashApiKey(raw) },
    select: { id: true, scope: true },
  });
  if (!key) {
    return { ok: false, status: 401, error: 'Geçersiz API anahtarı' };
  }
  const meta = parseKeyMeta(key.scope);
  const life = keyLifecycle(meta);
  if (life === 'revoked') return { ok: false, status: 401, error: 'Bu API anahtarı iptal edildi' };
  if (life === 'expired') return { ok: false, status: 401, error: 'Bu API anahtarının süresi doldu' };

  if (!ipAllowed(opts.ip ?? null, meta.ipAllowlist)) {
    await countUsage(key.id, 'denied');
    return { ok: false, status: 403, error: 'Bu IP adresinden erişime izin verilmiyor' };
  }

  let partnerDealerIds: string[] = [];
  if (meta.partnerId) {
    const partner = await prisma.partner.findUnique({ where: { id: meta.partnerId }, select: { isActive: true, metadata: true } });
    if (!partner || !partner.isActive || parsePartnerMeta(partner.metadata).archivedAt) {
      await countUsage(key.id, 'denied');
      return { ok: false, status: 403, error: 'Bu anahtarın bağlı olduğu partner pasif' };
    }
    partnerDealerIds = parsePartnerMeta(partner.metadata).dealerIds;
  }

  if (requiredScope && !meta.scopes.includes(requiredScope) && !meta.scopes.includes(FULL_ACCESS_SCOPE)) {
    await countUsage(key.id, 'denied');
    return { ok: false, status: 403, error: `Gerekli yetki: ${requiredScope}` };
  }

  // Anahtar başına oran sınırı (Redis öncelikli paylaşılan sayaç). Sayaç altyapısı çökerse
  // istek kesilmez (fail-open, defineRoute ile aynı karar) ama görünür kılınır.
  try {
    const rl = await checkRateLimitDb(`partner-api:${key.id}`, PARTNER_RATE_LIMIT_PER_MINUTE, 60_000);
    if (!rl.ok) {
      await countUsage(key.id, 'denied');
      return {
        ok: false,
        status: 429,
        error: 'Bu API anahtarı için istek sınırı aşıldı. Lütfen biraz sonra tekrar deneyin.',
        retryAfterSec: Math.max(1, Math.ceil((rl.retryAfterMs ?? 60_000) / 1000)),
      };
    }
  } catch (err) {
    console.warn('[partner-api-auth] oran sınırı kontrolü başarısız:', err);
  }

  await countUsage(key.id, 'ok');
  const touch = await redisIncrWithTtl(`apikey:touch:${key.id}`, 60);
  if (!touch || touch.count === 1) {
    try {
      await prisma.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } });
    } catch (err) {
      console.warn('[partner-api-auth] lastUsedAt yazılamadı:', err);
    }
  }
  return { ok: true, apiKeyId: key.id, dealerId: meta.dealerId, partnerId: meta.partnerId, partnerDealerIds, scopes: meta.scopes };
}
