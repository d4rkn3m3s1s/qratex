/**
 * POST /api/admin/users/[id]/approval — ikinci yöneticinin dört göz onay belirteci üretmesi.
 * Onaylayan kimliği YALNIZ bu oturumdan alınır; belirteç talep eden + kullanıcı + miktara bağlı,
 * 15 dk geçerli ve tek kullanımlıktır (lib/economy/admin-approval.ts).
 */
import { prisma } from '@/lib/prisma';
import { ApiError, defineRoute, ok } from '@/lib/http/define-route';
import { issueAdjustApproval } from '@/lib/economy/admin-approval';
import { auditEntry } from '@/lib/data-safety/audit';
import { approvalIssueSchema, idParamsSchema } from '@/lib/admin-users/contract';
import { actionCtx } from '@/lib/admin-users/actions.server';

export const dynamic = 'force-dynamic';

export const POST = defineRoute(
  {
    name: 'admin.users.approval',
    roles: ['ADMIN'],
    params: idParamsSchema,
    schema: approvalIssueSchema,
    rateLimit: { max: 20, windowMs: 60 * 60_000, by: 'user' },
  },
  async ({ params, body, session, request, user }) => {
    if (body.requesterId === user.id || params.id === user.id) {
      throw new ApiError('FORBIDDEN', 'İkinci onay, talep edenden ve hedef kullanıcıdan farklı bir yöneticiden gelmeli.');
    }
    const actors = await prisma.user.findMany({
      where: { id: { in: [user.id, body.requesterId] } },
      select: { id: true, role: true, suspendedAt: true },
    });
    const isActiveAdmin = (id: string) => actors.some((a) => a.id === id && String(a.role) === 'ADMIN' && !a.suspendedAt);
    if (!isActiveAdmin(user.id) || !isActiveAdmin(body.requesterId)) {
      throw new ApiError('FORBIDDEN', 'Yalnız etkin yöneticiler arasında onay verilebilir.');
    }
    const target = await prisma.user.findUnique({ where: { id: params.id }, select: { id: true } });
    if (!target) throw new ApiError('NOT_FOUND', 'Kullanıcı bulunamadı.');
    const issued = issueAdjustApproval({
      approverId: user.id,
      requesterId: body.requesterId,
      userId: params.id,
      delta: body.delta,
      xp: body.xp,
    });
    const ctx = actionCtx(session, request);
    await prisma.auditLog.create({
      data: auditEntry(
        ctx.actor,
        {
          action: 'ADMIN_POINTS_ADJUST_APPROVAL',
          entity: 'User',
          entityId: params.id,
          newData: { requesterId: body.requesterId, delta: body.delta, xp: body.xp, reason: body.reason, expiresAt: issued.expiresAt },
        },
        request
      ),
    });
    return ok({ token: issued.token, expiresAt: issued.expiresAt.toISOString() });
  }
);
