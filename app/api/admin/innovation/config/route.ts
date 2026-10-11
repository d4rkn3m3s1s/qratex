/**
 * /api/admin/innovation/config — GERİYE UYUMLU yapılandırma ucu (yeni arayüz:
 * `/api/admin/segments/modules`). Rapor Bulgu 4/5 kapatıldı:
 *  - GET webhook gizli değerini DÖNDÜRMEZ (yalnız `hasSecret` + son 4); kullanılmayan denetim sorgusu kaldırıldı.
 *  - PUT katı zod ile doğrulanır (bilinmeyen alan/yanlış tip 400), bölüm bölüm aynı denetimli yazıcıdan geçer;
 *    gizli değer bu uçtan yazılamaz (yalnız `/api/admin/segments/modules/rotate-secret`).
 */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import {
  currentModulesVersion,
  getMaskedConfig,
  patchCampaignAb,
  patchModules,
} from '@/components/admin/a-segmentler/server/modules';
import { MODULE_FEATURE_KEYS } from '@/components/admin/a-segmentler/domain';

export const dynamic = 'force-dynamic';

const experiment = z
  .object({
    id: z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/),
    name: z.string().min(1).max(120),
    variantA: z.string().max(500),
    variantB: z.string().max(500),
    active: z.boolean(),
    dimension: z.enum(['copy', 'push_title', 'push_hour', 'banner_image']).optional(),
    pushTitleA: z.string().max(200).optional(),
    pushTitleB: z.string().max(200).optional(),
    pushHourA: z.string().max(10).optional(),
    pushHourB: z.string().max(10).optional(),
    bannerImageUrlA: z.string().url().max(500).optional(),
    bannerImageUrlB: z.string().url().max(500).optional(),
    splitPercentB: z.number().int().min(1).max(99).optional(),
  })
  .strict();

const PutBody = z
  .object({
    features: z
      .object(Object.fromEntries(MODULE_FEATURE_KEYS.map((k) => [k, z.boolean().optional()])) as Record<(typeof MODULE_FEATURE_KEYS)[number], z.ZodOptional<z.ZodBoolean>>)
      .strict()
      .optional(),
    referral: z
      .object({
        maxInvitesPerReferrerLifetime: z.number().int().min(0).max(10_000),
        maxRedemptionsPerReferralCodePerMonth: z.number().int().min(0).max(10_000),
      })
      .strict()
      .optional(),
    partnerDigest: z.object({ webhookUrl: z.string().max(500), webhookEnabled: z.boolean() }).strict().optional(),
    campaignAb: z
      .object({ defaultSplitPercentForB: z.number().int().min(1).max(99), experiments: z.array(experiment).max(50) })
      .strict()
      .optional(),
  })
  .strict();

export const GET = defineRoute({ name: 'admin.innovation.config.get', roles: ['ADMIN'], rateLimit: 'read' }, async () => ok({
  config: await getMaskedConfig(),
}, { legacySpread: true }));

export const PUT = defineRoute(
  { name: 'admin.innovation.config.put', roles: ['ADMIN'], schema: PutBody, rateLimit: 'mutation' },
  async ({ body, user, request }) => {
    const actor = { id: user.id, role: user.role, ...getAuditRequestMeta(request) };
    if (body.features && Object.keys(body.features).length) {
      await patchModules({ section: 'features', features: body.features }, await currentModulesVersion(), actor).catch((e: unknown) => {
        // "Değişiklik yok" eski istemci için hata değildir.
        if ((e as { code?: string }).code !== 'BAD_REQUEST') throw e;
      });
    }
    if (body.referral) await patchModules({ section: 'referral', referral: body.referral }, await currentModulesVersion(), actor);
    if (body.partnerDigest) {
      await patchModules(
        { section: 'partnerDigest', partnerDigest: { enabled: body.partnerDigest.webhookEnabled, url: body.partnerDigest.webhookUrl } },
        await currentModulesVersion(),
        actor
      );
    }
    if (body.campaignAb) await patchCampaignAb(body.campaignAb, await currentModulesVersion(), actor);
    return ok({ config: await getMaskedConfig() }, { legacySpread: true });
  }
);
