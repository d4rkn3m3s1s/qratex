/**
 * Eşleştir-3 — kayıt defteri girdisi (istemci güvenli).
 *
 * YENİ (§7.3, sıra 2). 30 seviyelik hedefli harita (puan / topla / cam), Qratex rozet taşları,
 * özel taşlar (Hat, Bomba, Prizma) ve kombolar. Saf simülasyon
 * `components/customer/games/match-three/sim.ts`; sunucu aynı tohum + hamle kaydıyla yeniden
 * oynatır (`./match-three.server.ts` → `lib/games/validators/match-three.ts`).
 * Sıralı: tohumdan seçilen 5 seviyelik günlük rota. Pratik: haritadan seçilen tek seviye.
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
  status: 'live',
  role: 'casual',
  verification: 'deterministic',
  modes: { practice: true, ranked: { attemptsPerDay: 1 } },
  component: {
    contract: 'v2',
    load: () => import('@/components/customer/games/match-three/match-three-game').then((m) => m.MatchThreeGame),
  },
  controls:
    'Rozeti komşusuna doğru kaydır ya da önce rozete sonra komşusuna dokun. Klavyede ok tuşlarıyla gez, Enter/Boşluk ile seç, ok ile takas et. Esc/P: duraklat.',
});
