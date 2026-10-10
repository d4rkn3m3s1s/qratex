/**
 * `PUT /api/dealer/analytics/impact/settings` — Etki ekranının varsayımları ve hedefleri.
 *
 * Varsayımlar hesabın kendisini değiştirir (geri dönüş penceresi, tahmini ek ciroda kullanılan
 * ortalama sepet); sunucu kaydeder ve bir sonraki okuma bunlarla hesaplar (sunucu otoriter,
 * §4.4/6). Hedefler KPI kartlarında "hedef tuttu / tutmadı" olarak görünür. Yalnız DEALER
 * yazar; gövde sıkı zod şeması (bilinmeyen alan 400).
 */
import { defineRoute, ok } from '@/lib/http/define-route';
import { impactSettingsSchema } from '@/lib/dealer-impact/core';
import { writeImpactSettings } from '@/lib/dealer-impact/load';

export const dynamic = 'force-dynamic';

export const PUT = defineRoute(
  {
    name: 'dealer.analytics.impact.settings',
    roles: ['DEALER'],
    tenant: 'dealer',
    module: 'roi',
    rateLimit: 'mutation',
    schema: impactSettingsSchema,
  },
  async ({ tenant, body }) => ok(await writeImpactSettings(tenant.dealerId, body))
);
