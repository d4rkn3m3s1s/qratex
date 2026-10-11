/**
 * Sinyal Bağla — sunucu doğrulayıcısı (deterministik replay).
 *
 * Kanıt: `{ log: [[adım, kod, hücre?], …], steps }`. Sunucu `start`'taki tohumla saf tamsayı
 * simülasyonunu (`components/customer/games/signal-pipe/sim.ts`) adım adım yeniden oynatır;
 * seviyeler, süre, par/yıldız ve skor SUNUCUNUNDUR. Kural dışı girdi (boş/kilitli/aralık dışı
 * hücre, seviye geçişinde ya da insan üstü hızda dokunuş, bitmiş oyuna girdi, bilinmeyen kod) ya
 * da beyan edilen adımda bitmemiş oyun → `proof_invalid`; simülasyon süresi sunucu saatini
 * aşarsa → `implausible` (ortak katman). Ödül: doğrulanmış skor ≥ etkin eşik (garanti yok —
 * süre biterse oyun biter).
 */
import { deterministicVerifier } from '@/lib/games/verify';
import { END_TEXT, HZ, replaySignalPipe } from '@/components/customer/games/signal-pipe/sim';

export const signalPipeVerifier = deterministicVerifier({
  hz: HZ,
  simulate: (seed, log, steps) => {
    const r = replaySignalPipe(seed, log, steps);
    return {
      score: r.score,
      illegal: r.illegal,
      detail:
        r.detail ??
        `${r.levelsSolved} seviye, ${r.totalMoves} dokunuş${r.endReason ? `, ${END_TEXT[r.endReason]}` : ''}`,
    };
  },
});
