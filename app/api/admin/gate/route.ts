import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { checkRateLimitDb } from '@/lib/rate-limit';
import {
  ADMIN_GATE_SETTING_KEY,
  ADMIN_GATE_COOKIE,
  normalizeAdminGate,
  makeGateCookieValue,
} from '@/lib/admin-gate';

export const dynamic = 'force-dynamic';

/** Gate config'i DB'den okur (yoksa varsayılan). */
async function loadGate() {
  const setting = await prisma.settings
    .findUnique({ where: { key: ADMIN_GATE_SETTING_KEY }, select: { value: true } })
    .catch(() => null);
  return normalizeAdminGate(setting?.value);
}

/**
 * GET — Gizli kapı SORUSUNU döndürür (cevabı ASLA göndermez). Yalnız ADMIN.
 */
export async function GET() {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;
  const gate = await loadGate();
  return NextResponse.json(
    { success: true, question: gate.question },
    { headers: PRIVATE_NO_STORE_HEADERS }
  );
}

/**
 * POST — Cevabı ({ answer: "7" }) sunucuda doğrular. Doğruysa HMAC imzalı gate cookie set
 * eder (oturum boyunca tekrar sorulmaz). Yanlış cevap brute-force'a karşı rate-limitli.
 * Cevap yalnız sunucuda tutulur; istemciye asla gitmez.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;
  const userId = auth.session.user.id;

  // Brute-force koruması: kullanıcı başına 1 dk'da 8 deneme (gizli rakam 0-9 → tahmin zorlaşsın).
  const rl = await checkRateLimitDb(`admin-gate:${userId}`, 8, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { success: false, error: 'Çok fazla deneme. Biraz bekle.' },
      { status: 429, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }

  const body = await request.json().catch(() => ({}));
  const answer = typeof body?.answer === 'string' ? body.answer.trim() : '';

  const gate = await loadGate();
  if (answer !== gate.answer) {
    return NextResponse.json(
      { success: false, error: 'Yanlış cevap. Evrenin sırrını çözemedin. 🛸' },
      { status: 403, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }

  // Doğru → HMAC cookie set. Oturum cookie'si (tarayıcı kapanınca silinir) — "her oturumda 1 kez".
  const res = NextResponse.json({ success: true }, { headers: PRIVATE_NO_STORE_HEADERS });
  res.cookies.set(ADMIN_GATE_COOKIE, makeGateCookieValue(userId, gate.answer), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    // session cookie (maxAge yok) → tarayıcı kapanınca temizlenir; yeni oturumda tekrar sorulur.
  });
  return res;
}
