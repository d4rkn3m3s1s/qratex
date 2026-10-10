/**
 * POST /api/customer/scan/resolve — uygulama içi tarama çözümü (Tara yüzeyinin BFF'i).
 *
 *   gövde: { text: string, source: 'camera' | 'manual' | 'gallery' | 'link' }
 *   yanıt: { result: ScanResolution }   (bkz. components/customer/m-tara/scan-types.ts)
 *
 * POST: okunan içerik (kart token'ı dahil) URL'ye/erişim günlüğüne düşmesin.
 * Yan etki yalnız huni olayı `in_app_scan_resolved` (userId + kaynak + sonuç). `qr_scanned`
 * yazılmaz — o olay geri bildirim sayfası açıldığında BİR kez yazılır (B-7).
 */
import { after } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { defineRoute, ok } from '@/lib/http/define-route';
import { MAX_QR_PAYLOAD_LENGTH } from '@/lib/qr-resolve';
import { resolveScanForCustomer, resolutionOutcome } from '@/app/customer/scan/_server/resolve-scan';

export const dynamic = 'force-dynamic';

const Body = z.object({
  text: z.string().min(1).max(MAX_QR_PAYLOAD_LENGTH),
  source: z.enum(['camera', 'manual', 'gallery', 'link']),
});

export const POST = defineRoute(
  {
    name: 'customer.scan.resolve',
    roles: ['CUSTOMER'],
    schema: Body,
    // Kamerada aynı kod dedupe edilir; dakikada 40 çözüm insan kullanımına fazlasıyla yeter,
    // kod/token taramasını (enumeration) ise keser.
    rateLimit: { max: 40, windowMs: 60_000, by: 'user' },
    maxBodyBytes: 8_192,
  },
  async ({ user, body }) => {
    const { result } = await resolveScanForCustomer(user.id, body.text);

    const writeEvent = async () => {
      try {
        await prisma.analyticsEvent.create({
          data: {
            userId: user.id,
            event: 'in_app_scan_resolved',
            category: 'qr',
            data: { source: body.source, outcome: resolutionOutcome(result) },
          },
        });
      } catch (err) {
        console.warn('[scan.resolve] huni olayı yazılamadı', err);
      }
    };
    try {
      after(writeEvent);
    } catch {
      // İstek kapsamı dışında (test) → hemen yaz.
      await writeEvent();
    }

    return ok({ result });
  }
);
