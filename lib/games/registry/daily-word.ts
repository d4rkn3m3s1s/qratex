/**
 * Günün Kelimesi — kayıt defteri girdisi (istemci güvenli).
 *
 * YENİ (§7.3, sıra 1). Tamamen sunucu doğrulamalı: kelime sunucuda, her tahmin sunucuda
 * renklenir; paylaşılabilir sonuç kartı.
 *
 * OYUN AJANI: `component`'i v2 bileşenine bağla, `status: 'live'` yap, sunucu doğrulayıcısını
 * `./daily-word.server.ts`'e yaz ve `lib/minigame-config.ts`'teki `daily-word` satırından `hidden`/`release`'i kaldır.
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
  status: 'building',
  role: 'puzzle',
  verification: 'classification',
  modes: { practice: true, ranked: { attemptsPerDay: 1 } },
  component: null,
  controls: 'Klavyeyle yaz, Enter: tahmin et, Backspace: sil. Ekran klavyesi de var.',
});
