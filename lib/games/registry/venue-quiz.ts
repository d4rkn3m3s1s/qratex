/**
 * Mekân Bilgi Yarışması — kayıt defteri girdisi (istemci güvenli).
 *
 * YENİ (§7.3, sıra 3). Kategori bazlı süreli sorular (yeme-içme, şehir kültürü, mekân bilgisi;
 * onaylı bayi sponsorlu soru şeması `lib/games/content/venue-quiz.server.ts`), asenkron düello
 * (aynı kod → aynı sorular, sunucu puanlar). Doğrulayıcı `lib/games/validators/venue-quiz.ts`.
 *
 * Portföy tavanı 12 (§7.2 ilke 4): `optIn` → öne çıkan portföyde DEĞİL; sunucu kuralında
 * varsayılan KAPALI, admin oyun panelinden açar. Turnuva rotasyonuna girmez.
 */
import { defineGame } from './types';

export const venueQuizGame = defineGame({
  id: 'venue-quiz',
  gameType: 'venue-quiz',
  title: 'Mekân Bilgi Yarışması',
  tagline:
    'Kahveden şehir lezzetlerine 10 süreli soru: doğru cevap, hız ve seri puan getirir. Pratikte kategori seç ya da arkadaşına aynı sorularla düello at.',
  emoji: '🏆',
  accent: '#8b5cf6',
  status: 'live',
  role: 'social',
  verification: 'classification',
  optIn: true,
  modes: { practice: true, ranked: { attemptsPerDay: 1 } },
  component: {
    contract: 'v2',
    load: () => import('@/components/customer/games/venue-quiz/venue-quiz-game').then((m) => m.VenueQuizGame),
  },
  controls: '1–4 ya da A–D: şık seç. Enter: devam. Esc: duraklat (sıralıda süre durmaz).',
});
