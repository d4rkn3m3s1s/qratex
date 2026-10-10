/**
 * Yorum İstifi — kayıt defteri girdisi (istemci güvenli).
 *
 * KORU + giriş düzeltmesi (§7.3 #12): ≥640px dokunmatikte kontrol yok hatası motorun
 * `isCoarsePointer` ölçütüyle kapanır.
 *
 * OYUN AJANI: v2'ye taşırken `component`'i `{ contract: 'v2', load }` yap, doğrulayıcıyı
 * `./review-stack.server.ts`'e yaz. Sözleşme: lib/games/README.md
 */
import { defineGame } from './types';

export const reviewStackGame = defineGame({
  id: 'review-stack',
  gameType: 'review-stack',
  title: 'Yorum İstifi',
  tagline:
    'Düşen yorum bloklarını döndürüp diz; dolan satır onaylanır ve silinir.',
  emoji: '🧱',
  accent: '#3b82f6',
  status: 'live',
  role: 'arcade',
  verification: 'deterministic',
  // Eski sözleşmeli bileşen pratik modunu bilmiyor; v2'ye taşınınca true.
  modes: { practice: false, ranked: { attemptsPerDay: 1 } },
  component: {
    contract: 'legacy',
    load: () => import('@/components/customer/games/review-stack-game').then((m) => m.ReviewStackGame),
  },
  controls: '← / → kaydır, ↑ döndür, ↓ hızlı indir; dokunmatikte ekran tuşları ya da kaydırma.',
});
