/**
 * Zihin Hırsızı — kayıt defteri girdisi (istemci güvenli).
 *
 * KORU + cila (§7.3 #5) — v2 sözleşmesi: saf tohumlu simülasyon (`components/customer/games/
 * mind-thief/sim.ts`), 2D canvas oynanış, dekoratif Boss3D (öfkede WebGL yeniden kurulmaz),
 * Pratik/Sıralı mod. Sunucu skoru girdi kaydını yeniden oynatarak hesaplar (`./mind-thief.server.ts`).
 */
import { defineGame } from './types';

export const mindThiefGame = defineGame({
  id: 'mind-thief',
  gameType: 'mind-thief',
  title: 'Zihin Hırsızı',
  tagline:
    'Bozulmuş yorumlara dokunup yok et, gerçek yorumlara dokunma. Patron her seviyede güçlenir.',
  emoji: '🧠',
  accent: '#a855f7',
  status: 'live',
  role: 'action',
  verification: 'deterministic',
  modes: { practice: true, ranked: { attemptsPerDay: 1 } },
  component: {
    contract: 'v2',
    load: () => import('@/components/customer/games/mind-thief/mind-thief-game').then((m) => m.MindThiefGame),
  },
  controls:
    'Dokun ya da tıkla: bozuk yorumu (turuncu, ✕) yok et; gerçek yoruma (mavi, ✓) dokunma; sarı güçleri topla. Klavye: ← → kart seç, Boşluk/Enter yok et, Esc duraklat.',
});
