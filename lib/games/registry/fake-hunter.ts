/**
 * Sahte Avcısı — kayıt defteri girdisi (istemci güvenli).
 *
 * Amiral oyun (§7.3 #1–4). Dört eski oyun tek oyunda dört mod: Kaydır (truth-vs-fake), Dosya
 * (review-detective), Kelime (word-spot), Profil (bot-hunter). İçerik
 * `lib/games/content/fake-hunter.ts` (etiketli, yalnız sunucu); tur `start` cevabında etiketsiz
 * gelir.
 *
 * Canlı (Dalga 2): v2 bileşeni `components/customer/games/fake-hunter/`, doğrulayıcı
 * `lib/games/validators/fake-hunter.ts` (sınıflandırma; 4 aşama × 3 vaka, sunucu puanlar).
 */
import { defineGame } from './types';

export const fakeHunterGame = defineGame({
  id: 'fake-hunter',
  gameType: 'fake-hunter',
  title: 'Sahte Avcısı',
  tagline:
    'Dört aşamada sahteyi yakala: yorumu kaydır, yorumcu dosyasını incele, ele veren cümleyi bul, botu tanı. Sıralıda puanı sunucu hesaplar; pratikte zorluk seviyene göre ayarlanır.',
  emoji: '🕵️',
  accent: '#22d3ee',
  status: 'live',
  role: 'flagship',
  verification: 'classification',
  mergedFrom: ['truth-vs-fake', 'review-detective', 'word-spot', 'bot-hunter'],
  modes: { practice: true, ranked: { attemptsPerDay: 1 } },
  component: {
    contract: 'v2',
    load: () => import('@/components/customer/games/fake-hunter/fake-hunter-game').then((m) => m.FakeHunterGame),
  },
  controls: 'Kaydır ya da ← / A: sahte (bot), → / D: gerçek (insan). Kelime aşamasında 1–4: cümle seç. Enter: devam, Esc: duraklat.',
});
