/**
 * Müşteri Ana Sayfa — saf hesaplar (lib/customer-home/core.ts).
 *
 * Denetim bulgularının yapısal kapanışı:
 *  - Seri sabit 0 değil: gerçek alanlardan, İstanbul gününe göre; kırık seri 0 (Bulgu 1).
 *  - Seviye ilerlemesi kredi yolundaki `calculateLevel` ile aynı eğri (Bulgu 4, #64).
 *  - Lig kuralları DB'den; son lig açık uçlu; sıra aynı metrikle (Bulgu 2, 17).
 *  - Ödül hedefi stok/geçerlilik penceresine uyar (Bulgu 12).
 *  - Profil arka planı yalnız güvenli https URL'si (Bulgu 9).
 */
import { calculateLevel } from '@/lib/utils';
import {
  buildDailyGoals,
  buildPendingActions,
  dailyBoxDayKeys,
  dayKeyToDbDate,
  greetingFor,
  isRewardAvailable,
  istanbulTodayStart,
  istanbulWeekStart,
  leagueFor,
  leagueSnapshot,
  levelFromXp,
  parseClaimedMilestones,
  pickRewardTargets,
  safeBackgroundUrl,
  streakSnapshot,
  sumCreditedPoints,
  HOME_LINKS,
} from '@/lib/customer-home/core';
import type { HomeSections } from '@/lib/customer-home/types';

const MILESTONES = [
  { days: 3, points: 50 },
  { days: 7, points: 150 },
  { days: 14, points: 300 },
  { days: 30, points: 1000 },
];

const ALL_ON: HomeSections = { rewards: true, surpriseBoxes: true, leaderboard: true, games: true, remedy: true, spin: true };

describe('levelFromXp', () => {
  it.each([0, 1, 999, 1000, 2499, 2500, 4749, 4750, 123456])('xp=%i → calculateLevel ile aynı seviye', (xp) => {
    expect(levelFromXp(xp).level).toBe(calculateLevel(xp));
  });

  it('seviye içi ilerleme ve aralık doğru', () => {
    expect(levelFromXp(0)).toEqual({ level: 1, xp: 0, intoLevel: 0, levelSpan: 1000 });
    // 1000 → seviye 2, sonraki aralık floor(1000 * 1.5) = 1500
    expect(levelFromXp(1200)).toEqual({ level: 2, xp: 1200, intoLevel: 200, levelSpan: 1500 });
  });

  it('negatif/NaN XP sıfıra düşer', () => {
    expect(levelFromXp(-5).xp).toBe(0);
    expect(levelFromXp(Number.NaN).level).toBe(1);
  });
});

describe('greetingFor — İstanbul saati', () => {
  it('UTC 03:30 = İstanbul 06:30 → günaydın (sunucu UTC olsa da)', () => {
    expect(greetingFor(new Date('2026-10-10T03:30:00Z'))).toBe('morning');
  });
  it('UTC 21:00 = İstanbul 00:00 → iyi geceler', () => {
    expect(greetingFor(new Date('2026-10-10T21:00:00Z'))).toBe('night');
  });
  it('UTC 12:00 = İstanbul 15:00 → iyi günler; UTC 16:00 = 19:00 → iyi akşamlar', () => {
    expect(greetingFor(new Date('2026-10-10T12:00:00Z'))).toBe('afternoon');
    expect(greetingFor(new Date('2026-10-10T16:00:00Z'))).toBe('evening');
  });
});

describe('İstanbul gün/hafta sınırları', () => {
  it('gün başlangıcı İstanbul gece yarısı (UTC 21:00 önceki gün)', () => {
    expect(istanbulTodayStart(new Date('2026-10-10T10:00:00Z')).toISOString()).toBe('2026-10-09T21:00:00.000Z');
    // UTC 22:30 → İstanbul ertesi gün 01:30
    expect(istanbulTodayStart(new Date('2026-10-10T22:30:00Z')).toISOString()).toBe('2026-10-10T21:00:00.000Z');
  });
  it('hafta Pazartesi 00:00 İstanbul (2026-10-10 Cumartesi → 2026-10-05)', () => {
    expect(istanbulWeekStart(new Date('2026-10-10T10:00:00Z')).toISOString()).toBe('2026-10-04T21:00:00.000Z');
  });
  it('DailySpin gün değeri takvim tarihidir', () => {
    expect(dayKeyToDbDate('2026-10-10').toISOString()).toBe('2026-10-10T00:00:00.000Z');
  });
  it('günlük kutu anahtarları: İstanbul + UTC (eski kayıtlar)', () => {
    expect(dailyBoxDayKeys(new Date('2026-10-10T22:30:00Z')).sort()).toEqual(['2026-10-10', '2026-10-11']);
    expect(dailyBoxDayKeys(new Date('2026-10-10T10:00:00Z'))).toEqual(['2026-10-10']);
  });
});

