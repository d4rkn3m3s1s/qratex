import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';
import { touchLoginStreak, LOGIN_STREAK_MILESTONES } from '@/lib/login-streak';

export const dynamic = 'force-dynamic';

/**
 * GET — GÜNLÜK GİRİŞ SERİSİ (login/aktivite streak).
 *
 * Bu endpoint'i müşteri paneli (dashboard) sayfa yüklenince fire-and-forget
 * çağırır: touchLoginStreak günde bir kez seriyi ilerletir, kilometre taşında
 * atomik+idempotent puan ödülü verir ve güncel durumu döner.
 *
 * NOT: /api/customer/games/streak (mini oyun serisi) ve /api/streak (UserStreak
 * loyalty) AYRIDIR — bu yalnızca login streak'idir.
 *
 * Dönüş: { success, streak, longest, milestones, claimedMilestones,
 *          nextMilestone, todayClaimed (yeni ödül), milestoneReward? }
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== 'CUSTOMER') {
      return NextResponse.json(
        { error: 'Unauthorized', streak: 0, longest: 0 },
        { status: 401, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    const result = await touchLoginStreak(session.user.id);

    // Sonraki (henüz ödüllenmemiş) kilometre taşı.
    const nextMilestone =
      LOGIN_STREAK_MILESTONES.find(
        (m) => m.days > result.streak && !result.claimedMilestones.includes(m.days)
      ) ??
      LOGIN_STREAK_MILESTONES.find((m) => !result.claimedMilestones.includes(m.days)) ??
      null;

    return NextResponse.json(
      {
        success: true,
        streak: result.streak,
        longest: result.longest,
        isNewDay: result.isNewDay,
        milestones: LOGIN_STREAK_MILESTONES,
        claimedMilestones: result.claimedMilestones,
        nextMilestone,
        daysUntilNextMilestone: nextMilestone ? Math.max(0, nextMilestone.days - result.streak) : null,
        // Bu çağrıda yeni bir ödül kazanıldı mı (UI kutlaması için).
        todayClaimed: !!result.milestoneReward,
        milestoneReward: result.milestoneReward ?? null,
      },
      { headers: PRIVATE_NO_STORE_HEADERS }
    );
  } catch (error) {
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    console.error('[LOGIN_STREAK_API]', error);
    return NextResponse.json(
      { error: 'Seri alınamadı', streak: 0, longest: 0 },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}
