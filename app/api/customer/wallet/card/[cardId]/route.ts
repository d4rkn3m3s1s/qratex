import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { ApiError, defineRoute, ok } from '@/lib/http/define-route';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { generateCardToken } from '@/lib/utils';
import { decideCardAction } from '@/lib/wallet-card/actions';

export const dynamic = 'force-dynamic';

const Body = z.object({ action: z.enum(['freeze', 'unfreeze', 'rotate']) });
const Params = z.object({ cardId: z.string().min(1).max(64) });

function isUniqueViolation(error: unknown): boolean {
  return !!error && typeof error === 'object' && (error as { code?: unknown }).code === 'P2002';
}

/**
 * POST /api/customer/wallet/card/:cardId  { action: 'freeze' | 'unfreeze' | 'rotate' }
 *
 * Müşterinin KENDİ kartı (my-card raporu B3, eksik özellik 4 "kart güvenliği"):
 *  - freeze   → kasada kullanılamaz (CARD_BLOCKED); yalnız müşteri çözebilir.
 *  - unfreeze → yalnız müşterinin dondurduğu kart; yönetim bloğu çözülemez.
 *  - rotate   → "Kartımı kaybettim": yeni kod; basılı eski QR hiçbir kasada çalışmaz.
 * Karar `lib/wallet-card/actions.ts`'de (saf, test edilir). Her işlem `CardAuditLog`'a yazılır.
 * Puan etkisi yoktur; kart silinmez, tüketimler `cardId` ile bağlı kalır.
 */
export const POST = defineRoute(
  {
    name: 'customer.wallet.card.action',
    roles: ['CUSTOMER'],
    params: Params,
    schema: Body,
    rateLimit: 'sensitive',
  },
  async ({ user, params, body, request }) => {
    const card = await prisma.physicalCard.findUnique({
      where: { id: params.cardId },
      select: { id: true, token: true, customerId: true, status: true, blockReason: true, archivedAt: true },
    });
    const now = new Date();
    const decision = decideCardAction(card, user.id, body.action, now);
    if (!decision.ok) throw new ApiError(decision.code, decision.message, { status: decision.status });
    const current = card!;
    const meta = getAuditRequestMeta(request);

    for (let attempt = 0; attempt < 3; attempt++) {
      const nextToken = decision.data.rotate ? generateCardToken() : undefined;
      try {
        const updated = await prisma.$transaction(async (tx) => {
          // Yarış guard'ı: kart okunduğundan beri durumu değişmediyse yaz.
          const res = await tx.physicalCard.updateMany({
            where: { id: current.id, customerId: user.id, status: current.status, archivedAt: null, token: current.token },
            data: {
              status: decision.data.status,
              blockedAt: decision.data.blockedAt,
              blockReason: decision.data.blockReason,
              ...(nextToken ? { token: nextToken } : {}),
            },
          });
          if (res.count !== 1) {
            throw new ApiError('CONFLICT', 'Kart bu sırada değişti. Sayfayı yenileyip tekrar dene.');
          }
          await tx.cardAuditLog.create({
            data: {
              cardId: current.id,
              userId: user.id,
              action: decision.audit,
              metadata: {
                by: 'customer',
                action: body.action,
                ...(nextToken ? { previousTokenTail: current.token.slice(-8) } : {}),
              },
              ipAddress: meta.ipAddress,
              userAgent: meta.userAgent,
            },
          });
          return tx.physicalCard.findUnique({ where: { id: current.id }, select: { id: true, status: true } });
        });
        return ok({ card: { id: current.id, status: updated?.status ?? decision.data.status }, action: body.action });
      } catch (error) {
        // Yeni token çakıştıysa (çok düşük olasılık) yeni kodla tekrar dene.
        if (nextToken && isUniqueViolation(error) && attempt < 2) continue;
        throw error;
      }
    }
    throw new ApiError('CONFLICT', 'Yeni kod üretilemedi. Lütfen tekrar dene.', { retryable: true });
  }
);
