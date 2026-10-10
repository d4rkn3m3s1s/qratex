/**
 * Eşleştir-3 — kayıt defteri girdisi (istemci güvenli).
 *
 * YENİ (§7.3, sıra 2). memory-match'in yerini alır; seviye haritası, Qratex rozet ikonları;
 * tohum + hamle kaydıyla replay.
 *
 * OYUN AJANI: `component`'i v2 bileşenine bağla, `status: 'live'` yap, sunucu doğrulayıcısını
 * `./match-three.server.ts`'e yaz ve `lib/minigame-config.ts`'teki `match-three` satırından `hidden`/`release`'i kaldır.
 */
import { defineGame } from './types';

export const matchThreeGame = defineGame({
  id: 'match-three',
  gameType: 'match-three',
  title: 'Eşleştir-3',
  tagline:
    'Komşu rozetleri yer değiştirerek üç ve fazlasını eşleştir; seviye hedefini hamle bitmeden tamamla.',
  emoji: '💎',
  accent: '#ec4899',
  status: 'building',
  role: 'casual',
  verification: 'deterministic',
  modes: { practice: true, ranked: { attemptsPerDay: 1 } },
  component: null,
  controls: 'Rozete dokun, sonra komşusuna dokun ya da kaydır. Klavyede ok tuşları + Enter.',
});
