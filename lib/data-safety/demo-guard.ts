/**
 * Demo / bootstrap araçlarının üretim kapısı (P0-27).
 *
 * Kural:
 *  - Üretimde (`NODE_ENV=production`, Vercel preview dahil) demo üretimi YALNIZ
 *    `ALLOW_DEMO_SEED=true` ortam değişkeniyle açılır; yoksa uç 403 döner.
 *  - Açık olsa bile demo araçları YALNIZ `User.isDemo=true` sentetik varlıklara yazar;
 *    gerçek bayi/müşteri satırlarına (fraudStatus, businessCategory, AI alanları, teklif)
 *    asla dokunmaz.
 *
 * Demo giriş bloğu (login sayfasındaki örnek hesaplar) bu kapıdan bağımsızdır.
 */
import { NextResponse } from 'next/server';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';

type Env = Record<string, string | undefined>;

export function isDemoSeedAllowed(env: Env = process.env): boolean {
  const flag = (env.ALLOW_DEMO_SEED ?? '').trim().toLowerCase();
  if (flag === 'true' || flag === '1') return true;
  return env.NODE_ENV !== 'production';
}

export const DEMO_SEED_FORBIDDEN_MESSAGE =
  'Demo verisi üretimi canlı ortamda kapalı. Yalnız ALLOW_DEMO_SEED=true ile ve yalnız demo hesaplarda çalışır.';

export function demoSeedForbiddenResponse(): NextResponse {
  return NextResponse.json(
    { ok: false, success: false, code: 'DEMO_SEED_DISABLED', error: DEMO_SEED_FORBIDDEN_MESSAGE, message: DEMO_SEED_FORBIDDEN_MESSAGE },
    { status: 403, headers: PRIVATE_NO_STORE_HEADERS }
  );
}

/** Kapı kapalıysa 403 yanıtı, açıksa null. */
export function demoSeedGate(env: Env = process.env): NextResponse | null {
  return isDemoSeedAllowed(env) ? null : demoSeedForbiddenResponse();
}

export const DEMO_TARGET_REQUIRED_MESSAGE =
  'Demo araçları yalnız demo (isDemo) işaretli hesaplara yazabilir. Gerçek bir bayi seçilemez.';

export function demoTargetRequiredResponse(): NextResponse {
  return NextResponse.json(
    { ok: false, success: false, code: 'DEMO_TARGET_REQUIRED', error: DEMO_TARGET_REQUIRED_MESSAGE, message: DEMO_TARGET_REQUIRED_MESSAGE },
    { status: 409, headers: PRIVATE_NO_STORE_HEADERS }
  );
}
