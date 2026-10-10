import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { hashPassword } from '@/lib/password';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { checkRateLimitDb } from '@/lib/rate-limit';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

/**
 * OAuth (Google/GitHub) ile gelen kullanıcının hesabına ŞİFRE eklemesi için.
 * GET  → { hasPassword, providers } (onboarding'de şifre adımını göstermeli mi, hangi
 *        sağlayıcıyla geldi — ekrandaki metin sağlayıcıya göre yazılır).
 * POST → yalnızca ŞİFRESİ OLMAYAN kullanıcı için şifre belirler; koşullu ATOMİK yazım
 *        (`updateMany where password: null`) — mevcut şifre bu uçtan asla değişmez.
 *        `emailVerified` yalnız Google bağlantısı varsa garanti edilir (GitHub e-postanın
 *        doğrulandığını garanti etmez).
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Oturum gerekli' }, { status: 401, headers: PRIVATE_NO_STORE_HEADERS });
  }
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { password: true, accounts: { select: { provider: true } } },
  });
  const providers = Array.from(new Set((user?.accounts ?? []).map((a) => a.provider)));
  return NextResponse.json({ hasPassword: !!user?.password, providers }, { headers: PRIVATE_NO_STORE_HEADERS });
}

const bodySchema = z.object({
  password: z.string().min(8, 'Şifre en az 8 karakter olmalı').max(128, 'Şifre en fazla 128 karakter olabilir'),
});

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Oturum gerekli' }, { status: 401, headers: PRIVATE_NO_STORE_HEADERS });
  }
  const userId = session.user.id;

  const rl = await checkRateLimitDb(`set_password:${userId}`, 5, 300_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Çok fazla deneme. Lütfen biraz sonra tekrar dene.' },
      { status: 429, headers: { ...PRIVATE_NO_STORE_HEADERS, ...(rl.retryAfterMs ? { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) } : {}) } }
    );
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message || 'Geçersiz şifre' }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });
  }

  const hashed = await hashPassword(parsed.data.password);
  // GÜVENLİK: yalnız şifresi OLMAYAN hesaba ekler (hijack önlemi) — kontrol ve yazım tek sorgu.
  const res = await prisma.user.updateMany({ where: { id: userId, password: null }, data: { password: hashed } });
  if (res.count === 0) {
    return NextResponse.json({ error: 'Bu hesabın zaten bir şifresi var.' }, { status: 409, headers: PRIVATE_NO_STORE_HEADERS });
  }
  const google = await prisma.account.findFirst({ where: { userId, provider: 'google' }, select: { id: true } });
  if (google) {
    await prisma.user.updateMany({ where: { id: userId, emailVerified: null }, data: { emailVerified: new Date() } });
  }

  return NextResponse.json({ success: true }, { headers: PRIVATE_NO_STORE_HEADERS });
}
