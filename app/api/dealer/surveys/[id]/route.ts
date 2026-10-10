import { z } from 'zod';
import { ApiError, defineRoute, ok } from '@/lib/http/define-route';
import {
  deleteDealerSurvey,
  getSurveyForEditor,
  patchDealerSurvey,
  updateDealerSurvey,
} from '@/lib/dealer-surveys/service.server';
import { parseSurveyWrite, surveyPatchSchema } from '@/lib/dealer-surveys/input';

export const dynamic = 'force-dynamic';

const Params = z.object({ id: z.string().trim().min(1).max(64) });

/** GET — oluşturucu verisi (sorular + yanıt sayısı + yapısal kilit). ADMIN `?dealerId=` ile salt-okunur. */
export const GET = defineRoute(
  { name: 'dealer.surveys.detail', roles: ['DEALER', 'ADMIN'], tenant: 'dealer', module: 'dealer_surveys', params: Params, rateLimit: 'read' },
  async ({ tenant, params }) => ok(await getSurveyForEditor(tenant.dealerId, params.id), { legacySpread: true })
);

/**
 * PUT — anketi düzenle (başlık, açıklama, sorular). Yanıt almış ankette yapısal kilit:
 * soru silme / tip değiştirme / mevcut seçeneği değiştirme 409 STRUCTURE_LOCKED.
 */
export const PUT = defineRoute(
  {
    name: 'dealer.surveys.update',
    roles: ['DEALER'],
    tenant: 'dealer',
    module: 'dealer_surveys',
    params: Params,
    rateLimit: 'mutation',
    schema: z.record(z.string(), z.unknown()),
    maxBodyBytes: 200_000,
  },
  async ({ tenant, params, body }) => {
    const parsed = parseSurveyWrite(body);
    if (!parsed.ok) throw new ApiError('VALIDATION', parsed.message, { status: 400, details: { issues: parsed.issues } });
    const ids = parsed.data.questionIds ?? parsed.data.questions.map(() => null);
    const survey = await updateDealerSurvey(tenant.dealerId, params.id, parsed.data, ids);
    return ok({ survey }, { legacySpread: true });
  }
);

/** PATCH — yayın anahtarı / başlık / açıklama. */
export const PATCH = defineRoute(
  {
    name: 'dealer.surveys.patch',
    roles: ['DEALER'],
    tenant: 'dealer',
    module: 'dealer_surveys',
    params: Params,
    rateLimit: 'mutation',
    schema: surveyPatchSchema,
  },
  async ({ tenant, params, body }) => ok({ survey: await patchDealerSurvey(tenant.dealerId, params.id, body) }, { legacySpread: true })
);

/** DELETE — yalnız yanıtsız anket (yanıtı olan 409 SURVEY_HAS_RESPONSES; yanıtlar korunur). */
export const DELETE = defineRoute(
  { name: 'dealer.surveys.delete', roles: ['DEALER'], tenant: 'dealer', module: 'dealer_surveys', params: Params, rateLimit: 'mutation' },
  async ({ tenant, params }) => {
    await deleteDealerSurvey(tenant.dealerId, params.id);
    return ok({ deleted: true }, { legacySpread: true });
  }
);
