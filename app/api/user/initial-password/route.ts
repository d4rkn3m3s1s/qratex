import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';
import { getAuditRequestMeta } from '@/lib/request-metadata';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  newPassword: z.string().min(8).max(128),
});

/**
 * OAuth / Google ile giriş yapanlar için ilk şifre (hesapta password yokken).
 */
export async function POST(request: NextRequest) {
  try {
    const auditMeta = getAuditRequestMeta(request);
    const auth = await requireAuth();
    if ('error' in auth) return auth.error;
    const { session } = auth;

    const body = await request.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0]?.message || 'Geçersiz şifre' },
        { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, password: true },
    });

    if (!user) {
      return NextResponse.json({ error: 'Kullanıcı bulunamadı' }, { status: 404, headers: PRIVATE_NO_STORE_HEADERS });
    }

    if (user.password) {
      return NextResponse.json(
        { error: 'Zaten bir şifreniz var. Değiştirmek için mevcut şifre ile güncelleyin.' },
        { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    const hashed = await bcrypt.hash(parsed.data.newPassword, 12);
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashed },
    });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'SET_INITIAL_PASSWORD',
        entity: 'User',
        entityId: user.id,
        newData: { source: 'oauth_user' } as object,
        ...auditMeta,
      },
    });

    return NextResponse.json({ success: true, message: 'Şifre oluşturuldu' }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    console.error('initial-password:', error);
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    return NextResponse.json({ error: 'İşlem başarısız' }, { status: 500, headers: PRIVATE_NO_STORE_HEADERS });
  }
}
