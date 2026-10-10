import { z } from 'zod';
import { ApiError, defineRoute, ok } from '@/lib/http/define-route';
import { createDealerSurvey, listDealerSurveys } from '@/lib/dealer-surveys/service.server';
import { parseSurveyWrite } from '@/lib/dealer-surveys/input';

export const dynamic = 'force-dynamic';

/**
 * Bayi anketleri — liste + oluşturma (BFF). Kimlik/rol DB'den (`requireAuth`), kiracı kapsamı
 * `resolveDealerScope` (ADMIN yalnız `?dealerId=` ile ve SALT-OKUNUR), modül kapısı
 * `dealer_surveys` API düzeyinde (denetim: menüyü gizlemek yetmiyordu).
 */
export const GET = defineRoute(
  { name: 'dealer.surveys.list', roles: ['DEALER', 'ADMIN'], tenant: 'dealer', module: 'dealer_surveys', rateLimit: 'read' },
  async ({ tenant }) => ok(await listDealerSurveys(tenant.dealerId), { legacySpread: true })
);

/** Gövde önce nesne olarak alınır; asıl doğrulama ortak sözleşmeyle (soru indeksli hata). */
const Body = z.record(z.string(), z.unknown());

export const POST = defineRoute(
  {
    name: 'dealer.surveys.create',
    roles: ['DEALER'],
    tenant: 'dealer',
    module: 'dealer_surveys',
    rateLimit: 'mutation',
    schema: Body,
    maxBodyBytes: 200_000,
  },
  async ({ tenant, body }) => {
    const parsed = parseSurveyWrite(body);
    if (!parsed.ok) throw new ApiError('VALIDATION', parsed.message, { status: 400, details: { issues: parsed.issues } });
    const survey = await createDealerSurvey(tenant.dealerId, parsed.data, parsed.data.publish !== false);
    return ok({ survey }, { status: 201, legacySpread: true });
  }
);
