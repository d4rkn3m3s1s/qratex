/**
 * Yorum İstifi — kayıt defteri girdisi (istemci güvenli).
 *
 * KORU + giriş düzeltmesi (§7.3 #12): v2 motor. Saf simülasyon
 * `components/customer/games/review-stack/sim.ts` (tohumlu 7'li torba, SRS döndürme, lock-out,
 * 10 seviyelik hızlanma); sunucu aynı tohum + girdi kaydıyla yeniden oynatır
 * (`./review-stack.server.ts` → `lib/games/validators/review-stack.ts`). Dokunmatik kontroller
 * ekran genişliğiyle değil `useCoarsePointer` ile gösterilir (≥640 px iPad dahil).
 */
import { defineGame } from './types';

export const reviewStackGame = defineGame({
  id: 'review-stack',
  gameType: 'review-stack',
  title: 'Yorum İstifi',
  tagline:
    'Düşen yorum bloklarını döndürüp diz; dolan satır onaylanır ve silinir. Seviye arttıkça bloklar hızlanır.',
  emoji: '🧱',
  accent: '#3b82f6',
  status: 'live',
  role: 'arcade',
  verification: 'deterministic',
  modes: { practice: true, ranked: { attemptsPerDay: 1 } },
  component: {
    contract: 'v2',
    load: () => import('@/components/customer/games/review-stack/review-stack-game').then((m) => m.ReviewStackGame),
  },
  controls:
    '← / → kaydır, ↑ ya da X döndür, Z ters döndür, ↓ yumuşak düşür, Boşluk sert düşür, C sakla, Esc/P duraklat; dokunmatikte sürükle, dokun ya da ekran tuşları.',
});
