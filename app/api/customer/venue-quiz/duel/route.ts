import { z } from 'zod';
import { ApiError, defineRoute, ok } from '@/lib/http/define-route';
import { getEffectiveMiniGame } from '@/lib/minigame-config-effective';
import { VENUE_QUIZ_GAME_TYPE } from '@/lib/games/validators/venue-quiz';
import { handleDuelRound, handleDuelSubmit } from '@/lib/games/validators/venue-quiz-duel';

export const dynamic = 'force-dynamic';

const Answer = z.object({
  id: z.string().regex(/^q\d{1,2}$/),
  verdict: z.string().min(1).max(16),
  tMs: z.number().int().min(0).max(60 * 60 * 1000),
});
const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('round'), challenge: z.string().max(1024).nullish() }),
  z.object({ action: z.literal('submit'), roundToken: z.string().min(1).max(1024), answers: z.array(Answer).max(20) }),
]);

/**
 * POST — Mekân Bilgi Yarışması asenkron düellosu (ödülsüz, puanı sunucu hesaplar).
 *   round  → yeni düello ya da meydan okuma bağlantısındaki kodla aynı sorular (etiketsiz) + imzalı tur belirteci
 *   submit → cevapları sunucu puanlar; doğru şıklar + paylaşılabilir imzalı meydan okuma döner
 * Durumsuz (HMAC belirteç); DB'ye yazmaz, puan basmaz. Oyun kapalıysa (admin) düello da kapalı.
 */
export const POST = defineRoute(
  {
    name: 'customer.games.venue-quiz.duel',
    roles: ['CUSTOMER'],
    schema: Body,
    rateLimit: { max: 30, windowMs: 60_000, by: 'user' },
  },
  async ({ body, user, session }) => {
    const game = await getEffectiveMiniGame(VENUE_QUIZ_GAME_TYPE);
    if (!game || game.hidden || !game.enabled) throw new ApiError('FORBIDDEN', 'Bu oyun şu anda kullanılamıyor.');
    if (body.action === 'round') {
      return ok(handleDuelRound({ userId: user.id, challenge: body.challenge ?? null }));
    }
    return ok(
      await handleDuelSubmit({
        userId: user.id,
        userName: session.user?.name ?? null,
        roundToken: body.roundToken,
        answers: body.answers,
      })
    );
  }
);
