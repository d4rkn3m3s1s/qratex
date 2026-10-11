import { NextRequest, NextResponse } from 'next/server';
import { ANY_SIGNED_IN_ROLE, requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { hashPassword } from '@/lib/password';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { checkRateLimitDb } from '@/lib/rate-limit';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { passwordPolicyError } from '@/components/auth/p-auth/password-policy';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

/**
 * OAuth (Google/GitHub) ile gelen kullanıcının hesabına ŞİFRE eklemesi için (`/auth/complete`).
 * GET  → { hasPassword, providers } (geriye uyumluluk; sayfa artık bu durumu sunucuda okur).
 * POST → yalnızca ŞİFRESİ OLMAYAN kullanıcı için şifre belirler; koşullu ATOMİK yazım
 *        (`updateMany where password: null`) — mevcut şifre bu uçtan asla değişmez.
 *        Şifre politikası kayıtla aynıdır (eskiden yalnız uzunluk); işlem denetim kaydına yazılır
 *        (Ayarlar'daki eş uç `/api/user/initial-password` ile aynı iz).
 *        `emailVerified` yalnız Google bağlantısı varsa garanti edilir (GitHub e-postanın
 *        doğrulandığını garanti etmez).
 * Hata yanıtları makine-okunur `code` taşır: UNAUTHENTICATED · RATE_LIMITED · WEAK_PASSWORD ·
 * PASSWORD_TOO_LONG · ALREADY_SET.
 */
export async function GET() {
  // requireAuth: askı/silinme, sessionVersion, güncel rol, token replay (çıplak getServerSession değil).
  const auth = await requireAuth(ANY_SIGNED_IN_ROLE);
  if ('error' in auth) return auth.error;
  const session = auth.session;
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { password: true, accounts: { select: { provider: true } } },
  });
  const providers = Array.from(new Set((user?.accounts ?? []).map((a) => a.provider)));
  return NextResponse.json({ hasPassword: !!user?.password, providers }, { headers: PRIVATE_NO_STORE_HEADERS });
}

const bodySchema = z.object({ password: z.string().max(256) });

export async function POST(request: NextRequest) {
  // requireAuth: askı/silinme, sessionVersion, güncel rol, token replay (çıplak getServerSession değil).
  const auth = await requireAuth(ANY_SIGNED_IN_ROLE);
  if ('error' in auth) return auth.error;
  const session = auth.session;
  const userId = session.user.id;

  const rl = await checkRateLimitDb(`set_password:${userId}`, 5, 300_000);
  if (!rl.ok) {
    const sec = Math.max(1, Math.ceil((rl.retryAfterMs ?? 60_000) / 1000));
    return NextResponse.json(
      { code: 'RATE_LIMITED', error: 'Çok fazla deneme. Lütfen biraz sonra tekrar dene.', retryAfterSec: sec },
      { status: 429, headers: { ...PRIVATE_NO_STORE_HEADERS, 'Retry-After': String(sec) } }
    );
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  const policy = parsed.success ? passwordPolicyError(parsed.data.password) : 'WEAK_PASSWORD';
  if (!parsed.success || policy) {
    return NextResponse.json(
      {
        code: policy ?? 'WEAK_PASSWORD',
        error:
          policy === 'PASSWORD_TOO_LONG'
            ? 'Şifre en fazla 128 karakter olabilir.'
            : 'Şifre en az 8 karakter olmalı; küçük harf, büyük harf ve rakam içermeli.',
      },
      { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }

  const hashed = await hashPassword(parsed.data.password);
  // GÜVENLİK: yalnız şifresi OLMAYAN hesaba ekler (hijack önlemi) — kontrol ve yazım tek sorgu.
  const res = await prisma.user.updateMany({ where: { id: userId, password: null }, data: { password: hashed } });
  if (res.count === 0) {
    return NextResponse.json({ code: 'ALREADY_SET', error: 'Bu hesabın zaten bir şifresi var.' }, { status: 409, headers: PRIVATE_NO_STORE_HEADERS });
  }
  const google = await prisma.account.findFirst({ where: { userId, provider: 'google' }, select: { id: true } });
  if (google) {
    await prisma.user.updateMany({ where: { id: userId, emailVerified: null }, data: { emailVerified: new Date() } });
  }

  await prisma.auditLog
    .create({
      data: {
        userId,
        action: 'SET_INITIAL_PASSWORD',
        entity: 'User',
        entityId: userId,
        newData: { source: 'oauth_onboarding' } as object,
        ...getAuditRequestMeta(request),
      },
    })
    .catch((e: unknown) => console.error('[set-password] audit log failed', e));

  return NextResponse.json({ success: true }, { headers: PRIVATE_NO_STORE_HEADERS });
}
