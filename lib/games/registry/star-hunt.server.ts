/**
 * Yıldız Avı — SUNUCU modülü (doğrulayıcı). Yalnız `registry/server.ts` içe aktarır; istemci
 * paketine girmez. Aile: 'deterministic' (tohum + yön kaydı → sunucuda replay).
 * Sunucu anahtarı tarihsel olarak 'pacman' (registry/server.ts).
 */
import type { GameServerModule } from '@/lib/games/verify/types';
import { starHuntVerifier } from '@/lib/games/validators/star-hunt';

export const serverModule: GameServerModule | null = { verifier: starHuntVerifier };
