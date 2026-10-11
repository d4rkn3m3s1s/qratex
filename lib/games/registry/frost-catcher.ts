/**
 * Kar Tanesi Yakala — kayıt defteri girdisi (istemci güvenli).
 *
 * KORU, aile şablonu (§7.3 #8); Güven Muhafızı'nın iyi/kötü ayrımı modifikatör olarak birleşti
 * (§7.3 #9): kara buz (bozuk yorum) yakalanmamalı, Güven Kalkanı bir kara buzu emer.
 * v2 sözleşmesi: saf tohumlu simülasyon (`components/customer/games/frost-catcher/sim.ts`), 2D canvas,
 * Pratik/Sıralı. Sunucu skoru girdi kaydını yeniden oynatarak hesaplar (`./frost-catcher.server.ts`).
 */
import { defineGame } from './types';

export const frostCatcherGame = defineGame({
  id: 'frost-catcher',
  gameType: 'frost-catcher',
  title: 'Kar Tanesi Yakala',
  tagline:
    'Kar tanelerini eldivenle yakala, kombo yap; altın kristal +3. Kara buzdan kaç, Güven Kalkanı bir darbeyi emer.',
  emoji: '❄️',
  accent: '#38bdf8',
  status: 'live',
  role: 'action',
  verification: 'deterministic',
  mergedFrom: ['guardian-of-trust'],
  modes: { practice: true, ranked: { attemptsPerDay: 1 } },
  component: {
    contract: 'v2',
    load: () => import('@/components/customer/games/frost-catcher/frost-catcher-game').then((m) => m.FrostCatcherGame),
  },
  controls:
    'Parmağını/fareyi oyun alanında yatay kaydır ya da ← / → (A / D) tuşları. Kar ve altını yakala, kara buzdan (✕) kaç. Esc duraklatır.',
});
