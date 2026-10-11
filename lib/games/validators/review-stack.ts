/**
 * Yorum İstifi — sunucu doğrulayıcısı (deterministik replay).
 *
 * Kanıt: `{ log: [[tick, kod], …], steps }`. Sunucu `start`'taki tohumla saf simülasyonu
 * (`components/customer/games/review-stack/sim.ts`) yeniden oynatır; skor SUNUCUNUNDUR, tavan
 * sunucunun ETKİN kuralından (`rules.maxScore`). İstemci beyanı yalnız `score_mismatch` sinyalidir.
 * Kural dışı girdi (geri sayımda / bitmiş oyunda girdi, bilinmeyen kod), sırası bozuk kayıt ya da
 * beyan edilen adımda bitmemiş oyun → `proof_invalid`; simülasyon süresi sunucu saatini aşarsa → `implausible`.
 */
import { deterministicVerifier } from '@/lib/games/verify';
import { END_TEXT, replayReviewStack } from '@/components/customer/games/review-stack/sim';

export const reviewStackVerifier = deterministicVerifier({
  hz: 60,
  simulate: (seed, log, steps, rules) => {
    const r = replayReviewStack(seed, log, steps, rules.maxScore);
    return {
      score: r.score,
      illegal: r.illegal,
      detail: r.detail ?? `${r.lines} satır, seviye ${r.level}${r.cause ? `, ${END_TEXT[r.cause]}` : ''}`,
    };
  },
});
