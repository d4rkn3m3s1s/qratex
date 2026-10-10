/**
 * POST /api/dealer/inbox/[key]/suggest — AI yanıt taslakları (Profesyonel · Sıcak · Çözüm
 * odaklı). Tek AI geçidi (`suggestResponseWithGroq`: bayi AI anahtarı, kiracı bütçesi, prompt
 * enjeksiyonu süzgeci, maliyet kaydı) + `ai` hız sınırı. Taslak müşteriye GİTMEZ; bayi
 * editörde düzenleyip kendisi gönderir. AI yoksa boş liste + dürüst neden (şablon "AI" değildir).
 */
import { z } from 'zod';
import { ApiError, defineRoute, ok } from '@/lib/http/define-route';
import { InboxError, suggestInboxReplies } from '@/lib/dealer-inbox/server';

export const dynamic = 'force-dynamic';

const paramsSchema = z.object({ key: z.string().regex(/^(qr|cr)-[A-Za-z0-9_-]{1,64}$/, 'Geçersiz kayıt anahtarı.') });

export const POST = defineRoute(
  {
    name: 'dealer.inbox.suggest',
    roles: ['DEALER', 'STAFF'],
    tenant: 'dealer',
    rateLimit: 'ai',
    params: paramsSchema,
  },
  async ({ params, tenant, user }) => {
    try {
      return ok(await suggestInboxReplies(tenant.dealerId, user.id, params.key));
    } catch (err) {
      if (err instanceof InboxError) throw new ApiError(err.code, err.message, { status: err.status, details: err.details });
      throw err;
    }
  }
);
