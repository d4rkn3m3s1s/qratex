/**
 * Veri Yılanı — kayıt defteri girdisi (istemci güvenli).
 *
 * KORU + seviye (§7.3 #11): 5 seviye × 6 paket; seviye 2'den itibaren bot duvarları, 4'ten
 * itibaren devriye botları. Saf simülasyon `components/customer/games/data-snake/sim.ts`;
 * sunucu aynı tohum + girdi kaydıyla yeniden oynatır (`./data-snake.server.ts` →
 * `lib/games/validators/data-snake.ts`). Ödül: doğrulanmış skor ≥ eşik (ölmek ödülü silmez).
 */
import { defineGame } from './types';

export const dataSnakeGame = defineGame({
  id: 'data-snake',
  gameType: 'data-snake',
  title: 'Veri Yılanı',
  tagline:
    'Veri paketlerini yut, 5 seviyede bot duvarlarından ve devriye botlarından kaç; eşiği geçince çarpsan da skorun sayılır.',
  emoji: '🐍',
  accent: '#10b981',
  status: 'live',
  role: 'arcade',
  verification: 'deterministic',
  modes: { practice: true, ranked: { attemptsPerDay: 1 } },
  component: {
    contract: 'v2',
    load: () => import('@/components/customer/games/data-snake/data-snake-game').then((m) => m.DataSnakeGame),
  },
  controls: 'Ok tuşları / WASD ile yön ver; dokunmatikte kaydır ya da yön düğmeleri. Esc/P: duraklat.',
});
