/**
 * GET /api/customer/voices/[key] — tek sesin detayı (Seslerim çekmecesi).
 *
 *   key = fb-<feedbackId>  → QR geri bildirimi: metin, medya, işletme yanıtı, kronolojik
 *                            yolculuk, telafi teklifleri, "AI ne anladı" (modül açıksa)
 *   key = cs-<consumptionId> → tüketim makbuzu + (varsa) yorum, yanıt, telafi; yorum yoksa
 *                            sunucu otoriter ödül önizlemesiyle yazma izni
 *
 * Başkasının kaydı ile olmayan kayıt aynı 404'ü alır. Moderasyonla kaldırılan QR geri
 * bildirimi `VOICE_REMOVED` (404) ile açıklanır.
 */
import { z } from 'zod';
import { ApiError, defineRoute, ok } from '@/lib/http/define-route';
import { getVoiceDetail, VoiceNotFoundError } from '@/lib/customer-voices/server';

export const dynamic = 'force-dynamic';

const paramsSchema = z.object({ key: z.string().regex(/^(fb|cs)-[A-Za-z0-9_-]{1,64}$/, 'Geçersiz kayıt anahtarı.') });

export const GET = defineRoute(
  { name: 'customer.voices.detail', roles: ['CUSTOMER'], rateLimit: 'read', params: paramsSchema },
  async ({ params, user }) => {
    try {
      return ok(await getVoiceDetail(user.id, params.key));
    } catch (err) {
      if (err instanceof VoiceNotFoundError) throw new ApiError(err.code, err.message, { status: 404 });
      throw err;
    }
  }
);
