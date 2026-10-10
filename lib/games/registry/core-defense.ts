/**
 * Çekirdek Savunması — kayıt defteri girdisi (istemci güvenli).
 *
 * BİRLEŞTİR (§7.3 #6–7): spam-defense + troll-slayer. Çekirdek HP + dalga + yükseltme; motorun
 * sabit adımlı döngüsüyle (kare hızından bağımsız).
 *
 * OYUN AJANI: `component`'i v2 bileşenine bağla, `status: 'live'` yap, sunucu doğrulayıcısını
 * `./core-defense.server.ts`'e yaz ve `lib/minigame-config.ts`'teki `core-defense` satırından `hidden`/`release`'i kaldır.
 */
import { defineGame } from './types';

export const coreDefenseGame = defineGame({
  id: 'core-defense',
  gameType: 'core-defense',
  title: 'Çekirdek Savunması',
  tagline:
    'Qratex çekirdeğini spam ve trol dalgalarından koru: çekirdeğin canı var, dalgalar zorlaşır, aralarda yükseltme seç.',
  emoji: '🛡️',
  accent: '#ef4444',
  status: 'building',
  role: 'action',
  verification: 'action',
  mergedFrom: ['spam-defense', 'troll-slayer'],
  modes: { practice: true, ranked: { attemptsPerDay: 1 } },
  component: null,
  controls: 'Dokun/tıkla: hedefe ateş. 1-3: yükseltme seç.',
});
