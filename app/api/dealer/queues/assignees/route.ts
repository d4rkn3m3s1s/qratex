import { defineRoute, ok } from '@/lib/http/define-route';
import { loadAssigneeDirectory } from '@/lib/dealer-queues/assignees';

export const dynamic = 'force-dynamic';

/** Atanabilir kişiler: işletme sahibi + AKTİF personel (ad + rol; e-posta yok — P0-11). */
export const GET = defineRoute(
  {
    name: 'dealer.queues.assignees',
    roles: ['DEALER', 'ADMIN'],
    tenant: 'dealer',
    rateLimit: 'read',
  },
  async ({ tenant }) => ok({ items: (await loadAssigneeDirectory(tenant.dealerId, tenant.actorId)).list })
);
