/**
 * Spam Kırıcı — kayıt defteri girdisi (istemci güvenli).
 *
 * KORU (§7.3 #13): alt-adımlı fizik sabit adımlı döngüye taşınınca 120 Hz'de 2× hız hatası
 * kapanır.
 *
 * OYUN AJANI: v2'ye taşırken `component`'i `{ contract: 'v2', load }` yap, doğrulayıcıyı
 * `./spam-breaker.server.ts`'e yaz. Sözleşme: lib/games/README.md
 */
import { defineGame } from './types';

export const spamBreakerGame = defineGame({
  id: 'spam-breaker',
  gameType: 'spam-breaker',
  title: 'Spam Kırıcı',
  tagline:
    'Kalkanı kaydır, topu sektir, spam tuğlalarını kır; topu düşürme.',
  emoji: '🧊',
  accent: '#f43f5e',
  status: 'live',
  role: 'arcade',
  verification: 'deterministic',
  // Eski sözleşmeli bileşen pratik modunu bilmiyor; v2'ye taşınınca true.
  modes: { practice: false, ranked: { attemptsPerDay: 1 } },
  component: {
    contract: 'legacy',
    load: () => import('@/components/customer/games/spam-breaker-game').then((m) => m.SpamBreakerGame),
  },
  controls: 'Parmağını/fareyi yatay kaydır ya da ← / → tuşları.',
});
