import { z } from 'zod';
import { ApiError, defineRoute, ok } from '@/lib/http/define-route';
import { claimAllQuests, claimQuest, isQuestClaimError } from '@/lib/quests/claim';
import { getAuditRequestMeta } from '@/lib/request-metadata';

export const dynamic = 'force-dynamic';

const bodySchema = z
  .object({
    /** Tek görev. */
    questId: z.string().trim().min(1).max(64).optional(),
    /** "Hepsini al". */
    all: z.literal(true).optional(),
  })
  .strict()
  .refine((b) => !!b.questId !== !!b.all, { message: 'questId ya da all alanlarından yalnız biri gönderilmeli.' });

/**
 * POST /api/customer/quests/claim — görev ödülünü al (tekil `{ questId }` ya da toplu `{ all: true }`).
 *
 * Sunucu ilerlemeyi yeniden hesaplar; otomatik ödenen görevler 409 `QUEST_AUTO_REWARDED`.
 * Ödeme tek sefer (satır kilidi + koşullu güncelleme + defter anahtarı; lib/quests/claim.ts).
 * Hata kodları makine-okurdur (`code`), istemci kendi dilinde gösterir.
 * Yanıt: `{ claimed[], skipped[], totals, balance, xp, level, levelUp }`.
 */
export const POST = defineRoute(
  {
    name: 'customer.quests.claim',
    roles: ['CUSTOMER'],
    module: 'quests',
    schema: bodySchema,
    rateLimit: { max: 30, windowMs: 60_000, by: 'user' },
    idempotent: true,
  },
  async ({ user, body, request }) => {
    const auditMeta = getAuditRequestMeta(request);
    try {
      const result = body.all
        ? await claimAllQuests(user.id, { auditMeta })
        : await claimQuest(user.id, body.questId!, { auditMeta });
      return ok(result);
    } catch (error) {
      if (isQuestClaimError(error)) throw new ApiError(error.code, error.message, { status: error.status });
      throw error;
    }
  }
);
