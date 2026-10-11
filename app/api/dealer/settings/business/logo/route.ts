/**
 * `POST /api/dealer/settings/business/logo` — işletme logosu (multipart `photo`, ≤ 4 MB).
 * Biçim baytlardan doğrulanır, yeniden kodlanır (EXIF/konum atılır), R2 `logos/<bayi>/…`
 * altına yazılır; eski logo silinir. Müşteri kartları (`businessLogo`) bunu okur.
 * `DELETE` — logoyu kaldırır (baş harf gösterilir).
 */
import { ApiError, defineRoute, ok } from '@/lib/http/define-route';
import { MAX_UPLOAD_BYTES } from '@/lib/feedback-funnel/media';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { removeDealerLogo, uploadDealerLogo } from '@/lib/dealer-settings/write.server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const POST = defineRoute(
  { name: 'dealer.settings.logo.upload', roles: ['DEALER'], rateLimit: { max: 20, windowMs: 10 * 60_000, by: 'user' } },
  async ({ user, request }) => {
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
    return ok(await uploadDealerLogo(user.id, file, getAuditRequestMeta(request)), { status: 201 });
  }
);

export const DELETE = defineRoute(
  { name: 'dealer.settings.logo.remove', roles: ['DEALER'], rateLimit: 'mutation' },
  async ({ user, request }) => {
    await removeDealerLogo(user.id, getAuditRequestMeta(request));
    return ok({ logo: null });
  }
);
