import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { getWorkSummary, listWork } from '@/lib/dealer-queues/work-server';
import { WORK_KIND_FILTERS, WORK_PAGE_SIZE, WORK_SCOPES } from '@/lib/dealer-queues/work-core';
import { normalizeSearch } from '@/lib/dealer-queues/remedy-core';
import { loadAssigneeDirectory } from '@/lib/dealer-queues/assignees';
import { actorOf, isModuleOn } from '@/lib/dealer-queues/route-helpers';
import type { WorkListResponse } from '@/lib/dealer-queues/types';

export const dynamic = 'force-dynamic';

const Query = z.object({
  scope: z.enum(WORK_SCOPES).catch('mine'),
  kind: z.enum(WORK_KIND_FILTERS).catch('all'),
  q: z.string().optional().transform((v) => normalizeSearch(v)),
  offset: z.coerce.number().int().min(0).max(5000).catch(0),
});

/**
 * Gelen Kutusu → Bana atananlar: görev + vaka birleşik kuyruğu (geciken → öncelik → son
 * tarih) ve özet. SALT OKUMA — eski aksiyon listesinin LLM/kayıt üreten yan etkisi yok.
 * Personel (STAFF) yalnız kendine atananları görür. Vaka modülü kapalıysa vakalar listelenmez.
 */
export const GET = defineRoute(
  {
    name: 'dealer.queues.work.list',
    roles: ['DEALER', 'ADMIN', 'STAFF'],
    tenant: 'dealer',
    module: 'action_items',
    rateLimit: 'read',
    query: Query,
  },
  async ({ tenant, query, session }) => {
    const actor = actorOf(tenant, session);
    const [dir, incidentsEnabled] = await Promise.all([loadAssigneeDirectory(tenant.dealerId, tenant.actorId), isModuleOn('incidents')]);
    const [list, summary] = await Promise.all([
      listWork(
        tenant.dealerId,
        actor,
        { scope: query.scope, kind: query.kind, q: query.q, offset: query.offset, limit: WORK_PAGE_SIZE },
        dir,
        { incidentsEnabled }
      ),
      getWorkSummary(tenant.dealerId, actor, { incidentsEnabled }),
    ]);
    const body: WorkListResponse = { ...list, summary };
    return ok(body);
  }
);
