/**
 * Çekirdek Savunması — kayıt defteri girdisi (istemci güvenli).
 *
 * BİRLEŞTİR (§7.3 #6–7): spam-defense + troll-slayer. Çekirdek HP + 8 dalga + dalga arası
 * yükseltme; motorun sabit adımlı döngüsü (60 Hz). Saf simülasyon
 * `components/customer/games/core-defense/sim.ts`; sunucu aynı tohum + girdi kaydıyla yeniden
 * oynatır (`./core-defense.server.ts` → `lib/games/validators/core-defense.ts`).
 */
import { defineGame } from './types';

export const coreDefenseGame = defineGame({
  id: 'core-defense',
  gameType: 'core-defense',
  title: 'Çekirdek Savunması',
  tagline:
    'Qratex çekirdeğini spam ve trol dalgalarından koru: çekirdeğin canı var, 8 dalga zorlaşır, aralarda yükseltme seç.',
  emoji: '🛡️',
  accent: '#ef4444',
  status: 'live',
  role: 'action',
  verification: 'deterministic',
  mergedFrom: ['spam-defense', 'troll-slayer'],
  modes: { practice: true, ranked: { attemptsPerDay: 1 } },
  component: {
    contract: 'v2',
    load: () => import('@/components/customer/games/core-defense/core-defense-game').then((m) => m.CoreDefenseGame),
  },
  controls:
    'Dokun/tıkla: düşmanı vur. Boşluk/Enter: en tehlikeli düşmana ateş. Q ya da Kalkan düğmesi: kalkan darbesi. 1-3: yükseltme seç. Esc/P: duraklat.',
});
