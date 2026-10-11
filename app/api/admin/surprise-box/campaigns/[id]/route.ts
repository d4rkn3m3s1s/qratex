/** GET /api/admin/surprise-box/campaigns/[id] — kampanya ayrıntısı: alıcılar, açılış, denetim izi. */
import { defineRoute, ok } from '@/lib/http/define-route';
import { campaignKeySchema } from '@/lib/admin-surprise-boxes/contract';
import { getCampaign } from '@/lib/admin-surprise-boxes/server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'admin.surpriseBox.detail', roles: ['ADMIN'], params: campaignKeySchema, rateLimit: 'read' },
  async ({ params }) => ok(await getCampaign(params.id))
);
