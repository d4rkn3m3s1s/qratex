/**
 * Kar Tanesi Yakala — SUNUCU modülü (doğrulayıcı). Yalnız `registry/server.ts` içe aktarır; istemci
 * paketine girmez. Aile: 'deterministic' (tohum + girdi kaydı → sunucuda replay; eski 'action'
 * hedefinden daha güçlü — skor eğrisi değil, skorun kendisi sunucuda hesaplanır).
 */
import type { GameServerModule } from '@/lib/games/verify/types';
import { frostCatcherVerifier } from '@/lib/games/validators/frost-catcher';

export const serverModule: GameServerModule | null = { verifier: frostCatcherVerifier };
