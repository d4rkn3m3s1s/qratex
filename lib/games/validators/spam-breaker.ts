/**
 * Spam Kırıcı — sunucu doğrulayıcısı (deterministik replay).
 *
 * Kanıt: `{ log: [[adım, kod, a?], …], steps }`. Sunucu `start`'taki tohumla saf tamsayı
 * simülasyonunu (`components/customer/games/spam-breaker/sim.ts`) yeniden oynatır; skor
 * SUNUCUNUNDUR. Kural dışı girdi (oyun sırasında fırlat, aralık dışı hedef, bilinmeyen kod,
 * bitmiş oyuna girdi) ya da beyan edilen adımda bitmemiş oyun → `proof_invalid`; simülasyon
 * süresi sunucu saatini aşarsa → `implausible`. Ödül: doğrulanmış skor ≥ eşik (topu kaçırmak
 * eşiği geçmiş skoru silmez).
 */
import { deterministicVerifier } from '@/lib/games/verify';
import { END_TEXT, HZ, replaySpamBreaker } from '@/components/customer/games/spam-breaker/sim';

export const spamBreakerVerifier = deterministicVerifier({
  hz: HZ,
  simulate: (seed, log, steps) => {
    const r = replaySpamBreaker(seed, log, steps);
    return {
      score: r.score,
      illegal: r.illegal,
      detail: r.detail ?? `seviye ${r.level}${r.cause ? `, ${END_TEXT[r.cause]}` : ''}`,
    };
  },
});
