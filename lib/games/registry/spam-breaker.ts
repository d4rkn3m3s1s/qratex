/**
 * Spam Kırıcı — kayıt defteri girdisi (istemci güvenli).
 *
 * KORU (§7.3 #13): tamsayı fizik + motorun 60 Hz sabit adımı (4 alt-adım) → 120/144 Hz ekranda
 * 2× hız hatası yapısal olarak kapandı. 5 seviye, bot tuğlaları, kapsüller (geniş kalkan / +1 can).
 * Saf simülasyon `components/customer/games/spam-breaker/sim.ts`; sunucu aynı tohum + girdi
 * kaydıyla yeniden oynatır (`./spam-breaker.server.ts`). Ödül: skor ≥ eşik (topu kaçırmak silmez).
 */
import { defineGame } from './types';

export const spamBreakerGame = defineGame({
  id: 'spam-breaker',
  gameType: 'spam-breaker',
  title: 'Spam Kırıcı',
  tagline: 'Kalkanı kaydır, topu sektir, 5 seviyede spam ve bot tuğlalarını kır; eşiği geçince top kaçsa da skorun sayılır.',
  emoji: '🧊',
  accent: '#f43f5e',
  status: 'live',
  role: 'arcade',
  verification: 'deterministic',
  modes: { practice: true, ranked: { attemptsPerDay: 1 } },
  component: {
    contract: 'v2',
    load: () => import('@/components/customer/games/spam-breaker/spam-breaker-game').then((m) => m.SpamBreakerGame),
  },
  controls: 'Parmağını/fareyi oyun alanında kaydır ya da ← / → (A / D); Boşluk ya da dokunup bırak: fırlat. Esc/P: duraklat.',
});
