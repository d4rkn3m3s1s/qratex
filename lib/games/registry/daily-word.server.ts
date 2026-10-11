/**
 * Günün Kelimesi — SUNUCU modülü (doğrulayıcı). Yalnız `registry/server.ts` içe aktarır; istemci
 * paketine girmez. Kelime listesi ve zincir doğrulaması: `lib/games/validators/daily-word.ts`.
 */
import type { GameServerModule } from '@/lib/games/verify/types';
import { dailyWordVerifier } from '@/lib/games/validators/daily-word';

export const serverModule: GameServerModule | null = { verifier: dailyWordVerifier };
