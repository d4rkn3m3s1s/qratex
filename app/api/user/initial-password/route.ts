import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ANY_SIGNED_IN_ROLE, requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { hashPassword } from '@/lib/password';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { parseJsonBody } from '@/lib/http/parse-body';
import { PASSWORD_MAX_LENGTH, passwordPolicyError } from '@/components/auth/p-auth/password-policy';
import { enforceRouteRateLimit } from '@/lib/http/route-rate-limit';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  newPassword: z.string({ required_error: 'Şifre gerekli', invalid_type_error: 'Şifre gerekli' }).min(1, 'Şifre gerekli'),
});

/**
 * OAuth / Google ile giriş yapanlar için ilk şifre (hesapta password yokken) — ayarlar ekranı.
 *
 * mimari-api B6: şifre kayıt/sıfırlama/`/api/auth/set-password` ile AYNI politikadan geçer
 * (eskiden yalnız 8-128 uzunluk); yazım koşullu ve atomik (`password: null` iken) — iki paralel
 * istek birbirinin şifresini ezemez; ikinci istek 409.
 */
export async function POST(request: NextRequest) {
  try {
    const auditMeta = getAuditRequestMeta(request);
    const auth = await requireAuth(ANY_SIGNED_IN_ROLE);
    if ('error' in auth) return auth.error;
    const limited = await enforceRouteRateLimit('user.initial-password.post', auth.session.user.id, 'sensitive');
    if (limited) return limited;
    const { session } = auth;

    const parsed = await parseJsonBody(request, bodySchema, { maxBytes: 4_096 });
    if (!parsed.ok) return parsed.response;
    const policy = passwordPolicyError(parsed.data.newPassword);
    if (policy) {
      return NextResponse.json(
        {
          success: false,
          code: policy,
          error:
            policy === 'PASSWORD_TOO_LONG'
              ? `Şifre en fazla ${PASSWORD_MAX_LENGTH} karakter olabilir.`
              : 'Şifre en az 8 karakter olmalı; küçük harf, büyük harf ve rakam içermeli.',
        },
        { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    const hashed = await hashPassword(parsed.data.newPassword);
    const written = await prisma.user.updateMany({
      where: { id: session.user.id, password: null },
      data: { password: hashed },
    });
    if (written.count === 0) {
      return NextResponse.json(
        {
          success: false,
          code: 'PASSWORD_ALREADY_SET',
          error: 'Zaten bir şifreniz var. Değiştirmek için mevcut şifre ile güncelleyin.',
        },
        { status: 409, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'SET_INITIAL_PASSWORD',
        entity: 'User',
        entityId: session.user.id,
        newData: { source: 'oauth_user' } as object,
        ...auditMeta,
      },
    });

    return NextResponse.json({ success: true, message: 'Şifre oluşturuldu' }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    console.error('initial-password:', error);
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    return NextResponse.json(
      { success: false, code: 'INTERNAL', error: 'İşlem başarısız' },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}
