import { z } from 'zod';
import { defineRoute } from '@/lib/http/define-route';
import { buildSurveyCsv } from '@/lib/dealer-surveys/service.server';
import { exportFileSlug } from '@/lib/dealer-surveys/csv';
import { DEFAULT_SURVEY_RANGE, SURVEY_RANGES } from '@/lib/dealer-surveys/types';

export const dynamic = 'force-dynamic';

/**
 * GET — dönemdeki yanıtların CSV'si. Sunucuda üretilir ve doğrudan `Response` olarak döner
 * (istemcide blob kurgusu yok). Formül enjeksiyonu kaçışlı, tarih/saat İstanbul, TR'de `;`.
 * Kişisel kimlik yazılmaz (yalnız Üye/Anonim). Üst sınır aşılırsa `x-export-truncated: 1`.
 */
export const GET = defineRoute(
  {
    name: 'dealer.surveys.export',
    roles: ['DEALER', 'ADMIN'],
    tenant: 'dealer',
    module: 'dealer_surveys',
    rateLimit: { max: 10, windowMs: 60_000, by: 'user' },
    params: z.object({ id: z.string().trim().min(1).max(64) }),
    query: z.object({
      range: z.enum(SURVEY_RANGES).optional().default(DEFAULT_SURVEY_RANGE),
      lang: z.enum(['tr', 'en']).optional().default('tr'),
      dealerId: z.string().optional(),
    }),
  },
  async ({ tenant, params, query, requestId }) => {
    const { csv, title, rows, truncated } = await buildSurveyCsv(tenant.dealerId, params.id, { range: query.range, lang: query.lang });
    const filename = `anket-${exportFileSlug(title)}-${query.range}.csv`;
    return new Response(csv, {
      status: 200,
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="${filename}"`,
        'cache-control': 'private, no-store',
        'x-export-rows': String(rows),
        'x-export-truncated': truncated ? '1' : '0',
        'x-request-id': requestId,
      },
    });
  }
);
