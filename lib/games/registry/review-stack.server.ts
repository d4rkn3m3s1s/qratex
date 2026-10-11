/**
 * Yorum İstifi — SUNUCU modülü (doğrulayıcı). Yalnız `registry/server.ts` içe aktarır; istemci
 * paketine girmez. Aile: 'deterministic' (tohum + girdi kaydı → sunucuda replay).
 */
import type { GameServerModule } from '@/lib/games/verify/types';
import { reviewStackVerifier } from '@/lib/games/validators/review-stack';

export const serverModule: GameServerModule | null = { verifier: reviewStackVerifier };
