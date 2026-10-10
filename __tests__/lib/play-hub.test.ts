/**
 * Oyna merkezi (`/customer/games`) saf mantığı: katalog (emekliler görünmez, birleşmeyi
 * bekleyen eski oyunlar görünür), bugünkü deneme durumu, öne çıkan oyun, oyun serisi,
 * günlük oyun görevleri, Oyun Pasosu, emekli yönlendirmesi ve normalize skor başarımları.
 * Gerçek DB'ye gidilmez.
 */
jest.mock('@/lib/prisma', () => ({ prisma: {}, isPrismaConnectivityError: () => false }));

import { mergeGameConfig } from '@/lib/minigame-config-effective';
import { MINI_GAMES, PACMAN_GAME, getGameDef } from '@/lib/minigame-config';
import {
  buildHubCatalog,
  nextGameDayReset,
  pickFeatured,
  streakBonusXp,
  streakSummary,
  summarizeToday,
  todayStateOf,
  type EffectiveGameLike,
  type TodayRow,
} from '@/lib/play-hub/catalog';
import { GAME_QUESTS, questCounts, questIdFromKey, questIdempotencyKey, questProgress } from '@/lib/play-hub/quests';
import { PASS_TIERS, currentPassSeason, passProgress } from '@/lib/play-hub/pass';
import { retiredNoticeFor, retiredRedirectTarget } from '@/lib/play-hub/retired';
import { bestScorePctOf, longestRun } from '@/lib/game-achievement-stats';
import { evaluateAchievements } from '@/lib/game-achievements';
import { streakBonusFor } from '@/lib/game-session';

function effectiveMap(overrides: Record<string, Partial<EffectiveGameLike>> = {}) {
  const map = new Map<string, EffectiveGameLike>();
  for (const def of [...MINI_GAMES, PACMAN_GAME]) {
    map.set(def.gameType, { ...mergeGameConfig(def, null), ...(overrides[def.gameType] ?? {}) });
  }
  return map;
}

const RETIRED = ['speed-order', 'memory-match', 'combo-tap', 'lucky-wheel', 'data-miner', 'network-defender'];

describe('buildHubCatalog', () => {
  it('emekli 6 oyun hiçbir koşulda listelenmez (sunucuda gizli olmasalar bile)', () => {
    const catalog = buildHubCatalog(effectiveMap());
    for (const id of RETIRED) {
      expect(catalog.find((g) => g.id === id || g.gameType === id)).toBeUndefined();
    }
  });

  it('canlı registry oyunları registry sırasıyla ve tek kez gelir; pacman Yıldız Avı olarak', () => {
    const catalog = buildHubCatalog(effectiveMap());
    const types = catalog.map((g) => g.gameType);
    expect(new Set(types).size).toBe(types.length);
    expect(catalog.find((g) => g.gameType === 'pacman')?.id).toBe('star-hunt');
    expect(types).toContain('mind-thief');
  });

  it('hedefi henüz canlı olmayan eski oyun "classic" olarak görünür, hedefi canlı olan görünmez', () => {
    const catalog = buildHubCatalog(effectiveMap());
    // truth-vs-fake → Sahte Avcısı (yapım aşamasında) → eski sayfa hâlâ oynatır
    const tvf = catalog.find((g) => g.id === 'truth-vs-fake');
    expect(tvf?.role).toBe('classic');
    expect(tvf?.href).toBe('/customer/games/truth-vs-fake');
    expect(tvf?.mergesInto).toBeTruthy();
    // guardian-of-trust → Kar Tanesi Yakala (canlı) → ayrı kart yok
    expect(catalog.find((g) => g.id === 'guardian-of-trust')).toBeUndefined();
  });

  it('admin kapattığı ya da sunucunun gizlediği oyun görünmez; override başlığı kullanılır', () => {
    const catalog = buildHubCatalog(
      effectiveMap({ 'mind-thief': { enabled: false }, 'data-snake': { title: 'Yılan X' }, 'review-stack': { hidden: true } })
    );
    expect(catalog.find((g) => g.gameType === 'mind-thief')).toBeUndefined();
    expect(catalog.find((g) => g.gameType === 'review-stack')).toBeUndefined();
    expect(catalog.find((g) => g.gameType === 'data-snake')?.title).toBe('Yılan X');
  });

  it('sunucu kuralı olmayan oyun listelenmez', () => {
    const map = effectiveMap();
    map.delete('frost-catcher');
    expect(buildHubCatalog(map).find((g) => g.gameType === 'frost-catcher')).toBeUndefined();
  });
});

