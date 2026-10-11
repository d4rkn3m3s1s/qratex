/**
 * Veri Yılanı — SUNUCU modülü (doğrulayıcı). Yalnız `registry/server.ts` içe aktarır; istemci
 * paketine girmez. Aile: 'deterministic' (tohum + girdi kaydı → sunucuda replay).
 */
import type { GameServerModule } from '@/lib/games/verify/types';
import { dataSnakeVerifier } from '@/lib/games/validators/data-snake';

export const serverModule: GameServerModule | null = { verifier: dataSnakeVerifier };
