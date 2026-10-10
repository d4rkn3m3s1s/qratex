/**
 * Veri Yılanı — kayıt defteri girdisi (istemci güvenli).
 *
 * KORU + seviye (§7.3 #11): açıklamadaki 'bot duvarları' seviye olarak gerçekleştirilecek;
 * tohum + girdi kaydıyla replay doğrulaması hedef.
 *
 * OYUN AJANI: v2'ye taşırken `component`'i `{ contract: 'v2', load }` yap, doğrulayıcıyı
 * `./data-snake.server.ts`'e yaz. Sözleşme: lib/games/README.md
 */
import { defineGame } from './types';

export const dataSnakeGame = defineGame({
  id: 'data-snake',
  gameType: 'data-snake',
  title: 'Veri Yılanı',
  tagline:
    'Yılanı yönlendir, veri paketlerini yut ve büyü; kenara ve kendi kuyruğuna çarpma.',
  emoji: '🐍',
  accent: '#10b981',
  status: 'live',
  role: 'arcade',
  verification: 'deterministic',
  // Eski sözleşmeli bileşen pratik modunu bilmiyor; v2'ye taşınınca true.
  modes: { practice: false, ranked: { attemptsPerDay: 1 } },
  component: {
    contract: 'legacy',
    load: () => import('@/components/customer/games/data-snake-game').then((m) => m.DataSnakeGame),
  },
  controls: 'Ok tuşları / WASD, kaydırma ya da ekrandaki yön tuşları.',
});
