/** GET /api/admin/surprise-box/recipients?q= — alıcı seçicisi (yalnız müşteriler, en çok 8). */
import { defineRoute, ok } from '@/lib/http/define-route';
import { recipientSearchSchema } from '@/lib/admin-surprise-boxes/contract';
import { searchRecipients } from '@/lib/admin-surprise-boxes/server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'admin.surpriseBox.recipients', roles: ['ADMIN'], query: recipientSearchSchema, rateLimit: 'read' },
  async ({ query }) => ok(await searchRecipients(query.q))
);
