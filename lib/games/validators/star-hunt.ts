/**
 * Yıldız Avı — sunucu doğrulayıcısı (deterministik replay).
 *
 * Kanıt: `{ log: [[tick, yön], …], steps }`. Sunucu `start`'taki tohumla saf simülasyonu
 * (`components/customer/games/star-hunt/sim.ts`) yeniden oynatır; skor (toplanan yıldız)
 * SUNUCUNUNDUR. İstemcinin beyanı yalnız `score_mismatch` sinyali üretir. Kural dışı girdi
 * (bilinmeyen kod, bitmiş oyuna girdi) ya da beyan edilen adımda bitmemiş oyun → `proof_invalid`;
 * simülasyon süresi sunucu saatini aşarsa (hızlandırılmış betik) → `implausible`.
 * Eski açık (rapor bulgu 4): "start → 5 sn bekle → won:true, 5 yıldız" artık kanıt ister.
 */
import { deterministicVerifier } from '@/lib/games/verify';
import { HZ, replayStarHunt } from '@/components/customer/games/star-hunt/sim';

export const starHuntVerifier = deterministicVerifier({
  hz: HZ,
  simulate: (seed, log, steps) => {
    const r = replayStarHunt(seed, log, steps);
    return {
      score: r.score,
      illegal: r.illegal,
      detail: r.detail ?? (r.won ? 'tüm seviyeler' : `seviye ${r.level ?? 1}`),
    };
  },
});
