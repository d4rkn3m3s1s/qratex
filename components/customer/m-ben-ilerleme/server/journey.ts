/**
 * Ben → İlerleme: "Yolculuğun" akışı (sunucu). Yapısal olay döndürür; metinler istemcide
 * çevrilir (eski uç sabit Türkçe cümle ve "₺" üretiyordu — journey-score bulgu 6).
 *
 * Kaynaklar: QR geri bildirimi, tüketim yorumu (ConsumptionReview — eski akış hiç saymıyordu,
 * bulgu 2), işletme yanıtı ("Sesin duyuldu"), rozet, ödül, ziyaret, tamamlanan görev,
 * seviye ve lig anları (An Motoru kayıtları). Her olay tıklanabilir bir hedefe bağlanır
 * (bulgu 10); hedefi olmayan olay link gibi görünmez.
 */
import { prisma } from '@/lib/prisma';
import { routeHref } from '@/lib/navigation/registry';
import { badgeColor, badgeVisual } from '../badge-visual';
import { decodeCursor, mergeJourney, type Cursor } from '../journey-cursor';
import type { JourneyEvent, JourneyFilter, JourneyPage } from '../types';
import { consumptionVoiceHref, feedbackVoiceHref } from '@/lib/navigation/deep-links';

export const JOURNEY_PAGE_SIZE = 15;
const EXTRA = 5;

type SourceTag = 'fb' | 'cr' | 'fbh' | 'crh' | 'ub' | 'ur' | 'cs' | 'uq' | 'cm';

const FILTER_SOURCES: Record<JourneyFilter, SourceTag[]> = {
  all: ['fb', 'cr', 'fbh', 'crh', 'ub', 'ur', 'cs', 'uq', 'cm'],
  reviews: ['fb', 'cr', 'fbh', 'crh'],
  badges: ['ub'],
  rewards: ['ur'],
  visits: ['cs'],
  milestones: ['uq', 'cm'],
};

const placeName = (d: { businessName: string | null; name: string | null } | null | undefined) =>
  (d?.businessName || d?.name || '').trim() || null;

