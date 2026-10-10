/**
 * Mekân detayı — "Bu mekândaki geçmişim" zaman çizelgesi (sayfalı).
 *
 * Kaynaklar YALNIZ oturumdaki müşterinin kendi kayıtlarıdır (kiracı = kullanıcı):
 *  - Tüketim (`Consumption.customerId`, `dealerId`) + varsa tüketim yorumu ve işletme yanıtı.
 *  - QR geri bildirimi (`Feedback.userId`, `qrCode.dealerId`) + işletme yanıtı.
 * Silinmiş (soft delete) geri bildirim/yorum gösterilmez. Sayfalama `createdAt` imleciyle
 * (ISO) — iki kaynaktan `take+1` çekilip birleştirilir, ilk `take` döner.
 */
import { prisma } from '@/lib/prisma';
import type { VenueHistoryItem, VenueHistoryPage } from './types';

export const HISTORY_PAGE_SIZE = 10;
const EXCERPT_MAX = 160;

const TOPIC_KEYS = new Set([
  'service', 'speed', 'quality', 'price', 'cleanliness', 'location', 'ambience', 'support', 'staff', 'wait',
  'food', 'taste', 'value', 'atmosphere',
]);

export function excerpt(text: string | null | undefined, max = EXCERPT_MAX): string | null {
  if (!text) return null;
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return null;
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

/** AI konu anahtarlarını (ham İngilizce) bilinen kümeye süzer; çeviri istemcide yapılır. */
export function normalizeTopics(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const t of raw) {
    if (typeof t !== 'string') continue;
    const k = t.trim().toLowerCase();
    if (TOPIC_KEYS.has(k) && !out.includes(k)) out.push(k);
    if (out.length >= 3) break;
  }
  return out;
}

export function parseCursor(cursor: string | null | undefined): Date | null {
  if (!cursor) return null;
  const d = new Date(cursor);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** İki kaynağı tarihe göre birleştirir ve sayfalar (SAF). */
export function mergeHistory(items: VenueHistoryItem[], take: number): VenueHistoryPage {
  const sorted = [...items].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : a.id < b.id ? 1 : -1));
  const page = sorted.slice(0, take);
  const nextCursor = sorted.length > take && page.length > 0 ? page[page.length - 1].at : null;
  return { items: page, nextCursor };
}

export async function getVenueHistory(
  userId: string,
  dealerId: string,
  opts: { cursor?: string | null; take?: number } = {}
): Promise<VenueHistoryPage> {
  const take = Math.min(Math.max(opts.take ?? HISTORY_PAGE_SIZE, 1), 30);
  const before = parseCursor(opts.cursor);
  const createdAt = before ? { lt: before } : undefined;

  const [consumptions, feedbacks] = await Promise.all([
    prisma.consumption.findMany({
      where: { customerId: userId, dealerId, ...(createdAt ? { createdAt } : {}) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      select: {
        id: true,
        createdAt: true,
        amount: true,
        product: { select: { name: true } },
        review: {
          select: {
            id: true,
            rating: true,
            text: true,
            dealerReply: true,
            dealerRepliedAt: true,
            deletedAt: true,
          },
        },
      },
    }),
    prisma.feedback.findMany({
      where: { userId, deletedAt: null, qrCode: { dealerId }, ...(createdAt ? { createdAt } : {}) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      select: {
        id: true,
        createdAt: true,
        rating: true,
        text: true,
        topics: true,
        dealerReply: true,
        dealerRepliedAt: true,
      },
    }),
  ]);

  const items: VenueHistoryItem[] = [
    ...consumptions.map((c): VenueHistoryItem => {
      const r = c.review && !c.review.deletedAt ? c.review : null;
      return {
        kind: 'consumption',
        id: c.id,
        at: c.createdAt.toISOString(),
        productName: c.product?.name ?? null,
        amount: typeof c.amount === 'number' && Number.isFinite(c.amount) ? c.amount : null,
        review: r
          ? {
              id: r.id,
              rating: r.rating,
              excerpt: excerpt(r.text),
              dealerReply: excerpt(r.dealerReply, 280),
              dealerRepliedAt: r.dealerRepliedAt ? r.dealerRepliedAt.toISOString() : null,
            }
          : null,
      };
    }),
    ...feedbacks.map(
      (f): VenueHistoryItem => ({
        kind: 'feedback',
        id: f.id,
        at: f.createdAt.toISOString(),
        rating: f.rating,
        excerpt: excerpt(f.text),
        topics: normalizeTopics(f.topics),
        dealerReply: excerpt(f.dealerReply, 280),
        dealerRepliedAt: f.dealerRepliedAt ? f.dealerRepliedAt.toISOString() : null,
      })
    ),
  ];

  return mergeHistory(items, take);
}
