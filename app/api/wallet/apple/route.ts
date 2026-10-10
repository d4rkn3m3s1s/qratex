import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { ApiError, defineRoute } from '@/lib/http/define-route';
import { createPkPass, generateSerialNumber, isAppleWalletConfigured } from '@/lib/wallet';

export const dynamic = 'force-dynamic';

/**
 * GET /api/wallet/apple?cardId=…
 * Apple Wallet `.pkpass` indirir. Cüzdan → Kartım yalnız yapılandırma TAM iken (Team ID dahil)
 * ve iOS/macOS'ta düğmeyi gösterir; istemci bu uca doğrudan gezinir (iOS Safari pkpass'i
 * yalnız doğru içerik türüyle gezinmede Wallet'a açar).
 *
 * Yapılandırma eksikse 503 (bozuk/imzasız dosya "başarı" gibi gönderilmez). Eski
 * `POST` uygunluk ucu kaldırıldı: uygunluk artık sayfa verisinde (`wallet.apple`).
 */
export const GET = defineRoute(
  {
    name: 'wallet.apple.pass',
    roles: ['CUSTOMER'],
    query: z.object({ cardId: z.string().min(1).max(64).optional() }),
    rateLimit: { max: 10, windowMs: 60_000, by: 'user' },
  },
  async ({ user, query }) => {
    if (!isAppleWalletConfigured()) {
      throw new ApiError('SERVICE_UNAVAILABLE', 'Apple Wallet entegrasyonu henüz yapılandırılmamış.');
    }

    const card = await prisma.physicalCard.findFirst({
      where: {
        customerId: user.id,
        status: 'ACTIVATED',
        archivedAt: null,
        ...(query.cardId ? { id: query.cardId } : {}),
      },
      orderBy: { activatedAt: 'desc' },
      select: { id: true, token: true, activatedAt: true },
    });
    if (!card) throw new ApiError('NOT_FOUND', 'Aktif kart bulunamadı.');

    const owner = await prisma.user.findUnique({
      where: { id: user.id },
      select: { id: true, name: true, points: true, level: true },
    });
    if (!owner) throw new ApiError('NOT_FOUND', 'Kullanıcı bulunamadı.');

    const pkpass = await createPkPass({
      serialNumber: generateSerialNumber(owner.id, card.id),
      customerName: owner.name || 'Üye',
      customerId: owner.id,
      cardToken: card.token,
      cardId: card.id,
      points: owner.points,
      level: owner.level,
      activatedAt: card.activatedAt ?? undefined,
    });

    return new Response(new Uint8Array(pkpass), {
      status: 200,
      headers: {
        ...PRIVATE_NO_STORE_HEADERS,
        'Content-Type': 'application/vnd.apple.pkpass',
        'Content-Disposition': `attachment; filename="qratex-card-${card.id.slice(-8)}.pkpass"`,
      },
    });
  }
);
