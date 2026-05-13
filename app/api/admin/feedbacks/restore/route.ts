import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { adminFeedbacksRestoreSchema } from '@/lib/validations-admin';
import { checkAdminRateLimit } from '@/lib/rate-limit';


export const dynamic = 'force-dynamic';

/** POST - Restore soft-deleted feedbacks (set deletedAt = null) */
export async function POST(request: NextRequest) {
  try {
    const auditMeta = getAuditRequestMeta(request);
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) return auth.error;
    const { session } = auth;
    const rl = checkAdminRateLimit(session.user.id);
    if (!rl.ok) {
      return NextResponse.json(
        { error: 'Çok fazla istek. Lütfen biraz bekleyin.' },
        {
          status: 429,
          headers: {
            ...PRIVATE_NO_STORE_HEADERS,
            ...(rl.retryAfterMs ? { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) } : {}),
          },
        }
      );
    }

    const raw = await request.json();
    const parsed = adminFeedbacksRestoreSchema.safeParse(raw);
    if (!parsed.success) {
      const msg = parsed.error.errors[0]?.message ?? 'Geçersiz istek';
      return NextResponse.json({ error: msg, details: parsed.error.flatten() }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
    }
    const { feedbackIds } = parsed.data;

    const result = await prisma.feedback.updateMany({
      where: { id: { in: feedbackIds }, deletedAt: { not: null } },
      data: { deletedAt: null },
    });

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'RESTORE_FEEDBACKS',
        entity: 'Feedback',
        entityId: feedbackIds.join(','),
        newData: { count: result.count },
        ...auditMeta,
      },
    });

    return NextResponse.json({ success: true, restored: result.count }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    console.error('Restore feedbacks error:', error);
    return NextResponse.json({ error: 'Geri alma işlemi başarısız' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}
