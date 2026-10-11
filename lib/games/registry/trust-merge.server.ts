/**
 * Güven Birleştir — SUNUCU modülü (doğrulayıcı). Yalnız `registry/server.ts` içe aktarır; istemci
 * paketine girmez. Aile: 'deterministic' (tohum + girdi kaydı → sunucuda replay).
 */
import type { GameServerModule } from '@/lib/games/verify/types';
import { trustMergeVerifier } from '@/lib/games/validators/trust-merge';

export const serverModule: GameServerModule | null = { verifier: trustMergeVerifier };
