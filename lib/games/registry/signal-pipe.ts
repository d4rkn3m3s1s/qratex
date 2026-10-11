/**
 * Sinyal Bağla — kayıt defteri girdisi (istemci güvenli).
 *
 * KORU + seviye/süre (§7.3 #15): 10 seviye (5×5 → 6×6 → 7×7), ortak süre (75 sn, çözüm başına
 * +15 sn), par hamleye göre seviye yıldızı, kilitli hücreler ve tuzak borular. Garanti ödül yok:
 * süre biterse oyun biter. Saf simülasyon `components/customer/games/signal-pipe/sim.ts`; sunucu
 * aynı tohum + girdi kaydıyla yeniden oynatır (`./signal-pipe.server.ts`).
 */
import { defineGame } from './types';

export const signalPipeGame = defineGame({
  id: 'signal-pipe',
  gameType: 'signal-pipe',
  title: 'Sinyal Bağla',
  tagline: 'Boruları döndür, sinyali kaynaktan sunucuya ulaştır; süre bitmeden 10 seviyede az hamleyle yıldız topla.',
  emoji: '🔧',
  accent: '#06b6d4',
  status: 'live',
  role: 'puzzle',
  verification: 'deterministic',
  modes: { practice: true, ranked: { attemptsPerDay: 1 } },
  component: {
    contract: 'v2',
    load: () => import('@/components/customer/games/signal-pipe/signal-pipe-game').then((m) => m.SignalPipeGame),
  },
  controls: 'Boruya dokun/tıkla: saat yönünde döndür; sağ tık ya da Q: ters yön. Ok tuşları: hücreler arasında gezin, Enter/Boşluk: döndür. Esc/P: duraklat.',
});
