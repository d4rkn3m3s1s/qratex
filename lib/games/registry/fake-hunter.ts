/**
 * Sahte Avcısı — kayıt defteri girdisi (istemci güvenli).
 *
 * Amiral oyun (§7.3 #1–4). Dört eski oyun tek oyunda dört mod: Kaydır (truth-vs-fake), Dosya
 * (review-detective), Kelime (word-spot), Profil (bot-hunter). İçerik
 * `lib/games/content/fake-hunter.ts` (etiketli, yalnız sunucu); tur `start` cevabında etiketsiz
 * gelir.
 *
 * OYUN AJANI: `component`'i v2 bileşenine bağla, `status: 'live'` yap, sunucu doğrulayıcısını
 * `./fake-hunter.server.ts`'e yaz ve `lib/minigame-config.ts`'teki `fake-hunter` satırından `hidden`/`release`'i kaldır.
 */
import { defineGame } from './types';

export const fakeHunterGame = defineGame({
  id: 'fake-hunter',
  gameType: 'fake-hunter',
  title: 'Sahte Avcısı',
  tagline:
    'Gerçek yorumu sahtesinden ayır: kaydır, dosyayı incele, botu yakala. Sunucu puanlar, zorluk seninle büyür.',
  emoji: '🕵️',
  accent: '#22d3ee',
  status: 'building',
  role: 'flagship',
  verification: 'classification',
  mergedFrom: ['truth-vs-fake', 'review-detective', 'word-spot', 'bot-hunter'],
  modes: { practice: true, ranked: { attemptsPerDay: 1 } },
  component: null,
  controls: 'Kaydırma ya da ← / → tuşları: sahte / gerçek. Enter: seçili kartı onayla.',
});
