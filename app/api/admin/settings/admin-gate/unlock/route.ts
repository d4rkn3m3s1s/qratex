import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { ADMIN_GATE_AUDIT, ADMIN_GATE_AUDIT_ENTITY } from '@/lib/admin-gate';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({ userId: z.string().trim().min(1).max(191) }).strict();

/**
 * POST — Bir yöneticinin kapı kilidini kaldırır (`ADMIN_GATE_UNLOCKED`). Kilit, bu kayıttan
 * SONRAKİ yanlış denemelerle yeniden hesaplanır. Kendi kilidini kaldırmak anlamsızdır
 * (kilitli kişi kapıyı geçemediği için bu uca zaten ulaşamaz) ama reddedilir de.
 */
export async function POST(request: NextRequest) {
  const auditMeta = getAuditRequestMeta(request);
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;
  const actorId = auth.session.user.id;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, code: 'VALIDATION', error: 'Kilidi kaldırılacak hesap belirtilmedi.' },
      { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
  const targetId = parsed.data.userId;
  if (targetId === actorId) {
    return NextResponse.json(
      { success: false, code: 'FORBIDDEN', error: 'Kendi kapı kilidinizi kaldıramazsınız.' },
      { status: 403, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }

  try {
    const target = await prisma.user.findUnique({ where: { id: targetId }, select: { id: true } });
    if (!target) {
      return NextResponse.json(
        { success: false, code: 'NOT_FOUND', error: 'Hesap bulunamadı.' },
        { status: 404, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }
    await prisma.auditLog.create({
      data: {
        userId: actorId,
        action: ADMIN_GATE_AUDIT.UNLOCKED,
        entity: ADMIN_GATE_AUDIT_ENTITY,
        entityId: targetId,
        ...auditMeta,
      },
    });
  } catch {
    return NextResponse.json(
      { success: false, code: 'GATE_UNAVAILABLE', error: 'Kilit şu anda kaldırılamadı. Lütfen tekrar deneyin.' },
      { status: 503, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
  return NextResponse.json({ success: true }, { headers: PRIVATE_NO_STORE_HEADERS });
}
