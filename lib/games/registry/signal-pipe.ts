/**
 * Sinyal Bağla — kayıt defteri girdisi (istemci güvenli).
 *
 * KORU + seviye/süre (§7.3 #15): süre ve hamle sınırı eklenecek (bugün garanti ödül).
 *
 * OYUN AJANI: v2'ye taşırken `component`'i `{ contract: 'v2', load }` yap, doğrulayıcıyı
 * `./signal-pipe.server.ts`'e yaz. Sözleşme: lib/games/README.md
 */
import { defineGame } from './types';

export const signalPipeGame = defineGame({
  id: 'signal-pipe',
  gameType: 'signal-pipe',
  title: 'Sinyal Bağla',
  tagline:
    'Boruları döndürerek sinyali kaynaktan sunucuya ulaştır; kesintisiz hat kur.',
  emoji: '🔧',
  accent: '#06b6d4',
  status: 'live',
  role: 'puzzle',
  verification: 'deterministic',
  // Eski sözleşmeli bileşen pratik modunu bilmiyor; v2'ye taşınınca true.
  modes: { practice: false, ranked: { attemptsPerDay: 1 } },
  component: {
    contract: 'legacy',
    load: () => import('@/components/customer/games/signal-pipe-game').then((m) => m.SignalPipeGame),
  },
  controls: 'Hücreye dokun/tıkla: döndür.',
});
