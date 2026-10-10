import { z } from 'zod';
import { defineRoute } from '@/lib/http/define-route';
import { handleGameStart } from '@/lib/game-routes';

export const dynamic = 'force-dynamic';

/**
 * POST — SIRALI mod denemesi başlatır (ödüllü; liderlik ve turnuvaya girer). Günde 1 DENEME
 * (P0-17): deneme başlangıçta harcanır; sunucu tohum + nonce + başlangıç saati + son
 * geçerlilik üretir ve HMAC imzalı `attemptToken` döner. Sınıflandırma ailesinde tur
 * içeriği ETİKETSİZ `content` olarak gelir. Bugünün denemesi bittiyse `canPlay:false,
 * alreadyPlayed:true, outcome`. Pratik (ödülsüz) için: `POST …/practice`.
 * Ayrıntı: lib/game-session.ts, lib/games/README.md
 *
 * Yanıt gövdesi eski sözleşmeyle birebir (lib/use-mini-game.ts) — işleyici `Response` döner.
 */
export const POST = defineRoute(
  {
    name: 'customer.games.start',
    roles: ['CUSTOMER'],
    params: z.object({ game: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(48) }),
    // Günde 1 sıralı deneme; dakikada 20 start (ağ tekrarı + çift tık payı) yeterli.
    rateLimit: { max: 20, windowMs: 60_000, by: 'user' },
  },
  async ({ params, user }) => handleGameStart(params.game, { userId: user.id })
);
