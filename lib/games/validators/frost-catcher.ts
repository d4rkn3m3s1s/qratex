/**
 * Kar Tanesi Yakala — sunucu doğrulayıcısı (deterministik replay).
 *
 * Kanıt: `{ log: [[adım, kod, a], …], steps }`. Sunucu `start`'taki tohumla saf simülasyonu
 * (`components/customer/games/frost-catcher/sim.ts`) yeniden oynatır; skor SUNUCUNUNDUR (istemci beyanı
 * yalnız `score_mismatch` sinyali). Kural dışı girdi (aralık dışı hedef, bilinmeyen kod, insanüstü girdi
 * hızı, oyun sonrası girdi, beyan edilen adımda bitmemiş oyun) → `proof_invalid`; simülasyon süresi
 * sunucu saatini aşarsa (hızlandırılmış betik) → `implausible`. Tavan: etkin `rules.maxScore`.
 */
import { deterministicVerifier } from '@/lib/games/verify';
import { replayFrost } from '@/components/customer/games/frost-catcher/sim';

export const frostCatcherVerifier = deterministicVerifier({
  hz: 60,
  simulate: (seed, log, steps, rules) => replayFrost(seed, log, steps, rules.maxScore),
});
