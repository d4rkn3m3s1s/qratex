import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { actorFromSession, auditEntry } from '@/lib/data-safety/audit';
import { adminFeedbacksRestoreSchema } from '@/lib/validations-admin';
import { checkAdminRateLimit } from '@/lib/rate-limit';


export const dynamic = 'force-dynamic';

/** POST - Restore soft-deleted feedbacks (set deletedAt = null) */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) return auth.error;
    const { session } = auth;
    const rl = await checkAdminRateLimit(session.user.id);
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

    // Bozuk JSON → 400 (önceden `request.json()` fırlatıp 500 dönüyordu).
    const raw = await request.json().catch(() => null);
    const parsed = adminFeedbacksRestoreSchema.safeParse(raw);
    if (!parsed.success) {
      const msg = parsed.error.errors[0]?.message ?? 'Geçersiz istek';
      return NextResponse.json({ error: msg, details: parsed.error.flatten() }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
    }
    const { feedbackIds } = parsed.data;
    const ids = Array.from(new Set(feedbackIds));
    // P0-23: tüketim yorumları da soft-delete; `type: 'consumption'` ile geri alınır.
    const isConsumption = (raw as { type?: unknown } | null)?.type === 'consumption';

    // Geri alma + denetim satırı (aktör anlık görüntüsüyle) AYNI transaction'da.
    const result = await prisma.$transaction(async (tx) => {
      const res = isConsumption
        ? await tx.consumptionReview.updateMany({
            where: { id: { in: ids }, deletedAt: { not: null } },
            data: { deletedAt: null },
          })
        : await tx.feedback.updateMany({
            where: { id: { in: ids }, deletedAt: { not: null } },
            data: { deletedAt: null },
          });
      await tx.auditLog.create({
        data: auditEntry(
          actorFromSession(session),
          {
            action: isConsumption ? 'RESTORE_CONSUMPTION_REVIEWS' : 'RESTORE_FEEDBACKS',
            entity: isConsumption ? 'ConsumptionReview' : 'Feedback',
            entityId: ids.join(','),
            newData: { requested: ids.length, count: res.count },
          },
          request
        ),
      });
      return res;
    });

    return NextResponse.json({ success: true, restored: result.count }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    console.error('Restore feedbacks error:', error);
    return NextResponse.json({ error: 'Geri alma işlemi başarısız' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}
