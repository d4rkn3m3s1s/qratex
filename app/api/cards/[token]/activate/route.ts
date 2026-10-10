/**
 * POST /api/cards/[token]/activate — kartı oturumdaki müşteriye bağla (tek seferlik).
 *
 * Eski uç (rapor B3, B10): çıplak `getServerSession` (token-replay/oturum sürümü denetimi yok),
 * rate limit yok, ham `x-forwarded-for` denetim kaydında, yetim kartta sonsuz "başkasına bağlı".
 * Şimdi: `defineRoute` + `requireAuth(['CUSTOMER'])` + kullanıcı başına 10/dk; mantık
 * lib/cards/claim.ts'de (koşullu yazma, yetim kartın serbest bırakılması, denetim kaydı).
 *
 * Hata kodları geriye uyumlu (Tara yüzeyi components/customer/m-tara/resolve-client.ts okur):
 * CARD_NOT_FOUND 404 · CARD_BLOCKED 403 · ALREADY_YOURS 400 · ALREADY_ACTIVATED 409.
 */
import { z } from 'zod';
import { ApiError, defineRoute, ok } from '@/lib/http/define-route';
import { prisma } from '@/lib/prisma';
import { getUserAgent } from '@/lib/request-metadata';
import { CARD_TOKEN_PATTERN } from '@/lib/qr-resolve';
import { CardClaimError, claimCard, type ClaimErrorCode } from '@/lib/cards/claim';

export const dynamic = 'force-dynamic';

const CLAIM_ERRORS: Record<ClaimErrorCode, { message: string; status: number }> = {
  CARD_NOT_FOUND: { message: 'Kart bulunamadı.', status: 404 },
  CARD_BLOCKED: { message: 'Bu kart kullanıma kapalı.', status: 403 },
  ALREADY_YOURS: { message: 'Bu kart zaten sana bağlı.', status: 400 },
  ALREADY_ACTIVATED: { message: 'Bu kart başka bir üyeye bağlı.', status: 409 },
};

export const POST = defineRoute(
  {
    name: 'cards.activate',
    roles: ['CUSTOMER'],
    params: z.object({ token: z.string().regex(CARD_TOKEN_PATTERN) }),
    rateLimit: { max: 10, windowMs: 60_000, by: 'user' },
  },
  async ({ params, user, ip, request }) => {
    try {
      const result = await prisma.$transaction((tx) =>
        claimCard(tx, {
          token: params.token,
          userId: user.id,
          ipAddress: ip,
          userAgent: getUserAgent(request) || null,
        })
      );

      await prisma.analyticsEvent
        .create({
          data: {
            userId: user.id,
            event: 'card_activated',
            category: 'card',
            data: { cardId: result.id, released: result.released },
          },
        })
        .catch(() => undefined);

      return ok(
        {
          message: 'Kart başarıyla aktive edildi!',
          card: { id: result.id, status: result.status, activatedAt: result.activatedAt },
        },
        { legacySpread: true }
      );
    } catch (err) {
      if (err instanceof CardClaimError) {
        const e = CLAIM_ERRORS[err.code];
        throw new ApiError(err.code, e.message, { status: e.status });
      }
      throw err;
    }
  }
);
