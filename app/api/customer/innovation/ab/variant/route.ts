import { z } from 'zod';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getClientIp, getUserAgent } from '@/lib/request-metadata';
import { defineRoute, ok } from '@/lib/http/define-route';
import { getInnovationPlatformConfig } from '@/lib/innovation-config';
import { pickAbVariant, recordInnovationAbEvent } from '@/lib/innovation-ab';
import { getModuleControls } from '@/lib/module-gate';

export const dynamic = 'force-dynamic';

const Query = z.object({ experimentId: z.string().trim().min(1, 'experimentId gerekli').max(64) });

/**
 * Müşteri için A/B varyantı (oturum ya da anonim yapışkan anahtar); gösterim AnalyticsEvent'e yazılır.
 * Deney yönetimi: /admin/features?tab=deneyler. `ab_testing` modül anahtarı kapalıysa (acil durdurma)
 * herkes kontrol (A) varyantını alır ve gösterim kaydedilmez.
 */
export const GET = defineRoute(
  { name: 'customer.innovation.ab.variant', roles: 'public', query: Query, rateLimit: 'read' },
  async ({ query, request }) => {
    const [cfg, controls] = await Promise.all([getInnovationPlatformConfig(), getModuleControls()]);
    const experimentId = query.experimentId;
    const exp = controls.ab_testing === false ? null : cfg.campaignAb.experiments.find((e) => e.id === experimentId && e.active);
    if (!exp) {
      return ok({ experimentId, variant: 'A' as const, active: false, copy: '', message: 'Deney kapalı veya bulunamadı' }, { legacySpread: true });
    }

    const session = await getServerSession(authOptions);
    const ip = getClientIp(request) || '0';
    const ua = getUserAgent(request) || '';
    const stickySeed = session?.user?.id ?? `${ip}:${ua}`.slice(0, 200);
    const { variant } = pickAbVariant(cfg, experimentId, stickySeed);

    await recordInnovationAbEvent(session?.user?.id ?? null, experimentId, variant, 'impression', { dimension: exp.dimension || 'copy' });

    const copy = variant === 'A' ? exp.variantA : exp.variantB;
    return ok(
      {
        experimentId,
        variant,
        active: true,
        name: exp.name,
        dimension: exp.dimension || 'copy',
        copy,
        pushTitle: variant === 'A' ? (exp.pushTitleA ?? copy) : (exp.pushTitleB ?? copy),
        pushHour: variant === 'A' ? (exp.pushHourA ?? '18:00') : (exp.pushHourB ?? '19:00'),
        bannerImageUrl: variant === 'A' ? (exp.bannerImageUrlA ?? '') : (exp.bannerImageUrlB ?? ''),
      },
      { legacySpread: true }
    );
  }
);