describe('streakSnapshot', () => {
  const now = new Date('2026-10-10T10:00:00Z'); // Cumartesi (İstanbul 13:00)

  it('bugün sayılmış 5 günlük seri: hafta şeridi Salı→Cumartesi dolu', () => {
    const s = streakSnapshot({ count: 5, longest: 9, lastDay: new Date('2026-10-10T06:00:00Z'), claimedMilestones: [3] }, now, MILESTONES);
    expect(s.days).toBe(5);
    expect(s.countedToday).toBe(true);
    expect(s.longest).toBe(9);
    expect(s.week.map((d) => d.active)).toEqual([false, true, true, true, true, true, false]);
    expect(s.week[5].isToday).toBe(true);
    expect(s.week[6].isFuture).toBe(true);
    expect(s.nextMilestone).toEqual({ days: 7, points: 150, daysLeft: 2 });
  });

  it('dün sayılmış seri hâlâ canlı (bugün henüz sayılmadı)', () => {
    const s = streakSnapshot({ count: 2, longest: 2, lastDay: new Date('2026-10-09T08:00:00Z'), claimedMilestones: [] }, now, MILESTONES);
    expect(s.days).toBe(2);
    expect(s.countedToday).toBe(false);
    expect(s.nextMilestone).toEqual({ days: 3, points: 50, daysLeft: 1 });
  });

  it('iki gün önce kalmış seri kırıktır → 0 (eski "sabit 0" değil, gerçek kırılma)', () => {
    const s = streakSnapshot({ count: 12, longest: 12, lastDay: new Date('2026-10-08T08:00:00Z'), claimedMilestones: [3, 7] }, now, MILESTONES);
    expect(s.days).toBe(0);
    expect(s.week.every((d) => !d.active)).toBe(true);
    expect(s.longest).toBe(12);
  });

  it('UTC gece yarısından sonra ama İstanbul aynı gün değilse ayrı gün sayılır', () => {
    // 2026-10-09T22:30Z = İstanbul 10 Ekim 01:30 → "bugün"
    const s = streakSnapshot({ count: 1, longest: 1, lastDay: new Date('2026-10-09T22:30:00Z'), claimedMilestones: [] }, now, MILESTONES);
    expect(s.countedToday).toBe(true);
  });

  it('ödüllenmiş kilometre taşları atlanır', () => {
    expect(parseClaimedMilestones([3, '7', 7.9, null])).toEqual([3, 7]);
    const s = streakSnapshot({ count: 4, longest: 30, lastDay: now, claimedMilestones: [3, 7, 14] }, now, MILESTONES);
    expect(s.nextMilestone).toEqual({ days: 30, points: 1000, daysLeft: 26 });
  });
});

describe('pickRewardTargets', () => {
  const now = new Date('2026-10-10T10:00:00Z');
  const base = { icon: null, stock: -1, metadata: null };
  const rewards = [
    { ...base, id: 'a', name: 'Kurabiye', cost: 100 },
    { ...base, id: 'b', name: 'Kahve', cost: 500 },
    { ...base, id: 'c', name: 'Tükendi', cost: 300, stock: 0 },
    { ...base, id: 'd', name: 'Süresi geçti', cost: 350, metadata: { validUntil: '2026-10-01T00:00:00Z' } },
    { ...base, id: 'e', name: 'Henüz değil', cost: 400, metadata: { validFrom: '2026-11-01T00:00:00Z' } },
    { ...base, id: 'f', name: 'Pasta', cost: 900 },
  ];

  it('alınabilir sayısı ve sıradaki hedef stok/geçerliliğe uyar', () => {
    const r = pickRewardTargets(rewards, 320, now, () => null);
    expect(r.affordable).toBe(1);
    expect(r.next).toEqual({ id: 'b', name: 'Kahve', cost: 500, image: null });
    expect(r.pointsToNext).toBe(180);
  });

  it('her şeye yetiyorsa hedef yok', () => {
    const r = pickRewardTargets(rewards, 10_000, now, () => null);
    expect(r.next).toBeNull();
    expect(r.pointsToNext).toBeNull();
    expect(r.affordable).toBe(3);
  });

  it('maliyetsiz ödül hedef sayılmaz', () => {
    expect(isRewardAvailable({ ...base, id: 'z', name: 'z', cost: 0 }, now)).toBe(false);
  });
});

