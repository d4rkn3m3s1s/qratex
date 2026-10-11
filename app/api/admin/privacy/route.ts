/**
 * KVKK merkezi BFF (/admin/privacy).
 *
 *   GET ?section=overview[&fresh=1]  → ölçülen uyum kontrolleri + özetler (Redis 60 sn; fresh atlar)
 *   GET ?section=retention           → saklama kuralları, bekleyen satır sayıları, temizlik işi durumu
 *   GET ?section=consent&days=7|30|90 → ConsentRecord istatistikleri
 *
 * GET'te yazma ya da LLM yok. Hata "200 + sıfırlar" olarak dönmez; defineRoute zarfı taşır.
 */
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { defineRoute, ok } from '@/lib/http/define-route';
import { getConsentStats, getPrivacyOverview, getRetentionView } from '@/lib/admin-privacy/server';

export const dynamic = 'force-dynamic';

const Query = z.object({
  section: z.enum(['overview', 'retention', 'consent']).default('overview'),
  fresh: z.enum(['1']).optional(),
  days: z.coerce.number().int().refine((d) => d === 7 || d === 30 || d === 90, 'Geçersiz dönem').default(30),
});

const OVERVIEW_CACHE_KEY = 'admin:privacy-overview:v1';

export const GET = defineRoute(
  { name: 'admin.privacy.read', roles: ['ADMIN'], query: Query, rateLimit: 'read' },
  async ({ query }) => {
    if (query.section === 'retention') return ok(await getRetentionView(prisma));
    if (query.section === 'consent') return ok(await getConsentStats(prisma, query.days));

    const { redisGetJson, redisSetJson } = await import('@/lib/redis');
    if (!query.fresh) {
      const cached = await redisGetJson<Awaited<ReturnType<typeof getPrivacyOverview>>>(OVERVIEW_CACHE_KEY);
      if (cached) return ok(cached);
    }
    const overview = await getPrivacyOverview(prisma);
    await redisSetJson(OVERVIEW_CACHE_KEY, overview, 60);
    return ok(overview);
  }
);
