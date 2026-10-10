/**
 * Çekirdek Savunması — SUNUCU modülü (doğrulayıcı). Yalnız `registry/server.ts` içe aktarır; istemci
 * paketine girmez. Etiketli içerik (`lib/games/content/core-defense.ts`) yalnız buradan import edilir.
 *
 * null → bu oyun için kanıt istenmez; `lib/game-session.ts` yalnız ortak makullük
 * kurallarını uygular (süre, saniye başına skor, tavan). Hedef aile: 'action'.
 * Örnek: `export const serverModule: GameServerModule = { verifier: actionVerifier({ … }) };`
 */
import type { GameServerModule } from '@/lib/games/verify/types';

export const serverModule: GameServerModule | null = null;