describe('summarizeToday', () => {
  const now = new Date('2026-10-10T12:00:00Z');
  const row = (p: Partial<TodayRow>): TodayRow => ({
    gameType: 'x',
    status: 'active',
    starsCollected: 0,
    rewardPoints: 0,
    startedAt: new Date('2026-10-10T11:59:00Z'),
    serverStartedAt: null,
    expiresAt: null,
    ...p,
  });

  it('kazanılan / kaybedilen / yarım / süresi dolmuş denemeyi ayırır', () => {
    const m = summarizeToday(
      [
        row({ gameType: 'a', status: 'completed', starsCollected: 9, rewardPoints: 150 }),
        row({ gameType: 'b', status: 'failed', starsCollected: 3 }),
        row({ gameType: 'c', status: 'active', expiresAt: new Date('2026-10-10T12:05:00Z') }),
        row({ gameType: 'd', status: 'active', expiresAt: new Date('2026-10-10T11:00:00Z') }),
        row({ gameType: 'e', status: 'abandoned' }),
      ],
      now
    );
    expect(m.get('a')).toEqual({ state: 'won', score: 9, rewardPoints: 150 });
    expect(m.get('b')?.state).toBe('lost');
    expect(m.get('c')?.state).toBe('unfinished');
    expect(m.get('d')?.state).toBe('lost');
    expect(m.get('e')?.state).toBe('lost');
    expect(todayStateOf(m, 'zzz')).toBe('available');
    expect(todayStateOf(null, 'a')).toBeNull();
  });

  it('expiresAt yoksa oyunun deneme penceresiyle hesaplar', () => {
    const m = summarizeToday([row({ gameType: 'g', startedAt: new Date('2026-10-10T11:00:00Z') })], now, () => 120);
    expect(m.get('g')?.state).toBe('lost');
  });
});

describe('pickFeatured', () => {
  const catalog = buildHubCatalog(effectiveMap());

  it('turnuva oyunu bugün denenmediyse onu seçer', () => {
    const t = catalog[2].gameType;
    expect(pickFeatured(catalog, new Map(), { tournamentGameType: t, dayKey: '2026-10-10' })?.gameType).toBe(t);
  });

  it('turnuva oyunu denendiyse denenmemiş başka bir oyun; aynı gün herkese aynı', () => {
    const t = catalog[0].gameType;
    const today = new Map([[t, { state: 'lost' as const, score: 0, rewardPoints: 0 }]]);
    const a = pickFeatured(catalog, today, { tournamentGameType: t, dayKey: '2026-10-10' });
    const b = pickFeatured(catalog, today, { tournamentGameType: t, dayKey: '2026-10-10' });
    expect(a).not.toBeNull();
    expect(a!.gameType).not.toBe(t);
    expect(a!.gameType).toBe(b!.gameType);
  });

  it('hepsi denendiyse null', () => {
    const today = new Map(catalog.map((g) => [g.gameType, { state: 'won' as const, score: 1, rewardPoints: 0 }]));
    expect(pickFeatured(catalog, today, { tournamentGameType: null, dayKey: '2026-10-10' })).toBeNull();
  });
});

