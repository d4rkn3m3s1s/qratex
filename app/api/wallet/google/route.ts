import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { ApiError, defineRoute, ok } from '@/lib/http/define-route';
import {
  generateGooglePassObject,
  generateGoogleWalletJWT,
  generateSerialNumber,
  getGoogleWalletSaveUrl,
  isGoogleWalletConfigured,
} from '@/lib/wallet';

export const dynamic = 'force-dynamic';

/**
 * GET /api/wallet/google?cardId=…
 * "Google Cüzdan'a kaydet" bağlantısı üretir → `{ saveUrl, passId }`.
 *
 * Eskiden yapılandırma yokken `200 + fallbackUrl` dönüyor, UI "henüz yapılandırılmamış"
 * bilgisi gösteriyordu (sahte başarı). Artık 503; cüzdan sayfası düğmeyi zaten yalnız
 * yapılandırma tamken gösterir. Eski `POST` uygunluk ucu kaldırıldı (`wallet.google`).
 */
export const GET = defineRoute(
  {
    name: 'wallet.google.save-url',
    roles: ['CUSTOMER'],
    query: z.object({ cardId: z.string().min(1).max(64).optional() }),
    rateLimit: { max: 10, windowMs: 60_000, by: 'user' },
  },
  async ({ user, query }) => {
    if (!isGoogleWalletConfigured()) {
      throw new ApiError('SERVICE_UNAVAILABLE', 'Google Cüzdan entegrasyonu henüz yapılandırılmamış.');
    }

    const card = await prisma.physicalCard.findFirst({
      where: {
        customerId: user.id,
        status: 'ACTIVATED',
        archivedAt: null,
        ...(query.cardId ? { id: query.cardId } : {}),
      },
      orderBy: { activatedAt: 'desc' },
      select: { id: true, token: true },
    });
    if (!card) throw new ApiError('NOT_FOUND', 'Aktif kart bulunamadı.');

    const owner = await prisma.user.findUnique({
      where: { id: user.id },
      select: { id: true, name: true, points: true, level: true },
    });
    if (!owner) throw new ApiError('NOT_FOUND', 'Kullanıcı bulunamadı.');

    const passId = generateSerialNumber(owner.id, card.id);
    const passObject = generateGooglePassObject({
      id: passId,
      classId: 'qratex_membership',
      customerName: owner.name || 'Üye',
      customerId: owner.id,
      cardToken: card.token,
      points: owner.points,
      level: owner.level,
    });

    let saveUrl: string;
    try {
      saveUrl = getGoogleWalletSaveUrl(await generateGoogleWalletJWT(passObject));
    } catch (error) {
      console.error('[wallet.google] JWT üretilemedi', error);
      throw new ApiError('SERVICE_UNAVAILABLE', 'Google Cüzdan bağlantısı şu an oluşturulamadı.', { retryable: true });
    }
    return ok({ saveUrl, passId }, { legacySpread: true });
  }
);
