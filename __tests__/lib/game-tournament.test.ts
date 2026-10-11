/**
 * lib/game-tournament — haftalık turnuva düzeltmeleri (P0-17 / oyun-ekosistemi K4):
 * belirli sıralama (skor desc, ilk ulaşma asc), tek öne çıkan oyun rotasyonu,
 * minParticipants altında ödül yok.
 */
import {
  TOURNAMENT_MIN_PARTICIPANTS,
  featuredGameTypeForWeek,
  parseWeekKey,
  prizeFor,
  prizeTable,
  rankWeekly,
} from '@/lib/game-tournament';
import { getGameDef, visibleMiniGames } from '@/lib/minigame-config';
import * as t from '@/lib/game-tournament';
import { LIVE_GAME_TYPES } from '@/lib/games/registry/live-game-types';

const d = (iso: string) => new Date(iso);

describe('rankWeekly — eşitlik kırıcı', () => {
  it('eşit skorda o skoru ÖNCE yapan önde (eskiden Postgres sırası belirsizdi → iki "1.")', () => {
    const ranked = rankWeekly([
      { userId: 'late', starsCollected: 10, completedAt: d('2026-10-07T12:00:00Z') },
      { userId: 'early', starsCollected: 10, completedAt: d('2026-10-06T09:00:00Z') },
      { userId: 'low', starsCollected: 7, completedAt: d('2026-10-05T09:00:00Z') },
    ]);
    expect(ranked.map((r) => r.userId)).toEqual(['early', 'late', 'low']);
  });

  it('kullanıcı başına en iyi skor + o skora İLK ulaşma anı', () => {
    const ranked = rankWeekly([
      { userId: 'a', starsCollected: 8, completedAt: d('2026-10-06T10:00:00Z') },
      { userId: 'a', starsCollected: 9, completedAt: d('2026-10-07T10:00:00Z') },
      { userId: 'a', starsCollected: 9, completedAt: d('2026-10-08T10:00:00Z') },
      { userId: 'b', starsCollected: 9, completedAt: d('2026-10-07T11:00:00Z') },
    ]);
    expect(ranked).toEqual([
      { userId: 'a', best: 9, achievedAt: d('2026-10-07T10:00:00Z') },
      { userId: 'b', best: 9, achievedAt: d('2026-10-07T11:00:00Z') },
    ]);
  });

  it('tam eşitlikte (aynı skor, aynı an) deterministik: userId', () => {
    const t = d('2026-10-07T10:00:00Z');
    const ranked = rankWeekly([
      { userId: 'z', starsCollected: 5, completedAt: t },
      { userId: 'm', starsCollected: 5, completedAt: t },
    ]);
    expect(ranked.map((r) => r.userId)).toEqual(['m', 'z']);
  });

  it('skor 0 ve tamamlanma zamanı olmayanlar sıralamaya girmez', () => {
    expect(
      rankWeekly([
        { userId: 'a', starsCollected: 0, completedAt: d('2026-10-07T10:00:00Z') },
        { userId: 'b', starsCollected: 4, completedAt: null },
      ])
    ).toEqual([]);
  });
});

describe('featuredGameTypeForWeek — tek öne çıkan oyun', () => {
  const candidates = visibleMiniGames().map((g) => g.gameType);

  it('aynı hafta için her zaman aynı oyun; gizli oyunlar aday değil', () => {
    const a = featuredGameTypeForWeek('2026-W41', candidates);
    expect(a).toBe(featuredGameTypeForWeek('2026-W41', candidates));
    expect(candidates).not.toContain('lucky-wheel');
    expect(candidates).not.toContain('data-miner');
    expect(candidates).toContain(a);
  });

  it('art arda haftalarda döner', () => {
    expect(featuredGameTypeForWeek('2026-W41', candidates)).not.toBe(featuredGameTypeForWeek('2026-W42', candidates));
  });

  it('aday yoksa null; bozuk anahtar ilk adaya düşer', () => {
    expect(featuredGameTypeForWeek('2026-W41', [])).toBeNull();
    expect(featuredGameTypeForWeek('bozuk', ['x', 'y'])).toBe('x');
    expect(parseWeekKey('2026-W07')).toEqual({ year: 2026, week: 7 });
  });
});

describe('prizeFor — minParticipants', () => {
  it(`eşik (${TOURNAMENT_MIN_PARTICIPANTS}) altında rakipsiz ödül YOK`, () => {
    expect(prizeFor(1, 1)).toBe(0);
    expect(prizeFor(1, TOURNAMENT_MIN_PARTICIPANTS - 1)).toBe(0);
  });
  it('eşikte ilk 3 ödüllü, 4. ödülsüz', () => {
    expect(prizeFor(1, TOURNAMENT_MIN_PARTICIPANTS)).toBe(500);
    expect(prizeFor(3, TOURNAMENT_MIN_PARTICIPANTS)).toBe(150);
    expect(prizeFor(4, 50)).toBe(0);
  });
  it('öne çıkan olmayan oyunun ödül tablosu sıfır', () => {
    expect(prizeTable(false)).toEqual({ 1: 0, 2: 0, 3: 0 });
    expect(prizeTable(true)).toEqual({ 1: 500, 2: 300, 3: 150 });
  });
});

describe('TOURNAMENT_ROTATION — haftaya dondurulmuş takvim (K4 regresyonu)', () => {

  it('dilimler sıralı ve geçerli hafta anahtarlı', () => {
    const keys = t.TOURNAMENT_ROTATION.map((s) => s.fromWeek);
    expect([...keys].sort()).toEqual(keys);
    for (const k of keys.slice(1)) expect(t.parseWeekKey(k)).not.toBeNull();
  });

  it('son (yürürlükteki) dilim yalnız canlı, varsayılan açık oyunlardan oluşur — emekli kimlik ödüllü turnuvaya giremez', () => {
    const last = t.TOURNAMENT_ROTATION[t.TOURNAMENT_ROTATION.length - 1].candidates;
    expect(new Set(last).size).toBe(last.length);
    for (const g of last) {
      expect(LIVE_GAME_TYPES.has(g)).toBe(true);
      expect(getGameDef(g)?.optIn).toBeUndefined();
    }
    // Yıldız Avı (sunucu anahtarı 'pacman') artık aday.
    expect(last).toContain('pacman');
  });

  it('geçmiş haftaların öne çıkan oyunu değişmez (talep/kapanış kaymasın)', () => {
    // Takvim öncesi (eski visibleMiniGames sırası) ile bire bir.
    expect(t.featuredGameForWeek('2026-W40')).toBe('trust-merge');
    expect(t.featuredGameForWeek('2026-W41')).toBe('signal-pipe');
  });

  it('yeni dilimden itibaren hiçbir hafta emekli oyuna düşmez', () => {
    let wk = '2026-W42';
    const seen = new Set<string>();
    for (let i = 0; i < 60; i++) {
      const g = t.featuredGameForWeek(wk)!;
      expect(LIVE_GAME_TYPES.has(g)).toBe(true);
      seen.add(g);
      const p = t.parseWeekKey(wk)!;
      wk = p.week >= 52 ? `${p.year + 1}-W01` : `${p.year}-W${String(p.week + 1).padStart(2, '0')}`;
    }
    expect(seen.size).toBeGreaterThan(5);
  });
});
