/**
 * Cron uçları için TEK yetki kontrolü (denetim D1: on cron dosyasındaki kopya `validBearer`).
 *
 * Kurallar:
 *  - Yalnız `Authorization: Bearer <CRON_SECRET>` kabul edilir; sorgu parametresinde sır taşınmaz.
 *  - FAIL-CLOSED: `CRON_SECRET` tanımlı değilse uç kapalıdır (503), herkese açık hâle gelmez.
 *  - Karşılaştırma sabit zamanlıdır (`timingSafeEqual`); uzunluk farkı da erken sızdırmaz.
 */
import { NextResponse } from 'next/server';
import { createHash, timingSafeEqual } from 'crypto';

/** Sabit zamanlı Bearer karşılaştırması. Uzunluklar farklı olsa da aynı sürede döner (özet karşılaştırması). */
export function verifyCronBearer(authHeader: string | null | undefined, secret: string | null | undefined): boolean {
  const s = (secret ?? '').trim();
  if (!s) return false;
  const got = (authHeader ?? '').trim();
  if (!got) return false;
  const expected = `Bearer ${s}`;
  // Özetler sabit 32 bayt: uzunluk kontrolü erken dönmez, timingSafeEqual atmaz.
  const a = createHash('sha256').update(got).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b) && got.length === expected.length;
}

/**
 * Route başında: `const denied = requireCronAuth(req); if (denied) return denied;`
 * Geçerse `null` döner.
 */
export function requireCronAuth(req: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret || !secret.trim()) {
    return NextResponse.json({ error: 'CRON_SECRET ayarlı değil; cron devre dışı.' }, { status: 503 });
  }
  if (!verifyCronBearer(req.headers.get('authorization'), secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}

/** Orkestratörün alt işlere geçirdiği yetkili sentetik istek başlığı. */
export function cronAuthHeader(): string {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) throw new Error('CRON_SECRET tanımlı değil.');
  return `Bearer ${secret}`;
}
