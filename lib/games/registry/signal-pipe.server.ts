/**
 * Sinyal Bağla — SUNUCU modülü (doğrulayıcı). Yalnız `registry/server.ts` içe aktarır; istemci
 * paketine girmez. Aile: 'deterministic' (tohum + girdi kaydı → sunucuda tamsayı replay).
 */
import type { GameServerModule } from '@/lib/games/verify/types';
import { signalPipeVerifier } from '@/lib/games/validators/signal-pipe';

export const serverModule: GameServerModule | null = { verifier: signalPipeVerifier };
