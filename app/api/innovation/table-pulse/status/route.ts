/**
 * GET /api/innovation/table-pulse/status?ref=<vaka>&key=<imza> — misafirin sinyal durumu.
 *
 * Herkese açık ama yalnız sinyali gönderen tarayıcının elindeki imzalı, süreli anahtarla
 * (lib/table-signal/status-key). Yanıt yalnız aşama + zaman: vaka içeriği, not, atanan
 * personel ya da işletme verisi DÖNMEZ. Vaka çözüldüyse bağlı masa sinyali de kapatılır.
 */
import { z } from 'zod';
import { ApiError, defineRoute, ok } from '@/lib/http/define-route';
import { verifyTrackingKey } from '@/lib/table-signal/status-key';
import { readSignalStatus } from '@/lib/table-signal/service';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  {
    name: 'innovation.table-pulse.status',
    roles: 'public',
    query: z.object({ ref: z.string().min(1).max(64), key: z.string().min(1).max(256) }),
    rateLimit: { max: 60, windowMs: 60_000, by: 'ip' },
  },
  async ({ query }) => {
    if (!verifyTrackingKey(query.ref, query.key)) {
      throw new ApiError('TRACKING_EXPIRED', 'Bu sinyalin takip süresi doldu.', { status: 404 });
    }
    const status = await readSignalStatus(query.ref);
    if (!status) throw new ApiError('NOT_FOUND');
    return ok(status);
  }
);
