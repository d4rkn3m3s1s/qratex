/** POST /api/admin/badges/lab/classify — canlı sınıflandırma (üretim seçicisiyle; AI hız sınırlı, yazma yok). */
import { defineRoute, ok } from '@/lib/http/define-route';
import { labClassifySchema } from '@/lib/admin-badges/contract';
import { classifyForLab } from '@/lib/admin-badges/lab.server';

export const dynamic = 'force-dynamic';

export const POST = defineRoute(
  { name: 'admin.badges.lab.classify', roles: ['ADMIN'], schema: labClassifySchema, rateLimit: 'ai' },
  async ({ body }) => ok(await classifyForLab(body.text))
);
