/**
 * POST /api/innovation/table-pulse — masa sinyali (herkese açık; QR / kiosk).
 *
 * Eski uç (rapor bulgu 1, 3, 4, 7, 8): kimliksiz + sınırsız POST, try/catch yok, `customerId`
 * sessizce yazılıyor, iptal edilmiş QR kabul ediliyor, sunucu metinleri yalnız TR, Zod
 * metinleri İngilizce. Şimdi:
 *  - `defineRoute` (public) + IP başına 8 / 10 dk; ayrıca IP × işletme 4 / 10 dk.
 *  - Aynı masadan aynı türde açık vaka 3 dk içinde tekrar açılmaz (takip anahtarı döner).
 *  - `Idempotency-Key` (çevrimdışı kuyruğun yeniden denemesi çift kayıt üretmez).
 *  - Giriş `qr=<kod>` (önerilen) ya da eski `dealerId[+qrCodeId]`; QR yaşam döngüsü denetlenir.
 *  - Varsayılan ANONİM; `linkAccount: true` + müşteri oturumu varsa hesap ilişkilendirilir.
 *  - Hatalar makine-okur kodla (istemci TR/EN çevirir).
 */
import { z } from 'zod';
import { ApiError, defineRoute, ok } from '@/lib/http/define-route';
import { requireAuth } from '@/lib/api-auth';
import { checkRateLimitDb } from '@/lib/rate-limit';
import {
  CONCERN_REASONS,
  NOTE_MAX,
  REQUEST_TYPES,
  normalizeReasons,
  normalizeTableCode,
  sanitizeNote,
  type SignalKind,
} from '@/lib/table-signal/kinds';
import { resolveSignalVenue } from '@/lib/table-signal/venue';
import { SignalUnavailableError, createTableSignal } from '@/lib/table-signal/service';

export const dynamic = 'force-dynamic';

const body = z
  .object({
    qr: z.string().trim().max(64).optional(),
    dealerId: z.string().trim().max(191).optional(),
    qrCodeId: z.string().trim().max(191).optional(),
    kind: z.enum(['OK', 'CONCERN', 'REQUEST']).optional(),
    /** Eski istemci alanı (kind yoksa). */
    mood: z.enum(['OK', 'CONCERN']).optional(),
    reasons: z.array(z.enum(CONCERN_REASONS)).max(CONCERN_REASONS.length).optional(),
    requestType: z.enum(REQUEST_TYPES).optional(),
    tableCode: z.string().max(64).optional(),
    note: z.string().max(NOTE_MAX).optional(),
    linkAccount: z.boolean().optional(),
  })
  .refine((b) => !!(b.kind || b.mood), { message: 'Sinyal türü gerekli.', path: ['kind'] })
  .refine((b) => !!(b.qr || b.dealerId), { message: 'İşletme bağlantısı eksik.', path: ['qr'] });

const VENUE_ERRORS = {
  missing: () => new ApiError('MISSING_VENUE', 'Bu bağlantıda işletme bilgisi yok. Masadaki QR’ı yeniden okutun.', { status: 400 }),
  not_found: () => new ApiError('VENUE_NOT_FOUND', 'Bu işletme bulunamadı.', { status: 404 }),
  qr_inactive: () => new ApiError('QR_INACTIVE', 'Bu QR artık kullanılmıyor. İşletmeden güncel QR’ı isteyin.', { status: 409 }),
  disabled: () => new ApiError('FEATURE_DISABLED', 'Masa sinyali şu anda kapalı.', { status: 403 }),
} as const;

export const POST = defineRoute(
  {
    name: 'innovation.table-pulse.create',
    roles: 'public',
    schema: body,
    rateLimit: { max: 8, windowMs: 10 * 60_000, by: 'ip' },
    idempotent: true,
    maxBodyBytes: 8_000,
  },
  async ({ body: b, ip }) => {
    const venue = await resolveSignalVenue({ qr: b.qr, dealerId: b.dealerId, qrCodeId: b.qrCodeId });
    if (venue.status !== 'ok') throw VENUE_ERRORS[venue.status]();

    // Hedefli taşma: aynı IP'den aynı işletmeye 10 dk'da en fazla 4 sinyal.
    const perVenue = await checkRateLimitDb(`table-signal:ip-venue:${ip ?? 'unknown'}:${venue.dealerId}`, 4, 10 * 60_000).catch(
      () => null
    );
    if (perVenue && !perVenue.ok) {
      throw new ApiError('RATE_LIMITED', 'Az önce bildirdiniz; ekip haberdar. Biraz sonra tekrar deneyebilirsiniz.', {
        retryable: true,
        headers: { 'Retry-After': String(Math.max(1, Math.ceil((perVenue.retryAfterMs ?? 60_000) / 1000))) },
      });
    }

    const kind: SignalKind = b.kind ?? (b.mood === 'CONCERN' ? 'CONCERN' : 'OK');

    // Varsayılan anonim: yalnız açık rıza + doğrulanmış müşteri oturumu varsa ilişkilendirilir.
    let customerId: string | null = null;
    if (b.linkAccount === true) {
      const auth = await requireAuth(['CUSTOMER']);
      if ('session' in auth) customerId = auth.session.user.id;
    }

    try {
      const result = await createTableSignal({
        venue,
        kind,
        reasons: kind === 'CONCERN' ? normalizeReasons(b.reasons) : [],
        requestType: kind === 'REQUEST' ? (b.requestType ?? 'waiter') : null,
        tableCode: normalizeTableCode(b.tableCode),
        note: sanitizeNote(b.note),
        customerId,
      });
      return ok({ ...result, linked: !!customerId }, { status: result.duplicate ? 200 : 201 });
    } catch (err) {
      if (err instanceof SignalUnavailableError) {
        throw new ApiError('REQUESTS_UNAVAILABLE', 'Bu işletme şu anda masadan istek almıyor.', { status: 409 });
      }
      throw err;
    }
  }
);
