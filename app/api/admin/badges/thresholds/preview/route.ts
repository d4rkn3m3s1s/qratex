/** POST /api/admin/badges/thresholds/preview — taslak eşiklerin etkisi (yazma yok, tek toplu sorgu). */
import { defineRoute, ok } from '@/lib/http/define-route';
import { thresholdsPreviewSchema } from '@/lib/admin-badges/contract';
import { previewThresholdImpact } from '@/lib/admin-badges/thresholds.server';

export const dynamic = 'force-dynamic';

export const POST = defineRoute(
  {
    name: 'admin.badges.thresholds.preview',
    roles: ['ADMIN'],
    schema: thresholdsPreviewSchema,
    rateLimit: { max: 20, windowMs: 60_000, by: 'user-or-ip' },
  },
  async ({ body }) => ok(await previewThresholdImpact(body.overrides))
);
