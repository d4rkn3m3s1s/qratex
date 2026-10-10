/**
 * Otomatik kayıp müdahalesi ayarı (Müşteriler → Risk → "Otomasyon").
 *
 *   GET   ?thresholdPercent=60&inactiveDays=14 → kayıtlı ayar + bu eşiklerle ŞU AN işaretlenecek
 *         müşteri sayısı (canlı önizleme; yalnız bu işletmenin verisi).
 *   PATCH { enabled?, thresholdPercent?, inactiveDays?, autoOffer?, maxPerRun? } → kaydeder.
 *
 * Eşik arayüzde yüzde konuşulur (eskiden 0-1 ondalık girilirdi). Alan bazlı doğrulama hatası
 * `details` ile döner. Günlük iş (`lib/churn-intervention-core`) bu ayarı okur; teklif açıksa
 * müşteriye BAĞLI kişisel teklif taslağı onay kuyruğuna düşer. Modül kapısı: `churn_risk`.
 */
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { defineRoute, ok } from '@/lib/http/define-route';
import { parseChurnInterventionConfig } from '@/lib/churn-intervention-core';
import { loadUniverse } from '@/lib/dealer-customers/server';
import { DAY_MS } from '@/lib/dealer-customers/core';
import type { InterventionConfigDto } from '@/lib/dealer-customers/types';

export const dynamic = 'force-dynamic';

function toDto(raw: unknown): InterventionConfigDto {
  const c = parseChurnInterventionConfig(raw);
  return {
    enabled: c.enabled,
    thresholdPercent: Math.round(c.churnThreshold * 100),
    inactiveDays: c.inactiveDays,
    autoOffer: c.autoFlashOffer,
    maxPerRun: c.maxPerRun,
  };
}

async function matchingCount(dealerId: string, thresholdPercent: number, inactiveDays: number): Promise<number> {
  const now = new Date();
  const universe = await loadUniverse(dealerId, now);
  const cutoff = now.getTime() - inactiveDays * DAY_MS;
  const t = thresholdPercent / 100;
  return universe.rows.filter(
    (r) => r.churnRisk != null && r.churnRisk >= t && (r.lastVisitAt == null || r.lastVisitAt.getTime() < cutoff)
  ).length;
}

const PreviewQuery = z.object({
  thresholdPercent: z.coerce.number().int().min(10).max(95).optional(),
  inactiveDays: z.coerce.number().int().min(1).max(365).optional(),
});

export const GET = defineRoute(
  {
    name: 'dealer.churn-intervention.get',
    roles: ['DEALER', 'STAFF', 'ADMIN'],
    tenant: 'dealer',
    module: 'churn_risk',
    query: PreviewQuery,
    rateLimit: 'read',
  },
  async ({ tenant, query }) => {
    const user = await prisma.user.findUnique({ where: { id: tenant.dealerId }, select: { dealerChurnIntervention: true } });
    const config = toDto(user?.dealerChurnIntervention);
    const threshold = query.thresholdPercent ?? config.thresholdPercent;
    const inactive = query.inactiveDays ?? config.inactiveDays;
    return ok({ config, preview: { thresholdPercent: threshold, inactiveDays: inactive, matching: await matchingCount(tenant.dealerId, threshold, inactive) } });
  }
);

const PatchBody = z
  .object({
    enabled: z.boolean({ invalid_type_error: 'Açık/kapalı değeri geçersiz.' }).optional(),
    thresholdPercent: z
      .number({ invalid_type_error: 'Eşik bir sayı olmalı.' })
      .int('Eşik tam sayı olmalı.')
      .min(10, 'Eşik en az %10 olabilir.')
      .max(95, 'Eşik en fazla %95 olabilir.')
      .optional(),
    inactiveDays: z
      .number({ invalid_type_error: 'Gün sayısı bir sayı olmalı.' })
      .int('Gün sayısı tam sayı olmalı.')
      .min(1, 'En az 1 gün olmalı.')
      .max(365, 'En fazla 365 gün olabilir.')
      .optional(),
    autoOffer: z.boolean({ invalid_type_error: 'Teklif tercihi geçersiz.' }).optional(),
    maxPerRun: z
      .number({ invalid_type_error: 'Günlük üst sınır bir sayı olmalı.' })
      .int('Günlük üst sınır tam sayı olmalı.')
      .min(1, 'Günlük üst sınır en az 1 olmalı.')
      .max(100, 'Günlük üst sınır en fazla 100 olabilir.')
      .optional(),
  })
  .strict();

export const PATCH = defineRoute(
  {
    name: 'dealer.churn-intervention.patch',
    roles: ['DEALER'],
    tenant: 'dealer',
    module: 'churn_risk',
    schema: PatchBody,
    rateLimit: 'mutation',
  },
  async ({ tenant, body }) => {
    const current = await prisma.user.findUnique({ where: { id: tenant.dealerId }, select: { dealerChurnIntervention: true } });
    const base = parseChurnInterventionConfig(current?.dealerChurnIntervention);
    const merged = {
      ...base,
      ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
      ...(body.thresholdPercent !== undefined ? { churnThreshold: body.thresholdPercent / 100 } : {}),
      ...(body.inactiveDays !== undefined ? { inactiveDays: body.inactiveDays } : {}),
      ...(body.autoOffer !== undefined ? { autoFlashOffer: body.autoOffer } : {}),
      ...(body.maxPerRun !== undefined ? { maxPerRun: body.maxPerRun } : {}),
    };
    await prisma.user.update({ where: { id: tenant.dealerId }, data: { dealerChurnIntervention: merged as object } });
    const config = toDto(merged);
    return ok({
      config,
      preview: {
        thresholdPercent: config.thresholdPercent,
        inactiveDays: config.inactiveDays,
        matching: await matchingCount(tenant.dealerId, config.thresholdPercent, config.inactiveDays),
      },
    });
  }
);
