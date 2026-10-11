import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { ApiError, defineRoute, ok } from '@/lib/http/define-route';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { FIELD_REPORT_SOURCE } from '@/lib/staff-ops/core';
import { notifyStaffFieldReportUpdate } from '@/lib/staff-ops/notify';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/dealer/staff/field-reports/[id] { status: 'seen' | 'resolved' | 'open' } — saha bildirimini
 * "görüldü" / "çözüldü" işaretler (Incident kaydı: in_progress / resolved). Bildirimi yapan personele haber gider.
 */
export const PATCH = defineRoute(
  {
    name: 'dealer.team.fieldReports.update',
    roles: ['DEALER'],
    tenant: 'dealer',
    module: 'staff_management',
    params: z.object({ id: z.string().min(1).max(64) }),
    schema: z.object({ status: z.enum(['seen', 'resolved', 'open']) }),
    rateLimit: 'mutation',
  },
  async ({ tenant, params, body, user, request }) => {
    const incident = await prisma.incident.findFirst({
      where: { id: params.id, dealerId: tenant.dealerId, metadata: { path: ['source'], equals: FIELD_REPORT_SOURCE } },
      select: { id: true, status: true, metadata: true },
    });
    if (!incident) throw new ApiError('NOT_FOUND', 'Saha bildirimi bulunamadı.');
    const status = body.status === 'resolved' ? 'resolved' : body.status === 'seen' ? 'in_progress' : 'open';
    if (incident.status === status) return ok({ id: incident.id, unchanged: true });

    await prisma.incident.update({
      where: { id: incident.id },
      data: { status, resolvedAt: status === 'resolved' ? new Date() : null },
    });
    const meta = (incident.metadata ?? {}) as Record<string, unknown>;
    if (typeof meta.reporterUserId === 'string' && status !== 'open') {
      await notifyStaffFieldReportUpdate(meta.reporterUserId, status === 'resolved');
    }
    await prisma.auditLog
      .create({
        data: {
          userId: user.id,
          action: 'UPDATE_FIELD_REPORT',
          entity: 'Incident',
          entityId: incident.id,
          oldData: { status: incident.status },
          newData: { status },
          ...getAuditRequestMeta(request),
        },
      })
      .catch(() => {});
    return ok({ id: incident.id });
  }
);
