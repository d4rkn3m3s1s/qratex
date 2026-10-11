/**
 * Güven Birleştir — kayıt defteri girdisi (istemci güvenli).
 *
 * KORU + skor normalizasyonu (§7.3 #14): skor = birleşim puanı (karo değeri değil), böylece
 * liderlik/turnuva ince taneli sıralanır ve başarımlar (`bestScorePct`) diğer oyunlarla aynı
 * birimde ölçülür. Saf simülasyon `components/customer/games/trust-merge/sim.ts`; sunucu aynı
 * tohum + girdi kaydıyla yeniden oynatır (`./trust-merge.server.ts` →
 * `lib/games/validators/trust-merge.ts`).
 */
import { defineGame } from './types';

export const trustMergeGame = defineGame({
  id: 'trust-merge',
  gameType: 'trust-merge',
  title: 'Güven Birleştir',
  tagline: 'Aynı karoları kaydırıp birleştir: her birleşim puan getirir. En büyük karoyu köşede tut, eşiği aş.',
  emoji: '🔢',
  accent: '#f59e0b',
  status: 'live',
  role: 'puzzle',
  verification: 'deterministic',
  modes: { practice: true, ranked: { attemptsPerDay: 1 } },
  component: {
    contract: 'v2',
    load: () => import('@/components/customer/games/trust-merge/trust-merge-game').then((m) => m.TrustMergeGame),
  },
  controls: 'Ok tuşları / WASD ya da tahtada kaydır; dokunmatikte yön düğmeleri. Bitirmek için “Bitir”e basılı tut. Esc/P: duraklat.',
});
