/**
 * GET /api/admin/inbox/[id]/attachments/[n] — eki YETKİLİ uçtan akıtır (public R2 URL'si istemciye
 * verilmez). Önizlenebilir güvenli türler `inline`; geri kalan her şey (HTML, SVG, XHTML dahil)
 * `attachment` + `application/octet-stream` + `nosniff` (denetim Bulgu 2).
 */
import { z } from 'zod';
import { ApiError, defineRoute } from '@/lib/http/define-route';
import { getAttachment } from '@/lib/mail-center/inbox.server';
import { attachmentDisposition } from '@/lib/mail-center/mail-html';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export const GET = defineRoute(
  {
    name: 'admin.inbox.attachment',
    roles: ['ADMIN'],
    params: z.object({ id: z.string().min(1).max(40), n: z.coerce.number().int().min(0).max(200) }),
    rateLimit: 'read',
  },
  async ({ params }) => {
    const att = await getAttachment(params.id, params.n);
    const { isR2Configured, keyFromPublicUrl, getR2Object } = await import('@/lib/r2-storage');
    // DB'de çıplak key (yeni) ya da eski tam public URL; yalnız `inbox/` öneki sunulur.
    const key = att.url ? keyFromPublicUrl(att.url) : null;
    if (key && !key.startsWith('inbox/')) throw new ApiError('NOT_FOUND', 'Ek bulunamadı.');
    if (!isR2Configured() || !key) throw new ApiError('SERVICE_UNAVAILABLE', 'Ek deposuna şu anda ulaşılamıyor.');
    const obj = await getR2Object(key);
    if (!obj) throw new ApiError('NOT_FOUND', 'Ek depoda bulunamadı.');
    const { contentType, disposition } = attachmentDisposition(att.contentType, att.filename);
    return new Response(obj.body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': disposition,
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'; sandbox",
        'Cache-Control': 'private, no-store',
        ...(obj.size != null ? { 'Content-Length': String(obj.size) } : {}),
      },
    });
  }
);
