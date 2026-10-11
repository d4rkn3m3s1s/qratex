/**
 * Yıldız Avı — kayıt defteri girdisi (istemci güvenli).
 *
 * MOTORA TAŞINDI (§7.3 #10). Sunucu anahtarı geçmiş veriyle süreklilik için 'pacman' kalır
 * (PACMAN_GAME); API generic `/api/customer/games/pacman/{start,complete,practice}` → `[game]`.
 * Eski /customer/games/pacman → /customer/games/star-hunt (kayıt defteri eşlemesi + kalıcı yönlendirme).
 * Saf simülasyon `components/customer/games/star-hunt/sim.ts`; sunucu aynı tohum + yön kaydıyla
 * yeniden oynatır (`./star-hunt.server.ts` → `lib/games/validators/star-hunt.ts`).
 */
import { defineGame } from './types';

export const starHuntGame = defineGame({
  id: 'star-hunt',
  gameType: 'pacman',
  title: 'Yıldız Avı',
  tagline: 'Labirentte yıldızları topla, hayaletlerden kaç: 5 seviye, 3 can, güç kapsülüyle hayaletleri kovala.',
  emoji: '👾',
  accent: '#fbbf24',
  status: 'live',
  role: 'arcade',
  verification: 'deterministic',
  mergedFrom: ['pacman'],
  modes: { practice: true, ranked: { attemptsPerDay: 1 } },
  component: {
    contract: 'v2',
    load: () => import('@/components/customer/games/star-hunt/star-hunt-game').then((m) => m.StarHuntGame),
  },
  controls: 'Ok tuşları / WASD, kaydırma ya da ekrandaki yön tuşları: yön ver. Esc/P: duraklat.',
});