describe('sumCreditedPoints', () => {
  it('yalnız pozitif sayısal points toplanır', () => {
    expect(sumCreditedPoints([{ data: { points: 50 } }, { data: { points: '20' } }, { data: null }, { data: { points: -5 } }, { data: { points: 12.7 } }])).toBe(62);
  });
});

describe('lig', () => {
  const rules = [
    { key: 'BASLANGIC', name: 'Başlangıç', minPoints: 0, maxPoints: 2999 },
    { key: 'KOR', name: 'Kor', minPoints: 3000, maxPoints: 5000 },
    { key: 'ZENOR', name: 'Zenor', minPoints: 5001, maxPoints: 100000 },
  ];

  it('son lig açık uçlu: 250.000 puan Başlangıç\'a düşmez', () => {
    expect(leagueFor(250_000, rules).current.key).toBe('ZENOR');
  });

  it('ilerleme bir sonraki ligin alt sınırına göre; sıra aynı metrikle', () => {
    const l = leagueSnapshot(4000, rules, { rankInLeague: 3, leagueSize: 40, gapToAbove: 25 });
    expect(l.key).toBe('KOR');
    expect(l.next?.key).toBe('ZENOR');
    expect(l.pointsToNext).toBe(1001);
    expect(l.progress).toBe(49);
    expect(l.rankInLeague).toBe(3);
    expect(l.gapToAbove).toBe(25);
    expect(l.ladder.map((s) => s.key)).toEqual(['BASLANGIC', 'KOR', 'ZENOR']);
  });

  it('en üst ligde ilerleme 100 ve sonraki yok', () => {
    const l = leagueSnapshot(9000, rules, { rankInLeague: 1, leagueSize: 0, gapToAbove: null });
    expect(l.progress).toBe(100);
    expect(l.next).toBeNull();
    expect(l.leagueSize).toBe(1); // kendisi her zaman sayılır
  });
});

describe('günlük hedefler', () => {
  const signals = { streakCountedToday: true, reviewedToday: false, spinUsedToday: true, boxOpenedToday: false, playedToday: true };

  it('çark açıkken: seri + değerlendirme + çark', () => {
    expect(buildDailyGoals(signals, ALL_ON)).toEqual([
      { id: 'streak', done: true, href: null },
      { id: 'review', done: false, href: HOME_LINKS.scan },
      { id: 'spin', done: true, href: null },
    ]);
  });

  it('çark kapalı → günlük kutu; o da kapalı → oyun', () => {
    expect(buildDailyGoals(signals, { ...ALL_ON, spin: false }).map((g) => g.id)).toEqual(['streak', 'review', 'box']);
    expect(buildDailyGoals(signals, { ...ALL_ON, spin: false, surpriseBoxes: false })[2]).toEqual({
      id: 'game',
      done: true,
      href: HOME_LINKS.games,
    });
  });

  it('hepsi kapalıysa iki hedef kalır (uydurma hedef eklenmez)', () => {
    expect(buildDailyGoals(signals, { ...ALL_ON, spin: false, surpriseBoxes: false, games: false })).toHaveLength(2);
  });
});

describe('bekleyen işler', () => {
  it('sıfır sayılar ve kapalı modüller listelenmez; telafi önce', () => {
    const items = buildPendingActions({ reviews: 2, boxes: 0, rewards: 1, remedy: 1 }, { ...ALL_ON, rewards: false });
    expect(items).toEqual([
      { id: 'remedy', count: 1, href: HOME_LINKS.remedy },
      { id: 'reviews', count: 2, href: HOME_LINKS.pendingReviews },
    ]);
  });
});

describe('safeBackgroundUrl', () => {
  it.each([
    ['https://images.example.com/bg.jpg', 'https://images.example.com/bg.jpg'],
    ['http://insecure.example.com/a.png', null],
    ['bg-gradient-to-r from-purple-500', null],
    ['https://x.com/a.png") ; background:url("evil', null],
    ['javascript:alert(1)', null],
    [null, null],
  ])('%s → %s', (input, expected) => {
    expect(safeBackgroundUrl(input as string | null)).toBe(expected);
  });
});
