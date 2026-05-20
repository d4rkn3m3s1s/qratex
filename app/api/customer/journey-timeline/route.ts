/**
 * Müşteri journey timeline: register, feedback, badge, reward ve consumption eventlerini
 * kronolojik sırada döndürür. customer/journey-score sayfasında kullanılır.
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/api-auth';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';

export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireAuth(['CUSTOMER', 'ADMIN']);
  if ('error' in auth) return auth.error;
  const { session } = auth;

  const userId = session.user.id as string;

  const [user, feedbacks, userBadges, userRewards, consumptions] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { createdAt: true, name: true, level: true, points: true },
    }),
    prisma.feedback.findMany({
      where: { userId, deletedAt: null } as { userId: string; deletedAt: null },
      select: { id: true, rating: true, sentiment: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
    prisma.userBadge.findMany({
      where: { userId },
      include: { badge: { select: { name: true, icon: true } } },
      orderBy: { earnedAt: 'desc' },
      take: 10,
    }),
    prisma.userReward.findMany({
      where: { userId },
      include: { reward: { select: { name: true, icon: true } } },
      orderBy: { redeemedAt: 'desc' },
      take: 10,
    }),
    prisma.consumption.findMany({
      where: { customerId: userId },
      select: { id: true, createdAt: true, amount: true },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
  ]);

  type TimelineEvent = {
    id: string;
    type: 'register' | 'feedback' | 'badge' | 'reward' | 'consumption' | 'vip';
    title: string;
    description: string;
    icon: string;
    date: string;
    color: string;
    metadata?: Record<string, unknown>;
  };

  const events: TimelineEvent[] = [];

  // Register event
  if (user) {
    events.push({
      id: `register-${userId}`,
      type: 'register',
      title: 'Yolculuk Başladı',
      description: `${user.name || 'Müşteri'} QRATEX platformuna katıldı!`,
      icon: '🚀',
      date: user.createdAt.toISOString(),
      color: 'primary',
    });
  }

  // Feedback events
  for (const f of feedbacks) {
    events.push({
      id: `feedback-${f.id}`,
      type: 'feedback',
      title: f.rating >= 4 ? 'Olumlu Geri Bildirim' : f.rating <= 2 ? 'Geri Bildirim Verildi' : 'Geri Bildirim',
      description: `${f.rating}/5 puan ile geri bildirim verildi.`,
      icon: f.rating >= 4 ? '⭐' : '💬',
      date: f.createdAt.toISOString(),
      color: f.rating >= 4 ? 'emerald' : f.rating <= 2 ? 'amber' : 'blue',
      metadata: { rating: f.rating, sentiment: f.sentiment },
    });
  }

  // Badge events
  for (const ub of userBadges) {
    events.push({
      id: `badge-${ub.id}`,
      type: 'badge',
      title: `Rozet Kazanıldı: ${ub.badge.name}`,
      description: `${ub.badge.name} rozeti başarıyla kazanıldı!`,
      icon: ub.badge.icon || '🏆',
      date: ub.earnedAt.toISOString(),
      color: 'amber',
    });
  }

  // Reward events
  for (const ur of userRewards) {
    events.push({
      id: `reward-${ur.id}`,
      type: 'reward',
      title: `Ödül Talep Edildi: ${ur.reward.name}`,
      description: `${ur.reward.name} ödülü talep edildi.`,
      icon: ur.reward.icon || '🎁',
      date: ur.redeemedAt.toISOString(),
      color: 'primary',
    });
  }

  // Consumption events
  for (const c of consumptions) {
    events.push({
      id: `consumption-${c.id}`,
      type: 'consumption',
      title: 'Tüketim Gerçekleşti',
      description: c.amount ? `${c.amount.toLocaleString('tr-TR')} ₺ tutarında tüketim.` : 'Tüketim kaydedildi.',
      icon: '☕',
      date: c.createdAt.toISOString(),
      color: 'blue',
    });
  }

  // Sort by date descending
  events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const stats = {
    totalFeedbacks: feedbacks.length,
    totalBadges: userBadges.length,
    level: user?.level ?? 1,
    points: user?.points ?? 0,
  };

  return NextResponse.json(
    { success: true, timeline: events.slice(0, 30), stats },
    { headers: PRIVATE_NO_STORE_HEADERS }
  );
}
