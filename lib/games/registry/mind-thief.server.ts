/**
 * Zihin Hırsızı — SUNUCU modülü (doğrulayıcı). Yalnız `registry/server.ts` içe aktarır.
 *
 * Aile: deterministic. İstemcinin oynadığı SAF simülasyon (`sim.ts`) start'ta verilen tohum +
 * girdi kaydı `[adım, 16, varlıkId]` ile yeniden oynatılır; skor sunucunundur. Kural dışı kayıt
 * (olmayan/bitmiş varlığa dokunuş, insanüstü tepki < 117 ms, > 14 dokunuş/sn, oyun sonrası girdi,
 * adım sayısı uyuşmazlığı) → `proof_invalid`; simülasyon süresi sunucu süresini aşarsa `implausible`.
 * Tavan skor etkin yapılandırmadan (`rules.maxScore`, admin override'ı dahil).
 */
import { deterministicVerifier } from '@/lib/games/verify';
import type { GameServerModule } from '@/lib/games/verify/types';
import { replayMindThief } from '@/components/customer/games/mind-thief/sim';

export const serverModule: GameServerModule = {
  verifier: deterministicVerifier({
    simulate: (seed, log, steps, rules) => replayMindThief(seed, log, steps, rules.maxScore),
  }),
};
