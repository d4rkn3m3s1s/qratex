import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/api-auth';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { checkRateLimitDb } from '@/lib/rate-limit';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { issueAdjustApproval } from '@/lib/economy/admin-approval';
import { ADMIN_ADJUST_LIMITS } from '@/lib/economy/caps';

/**
 * POST /api/admin/economy/adjust-approvals — ikinci yönetici onayı (dört göz).
 * Onaylayan kimliği YALNIZ bu isteğin oturumundan alınır; dönen belirteç talep eden
 * admine iletilir ve yalnız bu kullanıcı + miktar için, 15 dk, tek kez geçerlidir.
 */
const bodySchema = z.object({
  userId: z.string().min(1).max(64),
  requesterId: z.string().min(1).max(64),
  delta: z.number().int().refine((n) => n !== 0, 'Miktar sıfır olamaz'),
  xp: z.number().int().min(0).optional(),
  reason: z.string().trim().min(ADMIN_ADJUST_LIMITS.reasonMin).max(ADMIN_ADJUST_LIMITS.reasonMax),
});

export async function POST(request: NextRequest) {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;
  const approverId = auth.session.user.id;

  const rl = await checkRateLimitDb(`admin_adjust_approval:${approverId}`, 20, 60 * 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Çok fazla onay isteği. Biraz sonra tekrar deneyin.' },
      { status: 429, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Geçersiz onay isteği.', details: parsed.error.flatten() },
      { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
  const { userId, requesterId, delta, xp = 0, reason } = parsed.data;
  if (approverId === requesterId || approverId === userId) {
    return NextResponse.json(
      { error: 'İkinci onay, talep edenden ve hedef kullanıcıdan farklı bir yöneticiden gelmeli.' },
      { status: 403, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }

  // Rol JWT'den değil DB'den: onaylayan ve talep eden gerçekten ADMIN mi?
  const actors = await prisma.user.findMany({
    where: { id: { in: [approverId, requesterId] } },
    select: { id: true, role: true, email: true, name: true },
  });
  const approver = actors.find((a) => a.id === approverId);
  const requester = actors.find((a) => a.id === requesterId);
  if (approver?.role !== 'ADMIN' || requester?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Yalnız yöneticiler arasında onay verilebilir.' }, { status: 403, headers: PRIVATE_NO_STORE_HEADERS });
  }

  const { token, expiresAt } = issueAdjustApproval({ approverId, requesterId, userId, delta, xp });
  const meta = getAuditRequestMeta(request);
  await prisma.auditLog.create({
    data: {
      userId: approverId,
      actorType: 'user',
      actorSnapshot: { email: approver.email, role: approver.role, name: approver.name ?? null },
      action: 'ADMIN_POINTS_ADJUST_APPROVED',
      entity: 'User',
      entityId: userId,
      newData: { requesterId, delta, xp, reason, expiresAt: expiresAt.toISOString() },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    },
  });

  return NextResponse.json({ approvalToken: token, expiresAt }, { headers: PRIVATE_NO_STORE_HEADERS });
}
