import { z } from 'zod';
import { ApiError, defineRoute, ok } from '@/lib/http/define-route';
import { prisma } from '@/lib/prisma';
import { mintPoints, isEconomyError } from '@/lib/economy';
import { gameDayKey } from '@/lib/game-session';
import { GAME_QUEST_IDS, getGameQuest, questCounts, questIdempotencyKey } from '@/lib/play-hub/quests';

export const dynamic = 'force-dynamic';

/**
 * POST /api/customer/games/quests — günlük OYUN görevinin XP ödülünü talep eder.
 *
 * Sunucu otoriter: ilerleme bugünkü sıralı deneme satırlarından (MiniGameSession) YENİDEN
 * hesaplanır; istemcinin "tamamladım" demesine güvenilmez. Ödül yalnız XP'dir ve `mintPoints`
 * ile basılır (defter + kilit + fraud kapısı). Tek-kez garantisi `PointsLedger.idempotencyKey`
 * (@unique) `game_quest:<kullanıcı>:<gün>:<görev>`: paralel/çift tıklama ikinci krediyi
 * üretemez (`duplicate` → 409). Gün = deneme günü (`gameDayKey`).
 *
 * Gövde: `{ questId: 'play-1' | 'win-1' | 'variety-3' }`
 * Yanıt: `{ questId, xp, duplicate:false }` · 409 ALREADY_CLAIMED · 409 NOT_COMPLETED
 */
export const POST = defineRoute(
  {
    name: 'customer.games.quests.claim',
    roles: ['CUSTOMER'],
    schema: z.object({ questId: z.enum(GAME_QUEST_IDS) }),
    rateLimit: { max: 20, windowMs: 60_000, by: 'user' },
  },
  async ({ body, user }) => {
    const quest = getGameQuest(body.questId);
    if (!quest) throw new ApiError('NOT_FOUND', 'Görev bulunamadı.');

    const now = new Date();
    const dayKey = gameDayKey(now);
    const rows = await prisma.miniGameSession.findMany({
      where: { userId: user.id, dayKey },
      select: { gameType: true, status: true },
    });
    const progress = questCounts(rows)[quest.metric];
    if (progress < quest.target) {
      throw new ApiError('NOT_COMPLETED', `Görev henüz tamamlanmadı (${Math.min(progress, quest.target)}/${quest.target}).`, {
        status: 409,
      });
    }

    try {
      const minted = await mintPoints(prisma, {
        userId: user.id,
        points: 0,
        xp: quest.xp,
        source: 'game_quest',
        sourceId: `${dayKey}:${quest.id}`,
        idempotencyKey: questIdempotencyKey(user.id, dayKey, quest.id),
        // Yalnız XP: oyun puan tavanına girmez (oyunlar XP motorudur, §7.2/3).
        capCategory: null,
        meta: { questId: quest.id, dayKey },
        now,
      });
      if (minted.duplicate) {
        throw new ApiError('ALREADY_CLAIMED', 'Bu görevin ödülünü bugün zaten aldın.', { status: 409 });
      }
      return ok({ questId: quest.id, xp: minted.xpCredited, duplicate: false });
    } catch (e) {
      if (isEconomyError(e)) {
        throw new ApiError(e.code, e.message, { status: e.httpStatus });
      }
      throw e;
    }
  }
);
