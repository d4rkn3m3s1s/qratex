/**
 * `GET /api/dealer/insights/evidence?theme=<anahtar>|rec=<kimlik>|entity=<tür:ad>` — bir
 * temanın / önerinin / varlığın arkasındaki geri bildirimler (imleçli sayfa).
 *
 * DEALER + ADMIN (salt-okunur). Dönem/şube sözleşmesi İçgörüler sayfasıyla aynı.
 */
import { z } from 'zod';
import { ApiError, defineRoute, ok } from '@/lib/http/define-route';
import { COMPARE_MODES, DATE_RANGE_PRESETS, isValidDay } from '@/components/ds/page/date-range';
import { objectParams, parseInsightsSearch, parseLocationParam } from '@/lib/dealer-insights/params';
import { loadEvidence, type EvidenceFilter } from '@/lib/dealer-insights/evidence';

export const dynamic = 'force-dynamic';

const day = z.string().refine((v) => isValidDay(v));
const Query = z
  .object({
    period: z.enum(DATE_RANGE_PRESETS as unknown as [string, ...string[]]).optional(),
    from: day.optional(),
    to: day.optional(),
    compare: z.enum(COMPARE_MODES as unknown as [string, ...string[]]).optional(),
    location: z.string().refine((v) => parseLocationParam(v) !== null).optional(),
    theme: z.string().min(1).max(120).optional(),
    rec: z.string().regex(/^r_[0-9a-f]{8}$/).optional(),
    entity: z.string().min(3).max(140).optional(),
    cursor: z.string().max(200).optional(),
    limit: z.coerce.number().int().min(1).max(50).optional(),
    dealerId: z.string().max(191).optional(),
  })
  .refine((v) => (v.from == null) === (v.to == null))
  .refine((v) => [v.theme, v.rec, v.entity].filter(Boolean).length === 1, {
    message: 'Tek bir süzgeç verin: tema, öneri ya da varlık.',
  });

export const GET = defineRoute(
  {
    name: 'dealer.insights.evidence',
    roles: ['DEALER', 'ADMIN'],
    tenant: 'dealer',
    module: 'ai_features',
    rateLimit: 'read',
    query: Query,
  },
  async ({ tenant, query }) => {
    const q = parseInsightsSearch(objectParams(query as Record<string, unknown>));
    const filter: EvidenceFilter | null = query.theme
      ? { kind: 'theme', key: query.theme }
      : query.rec
        ? { kind: 'rec', key: query.rec }
        : query.entity
          ? { kind: 'entity', key: query.entity }
          : null;
    if (!filter) throw new ApiError('VALIDATION');
    return ok(
      await loadEvidence(tenant.dealerId, q, filter, {
        cursor: query.cursor ?? null,
        limit: query.limit,
        canCorrect: tenant.via !== 'admin',
      })
    );
  }
);
