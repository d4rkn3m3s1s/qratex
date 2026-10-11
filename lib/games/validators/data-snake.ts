/**
 * Veri Yılanı — sunucu doğrulayıcısı (deterministik replay).
 *
 * Kanıt: `{ log: [[tick, yön], …], steps }`. Sunucu `start`'taki tohumla saf simülasyonu
 * (`components/customer/games/data-snake/sim.ts`) yeniden oynatır; skor SUNUCUNUNDUR. İstemcinin
 * skor beyanı yalnız `score_mismatch` sinyali üretir. Kural dışı girdi (180° dönüş, dolu tampon,
 * bitmiş oyuna girdi, bilinmeyen kod) ya da beyan edilen adımda bitmemiş oyun → `proof_invalid`;
 * simülasyon süresi sunucu saatini aşarsa (hızlandırılmış betik) → `implausible`.
 * Ödül kararı ortak katmanda: doğrulanmış skor ≥ eşik (ölmek ödülü silmez).
 */
import { deterministicVerifier } from '@/lib/games/verify';
import { replayDataSnake, DEATH_TEXT } from '@/components/customer/games/data-snake/sim';

export const dataSnakeVerifier = deterministicVerifier({
  hz: 60,
  simulate: (seed, log, steps) => {
    const r = replayDataSnake(seed, log, steps);
    return {
      score: r.score,
      illegal: r.illegal,
      detail: r.detail ?? (r.won ? 'tam tur' : `seviye ${r.level}${r.cause ? `, ${DEATH_TEXT[r.cause]}` : ''}`),
    };
  },
});
