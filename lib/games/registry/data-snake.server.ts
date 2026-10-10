/**
 * Veri Yılanı — SUNUCU modülü (doğrulayıcı). Yalnız `registry/server.ts` içe aktarır; istemci
 * paketine girmez. Etiketli içerik (`lib/games/content/data-snake.ts`) yalnız buradan import edilir.
 *
 * null → bu oyun için kanıt istenmez; `lib/game-session.ts` yalnız ortak makullük
 * kurallarını uygular (süre, saniye başına skor, tavan). Hedef aile: 'deterministic'.
 * Örnek: `export const serverModule: GameServerModule = { verifier: deterministicVerifier({ … }) };`
 */
import type { GameServerModule } from '@/lib/games/verify/types';

export const serverModule: GameServerModule | null = null;
