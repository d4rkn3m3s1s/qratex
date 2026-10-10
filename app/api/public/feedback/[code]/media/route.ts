/**
 * POST /api/public/feedback/[code]/media — tek geri bildirim fotoğrafı yükle (multipart `photo`).
 *
 * Eski akış base64'ü JSON gövdesine koyup Postgres'e yazıyordu (Vercel 4,5 MB sınırında 413,
 * DB'de megabaytlarca base64). Şimdi: QR açık olmalı, IP başına 10 dk'da 12 yükleme, dosya
 * ≤ 4 MB (istemci ~1,5 MB'a küçültür), biçim BAYTLARDAN doğrulanır, sharp ile yeniden
 * kodlanır (EXIF/konum dahil tüm meta veri atılır) ve R2'ye yazılır. Yanıt yalnız HTTPS URL.
 * Gönderim ucu yalnız bu biçimdeki, bu QR'a ait URL'leri kabul eder.
 */
import { z } from 'zod';
import { ApiError, defineRoute, ok } from '@/lib/http/define-route';
import { QR_CODE_PATTERN } from '@/lib/qr-resolve';
import { uploadToR2 } from '@/lib/r2-storage';
import { requireOpenQr } from '@/lib/feedback-funnel/submit';
import { feedbackPhotosEnabled, MAX_UPLOAD_BYTES, newMediaKey, processFeedbackPhoto } from '@/lib/feedback-funnel/media';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const params = z.object({ code: z.string().regex(QR_CODE_PATTERN) });

export const POST = defineRoute(
  {
    name: 'public.feedback.media',
    roles: 'public',
    params,
    rateLimit: { max: 12, windowMs: 10 * 60_000, by: 'ip' },
  },
  async ({ params: p, request }) => {
    if (!feedbackPhotosEnabled()) {
      throw new ApiError('SERVICE_UNAVAILABLE', 'Fotoğraf yükleme şu anda kullanılamıyor.', { retryable: false });
    }
    const declared = Number(request.headers.get('content-length') ?? '');
    if (Number.isFinite(declared) && declared > MAX_UPLOAD_BYTES + 64 * 1024) {
      throw new ApiError('PAYLOAD_TOO_LARGE', 'Fotoğraf çok büyük (en fazla 4 MB).');
    }
    const qr = await requireOpenQr({ code: p.code });

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw new ApiError('BAD_REQUEST', 'Fotoğraf okunamadı.');
    }
    const file = form.get('photo');
    if (!file || typeof file === 'string') throw new ApiError('VALIDATION', 'Fotoğraf seçilmedi.');
    if (file.size > MAX_UPLOAD_BYTES) throw new ApiError('PAYLOAD_TOO_LARGE', 'Fotoğraf çok büyük (en fazla 4 MB).');

    const processed = await processFeedbackPhoto(Buffer.from(await file.arrayBuffer()));
    if (!processed) throw new ApiError('VALIDATION', 'Yalnız JPEG, PNG, WebP ya da HEIC fotoğraf yüklenebilir.');

    const url = await uploadToR2(newMediaKey(qr.id), processed.buffer, 'image/jpeg', 'inline');
    return ok({ url, width: processed.width, height: processed.height }, { status: 201 });
  }
);