export async function getJourneyPage(
  userId: string,
  opts: { filter: JourneyFilter; cursor?: string | null; limit?: number },
): Promise<JourneyPage> {
  const limit = Math.min(30, Math.max(5, opts.limit ?? JOURNEY_PAGE_SIZE));
  const take = limit + EXTRA;
  const cursor: Cursor | null = decodeCursor(opts.cursor ?? null);
  const before = cursor ? new Date(cursor.at) : undefined;
  const lte = before ? { lte: before } : undefined;
  const want = new Set(FILTER_SOURCES[opts.filter] ?? FILTER_SOURCES.all);

  const badgesHref = routeHref('customer.me.badges');
  const ownedHref = routeHref('customer.wallet.owned');
  const questsHref = routeHref('customer.quests');
  const leagueHref = routeHref('customer.leaderboard');

  const empty = Promise.resolve([] as JourneyEvent[]);

  const sources: Array<Promise<JourneyEvent[]>> = [
    want.has('fb')
      ? prisma.feedback
          .findMany({
            where: { userId, deletedAt: null, ...(lte ? { createdAt: lte } : {}) },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            take,
            select: { id: true, rating: true, createdAt: true, qrCode: { select: { dealer: { select: { businessName: true, name: true } } } } },
          })
          .then((rows) =>
            rows.map<JourneyEvent>((r) => ({
              key: `fb:${r.id}`,
              type: 'review',
              at: r.createdAt.toISOString(),
              href: feedbackVoiceHref(r.id),
              data: { rating: r.rating, place: placeName(r.qrCode?.dealer), source: 'qr' },
            })),
          )
      : empty,
    want.has('cr')
      ? prisma.consumptionReview
          .findMany({
            where: { customerId: userId, deletedAt: null, ...(lte ? { createdAt: lte } : {}) },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            take,
            select: {
              id: true,
              rating: true,
              createdAt: true,
              consumptionId: true,
              consumption: { select: { dealer: { select: { businessName: true, name: true } } } },
            },
          })
          .then((rows) =>
            rows.map<JourneyEvent>((r) => ({
              key: `cr:${r.id}`,
              type: 'review',
              at: r.createdAt.toISOString(),
              href: consumptionVoiceHref(r.consumptionId),
              data: { rating: r.rating, place: placeName(r.consumption?.dealer), source: 'consumption' },
            })),
          )
      : empty,
    want.has('fbh')
      ? prisma.feedback
          .findMany({
            where: { userId, deletedAt: null, dealerRepliedAt: lte ? { not: null, ...lte } : { not: null } },
            orderBy: [{ dealerRepliedAt: 'desc' }, { id: 'desc' }],
            take,
            select: { id: true, dealerRepliedAt: true, qrCode: { select: { dealer: { select: { businessName: true, name: true } } } } },
          })
          .then((rows) =>
            rows
              .filter((r) => r.dealerRepliedAt)
              .map<JourneyEvent>((r) => ({
                key: `fbh:${r.id}`,
                type: 'heard',
                at: (r.dealerRepliedAt as Date).toISOString(),
                href: feedbackVoiceHref(r.id),
                data: { place: placeName(r.qrCode?.dealer), source: 'qr' },
              })),
          )
      : empty,
    want.has('crh')
      ? prisma.consumptionReview
          .findMany({
            where: { customerId: userId, deletedAt: null, dealerRepliedAt: lte ? { not: null, ...lte } : { not: null } },
            orderBy: [{ dealerRepliedAt: 'desc' }, { id: 'desc' }],
            take,
            select: {
              id: true,
              dealerRepliedAt: true,
              consumptionId: true,
              consumption: { select: { dealer: { select: { businessName: true, name: true } } } },
            },
          })
          .then((rows) =>
            rows
              .filter((r) => r.dealerRepliedAt)
              .map<JourneyEvent>((r) => ({
                key: `crh:${r.id}`,
                type: 'heard',
                at: (r.dealerRepliedAt as Date).toISOString(),
                href: consumptionVoiceHref(r.consumptionId),
                data: { place: placeName(r.consumption?.dealer), source: 'consumption' },
              })),
          )
      : empty,
    want.has('ub')
      ? prisma.userBadge
          .findMany({
            where: { userId, ...(lte ? { earnedAt: lte } : {}) },
            orderBy: [{ earnedAt: 'desc' }, { id: 'desc' }],
            take,
            select: { id: true, earnedAt: true, badge: { select: { name: true, icon: true, rarity: true, color: true } } },
          })
          .then((rows) =>
            rows.map<JourneyEvent>((r) => {
              const v = badgeVisual(r.badge.icon);
              return {
                key: `ub:${r.id}`,
                type: 'badge',
                at: r.earnedAt.toISOString(),
                href: badgesHref,
                data: {
                  name: r.badge.name,
                  imageSrc: v.imageSrc,
                  emoji: v.emoji,
                  rarity: (r.badge.rarity || 'common').toLowerCase(),
                  color: badgeColor(r.badge.color),
                },
              };
            }),
          )
      : empty,
    want.has('ur')
      ? prisma.userReward
          .findMany({
            where: { userId, ...(lte ? { redeemedAt: lte } : {}) },
            orderBy: [{ redeemedAt: 'desc' }, { id: 'desc' }],
            take,
            select: { id: true, redeemedAt: true, reward: { select: { name: true } } },
          })
          .then((rows) =>
            rows.map<JourneyEvent>((r) => ({
              key: `ur:${r.id}`,
              type: 'reward',
              at: r.redeemedAt.toISOString(),
              href: ownedHref,
              data: { name: r.reward.name },
            })),
          )
      : empty,
    want.has('cs')
      ? prisma.consumption
          .findMany({
            where: { customerId: userId, ...(lte ? { createdAt: lte } : {}) },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            take,
            select: {
              id: true,
              createdAt: true,
              dealer: { select: { businessName: true, name: true } },
              product: { select: { name: true } },
            },
          })
          .then((rows) =>
            rows.map<JourneyEvent>((r) => ({
              key: `cs:${r.id}`,
              type: 'visit',
              at: r.createdAt.toISOString(),
              href: consumptionVoiceHref(r.id),
              data: { place: placeName(r.dealer), product: r.product?.name ?? null },
            })),
          )
      : empty,
    want.has('uq')
      ? prisma.userQuest
          .findMany({
            where: { userId, completedAt: lte ? { not: null, ...lte } : { not: null } },
            orderBy: [{ completedAt: 'desc' }, { id: 'desc' }],
            take,
            select: { id: true, completedAt: true, quest: { select: { name: true } } },
          })
          .then((rows) =>
            rows
              .filter((r) => r.completedAt)
              .map<JourneyEvent>((r) => ({
                key: `uq:${r.id}`,
                type: 'quest',
                at: (r.completedAt as Date).toISOString(),
                href: questsHref,
                data: { name: r.quest.name },
              })),
          )
      : empty,
    want.has('cm')
      ? prisma.customerMoment
          .findMany({
            where: { userId, kind: { in: ['level_up', 'league_up'] }, ...(lte ? { createdAt: lte } : {}) },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            take,
            select: { id: true, kind: true, payload: true, createdAt: true },
          })
          .then((rows) =>
            rows.flatMap<JourneyEvent>((r) => {
              const p = (r.payload && typeof r.payload === 'object' && !Array.isArray(r.payload) ? r.payload : {}) as Record<string, unknown>;
              if (r.kind === 'level_up') {
                const to = Number(p.to);
                if (!Number.isFinite(to) || to < 1) return [];
                return [{ key: `cm:${r.id}`, type: 'level', at: r.createdAt.toISOString(), href: null, data: { to } }];
              }
              const name = typeof p.toName === 'string' && p.toName.trim() ? p.toName.trim() : typeof p.toKey === 'string' ? p.toKey : '';
              if (!name) return [];
              return [{ key: `cm:${r.id}`, type: 'league', at: r.createdAt.toISOString(), href: leagueHref, data: { name } }];
            }),
          )
      : empty,
  ];

  const lists = await Promise.all(sources);
  return mergeJourney(lists, cursor, limit, take);
}
