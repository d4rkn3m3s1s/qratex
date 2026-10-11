/**
 * Çekirdek Savunması — sunucu doğrulayıcısı (deterministik replay).
 *
 * Kanıt: `{ log: [[tick, kod, a?, b?], …], steps }`. Sunucu `start`'taki tohumla saf simülasyonu
 * (`components/customer/games/core-defense/sim.ts`) yeniden oynatır; skor SUNUCUNUNDUR. İstemcinin
 * skor beyanı yalnız `score_mismatch` sinyali üretir. Kural dışı girdi (dolmamış kalkan, seçim
 * fazı dışında seçim, bitmiş oyuna girdi) ya da beyan edilen adımda bitmemiş oyun → `proof_invalid`;
 * simülasyon süresi sunucu saatini aşarsa (hızlandırılmış betik) → `implausible`.
 */
import { deterministicVerifier } from '@/lib/games/verify';
import { replayCoreDefense } from '@/components/customer/games/core-defense/sim';

export const coreDefenseVerifier = deterministicVerifier({
  hz: 60,
  simulate: (seed, log, steps) => {
    const r = replayCoreDefense(seed, log, steps);
    return { score: r.score, illegal: r.illegal, detail: r.detail ?? (r.won ? `zafer, dalga ${r.wave}` : `dalga ${r.wave}`) };
  },
});
