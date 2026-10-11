import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { prisma } from '@/lib/prisma';
import { handlePracticeGuess, handleRankedGuess } from '@/lib/games/validators/daily-word-api';

export const dynamic = 'force-dynamic';

const Seed = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/);
const Body = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('ranked'), seed: Seed, guess: z.string().min(1).max(16), chain: z.string().max(1024).nullish() }),
  z.object({ mode: z.literal('practice'), seed: Seed, guess: z.string().min(1).max(16).optional(), reveal: z.boolean().optional() }),
]);

/**
 * POST — Günün Kelimesi tahmini. Kelime yalnız sunucuda; yanıt harf işaretleri (2 doğru yer,
 * 1 var, 0 yok). Sıralı: aktif denemeye bağlı, sayaç atomik, imzalı zincir döner (complete kanıtı).
 * Pratik: tohumdan sunucuda çözülen kelime, ödülsüz; `reveal` yalnız pratikte.
 */
export const POST = defineRoute(
  {
    name: 'customer.games.daily-word.guess',
    roles: ['CUSTOMER'],
    schema: Body,
    rateLimit: { max: 60, windowMs: 60_000, by: 'user' },
  },
  async ({ body, user }) => {
    if (body.mode === 'ranked') {
      return ok(await handleRankedGuess(prisma, { userId: user.id, seed: body.seed, guess: body.guess, chain: body.chain }));
    }
    return ok(handlePracticeGuess({ seed: body.seed, guess: body.guess, reveal: body.reveal }));
  }
);
