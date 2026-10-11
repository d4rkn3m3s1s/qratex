/** POST /api/admin/badges/lab/preview — açılış önizleme yükü (müşteri ucuyla aynı biçim; yazma yok). */
import { defineRoute, ok } from '@/lib/http/define-route';
import { labPreviewSchema } from '@/lib/admin-badges/contract';
import { buildRevealPreview } from '@/lib/admin-badges/lab.server';

export const dynamic = 'force-dynamic';

export const POST = defineRoute(
  { name: 'admin.badges.lab.preview', roles: ['ADMIN'], schema: labPreviewSchema, rateLimit: 'read' },
  async ({ body }) => ok(await buildRevealPreview(body))
);
