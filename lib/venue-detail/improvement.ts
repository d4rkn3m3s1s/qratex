/**
 * "Daha iyi olabilirdi" — iyileştirme isteği (eski `/customer/experiences`'tan taşındı).
 *
 * Denetim bulguları (docs/audit/2026-10-08/musteri/customer_experiences.md):
 *  - B1: sınırsız bildirim spam'i → ziyaret uygunluğu (son 180 günde bu mekânda tüketim ya da
 *    QR geri bildirimi) + kullanıcı×mekân günlük 2, kullanıcı günlük 10 tavanı (DB'den sayılır).
 *  - B6: kara delik → bildirim artık isteğin kategorisini ve METNİNİ taşır (bayi bildirim
 *    merkezinde okur); müşteri tarafında "işletme gördü" durumu bildirimin `readAt`'inden gelir.
 *  - B7: müşteri SLA seçmez → `expectedHours` işletmenin GERÇEK medyan yanıt süresinden
 *    (yoksa şema varsayılanı 48) sunucuda yazılır.
 *  - Kayıt + bildirim tek transaction'da.
 */
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/http/define-route';
import { excerpt } from './history';
import type { ImprovementTemplateKey, VenueImprovementRequest } from './types';

export const IMPROVEMENT_ELIGIBILITY_DAYS = 180;
export const IMPROVEMENT_PER_DEALER_PER_DAY = 2;
export const IMPROVEMENT_PER_USER_PER_DAY = 10;
const DAY_MS = 24 * 60 * 60 * 1000;

export const IMPROVEMENT_TEMPLATE_LABEL_TR: Readonly<Record<ImprovementTemplateKey, string>> = {
  tone: 'Üslup ve iletişim',
  speed: 'Hız ve bekleme',
  quality: 'Ürün ve lezzet kalitesi',
  value: 'Fiyat-değer dengesi',
  other: 'Diğer',
};

export async function findActiveDealer(dealerId: string) {
  return prisma.user.findFirst({
    where: { id: dealerId, role: 'DEALER', anonymizedAt: null, suspendedAt: null },
    select: { id: true, businessName: true, name: true },
  });
}

/** Son `days` günde bu mekânda tüketim ya da (silinmemiş) QR geri bildirimi var mı? */
export async function hasRecentVisit(userId: string, dealerId: string, now: Date, days = IMPROVEMENT_ELIGIBILITY_DAYS) {
  const since = new Date(now.getTime() - days * DAY_MS);
  const [consumption, feedback] = await Promise.all([
    prisma.consumption.findFirst({
      where: { customerId: userId, dealerId, createdAt: { gte: since } },
      select: { id: true },
    }),
    prisma.feedback.findFirst({
      where: { userId, deletedAt: null, qrCode: { dealerId }, createdAt: { gte: since } },
      select: { id: true },
    }),
  ]);
  return Boolean(consumption || feedback);
}

export async function createImprovementRequest(input: {
  userId: string;
  dealerId: string;
  templateKey: ImprovementTemplateKey;
  message: string;
  /** Sunucuda hesaplanmış medyan yanıt saati (yoksa null → şema varsayılanı). */
  expectedHours: number | null;
  now?: Date;
}): Promise<VenueImprovementRequest> {
  const now = input.now ?? new Date();
  const dealer = await findActiveDealer(input.dealerId);
  if (!dealer) throw new ApiError('NOT_FOUND', 'Mekân bulunamadı.');

  if (!(await hasRecentVisit(input.userId, input.dealerId, now))) {
    throw new ApiError(
      'NO_RECENT_VISIT',
      'İyileştirme isteği yalnız son 6 ayda ziyaret ettiğin mekânlara gönderilebilir.',
      { status: 403 }
    );
  }

  const since = new Date(now.getTime() - DAY_MS);
  const [perDealer, perUser] = await Promise.all([
    prisma.improvementRequest.count({ where: { userId: input.userId, dealerId: input.dealerId, createdAt: { gte: since } } }),
    prisma.improvementRequest.count({ where: { userId: input.userId, createdAt: { gte: since } } }),
  ]);
  if (perDealer >= IMPROVEMENT_PER_DEALER_PER_DAY || perUser >= IMPROVEMENT_PER_USER_PER_DAY) {
    throw new ApiError(
      'RATE_LIMITED',
      perDealer >= IMPROVEMENT_PER_DEALER_PER_DAY
        ? 'Bu mekâna bugün yeterince istek gönderdin. Yarın yeniden deneyebilirsin.'
        : 'Bugünlük iyileştirme isteği sınırına ulaştın. Yarın yeniden deneyebilirsin.',
      { retryable: true, headers: { 'Retry-After': '3600' } }
    );
  }

  const message = input.message.replace(/\s+\n/g, '\n').trim();
  const label = IMPROVEMENT_TEMPLATE_LABEL_TR[input.templateKey];
  const expectedHours =
    input.expectedHours != null && Number.isFinite(input.expectedHours)
      ? Math.min(168, Math.max(1, Math.round(input.expectedHours)))
      : undefined;

  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.improvementRequest.create({
      data: {
        userId: input.userId,
        dealerId: input.dealerId,
        templateKey: input.templateKey,
        message,
        ...(expectedHours !== undefined ? { expectedHours } : {}),
      },
      select: { id: true, templateKey: true, message: true, createdAt: true },
    });
    await tx.notification.create({
      data: {
        userId: input.dealerId,
        title: `İyileştirme isteği · ${label}`,
        message: excerpt(message, 240) ?? label,
        type: 'info',
        data: {
          type: 'improvement_request',
          improvementRequestId: row.id,
          templateKey: input.templateKey,
        },
      },
    });
    return row;
  });

  return {
    id: created.id,
    templateKey: created.templateKey,
    message: created.message,
    createdAt: created.createdAt.toISOString(),
    seen: false,
    seenAt: null,
  };
}

/**
 * Müşterinin bu mekâna gönderdiği son istekler + "işletme gördü" zamanı.
 * Görüldü bilgisi, isteğin bayiye düşen bildiriminin `readAt` alanıdır (ek şema yok).
 */
export async function listImprovementRequests(userId: string, dealerId: string, take = 10): Promise<VenueImprovementRequest[]> {
  const rows = await prisma.improvementRequest.findMany({
    where: { userId, dealerId },
    orderBy: { createdAt: 'desc' },
    take,
    select: { id: true, templateKey: true, message: true, createdAt: true },
  });
  if (rows.length === 0) return [];
  const oldest = rows[rows.length - 1].createdAt;
  const notes = await prisma.notification.findMany({
    where: {
      userId: dealerId,
      createdAt: { gte: new Date(oldest.getTime() - 60_000) },
      data: { path: ['type'], equals: 'improvement_request' },
    },
    select: { data: true, readAt: true, isRead: true },
    take: 500,
  });
  const seen = new Map<string, Date | null>();
  for (const n of notes) {
    const d = n.data as Record<string, unknown> | null;
    const id = d && typeof d.improvementRequestId === 'string' ? d.improvementRequestId : null;
    if (!id) continue;
    if (n.readAt) seen.set(id, n.readAt);
    else if (n.isRead && !seen.has(id)) seen.set(id, null);
  }
  return rows.map((r) => ({
    id: r.id,
    templateKey: r.templateKey,
    message: r.message,
    createdAt: r.createdAt.toISOString(),
    seen: seen.has(r.id),
    seenAt: seen.get(r.id)?.toISOString() ?? null,
  }));
}
