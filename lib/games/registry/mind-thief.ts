/**
 * Zihin Hırsızı — kayıt defteri girdisi (istemci güvenli).
 *
 * KORU + cila (§7.3 #5). Bugün eski sözleşmeyle (kendi GameShell'i) canlı; v2'ye taşınınca
 * state updater yan etkisi ve Boss3D yeniden kurulumu temizlenir.
 *
 * OYUN AJANI: v2'ye taşırken `component`'i `{ contract: 'v2', load }` yap, doğrulayıcıyı
 * `./mind-thief.server.ts`'e yaz. Sözleşme: lib/games/README.md
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
  verification: 'action',
  // Eski sözleşmeli bileşen pratik modunu bilmiyor; v2'ye taşınınca true.
  modes: { practice: false, ranked: { attemptsPerDay: 1 } },
  component: {
    contract: 'legacy',
    load: () => import('@/components/customer/games/mind-thief-game').then((m) => m.MindThiefGame),
  },
  controls: 'Dokun ya da tıkla: bozulmuş yorumu yok et.',
});
