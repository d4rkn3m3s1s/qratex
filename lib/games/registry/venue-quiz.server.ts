/**
 * Mekân Bilgi Yarışması — SUNUCU modülü. Yalnız `registry/server.ts` içe aktarır; istemci
 * paketine girmez. Doğrulayıcı ve etiketli içerik: `lib/games/validators/venue-quiz.ts`.
 */
import type { GameServerModule } from '@/lib/games/verify/types';
import { venueQuizVerifier } from '@/lib/games/validators/venue-quiz';

export const serverModule: GameServerModule | null = { verifier: venueQuizVerifier };
