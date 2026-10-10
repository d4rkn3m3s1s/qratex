import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import {
  INCIDENT_VIEWS,
  createManualIncident,
  getIncidentSummary,
  listIncidents,
} from '@/lib/dealer-queues/incident-server';
import {
  INCIDENT_DESCRIPTION_MAX,
  INCIDENT_GROUPS,
  INCIDENT_PAGE_SIZE,
  INCIDENT_SEVERITIES,
  INCIDENT_TITLE_MAX,
  MANUAL_INCIDENT_TYPES,
} from '@/lib/dealer-queues/incident-catalog';
import { normalizeSearch } from '@/lib/dealer-queues/remedy-core';
import { loadAssigneeDirectory } from '@/lib/dealer-queues/assignees';
import { AssigneeIdSchema, DueAtSchema, actorOf } from '@/lib/dealer-queues/route-helpers';
import type { IncidentListResponse } from '@/lib/dealer-queues/types';

export const dynamic = 'force-dynamic';

const Query = z.object({
  view: z.enum(INCIDENT_VIEWS).catch('open'),
  severity: z.enum(['all', ...INCIDENT_SEVERITIES]).catch('all'),
  group: z.enum(['all', ...INCIDENT_GROUPS]).catch('all'),
  q: z.string().optional().transform((v) => normalizeSearch(v)),
  page: z.coerce.number().int().min(1).max(500).catch(1),
});

/** Gelen Kutusu → Vakalar: liste (önem → son tarih → yeni) + özet şeridi. Salt okuma. */
export const GET = defineRoute(
  {
    name: 'dealer.queues.incidents.list',
    roles: ['DEALER', 'ADMIN'],
    tenant: 'dealer',
    module: 'incidents',
    rateLimit: 'read',
    query: Query,
  },
  async ({ tenant, query }) => {
    const dir = await loadAssigneeDirectory(tenant.dealerId, tenant.actorId);
    const [list, summary] = await Promise.all([
      listIncidents(
        tenant.dealerId,
        tenant.actorId,
        { view: query.view, severity: query.severity, group: query.group, q: query.q, page: query.page, pageSize: INCIDENT_PAGE_SIZE },
        dir
      ),
      getIncidentSummary(tenant.dealerId, tenant.actorId),
    ]);
    const body: IncidentListResponse = { ...list, summary };
    return ok(body);
  }
);

const CreateBody = z.object({
  type: z.enum(MANUAL_INCIDENT_TYPES),
  severity: z.enum(INCIDENT_SEVERITIES),
  title: z.string().trim().min(3, 'Başlık en az 3 karakter olmalı.').max(INCIDENT_TITLE_MAX, `Başlık en fazla ${INCIDENT_TITLE_MAX} karakter olabilir.`),
  description: z.string().max(INCIDENT_DESCRIPTION_MAX, `Açıklama en fazla ${INCIDENT_DESCRIPTION_MAX} karakter olabilir.`).optional().nullable(),
  assignedToId: AssigneeIdSchema.optional(),
  dueAt: DueAtSchema.optional(),
});

/** Elle vaka aç (tür katalogdan; sorumlu yalnız aktif personel/bayi; son tarih yoksa önemden). */
export const POST = defineRoute(
  {
    name: 'dealer.queues.incidents.create',
    roles: ['DEALER'],
    tenant: 'dealer',
    module: 'incidents',
    rateLimit: { max: 20, windowMs: 10 * 60_000, by: 'user' },
    schema: CreateBody,
  },
  async ({ tenant, body, session }) => {
    const dir = await loadAssigneeDirectory(tenant.dealerId, tenant.actorId);
    const detail = await createManualIncident(
      tenant.dealerId,
      actorOf(tenant, session),
      {
        type: body.type,
        severity: body.severity,
        title: body.title,
        description: body.description ?? null,
        assignedToId: body.assignedToId,
        dueAt: body.dueAt ?? null,
      },
      dir
    );
    return ok(detail, { status: 201 });
  }
);
