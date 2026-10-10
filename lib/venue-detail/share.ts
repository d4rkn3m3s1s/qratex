/**
 * Deneyim kartı paylaşımı (anonim, 7 gün) — eski `/customer/experiences`'tan taşındı.
 *
 * Denetim bulguları:
 *  - B2: serbest metin + ilişki kontrolü yok → kart artık müşterinin KENDİ, silinmemiş ve
 *    bu mekâna ait bir deneyim kaydına (QR geri bildirimi ya da tüketim yorumu) bağlı; metin
 *    sunucudaki sabit şablonlardan seçilir (serbest metin yok → moderasyon gereksiz);
 *    yalnız 4-5 puanlık deneyim paylaşılır; kullanıcı başına 24 saatte 10 kart.
 *  - B9: sabit "gelirsen şunu dene" → kullanıcı ruh hâlini ve notunu seçer, puan karta yazılır.
 *  - Aynı kart tekrar istenirse (süresi ≥ 1 gün kalmış) yeni token üretilmez.
 */
import { randomBytes } from 'crypto';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/http/define-route';
import { findActiveDealer } from './improvement';
import type { ShareCaptionKey, ShareMood, VenueShareLink } from './types';

export const SHARE_TTL_DAYS = 7;
export const SHARE_PER_USER_PER_DAY = 10;
export const SHARE_MIN_RATING = 4;
const DAY_MS = 24 * 60 * 60 * 1000;

export const SHARE_CAPTION_TR: Readonly<Record<ShareCaptionKey, string>> = {
  recommend: 'Gönül rahatlığıyla tavsiye ederim.',
  try_it: 'Yolun düşerse mutlaka uğra.',
  hidden_gem: 'Keşfedilmeyi bekleyen bir yer.',
  great_service: 'Hizmet gerçekten çok iyiydi.',
};

export function buildShareCaption(captionKey: ShareCaptionKey, rating: number): string {
  const r = Math.min(5, Math.max(1, Math.round(rating)));
  return `${SHARE_CAPTION_TR[captionKey]} · ${r}/5`.slice(0, 200);
}

export function shareUrlFor(base: string, token: string): string {
  return `${base.replace(/\/$/, '')}/experience/${token}`;
}

/** Deneyim kaydının sahibi + mekânı doğrulanır; puanı döner. */
async function resolveExperienceRating(
  userId: string,
  dealerId: string,
  ref: { kind: 'feedback' | 'review'; id: string }
): Promise<number | null> {
  if (ref.kind === 'feedback') {
    const f = await prisma.feedback.findFirst({
      where: { id: ref.id, userId, deletedAt: null, qrCode: { dealerId } },
      select: { rating: true },
    });
    return f?.rating ?? null;
  }
  const r = await prisma.consumptionReview.findFirst({
    where: { id: ref.id, customerId: userId, deletedAt: null, consumption: { dealerId } },
    select: { rating: true },
  });
  return r?.rating ?? null;
}

export async function createExperienceShare(input: {
  userId: string;
  dealerId: string;
  ref: { kind: 'feedback' | 'review'; id: string };
  captionKey: ShareCaptionKey;
  mood: ShareMood;
  baseUrl: string;
  now?: Date;
}): Promise<VenueShareLink & { reused: boolean }> {
  const now = input.now ?? new Date();
  const dealer = await findActiveDealer(input.dealerId);
  if (!dealer) throw new ApiError('NOT_FOUND', 'Mekân bulunamadı.');

  const rating = await resolveExperienceRating(input.userId, input.dealerId, input.ref);
  if (rating == null) throw new ApiError('NOT_FOUND', 'Paylaşılacak deneyim bulunamadı.');
  if (rating < SHARE_MIN_RATING) {
    throw new ApiError('NOT_SHAREABLE', 'Deneyim kartı yalnız 4 ve 5 puanlık deneyimler için oluşturulabilir.', {
      status: 422,
    });
  }

  const caption = buildShareCaption(input.captionKey, rating);

  const existing = await prisma.experienceShareToken.findFirst({
    where: {
      creatorId: input.userId,
      dealerId: input.dealerId,
      caption,
      mood: input.mood,
      expiresAt: { gt: new Date(now.getTime() + DAY_MS) },
    },
    orderBy: { createdAt: 'desc' },
    select: { token: true, caption: true, mood: true, viewCount: true, expiresAt: true },
  });
  if (existing) {
    return {
      token: existing.token,
      url: shareUrlFor(input.baseUrl, existing.token),
      caption: existing.caption,
      mood: existing.mood,
      viewCount: existing.viewCount,
      expiresAt: existing.expiresAt.toISOString(),
      reused: true,
    };
  }

  const recent = await prisma.experienceShareToken.count({
    where: { creatorId: input.userId, createdAt: { gte: new Date(now.getTime() - DAY_MS) } },
  });
  if (recent >= SHARE_PER_USER_PER_DAY) {
    throw new ApiError('RATE_LIMITED', 'Bugünlük kart oluşturma sınırına ulaştın. Yarın yeniden deneyebilirsin.', {
      retryable: true,
      headers: { 'Retry-After': '3600' },
    });
  }

  const token = randomBytes(18).toString('base64url');
  const expiresAt = new Date(now.getTime() + SHARE_TTL_DAYS * DAY_MS);
  await prisma.experienceShareToken.create({
    data: { token, creatorId: input.userId, dealerId: input.dealerId, caption, mood: input.mood, expiresAt },
  });
  return {
    token,
    url: shareUrlFor(input.baseUrl, token),
    caption,
    mood: input.mood,
    viewCount: 0,
    expiresAt: expiresAt.toISOString(),
    reused: false,
  };
}

export async function listShareLinks(userId: string, dealerId: string, baseUrl: string, now: Date): Promise<VenueShareLink[]> {
  const rows = await prisma.experienceShareToken.findMany({
    where: { creatorId: userId, dealerId, expiresAt: { gt: now } },
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: { token: true, caption: true, mood: true, viewCount: true, expiresAt: true },
  });
  return rows.map((r) => ({
    token: r.token,
    url: shareUrlFor(baseUrl, r.token),
    caption: r.caption,
    mood: r.mood,
    viewCount: r.viewCount,
    expiresAt: r.expiresAt.toISOString(),
  }));
}

/** Paylaşım linki tabanı: yapılandırılmış uygulama adresi, yoksa isteğin kökeni. */
export function resolveShareBase(origin: string | null | undefined): string {
  const env = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '');
  return env || (origin ?? '').replace(/\/$/, '');
}
