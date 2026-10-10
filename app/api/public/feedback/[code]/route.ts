/**
 * POST /api/public/feedback/[code] — QR geri bildirimi gönder (oturum isteğe bağlı).
 *
 * Varsayılan reddet sözleşmesi (`defineRoute`): açıkça `public`, IP hız sınırı, zod gövde,
 * 32 KB gövde sınırı (fotoğraflar ayrı uçtan R2'ye; burada yalnız URL), `Idempotency-Key`
 * ile tekrar korumalı (çevrimdışı kuyruk ve "yeniden dene" çift kayıt üretmez).
 * Oturum varsa kimlik DB'den doğrulanır (`resolveOptionalViewer`); iş mantığı
 * `lib/feedback-funnel/submit.ts`.
 */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { QR_CODE_PATTERN } from '@/lib/qr-resolve';
import { submitFeedbackSchema } from '@/lib/feedback-funnel/schema';
import { submitFeedback } from '@/lib/feedback-funnel/submit';
import { resolveOptionalViewer } from '@/lib/feedback-funnel/viewer';

export const dynamic = 'force-dynamic';

const params = z.object({ code: z.string().regex(QR_CODE_PATTERN) });

export const POST = defineRoute(
  {
    name: 'public.feedback.submit',
    roles: 'public',
    params,
    schema: submitFeedbackSchema,
    rateLimit: { max: 20, windowMs: 60_000, by: 'ip' },
    idempotent: true,
    maxBodyBytes: 32 * 1024,
  },
  async ({ params: p, body, ip }) => {
    const viewer = await resolveOptionalViewer();
    const result = await submitFeedback({ code: p.code }, body, { viewer, clientId: ip ?? 'unknown' });
    return ok(result, { status: 201 });
  }
);
