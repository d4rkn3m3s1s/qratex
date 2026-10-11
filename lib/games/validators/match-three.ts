/**
 * Eşleştir-3 — sunucu doğrulayıcısı (deterministik replay).
 *
 * Kanıt: `{ log: [[adım, CODE_SWAP, a, b] | [adım, CODE_END], …], steps }`. Sunucu `start`'taki
 * tohumla günlük rotayı (`rankedLevels(seed)`) kurar ve saf simülasyonu
 * (`components/customer/games/match-three/sim.ts`) yeniden oynatır; skor SUNUCUNUNDUR.
 * Kural dışı girdi (eşleşmeyen / komşu olmayan takas, insan üstü takas hızı, bitmiş oyuna girdi,
 * bilinmeyen kod) ya da bitmemiş oyun → `proof_invalid`; simülasyon süresi sunucu saatini aşarsa
 * → `implausible` (ortak katman). Ödül kararı ortak katmanda: doğrulanmış skor ≥ etkin eşik.
 */
import { deterministicVerifier } from '@/lib/games/verify';
import { replayMatchThree } from '@/components/customer/games/match-three/sim';

export const matchThreeVerifier = deterministicVerifier({
  hz: 60,
  simulate: (seed, log, steps) => {
    const r = replayMatchThree(seed, log, steps);
    return { score: r.score, illegal: r.illegal, detail: r.detail };
  },
});
