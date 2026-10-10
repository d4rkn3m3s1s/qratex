/**
 * `POST /api/dealer/catalog/images` — ürün görseli yükle (multipart `photo`, ≤ 4 MB).
 * Biçim baytlardan doğrulanır, sharp ile yeniden kodlanır (EXIF/konum atılır), R2'ye
 * `products/<bayi>/…` altına yazılır. Ürüne yalnız bu alandaki URL yazılabilir.
 */
import { ApiError, defineRoute, ok } from '@/lib/http/define-route';
import { MAX_UPLOAD_BYTES } from '@/lib/feedback-funnel/media';
import { uploadProductImage } from '@/lib/dealer/catalog/mutations';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const POST = defineRoute(
  {
    name: 'dealer.catalog.images',
    roles: ['DEALER'],
    tenant: 'dealer',
    rateLimit: { max: 30, windowMs: 10 * 60_000, by: 'user' },
  },
  async ({ tenant, request }) => {
    const declared = Number(request.headers.get('content-length') ?? '');
    if (Number.isFinite(declared) && declared > MAX_UPLOAD_BYTES + 64 * 1024) {
      throw new ApiError('PAYLOAD_TOO_LARGE', 'Görsel çok büyük (en fazla 4 MB).');
    }
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw new ApiError('BAD_REQUEST', 'Görsel okunamadı.');
    }
    const file = form.get('photo');
    if (!file || typeof file === 'string') throw new ApiError('VALIDATION', 'Görsel seçilmedi.');
    return ok(await uploadProductImage(tenant.dealerId, file), { status: 201 });
  }
);
