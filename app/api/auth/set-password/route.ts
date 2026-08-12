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
 * OAuth (Google) ile gelen kullanıcının hesabına ŞİFRE eklemesi için.
 * GET  → { hasPassword } (onboarding'de şifre adımını göstermeli mi).
 * POST → yalnızca ŞİFRESİ OLMAYAN kullanıcı için şifre belirler (mevcut şifreyi
 *        bu uç DEĞİŞTİRMEZ — değiştirme /api/user/password'da, currentPassword ister).
 *        Email zaten OAuth ile doğrulandığı için emailVerified de garantilenir.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Oturum gerekli' }, { status: 401, headers: PRIVATE_NO_STORE_HEADERS });
  }
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { password: true } });
  return NextResponse.json({ hasPassword: !!user?.password }, { headers: PRIVATE_NO_STORE_HEADERS });
}

const bodySchema = z.object({
  password: z.string().min(8, 'Şifre en az 8 karakter olmalıdır').max(200),
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
      { error: 'Çok fazla deneme. Lütfen biraz sonra tekrar deneyin.' },
      { status: 429, headers: { ...PRIVATE_NO_STORE_HEADERS, ...(rl.retryAfterMs ? { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) } : {}) } }
    );
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message || 'Geçersiz şifre' }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });
  }

  // GÜVENLİK: bu uç yalnız ŞİFRESİ OLMAYAN (OAuth) hesaba şifre EKLER.
  // Zaten şifresi varsa değiştirmez (hijack önlemi) → /api/user/password kullanılmalı.
  const existing = await prisma.user.findUnique({ where: { id: userId }, select: { password: true } });
  if (existing?.password) {
    return NextResponse.json({ error: 'Bu hesabın zaten bir şifresi var.' }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });
  }

  const hashed = await hashPassword(parsed.data.password);
  await prisma.user.update({ where: { id: userId }, data: { password: hashed } });
  // Email OAuth ile zaten doğrulandı → emailVerified null kalmışsa garanti et (koşullu).
  await prisma.user.updateMany({ where: { id: userId, emailVerified: null }, data: { emailVerified: new Date() } });

  return NextResponse.json({ success: true }, { headers: PRIVATE_NO_STORE_HEADERS });
}
