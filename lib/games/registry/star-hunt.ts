/**
 * Yıldız Avı — kayıt defteri girdisi (istemci güvenli).
 *
 * MOTORA TAŞI (§7.3 #10). Sunucu anahtarı geçmiş veriyle süreklilik için 'pacman' kalır
 * (PACMAN_GAME). Eski /customer/games/pacman → /customer/games/star-hunt yönlendirmesi oyun
 * ajanının işi.
 *
 * OYUN AJANI: v2'ye taşırken `component`'i `{ contract: 'v2', load }` yap, doğrulayıcıyı
 * `./star-hunt.server.ts`'e yaz. Sözleşme: lib/games/README.md
 */
import { defineGame } from './types';

export const starHuntGame = defineGame({
  id: 'star-hunt',
  gameType: 'pacman',
  title: 'Yıldız Avı',
  tagline:
    'Labirentte yıldızları topla, hayaletlerden kaç; 5 yıldız ödül eşiği.',
  emoji: '👾',
  accent: '#fbbf24',
  status: 'live',
  role: 'arcade',
  verification: 'action',
  mergedFrom: ['pacman'],
  // Eski sözleşmeli bileşen pratik modunu bilmiyor; v2'ye taşınınca true.
  modes: { practice: false, ranked: { attemptsPerDay: 1 } },
  component: {
    contract: 'legacy',
    load: () => import('@/components/customer/pacman-game').then((m) => m.PacmanGame),
  },
  controls: 'Ok tuşları / WASD ya da kaydırma.',
});
