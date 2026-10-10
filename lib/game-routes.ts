/**
 * Mini oyun start/complete HTTP işleyicileri — generic `[game]` route'ları ve eski pacman
 * route'ları AYNI işleyiciyi çağırır (kural tek yerde: lib/game-session.ts).
 *
 * Yanıt sözleşmesi geriye uyumlu (lib/use-mini-game.ts ve pacman bileşeni):
 *   start    → { success, canPlay, sessionId, config, attemptToken, seed, serverStartedAt, expiresAt }
 *              | { success, canPlay:false, alreadyPlayed:true, outcome, session, message }
 *   complete → { success, rewarded, rewardPoints, rewardXp, won, score, streak, streakBonusXp,
 *                newAchievements, tooFast, capped, reason, alreadyCompleted? }
 */
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';
import {
  getEffectiveMiniGame,
  getEffectiveMiniGameFresh,
  publicGameConfig,
} from '@/lib/minigame-config-effective';
import { attemptReasonMessage, finalizeAttempt, resolveStartAttempt } from '@/lib/game-session';
import { computeAchievementStats } from '@/lib/game-achievement-stats';
import { evaluateAchievements } from '@/lib/game-achievements';
import { isEconomyError } from '@/lib/economy';

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: PRIVATE_NO_STORE_HEADERS });
}

/** POST start — günde 1 DENEME (başlangıçta harcanır). */
export async function handleGameStart(gameType: string): Promise<NextResponse> {
  try {
    const game = await getEffectiveMiniGame(gameType);
    if (!game) return json({ error: 'Oyun bulunamadı', canPlay: false }, 404);

    const auth = await requireAuth(['CUSTOMER']);
    if ('error' in auth) return auth.error;
    const userId = auth.session.user.id;

    // Portföyden çıkarılan (§7.3) ya da admin'in kapattığı oyun yeni deneme açamaz.
    if (game.hidden) {
      return json(
        { error: 'Bu oyun emekliye ayrıldı. Oyun Merkezi’nden başka bir oyun seçebilirsin.', canPlay: false },
        403
      );
    }
    if (!game.enabled) return json({ error: 'Bu oyun şu anda kullanılamıyor', canPlay: false }, 403);

    const r = await resolveStartAttempt(prisma, { userId, game });

    if (r.kind === 'played') {
      return json({
        success: true,
        canPlay: false,
        alreadyPlayed: true,
        outcome: r.outcome,
        session: r.session,
        message: r.expiredNow
          ? 'Bugünkü denemen yarım kaldığı için kullanılmış sayıldı. Yarın yeni hakkın var!'
          : r.outcome === 'won'
            ? 'Bugünün oyununu kazandın. Yarın tekrar gel!'
            : 'Bugünkü denemeni kullandın. Yarın tekrar dene!',
      });
    }

    return json({
      success: true,
      canPlay: true,
      sessionId: r.sessionId,
      attemptToken: r.token,
      seed: r.seed,
      resumed: r.resumed,
      serverStartedAt: r.startedAt.toISOString(),
      expiresAt: r.expiresAt.toISOString(),
      config: publicGameConfig(game),
    });
  } catch (error) {
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    console.error('[MINIGAME_START]', gameType, error);
    return json({ error: 'Oyun başlatılamadı', canPlay: false }, 500);
  }
}

export interface CompleteBody {
  sessionId: string;
  score: number;
  durationSec: number;
  /** Kozmetik: kazanma kararı sunucunundur. */
  won?: boolean;
  attemptToken?: string | null;
}

/** POST complete — sunucu doğrular, karar verir, ödülü atomik basar. */
export async function handleGameComplete(gameType: string, body: CompleteBody): Promise<NextResponse> {
  try {
    const auth = await requireAuth(['CUSTOMER']);
    if ('error' in auth) return auth.error;
    const userId = auth.session.user.id;

    // Puan basan karar önbelleksiz config ile (admin "kapat" = derhal ödülsüz).
    const game = await getEffectiveMiniGameFresh(gameType);
    if (!game) return json({ error: 'Oyun bulunamadı' }, 404);

    let beforeUnlocked: Set<string> | null = null;
    const result = await finalizeAttempt(prisma, {
      userId,
      game,
      sessionId: body.sessionId,
      clientScore: body.score,
      clientDurationSec: body.durationSec,
      token: body.attemptToken ?? null,
      onValidated: async () => {
        try {
          beforeUnlocked = new Set(
            evaluateAchievements(await computeAchievementStats(prisma, userId))
              .filter((a) => a.unlocked)
              .map((a) => a.id)
          );
        } catch {
          beforeUnlocked = null; // başarım tespiti kritik değil
        }
      },
    });

    if (result.kind === 'not_found') return json({ error: 'Oturum bulunamadı' }, 404);
    if (result.kind === 'invalid_token') {
      return json(
        { error: 'Oyun oturumu doğrulanamadı. Sayfayı yenileyip tekrar deneyin.', code: 'INVALID_ATTEMPT_TOKEN' },
        400
      );
    }
    if (result.kind === 'already_finished') {
      // İdempotent: aynı deneme için tekrar gönderim kayıtlı sonucu döndürür (409 değil).
      return json({
        success: true,
        alreadyCompleted: true,
        rewarded: result.rewardPoints > 0,
        rewardPoints: result.rewardPoints,
        rewardXp: 0,
        won: result.won,
        score: result.score,
        streak: 0,
        streakBonusXp: 0,
        newAchievements: [],
        tooFast: false,
        capped: false,
        reason: null,
      });
    }

    const { evaluation } = result;

    if (result.credited > 0) {
      await prisma.notification
        .create({
          data: {
            userId,
            title: `${game.emoji} ${game.title} Ödülü!`,
            message: `${result.credited} puan + ${result.xpCredited} XP kazandın!`,
            type: 'success',
          },
        })
        .catch(() => undefined);
    }

    let newAchievements: { id: string; title: string; icon: string }[] = [];
    const before = beforeUnlocked as Set<string> | null;
    if (before) {
      try {
        const after = evaluateAchievements(await computeAchievementStats(prisma, userId));
        newAchievements = after
          .filter((a) => a.unlocked && !before.has(a.id))
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
    }

    const capped = result.capped && evaluation.rewardEligible;
    return json({
      success: true,
      rewarded: result.credited > 0,
      rewardPoints: result.credited,
      rewardXp: result.xpCredited,
      won: evaluation.won,
      score: evaluation.verifiedScore,
      streak: result.streak,
      streakBonusXp: result.streakBonusXp,
      newAchievements,
      tooFast: evaluation.flags.includes('too_fast'),
      capped,
      reason: capped && result.credited === 0
        ? 'Bugünkü oyun puanı sınırına ulaştın; XP ve başarımlar işlemeye devam ediyor.'
        : attemptReasonMessage(evaluation, game),
    });
  } catch (error) {
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    if (isEconomyError(error)) {
      return json({ error: error.message, code: error.code }, error.httpStatus);
    }
    console.error('[MINIGAME_COMPLETE]', gameType, error);
    return json({ error: 'Oyun tamamlanamadı' }, 500);
  }
}
