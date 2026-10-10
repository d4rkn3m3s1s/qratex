import { z } from 'zod';
import { defineRoute } from '@/lib/http/define-route';
import { handleGameComplete } from '@/lib/game-routes';
import { MAX_PROOF_BYTES } from '@/lib/games/verify/types';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  sessionId: z.string().min(1).max(64),
  /** İstemcinin skor beyanı — sunucu kırpar, doğrulayıcı varsa YENİDEN hesaplar. */
  score: z.number().int().min(0).max(1_000_000),
  /** İstemcinin ölçtüğü süre (sn) — sunucu kendi saatini esas alır. */
  durationSec: z.number().int().min(0).max(86_400),
  /** Kozmetik; kazanma kararı sunucunundur (geriye uyumluluk için kabul edilir). */
  won: z.boolean().optional(),
  /** start'ın verdiği HMAC imzalı deneme belirteci. */
  attemptToken: z.string().max(2048).optional().nullable(),
  /**
   * Oyun doğrulayıcısının kanıtı (sınıflandırma: cevaplar; deterministik: girdi kaydı;
   * aksiyon: checkpoint izi). Şemayı oyunun doğrulayıcısı uygular (lib/games/verify).
   */
  proof: z.unknown().optional(),
});

/**
 * POST — SIRALI deneme bitirici. Ödül SUNUCUDA: belirteç doğrulanır; oyunun doğrulayıcısı
 * varsa skor sunucuda hesaplanır (etiketler / replay / checkpoint); süre ve saniye başına
 * skor makullüğü sunucu saatine göre denetlenir; kazanma kararı sunucunundur (`won`
 * kozmetik); ödül `mintPoints` ile atomik + tek seferlik + oyun kategorisi tavanlı
 * (lib/economy caps: günde 600, haftada 3.000). Ayrıntı: lib/game-session.ts
 */
export const POST = defineRoute(
  {
    name: 'customer.games.complete',
    roles: ['CUSTOMER'],
    params: z.object({ game: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(48) }),
    schema: bodySchema,
    rateLimit: { max: 30, windowMs: 60_000, by: 'user' },
    maxBodyBytes: MAX_PROOF_BYTES + 4_096,
  },
  async ({ params, body, user }) => handleGameComplete(params.game, body, { userId: user.id })
);
