/**
 * Çekirdek Savunması — SUNUCU modülü (doğrulayıcı). Yalnız `registry/server.ts` içe aktarır; istemci
 * paketine girmez. Aile: 'deterministic' (tohum + girdi kaydı → sunucuda replay).
 */
import type { GameServerModule } from '@/lib/games/verify/types';
import { coreDefenseVerifier } from '@/lib/games/validators/core-defense';

export const serverModule: GameServerModule | null = { verifier: coreDefenseVerifier };
