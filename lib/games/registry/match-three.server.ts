/**
 * Eşleştir-3 — SUNUCU modülü (doğrulayıcı). Yalnız `registry/server.ts` içe aktarır; istemci
 * paketine girmez. Aile: 'deterministic' (tohum + hamle kaydı → sunucuda replay).
 */
import type { GameServerModule } from '@/lib/games/verify/types';
import { matchThreeVerifier } from '@/lib/games/validators/match-three';

export const serverModule: GameServerModule | null = { verifier: matchThreeVerifier };
