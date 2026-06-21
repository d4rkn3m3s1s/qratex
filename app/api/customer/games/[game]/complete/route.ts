import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';
import { creditPointsAndXp } from '@/lib/points-wallet';
import { getMiniGame, computeGameReward } from '@/lib/minigame-config';
import { computeAchievementStats } from '@/lib/game-achievement-stats';
import { evaluateAchievements } from '@/lib/game-achievements';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  sessionId: z.string().min(1),
  /** Oyun skoru (0..maxScore — registry'den doğrulanır). */
  score: z.number().int().min(0).max(10000),
  /** Oyun süresi (sn) — çok kısa süre şüpheli (bot). */
  durationSec: z.number().int().min(0).max(3600),
  won: z.boolean(),
});

/**
 * POST — Generic mini oyun bitirici. Ödülü SUNUCUDA registry'ye göre hesaplar.
 * Client skor/sonuç bildirir ama ödül burada (cap'li) belirlenir. Atomik: aktif
 * oturum guard'ı ile tek kez ödül verilir; tekrar gönderim ödülü ikiletmez.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ game: string }> }
) {
  try {
    const { game: gameType } = await params;
    const game = getMiniGame(gameType);
    if (!game) {
      return NextResponse.json(
        { error: 'Oyun bulunamadı' },
        { status: 404, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== 'CUSTOMER') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }
    const userId = session.user.id;

    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0].message },
        { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }
    const { sessionId, score, durationSec, won } = parsed.data;
    // Skoru oyunun cap'ine sıkıştır (anti-cheat).
    const clampedScore = Math.max(0, Math.min(game.maxScore, score));

    const gameSession = await prisma.miniGameSession.findUnique({
      where: { id: sessionId },
      select: { id: true, userId: true, gameType: true, status: true, startedAt: true },
    });
    if (!gameSession || gameSession.userId !== userId || gameSession.gameType !== game.gameType) {
      return NextResponse.json(
        { error: 'Oturum bulunamadı' },
        { status: 404, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }
    if (gameSession.status === 'completed') {
      return NextResponse.json(
        { error: 'Bu oyun zaten tamamlandı' },
        { status: 409, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    // Anti-abuse: sunucu tarafı süre kontrolü (client süresine de bakılır).
    const serverElapsedSec = Math.floor((Date.now() - gameSession.startedAt.getTime()) / 1000);
    const tooFast =
      serverElapsedSec < game.minDurationSec || durationSec < game.minDurationSec;

    // Ödül yalnızca kazanıldıysa, yeterince skor yapıldıysa ve süre makulse.
    const eligible = won && !tooFast;
    const reward = eligible ? computeGameReward(game, clampedScore) : { points: 0, xp: 0 };

    // Başarım tespiti için: bu tamamlamadan ÖNCE açık olan başarım id'leri.
    const beforeUnlocked = new Set(
      evaluateAchievements(await computeAchievementStats(prisma, userId))
        .filter((a) => a.unlocked)
        .map((a) => a.id)
    );

    // Atomik: yalnızca hâlâ 'active' olan oturumu 'completed'a çevirip ödül ver.
    const result = await prisma.$transaction(async (tx) => {
      const claimed = await tx.miniGameSession.updateMany({
        where: { id: sessionId, status: 'active' },
        data: {
          status: won ? 'completed' : 'failed',
          starsCollected: clampedScore,
          rewardPoints: reward.points,
          completedAt: new Date(),
        },
      });
      if (claimed.count === 0) {
        return { credited: false as const, streakBonusXp: 0, streak: 0 };
      }

      // Günlük seri bonusu: yalnızca ÖDÜLE HAK KAZANILDIYSA (eligible = won &&
      // !tooFast && eşik geçildi) ve bu günün İLK tamamlanan oyunuysa verilir.
      // Önceden yalnızca `won` kontrol ediliyordu → {won:true,score:0,durationSec:0}
      // gönderen bot ödül almadan bile her gün streak XP topluyordu (rank 7).
      let streakBonusXp = 0;
      let streak = 0;
      if (eligible && reward.points > 0) {
        const today = new Date().toISOString().slice(0, 10);
        // ATOMİK günlük tek-claim: (userId, dayKey) UNIQUE kaydını oluşturmayı
        // dene. Aynı gün başka bir oyun zaten bonus aldıysa P2002 atar → bonus yok.
        // Önceki count-then-act, Read Committed'da iki eşzamanlı oyunda çift bonus
        // veriyordu (rank 13). Bu, yarışı DB seviyesinde tek kazanana indirir.
        let claimedStreakToday = false;
        try {
          await tx.gameStreakClaim.create({ data: { userId, dayKey: today } });
          claimedStreakToday = true;
        } catch (e) {
          if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e;
        }
        if (claimedStreakToday) {
          // Geriye doğru kesintisiz günleri say (son 120 gün penceresi).
          const since = new Date(Date.now() - 120 * 86_400_000);
          const rows = await tx.miniGameSession.findMany({
            where: { userId, status: 'completed', completedAt: { gte: since } },
            select: { dayKey: true },
            distinct: ['dayKey'],
          });
          const set = new Set(rows.map((r) => r.dayKey));
          set.add(today); // bu oturum
          let cur = today;
          while (set.has(cur)) {
            streak += 1;
            const d = new Date(`${cur}T00:00:00.000Z`);
            d.setUTCDate(d.getUTCDate() - 1);
            cur = d.toISOString().slice(0, 10);
          }
          // Her gün +10 XP, her 3. günde ekstra +30 XP milestone.
          streakBonusXp = 10 + (streak % 3 === 0 ? 30 : 0);
        }
      }

      const totalXp = reward.xp + streakBonusXp;
      if (reward.points > 0 || totalXp > 0) {
        const updated = await creditPointsAndXp(tx, {
          userId,
          points: reward.points,
          xp: totalXp,
        });
        // Anti-fraud görünürlüğü: kredilenen puanı points_credited olarak işle ki
        // caps (lib/points-caps) ve velocity dedektörü (lib/points-velocity) oyun
        // ekonomisini de görsün (önceden tüm oyun puanları bu olaylara görünmezdi).
        if (reward.points > 0) {
          await tx.analyticsEvent.create({
            data: {
              userId,
              event: 'points_credited',
              category: 'game',
              data: { points: reward.points, gameType: game.gameType, sessionId },
            },
          });
        }
        return { credited: true as const, newPoints: updated.points, streakBonusXp, streak };
      }
      return { credited: true as const, newPoints: null, streakBonusXp, streak };
    });

    if (!result.credited) {
      return NextResponse.json(
        { error: 'Oyun zaten tamamlandı' },
        { status: 409, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    // Ödül kazanıldıysa bildirim.
    if (reward.points > 0) {
      await prisma.notification.create({
        data: {
          userId,
          title: `${game.emoji} ${game.title} Ödülü!`,
          message: `${reward.points} puan + ${reward.xp} XP kazandın!`,
          type: 'success',
        },
      });
    }

    // Bu tamamlamayla yeni açılan başarımları tespit et (önce/sonra farkı).
    let newAchievements: { id: string; title: string; icon: string }[] = [];
    try {
      const after = evaluateAchievements(await computeAchievementStats(prisma, userId));
      newAchievements = after
        .filter((a) => a.unlocked && !beforeUnlocked.has(a.id))
        .map((a) => ({ id: a.id, title: a.title, icon: a.icon }));
      if (newAchievements.length > 0) {
        await prisma.notification.create({
          data: {
            userId,
            title: '🏆 Yeni Başarım!',
            message: newAchievements.map((a) => `${a.icon} ${a.title}`).join(', '),
            type: 'success',
          },
        });
      }
    } catch {
      // Başarım tespiti kritik değil; sessizce geç.
    }

    return NextResponse.json(
      {
        success: true,
        rewarded: reward.points > 0,
        rewardPoints: reward.points,
        rewardXp: reward.xp,
        streak: result.streak,
        streakBonusXp: result.streakBonusXp,
        newAchievements,
        tooFast,
      },
      { headers: PRIVATE_NO_STORE_HEADERS }
    );
  } catch (error) {
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    console.error('[MINIGAME_COMPLETE]', error);
    return NextResponse.json(
      { error: 'Oyun tamamlanamadı' },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}
