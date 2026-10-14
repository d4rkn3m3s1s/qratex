/**
 * GET /api/files/feedback/[id]/[n] — geri bildirim fotoğrafını (PRIVATE, `feedback/` öneki)
 * yetkili uçtan akıtır. Kural (varsayılan reddet, varlık sızdırmamak için 404):
 *  - ADMIN: her geri bildirim
 *  - DEALER: yalnız kendi QR'ına gelen geri bildirim
 *  - STAFF: yalnız AKTİF bağlı olduğu bayinin geri bildirimi (DB kaynak-doğruluk)
 *  - CUSTOMER: yalnız kendi yazdığı geri bildirim (moderasyonla kaldırılmamışsa)
 */
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { ApiError, defineRoute } from '@/lib/http/define-route';
import { getActiveStaffDealerId } from '@/lib/auth/scope';
import { safeFileHeaders, storedKeyOf } from '@/lib/storage/served-url';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const params = z.object({ id: z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/), n: z.coerce.number().int().min(0).max(20) });

export const GET = defineRoute(
  { name: 'files.feedback.media', roles: ['ADMIN', 'DEALER', 'STAFF', 'CUSTOMER'], params, rateLimit: 'read' },
  async ({ user, params: p }) => {
    const f = await prisma.feedback.findUnique({
      where: { id: p.id },
      select: { id: true, userId: true, media: true, deletedAt: true, qrCode: { select: { dealerId: true } } },
    });
    if (!f) throw new ApiError('NOT_FOUND', 'Dosya bulunamadı.');

    let allowed = false;
    if (user.role === 'ADMIN') allowed = true;
    else if (user.role === 'DEALER') allowed = !!f.qrCode?.dealerId && f.qrCode.dealerId === user.id;
    else if (user.role === 'STAFF') {
      const dealerId = await getActiveStaffDealerId(user.id);
      allowed = !!dealerId && f.qrCode?.dealerId === dealerId;
    } else if (user.role === 'CUSTOMER') allowed = !!f.userId && f.userId === user.id && !f.deletedAt;
    if (!allowed) throw new ApiError('NOT_FOUND', 'Dosya bulunamadı.');

    const raw = Array.isArray(f.media) ? f.media[p.n] : undefined;
    const ref = typeof raw === 'string' ? raw : raw && typeof raw === 'object' ? (raw as { url?: unknown }).url : null;
    const key = storedKeyOf(ref);
    if (!key || !key.startsWith('feedback/')) throw new ApiError('NOT_FOUND', 'Dosya bulunamadı.');

    const { isR2Configured, getR2Object } = await import('@/lib/r2-storage');
    if (!isR2Configured()) throw new ApiError('SERVICE_UNAVAILABLE', 'Dosya deposuna şu anda ulaşılamıyor.');
    const obj = await getR2Object(key);
    if (!obj) throw new ApiError('NOT_FOUND', 'Dosya bulunamadı.');
    // Yüklemede sharp ile JPEG'e yeniden kodlanıyor; tür sabit.
    return new Response(obj.body, {
      status: 200,
      headers: {
        ...safeFileHeaders('image/jpeg', `geri-bildirim-${p.n + 1}.jpg`),
        'Cache-Control': 'private, max-age=600',
        ...(obj.size != null ? { 'Content-Length': String(obj.size) } : {}),
      },
    });
  }
);