describe('streakSummary', () => {
  it('bugün kazanıldıysa bugünden geriye sayar', () => {
    const s = streakSummary(['2026-10-08', '2026-10-09', '2026-10-10'], '2026-10-10');
    expect(s).toMatchObject({ current: 3, wonToday: true, atRisk: false, nextLength: 3, nextMilestone: 6 });
  });

  it('dün kazanıldı, bugün değil → seri tehlikede; bugün kazanılırsa bonus günü', () => {
    const s = streakSummary(['2026-10-08', '2026-10-09'], '2026-10-10');
    expect(s).toMatchObject({ current: 2, wonToday: false, atRisk: true, nextLength: 3, nextMilestone: 3 });
    expect(streakBonusXp(s.nextLength)).toBe(40);
  });

  it('kopmuş seri sıfırdır; en uzun seri korunur', () => {
    const s = streakSummary(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-07'], '2026-10-10');
    expect(s.current).toBe(0);
    expect(s.atRisk).toBe(false);
    expect(s.longest).toBe(4);
  });

  it('XP bonusu sunucu kuralıyla birebir', () => {
    for (let n = 0; n <= 10; n++) expect(streakBonusXp(n)).toBe(streakBonusFor(n));
  });

  it('oyun günü UTC gece yarısı sıfırlanır (TSİ 03:00)', () => {
    expect(nextGameDayReset(new Date('2026-10-10T22:30:00Z')).toISOString()).toBe('2026-10-11T00:00:00.000Z');
  });
});

describe('günlük oyun görevleri', () => {
  it('sayaçlar: başlatılan her deneme kullanıldı sayılır, kazanç yalnız completed', () => {
    const c = questCounts([
      { gameType: 'a', status: 'completed' },
      { gameType: 'b', status: 'failed' },
      { gameType: 'b2', status: 'active' },
    ]);
    expect(c).toEqual({ attempts: 3, wins: 1, distinct: 3 });
  });

  it('ilerleme hedefte kırpılır; talep edilenler işaretlenir', () => {
    const p = questProgress({ attempts: 5, wins: 0, distinct: 2 }, new Set(['play-1']));
    const play = p.find((x) => x.quest.id === 'play-1')!;
    const win = p.find((x) => x.quest.id === 'win-1')!;
    const variety = p.find((x) => x.quest.id === 'variety-3')!;
    expect(play).toMatchObject({ progress: 1, done: true, claimed: true });
    expect(win).toMatchObject({ progress: 0, done: false, claimed: false });
    expect(variety).toMatchObject({ progress: 2, done: false });
  });

  it('defter anahtarı kullanıcı + gün + görev; geri çözülür', () => {
    const k = questIdempotencyKey('u1', '2026-10-10', 'win-1');
    expect(k).toBe('game_quest:u1:2026-10-10:win-1');
    expect(questIdFromKey(k)).toBe('win-1');
    expect(questIdFromKey('game:abc')).toBeNull();
  });

  it('ödüller yalnız XP ve küçük', () => {
    for (const q of GAME_QUESTS) {
      expect(q.xp).toBeGreaterThan(0);
      expect(q.xp).toBeLessThanOrEqual(50);
    }
  });
});

describe('Oyun Pasosu', () => {
  it('kademe, sonraki kademe ve yüzdeler', () => {
    expect(passProgress(0)).toMatchObject({ tier: 0, toNext: 100, pctToNext: 0 });
    const p = passProgress(450);
    expect(p.tier).toBe(2);
    expect(p.next?.level).toBe(3);
    expect(p.toNext).toBe(150);
    expect(p.pctToNext).toBe(50);
    const top = passProgress(999_999);
    expect(top.tier).toBe(PASS_TIERS.length);
    expect(top.next).toBeNull();
    expect(top.pctTotal).toBe(100);
    expect(passProgress(Number.NaN).xp).toBe(0);
  });

  it('kademe eşikleri artan', () => {
    for (let i = 1; i < PASS_TIERS.length; i++) expect(PASS_TIERS[i].xp).toBeGreaterThan(PASS_TIERS[i - 1].xp);
  });

  it('sezon = İstanbul takvim ayı (UTC 21:30 → İstanbul ertesi ay)', () => {
    const s = currentPassSeason(new Date('2026-10-31T21:30:00Z'));
    expect(s.key).toBe('2026-11');
    expect(s.start.toISOString()).toBe('2026-10-31T21:00:00.000Z');
    const dec = currentPassSeason(new Date('2026-12-15T10:00:00Z'));
    expect(dec.end.toISOString()).toBe('2026-12-31T21:00:00.000Z');
  });
});

describe('emekli oyun yönlendirmesi', () => {
  it('hub’a gider, sorgu korunur, emekli kimliği eklenir', () => {
    expect(retiredRedirectTarget('speed-order')).toBe('/customer/games?emekli=speed-order');
    expect(retiredRedirectTarget('combo-tap', { utm_source: 'push', emekli: 'x' })).toBe(
      '/customer/games?utm_source=push&emekli=combo-tap'
    );
  });

  it('bildirim yalnız bilinen emekli kimliği için; serbest metin yansıtılmaz', () => {
    expect(retiredNoticeFor('lucky-wheel')?.title).toBe('Şans Çarkı');
    expect(retiredNoticeFor('<script>')).toBeNull();
    expect(retiredNoticeFor(undefined)).toBeNull();
    // combo-tap → Zihin Hırsızı canlı → halef bağlantısı
    expect(retiredNoticeFor('combo-tap')?.successor?.href).toBe('/customer/games/mind-thief');
  });
});

describe('başarımlar — birimden bağımsız skor', () => {
  it('skor oyunun tavanına oranla ölçülür (trust-merge karo değeri bedava rozet vermez)', () => {
    const tm = getGameDef('trust-merge')!;
    const snake = getGameDef('data-snake')!;
    expect(bestScorePctOf([{ gameType: 'trust-merge', best: 64 }])).toBe(Math.floor((64 / tm.maxScore) * 100));
    expect(bestScorePctOf([{ gameType: 'data-snake', best: snake.maxScore }])).toBe(100);
    expect(bestScorePctOf([{ gameType: 'bilinmeyen', best: 999 }])).toBe(0);
  });

  it('peak başarımları yüzdeye göre açılır; eksik alan 0 sayılır', () => {
    const base = { totalWins: 0, distinctGames: 0, bestScore: 2048, totalPlays: 0, streak: 0 };
    expect(evaluateAchievements(base).find((a) => a.id === 'peak-80')?.unlocked).toBe(false);
    const res = evaluateAchievements({ ...base, bestScorePct: 85 });
    expect(res.find((a) => a.id === 'peak-80')?.unlocked).toBe(true);
    expect(res.find((a) => a.id === 'peak-100')?.unlocked).toBe(false);
  });

  it('en uzun seri', () => {
    expect(longestRun(['2026-10-01', '2026-10-02', '2026-10-04', '2026-10-05', '2026-10-06'])).toBe(3);
    expect(longestRun([])).toBe(0);
  });
});
