/**
 * Mağaza ekranı akışı (GET, OTURUMSUZ). Token → bayi; yalnız yayınlanabilir alanlar (maskeli ad,
 * gizlenmiş metin). IP başına sınırlı. Geçersiz/iptal/süresi dolmuş bağlantı 404 (ayrım sızdırmaz).
 */
import { z } from 'zod';
import { ApiError, defineRoute, ok } from '@/lib/http/define-route';
import { isWallModuleEnabled, loadWallFeed, resolveDisplayToken } from '@/lib/dealer/voc-wall/server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  {
    name: 'wall.display.feed',
    roles: 'public',
    rateLimit: { max: 30, windowMs: 60_000, by: 'ip' },
    params: z.object({ token: z.string().min(1).max(128) }),
  },
  async ({ params }) => {
    const resolved = await resolveDisplayToken(params.token);
    if (!resolved.ok) throw new ApiError('NOT_FOUND', 'Ekran bağlantısı geçersiz ya da iptal edilmiş.');
    if (!(await isWallModuleEnabled())) throw new ApiError('MODULE_DISABLED');
    return ok(await loadWallFeed(resolved.dealerId, resolved.config, resolved.display.qrCodeId));
  }
);
