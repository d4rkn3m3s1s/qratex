/**
 * POST /api/public/feedback/[code]/scan — tarama olayı (beacon), tekilleştirilmiş.
 * Sayfa açılınca istemci bir kez çağırır; aynı tarayıcı + aynı QR için 30 dk içinde ikinci
 * olay yazılmaz (httpOnly çerez). Kapalı/bilinmeyen QR'da sessizce sayılmaz (204 benzeri).
 */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { QR_CODE_PATTERN } from '@/lib/qr-resolve';
import { scanBeaconSchema } from '@/lib/feedback-funnel/schema';
import { recordScan, scanCookieName, SCAN_DEDUPE_SECONDS } from '@/lib/feedback-funnel/scan';
import { requireOpenQr } from '@/lib/feedback-funnel/submit';

export const dynamic = 'force-dynamic';

const params = z.object({ code: z.string().regex(QR_CODE_PATTERN) });

export const POST = defineRoute(
  {
    name: 'public.feedback.scan',
    roles: 'public',
    params,
    schema: scanBeaconSchema,
    rateLimit: { max: 30, windowMs: 60_000, by: 'ip' },
    maxBodyBytes: 4 * 1024,
  },
  async ({ params: p, body, request }) => {
    const qr = await requireOpenQr({ code: p.code });
    const cookie = scanCookieName(qr.id);
    if (request.cookies.get(cookie)?.value) return ok({ counted: false });
    await recordScan(qr, body ?? {});
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    return ok(
      { counted: true },
      {
        headers: {
          'Set-Cookie': `${cookie}=1; Path=/; Max-Age=${SCAN_DEDUPE_SECONDS}; HttpOnly; SameSite=Lax${secure}`,
        },
      }
    );
  }
);
