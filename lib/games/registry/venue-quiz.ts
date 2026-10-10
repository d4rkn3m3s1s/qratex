/**
 * Mekân Bilgi Yarışması — kayıt defteri girdisi (istemci güvenli).
 *
 * YENİ (§7.3, sıra 3). Bayi sponsorlu sorular, kategori bazlı, asenkron düello. Portföy tavanı
 * 12: canlıya çıktığında en zayıf oyun emekliye ayrılır (§7.2 ilke 4).
 *
 * OYUN AJANI: `component`'i v2 bileşenine bağla, `status: 'live'` yap, sunucu doğrulayıcısını
 * `./venue-quiz.server.ts`'e yaz ve `lib/minigame-config.ts`'teki `venue-quiz` satırından `hidden`/`release`'i kaldır.
 */
import { defineGame } from './types';

export const venueQuizGame = defineGame({
  id: 'venue-quiz',
  gameType: 'venue-quiz',
  title: 'Mekân Bilgi Yarışması',
  tagline:
    'Mekânlar ve kategoriler hakkında süreli sorular; doğru cevap ve hız puan getirir.',
  emoji: '🏆',
  accent: '#8b5cf6',
  status: 'building',
  role: 'social',
  verification: 'classification',
  modes: { practice: true, ranked: { attemptsPerDay: 1 } },
  component: null,
  controls: '1-4 tuşları ya da dokun: şık seç.',
});
