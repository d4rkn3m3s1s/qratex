import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';


export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) return auth.error;

    // Get all customers with their stats
    const customers = await prisma.user.findMany({
      where: { role: 'CUSTOMER' },
      take: 10_000,
      orderBy: { id: 'asc' },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        points: true,
        level: true,
        createdAt: true,
        _count: {
          select: {
            feedbacks: true,
            badges: true,
            rewards: true,
          },
        },
      },
    });

    // Calculate segments
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Get recent activity per customer
    const recentFeedbacks = await prisma.feedback.groupBy({
      by: ['userId'],
      where: { createdAt: { gte: thirtyDaysAgo }, userId: { not: null } },
      _count: true,
    });
    const recentMap = new Map(recentFeedbacks.map(r => [r.userId, r._count]));

    // Segment customers
    const segments: Record<string, { name: string; color: string; icon: string; customers: typeof customers }> = {
      vip: { name: 'VIP', color: 'amber', icon: '👑', customers: [] },
      loyal: { name: 'Sadık', color: 'emerald', icon: '💚', customers: [] },
      active: { name: 'Aktif', color: 'blue', icon: '⚡', customers: [] },
      new: { name: 'Yeni', color: 'violet', icon: '🆕', customers: [] },
      risk: { name: 'Riskli', color: 'red', icon: '⚠️', customers: [] },
      passive: { name: 'Pasif', color: 'gray', icon: '💤', customers: [] },
    };

    for (const customer of customers) {
      const recentCount = recentMap.get(customer.id) || 0;
      const daysSinceJoin = Math.floor((now.getTime() - new Date(customer.createdAt).getTime()) / (1000 * 60 * 60 * 24));

      // VIP: High level + many feedbacks + many badges
      if (customer.level >= 5 && customer._count.feedbacks >= 20 && customer._count.badges >= 3) {
        segments.vip.customers.push(customer);
      }
      // Loyal: Regular feedback (>5 in last 30 days) + level > 2
      else if (recentCount >= 5 && customer.level >= 2) {
        segments.loyal.customers.push(customer);
      }
      // Active: Some recent activity
      else if (recentCount >= 2) {
        segments.active.customers.push(customer);
      }
      // New: Joined in last 7 days
      else if (daysSinceJoin <= 7) {
        segments.new.customers.push(customer);
      }
      // Risk: Was active but no recent activity + has some history
      else if (customer._count.feedbacks >= 3 && recentCount === 0) {
        segments.risk.customers.push(customer);
      }
      // Passive: No activity at all recently
      else {
        segments.passive.customers.push(customer);
      }
    }

    const segmentSummary = Object.entries(segments).map(([key, seg]) => ({
      id: key,
      name: seg.name,
      color: seg.color,
      icon: seg.icon,
      count: seg.customers.length,
      customers: seg.customers.slice(0, 10).map(c => ({
        id: c.id,
        name: c.name,
        email: c.email,
        image: c.image,
        points: c.points,
        level: c.level,
        feedbackCount: c._count.feedbacks,
        badgeCount: c._count.badges,
      })),
    }));

    return NextResponse.json({
      success: true,
      segments: segmentSummary,
      totalCustomers: customers.length,
    }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    console.error('Error fetching segments:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}
