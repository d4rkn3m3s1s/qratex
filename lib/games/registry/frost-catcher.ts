/**
 * Kar Tanesi Yakala — kayıt defteri girdisi (istemci güvenli).
 *
 * KORU, aile şablonu (§7.3 #8); guardian-of-trust'ın iyi/kötü ayrımı modifikatör olarak buraya
 * birleşecek (§7.3 #9).
 *
 * OYUN AJANI: v2'ye taşırken `component`'i `{ contract: 'v2', load }` yap, doğrulayıcıyı
 * `./frost-catcher.server.ts`'e yaz. Sözleşme: lib/games/README.md
 */
import { defineGame } from './types';

export const frostCatcherGame = defineGame({
  id: 'frost-catcher',
  gameType: 'frost-catcher',
  title: 'Kar Tanesi Yakala',
  tagline:
    'Düşen kar tanelerini eldivenle yakala, kombo yap; altın kristal bonus, kaçan tane can götürür.',
  emoji: '❄️',
  accent: '#38bdf8',
  status: 'live',
  role: 'action',
  verification: 'action',
  mergedFrom: ['guardian-of-trust'],
  // Eski sözleşmeli bileşen pratik modunu bilmiyor; v2'ye taşınınca true.
  modes: { practice: false, ranked: { attemptsPerDay: 1 } },
  component: {
    contract: 'legacy',
    load: () => import('@/components/customer/games/frost-catcher-game').then((m) => m.FrostCatcherGame),
  },
  controls: 'Parmağını/fareyi yatay kaydır ya da ← / → tuşları.',
});
