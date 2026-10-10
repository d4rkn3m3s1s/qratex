/**
 * POST /api/cards/[token]/found — "Kart buldum, sahibine haber ver" (herkese açık).
 *
 * Kayıp kart akışı (rapor B14 / eksik özellik 5): başkasının kartını okutan kişi, kimliğini ya
 * da sahibin kimliğini ÖĞRENMEDEN sahibine uygulama içi bildirim + web push gönderir. Sahip
 * Kartım'dan kartı dondurabilir ya da yeni kod alabilir.
 *
 * Kötüye kullanım sınırları: IP başına 3 / 10 dk; aynı kart için 6 saatte en fazla bir bildirim
 * (sonraki istekler bildirim üretmeden "iletildi" döner — sahip spamlenmez). Not 280 karakter,
 * telefon/e-posta maskelenmez (bulan kişi bilerek iletişim bırakabilir) ama bağlantı kabul edilmez.
 * Yanıt kartın durumunu ya da sahibini ASLA açığa çıkarmaz.
 */
import { after } from 'next/server';
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { prisma } from '@/lib/prisma';
import { sendPushNotification } from '@/lib/push';
import { getUserAgent } from '@/lib/request-metadata';
import { CARD_TOKEN_PATTERN } from '@/lib/qr-resolve';

export const dynamic = 'force-dynamic';

const FOUND_NOTIFY_WINDOW_MS = 6 * 60 * 60_000;
const URL_RE = /(https?:\/\/|www\.)\S+/gi;

const body = z
  .object({
    note: z.string().max(280).optional(),
  })
  .optional();

function cleanNote(raw: string | undefined): string | null {
  if (!raw) return null;
  const v = raw.replace(URL_RE, '').replace(/\s+/g, ' ').trim().slice(0, 280);
  return v || null;
}

export const POST = defineRoute(
  {
    name: 'cards.found',
    roles: 'public',
    params: z.object({ token: z.string().regex(CARD_TOKEN_PATTERN) }),
    schema: body,
    rateLimit: { max: 3, windowMs: 10 * 60_000, by: 'ip' },
    maxBodyBytes: 4_000,
  },
  async ({ params, body: b, ip, request }) => {
    const card = await prisma.physicalCard.findUnique({
      where: { token: params.token },
      select: {
        id: true,
        status: true,
        customerId: true,
        archivedAt: true,
        customer: { select: { anonymizedAt: true } },
      },
    });

    // Sahibi olmayan / arşivli kart: aynı nötr yanıt (kart durumu sızmaz).
    const ownerId = card && !card.archivedAt && card.customerId && !card.customer?.anonymizedAt ? card.customerId : null;
    if (!card || !ownerId) return ok({ delivered: true });

    const since = new Date(Date.now() - FOUND_NOTIFY_WINDOW_MS);
    const recent = await prisma.cardAuditLog.findFirst({
      where: { cardId: card.id, action: 'FOUND_REPORTED', createdAt: { gte: since } },
      select: { id: true },
    });
    if (recent) return ok({ delivered: true });

    const note = cleanNote(b?.note);
    const title = 'Kartın bulundu bildirimi';
    const message = note
      ? `Biri Qratex kartını okuttu ve bulduğunu bildirdi. Notu: “${note}”`
      : 'Biri Qratex kartını okuttu ve bulduğunu bildirdi. Kartını kaybettiysen Kartım’dan dondurabilir ya da yeni kod alabilirsin.';
    const url = '/customer/wallet/card';

    await prisma.$transaction([
      prisma.cardAuditLog.create({
        data: {
          cardId: card.id,
          userId: null,
          action: 'FOUND_REPORTED',
          metadata: { hasNote: !!note },
          ipAddress: ip,
          userAgent: getUserAgent(request),
        },
      }),
      prisma.notification.create({
        data: {
          userId: ownerId,
          title,
          message,
          type: 'warning',
          data: { kind: 'card_found', cardId: card.id, url },
        },
      }),
    ]);

    const push = () => sendPushNotification(ownerId, title, message, url).catch(() => false);
    try {
      after(push);
    } catch {
      void push();
    }

    return ok({ delivered: true });
  }
);
