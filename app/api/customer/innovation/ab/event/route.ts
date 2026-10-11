import { z } from 'zod';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { defineRoute, ok } from '@/lib/http/define-route';
import { recordInnovationAbEvent } from '@/lib/innovation-ab';
import { getInnovationPlatformConfig } from '@/lib/innovation-config';
import { getModuleControls } from '@/lib/module-gate';

export const dynamic = 'force-dynamic';

const Body = z
  .object({
    experimentId: z.string().trim().min(1).max(64),
    variant: z.enum(['A', 'B']),
    kind: z.enum(['conversion']).optional(),
  })
  .strict();

/**
 * Dönüşüm olayı. Yalnız ÇALIŞAN bir deney için ve `ab_testing` anahtarı açıkken kaydedilir;
 * aksi halde sessizce yok sayılır (`recorded: false`) — rastgele kimliklerle istatistik kirletilemez.
 * Oturumsuz yazma olduğu için IP başına hız sınırı uygulanır.
 */
export const POST = defineRoute(
  { name: 'customer.innovation.ab.event', roles: 'public', schema: Body, rateLimit: 'public-write' },
  async ({ body }) => {
    const [cfg, controls] = await Promise.all([getInnovationPlatformConfig(), getModuleControls()]);
    const live = controls.ab_testing !== false && cfg.campaignAb.experiments.some((e) => e.id === body.experimentId && e.active);
    if (!live) return ok({ recorded: false }, { legacySpread: true });
    const session = await getServerSession(authOptions);
    await recordInnovationAbEvent(session?.user?.id ?? null, body.experimentId, body.variant, 'conversion');
    return ok({ recorded: true }, { legacySpread: true });
  }
);
