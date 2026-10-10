/**
 * `PATCH /api/dealer/analytics/benchmark/segment` — bayinin kendi sektörünü seçmesi
 * (denetim #39: `businessCategory`'yi yalnız admin bootstrap'ı yazabiliyordu).
 *
 * Kontrollü sözlük (`lib/places/categories` slug'ları); serbest metin kabul edilmez. Aynı alan
 * Keşfet'teki kategori çipini de besler (tek doğruluk kaynağı). Yalnız DEALER kendi profilini
 * yazar (ADMIN bayi adına yazamaz — defineRoute salt-okunur kuralı). Sık değiştirerek farklı
 * segmentleri yoklamaya karşı sıkı hız sınırı; k-anonimlik zaten tekil akran verisi döndürmez.
 */
import { defineRoute, ok } from '@/lib/http/define-route';
import { prisma } from '@/lib/prisma';
import { benchmarkCategorySchema } from '@/lib/dealer-benchmark/params';

export const dynamic = 'force-dynamic';

export const PATCH = defineRoute(
  {
    name: 'dealer.analytics.benchmark.segment',
    roles: ['DEALER'],
    tenant: 'dealer',
    module: 'benchmark',
    rateLimit: { max: 5, windowMs: 15 * 60_000, by: 'user' },
    schema: benchmarkCategorySchema,
  },
  async ({ tenant, body }) => {
    await prisma.user.update({
      where: { id: tenant.dealerId },
      data: { businessCategory: body.category },
      select: { id: true },
    });
    return ok({ category: body.category });
  }
);
