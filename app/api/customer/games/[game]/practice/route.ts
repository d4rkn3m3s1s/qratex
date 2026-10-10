import { z } from 'zod';
import { ApiError, defineRoute, ok } from '@/lib/http/define-route';
import { buildPracticeRound } from '@/lib/game-routes';

export const dynamic = 'force-dynamic';

/**
 * POST — PRATİK turu (yol haritası §7.2 ilke 2): sınırsız, ÖDÜLSÜZ; liderliğe, turnuvaya,
 * seriye ve başarıma girmez; DB'ye yazmaz. Her çağrıda yeni tohum. Sınıflandırma ailesinde
 * pratik havuzundan ETİKETLİ tur döner (sıralı havuzdan ayrı). Pratik sonucu sunucuya
 * gönderilmez (puan basan yol yok).
 *
 * Yanıt (zarf v2 + eski alanlar kökte): `{ success, mode:'practice', seed, config, verification, content?, answerKey? }`
 */
export const POST = defineRoute(
  {
    name: 'customer.games.practice',
    roles: ['CUSTOMER'],
    params: z.object({ game: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(48) }),
    // Sınırsız oynanır ama kazıma/otomasyon tavanı: dakikada 30 tur.
    rateLimit: { max: 30, windowMs: 60_000, by: 'user' },
  },
  async ({ params }) => {
    const r = await buildPracticeRound(params.game);
    if (!r.ok) {
      throw new ApiError(r.status === 404 ? 'NOT_FOUND' : 'FORBIDDEN', r.error, { status: r.status });
    }
    return ok(r.data, { legacySpread: true });
  }
);
