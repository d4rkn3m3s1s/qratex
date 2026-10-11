/**
 * Sahte Avcısı — SUNUCU modülü. Yalnız `registry/server.ts` içe aktarır; istemci paketine girmez.
 * Doğrulayıcı ve etiketli içerik: `lib/games/validators/fake-hunter.ts`.
 */
import type { GameServerModule } from '@/lib/games/verify/types';
import { fakeHunterVerifier } from '@/lib/games/validators/fake-hunter';

export const serverModule: GameServerModule | null = { verifier: fakeHunterVerifier };
