/**
 * Güven Birleştir — sunucu doğrulayıcısı (deterministik replay).
 *
 * Kanıt: `{ log: [[adım, kod], …], steps }`. Sunucu `start`'taki tohumla saf simülasyonu
 * (`components/customer/games/trust-merge/sim.ts`) yeniden oynatır; skor (birleşim puanı)
 * SUNUCUNUNDUR. İstemcinin skor beyanı yalnız `score_mismatch` sinyali üretir. Kural dışı girdi
 * (etkisiz hamle, insan üstü hamle hızı, bitmiş oyuna girdi, bilinmeyen kod) ya da bitmemiş oyun
 * → `proof_invalid`; simülasyon süresi sunucu saatini aşarsa → `implausible` (ortak katman).
 * Ödül kararı ortak katmanda: doğrulanmış skor ≥ etkin eşik.
 */
import { deterministicVerifier } from '@/lib/games/verify';
import { replayTrustMerge } from '@/components/customer/games/trust-merge/sim';

export const trustMergeVerifier = deterministicVerifier({
  hz: 60,
  simulate: (seed, log, steps) => {
    const r = replayTrustMerge(seed, log, steps);
    return {
      score: r.score,
      illegal: r.illegal,
      detail:
        r.detail ??
        `en yüksek karo ${r.maxTile}, ${r.moves} hamle, ${r.endReason === 'bank' ? 'oyuncu bitirdi' : 'hamle kalmadı'}`,
    };
  },
});
