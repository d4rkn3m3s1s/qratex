import { z } from 'zod';
import { ApiError, defineRoute, ok } from '@/lib/http/define-route';
import { getIncidentDetail, updateIncident } from '@/lib/dealer-queues/incident-server';
import { INCIDENT_NOTE_MAX, INCIDENT_SEVERITIES, INCIDENT_STATUSES, ROOT_CAUSES } from '@/lib/dealer-queues/incident-catalog';
import { loadAssigneeDirectory } from '@/lib/dealer-queues/assignees';
import { AssigneeIdSchema, DueAtSchema, IdParams, actorOf } from '@/lib/dealer-queues/route-helpers';

export const dynamic = 'force-dynamic';

/** Vaka detayı: açıklama, metrik kanıtı, ilgili yorumlar, bağlı görevler, zaman çizelgesi. */
export const GET = defineRoute(
  {
    name: 'dealer.queues.incidents.detail',
    roles: ['DEALER', 'ADMIN', 'STAFF'],
    tenant: 'dealer',
    module: 'incidents',
    rateLimit: 'read',
    params: IdParams,
  },
  async ({ tenant, params }) => {
    const dir = await loadAssigneeDirectory(tenant.dealerId, tenant.actorId);
    const detail = await getIncidentDetail(tenant.dealerId, params.id, dir);
    if (tenant.actorRole === 'STAFF' && detail.assignee?.id !== tenant.actorId) {
      throw new ApiError('FORBIDDEN', 'Yalnız size atanmış vakayı görüntüleyebilirsiniz.');
    }
    return ok(detail);
  }
);

const PatchBody = z
  .object({
    status: z.enum(INCIDENT_STATUSES).optional(),
    assignedToId: AssigneeIdSchema.optional(),
    severity: z.enum(INCIDENT_SEVERITIES).optional(),
    dueAt: DueAtSchema.optional(),
    resolutionNote: z.string().max(INCIDENT_NOTE_MAX).optional().nullable(),
    rootCause: z.enum(ROOT_CAUSES).optional().nullable(),
    note: z.string().max(INCIDENT_NOTE_MAX).optional().nullable(),
  })
  .refine((b) => Object.values(b).some((v) => v !== undefined), { message: 'Değiştirilecek alan yok.' });

/**
 * Yaşam döngüsü: Üstlen (sorumlu = ben + işlemde) · Ata · İşleme al · Çöz (not zorunlu, masa
 * sinyali hariç) · Yeniden aç · önem / son tarih · iç not. Geçişler sunucu durum makinesinden.
 */
export const PATCH = defineRoute(
  {
    name: 'dealer.queues.incidents.update',
    roles: ['DEALER', 'STAFF'],
    tenant: 'dealer',
    module: 'incidents',
    rateLimit: 'mutation',
    params: IdParams,
    schema: PatchBody,
  },
  async ({ tenant, params, body, session }) => {
    const dir = await loadAssigneeDirectory(tenant.dealerId, tenant.actorId);
    const detail = await updateIncident(
      tenant.dealerId,
      actorOf(tenant, session),
      params.id,
      {
        status: body.status,
        assignedToId: body.assignedToId,
        severity: body.severity,
        dueAt: body.dueAt,
        resolutionNote: body.resolutionNote ?? null,
        rootCause: body.rootCause ?? null,
        note: body.note ?? null,
      },
      dir
    );
    return ok(detail);
  }
);
