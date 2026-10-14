/**
 * GET /api/files/public/<key> — PUBLIC sınıf R2 nesnelerini (site görselleri) uygulama üzerinden
 * sunar; bucket'ın r2.dev public erişimi kapatılabilir (docs/ops/R2-GUVENLIK.md).
 *
 * Yalnız izinli önekler (`assets/`, `logos/`, `products/`) ve görsel uzantıları; `..`/boş segment
 * reddedilir. Key'ler rastgele/tekil olduğu için uzun, değişmez önbellek + ETag (304).
 */
import { z } from 'zod';
import { ApiError, defineRoute } from '@/lib/http/define-route';
import { isPublicKey, publicImageType, safeFileHeaders } from '@/lib/storage/served-url';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const params = z.object({ key: z.array(z.string().min(1).max(200)).min(2).max(8) });

/** Herkese açık: site görselleri (rozet/ödül ikonu, bayi logosu, ürün görseli) oturumsuz sayfalarda da görünür. */
export const GET = defineRoute({ name: 'files.public', roles: 'public', params }, async ({ params: p, request }) => {
  const key = p.key.join('/');
  if (!isPublicKey(key)) throw new ApiError('NOT_FOUND', 'Dosya bulunamadı.');
  const contentType = publicImageType(key);
  if (!contentType) throw new ApiError('NOT_FOUND', 'Dosya bulunamadı.');

  const { isR2Configured, getR2Object } = await import('@/lib/r2-storage');
  if (!isR2Configured()) throw new ApiError('SERVICE_UNAVAILABLE', 'Dosya deposuna şu anda ulaşılamıyor.');
  const obj = await getR2Object(key);
  if (!obj) throw new ApiError('NOT_FOUND', 'Dosya bulunamadı.');

  const filename = key.slice(key.lastIndexOf('/') + 1);
  const headers: Record<string, string> = {
    ...safeFileHeaders(contentType, filename),
    'Cache-Control': 'public, max-age=31536000, immutable',
  };
  if (obj.etag) headers.ETag = obj.etag;
  if (obj.lastModified) headers['Last-Modified'] = obj.lastModified.toUTCString();

  const inm = request.headers.get('if-none-match');
  if (obj.etag && inm && inm.split(',').some((t) => t.trim().replace(/^W\//, '') === obj.etag)) {
    await obj.body.cancel().catch(() => undefined);
    return new Response(null, { status: 304, headers });
  }
  if (obj.size != null) headers['Content-Length'] = String(obj.size);
  return new Response(obj.body, { status: 200, headers });
});
