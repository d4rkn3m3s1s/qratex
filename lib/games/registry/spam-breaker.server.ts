/**
 * Spam Kırıcı — SUNUCU modülü (doğrulayıcı). Yalnız `registry/server.ts` içe aktarır; istemci
 * paketine girmez. Aile: 'deterministic' (tohum + girdi kaydı → sunucuda tamsayı replay).
 */
import type { GameServerModule } from '@/lib/games/verify/types';
import { spamBreakerVerifier } from '@/lib/games/validators/spam-breaker';

export const serverModule: GameServerModule | null = { verifier: spamBreakerVerifier };
