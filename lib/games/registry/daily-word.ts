/**
 * Günün Kelimesi — kayıt defteri girdisi (istemci güvenli).
 *
 * YENİ (§7.3, sıra 1). Tamamen sunucu doğrulamalı: kelime yalnız sunucuda; her tahmin
 * `POST /api/customer/daily-word/guess` ile sunucuda renklenir ve imzalı zincire eklenir;
 * `complete` zinciri doğrular (`lib/games/validators/daily-word.ts`). Paylaşılabilir emoji kartı.
 */
import { defineGame } from './types';

export const dailyWordGame = defineGame({
  id: 'daily-word',
  gameType: 'daily-word',
  title: 'Günün Kelimesi',
  tagline:
    'Herkese aynı 5 harfli Türkçe kelimeyi 6 denemede bul; her tahminde harfler renklenir.',
  emoji: '🔤',
  accent: '#84cc16',
  status: 'live',
  role: 'puzzle',
  verification: 'classification',
  modes: { practice: true, ranked: { attemptsPerDay: 1 } },
  component: { contract: 'v2', load: () => import('@/components/customer/games/daily-word/daily-word-game').then((m) => m.DailyWordGame) },
  controls: 'Klavyeyle yaz (Türkçe harfler dahil), Enter: tahmin et, Backspace: sil, Esc: duraklat. Ekran klavyesi de var.',
});
