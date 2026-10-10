/**
 * Katkı skoru (eski Yolculuk skoru) — journey-score bulgu 1, 2, 4.
 * Değişmez: puanın yönü skoru etkilemez (girdi tipinde yıldız yok; aynı katkı = aynı skor).
 */
import {
  CONTRIBUTION_STAGES,
  contributionCounts,
  contributionHistory,
  contributionScore,
  istanbulWeekKey,
  planToReach,
  scoreFromCounts,
  stageFor,
  type ReviewSignal,
} from '@/components/customer/m-ben-ilerleme/contribution';

const NOW = new Date('2026-10-10T12:00:00Z'); // Cumartesi, İstanbul 15:00
const DAY = 86_400_000;

function review(daysAgo: number, opts: Partial<ReviewSignal> = {}): ReviewSignal {
  return { at: new Date(NOW.getTime() - daysAgo * DAY), textLength: 20, flagged: false, repliedAt: null, ...opts };
}

describe('contributionScore', () => {
  it('hiç yorum yok → 0, Tanışma, sonraki aşama planı var', () => {
    const r = contributionScore([], NOW);
    expect(r.score).toBe(0);
    expect(r.stage).toBe(0);
    expect(r.next?.stage).toBe(1);
    expect(r.next?.plan).not.toBeNull();
  });

  it('tek bir yorum artık 92 puan getirmez (eski formül: tek 5★ → 92)', () => {
    const r = contributionScore([review(1, { textLength: 150 })], NOW);
    expect(r.score).toBeLessThan(15);
    expect(r.stage).toBe(0);
  });

  it('yalnız katkı sayılır: aynı yorum seti hangi yıldızla yazılmış olursa olsun aynı skor', () => {
    // Girdi tipinde rating yok; aynı sinyaller → aynı skor. Eski "10 dürüst 2★ = 40 puan" senaryosu:
    const honest = Array.from({ length: 10 }, (_, i) => review(i * 7 + 1, { textLength: 120 }));
    const r = contributionScore(honest, NOW);
    expect(r.score).toBeGreaterThanOrEqual(50);
    expect(contributionScore(honest.map((x) => ({ ...x })), NOW).score).toBe(r.score);
  });

  it('bileşen tavanları: 90 günün dışı sayılmaz, işaretli yorum ayrıntıya girmez', () => {
    const list = [
      review(1, { textLength: 200, flagged: true }),
      review(2, { textLength: 200 }),
      review(120, { textLength: 200 }),
      review(3, { repliedAt: new Date(NOW.getTime() - DAY) }),
    ];
    const c = contributionCounts(list, NOW);
    expect(c.participation).toBe(3);
    expect(c.detail).toBe(1);
    expect(c.impact).toBe(1);
  });

  it('düzenlilik İstanbul haftasıyla: son 12 haftadaki farklı haftalar', () => {
    const list = [review(0), review(1), review(8), review(15), review(200)];
    expect(contributionCounts(list, NOW).regularity).toBe(3);
  });

  it('tam katkı 100 ve en üst aşama, sonraki aşama yok', () => {
    const list = Array.from({ length: 12 }, (_, i) =>
      review(i * 7, { textLength: 300, repliedAt: new Date(NOW.getTime() - i * 7 * DAY + 3_600_000) }),
    );
    const r = contributionScore(list, NOW);
    expect(r.score).toBe(100);
    expect(r.stage).toBe(3);
    expect(r.next).toBeNull();
  });

  it('gelecekteki yanıt geçmiş an hesabına girmez', () => {
    const list = [review(10, { repliedAt: new Date(NOW.getTime() + DAY) })];
    expect(contributionCounts(list, NOW).impact).toBe(0);
  });
});

describe('planToReach', () => {
  it('plan uygulanınca hedefe ulaşılır', () => {
    const counts = { participation: 2, detail: 0, regularity: 1, impact: 0 };
    const target = CONTRIBUTION_STAGES[2];
    const plan = planToReach(counts, target);
    expect(plan).not.toBeNull();
    const after = scoreFromCounts({
      participation: counts.participation + plan!.reviews,
      detail: counts.detail + plan!.detailed,
      regularity: counts.regularity + plan!.newWeeks,
      impact: 0,
    });
    expect(after).toBeGreaterThanOrEqual(target);
    expect(plan!.detailed).toBeLessThanOrEqual(plan!.reviews);
    expect(plan!.newWeeks).toBeLessThanOrEqual(plan!.reviews);
  });

  it('yalnız işletme yanıtıyla ulaşılabilecek hedefte plan yok', () => {
    const maxed = { participation: 12, detail: 8, regularity: 8, impact: 0 };
    expect(scoreFromCounts(maxed)).toBe(85);
    expect(planToReach(maxed, 90)).toBeNull();
  });
});

describe('yardımcılar', () => {
  it('aşama eşikleri 0/25/50/75', () => {
    expect([0, 24, 25, 49, 50, 74, 75, 100].map(stageFor)).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
  });

  it('hafta anahtarı İstanbul Pazartesi 00:00 sınırında döner', () => {
    // 2026-10-11 Pazar 20:59Z = İstanbul Pazar 23:59 → 2026-10-05 haftası
    expect(istanbulWeekKey(new Date('2026-10-11T20:59:00Z'))).toBe('2026-10-05');
    // 2026-10-11 21:00Z = İstanbul Pazartesi 00:00 → yeni hafta
    expect(istanbulWeekKey(new Date('2026-10-11T21:00:00Z'))).toBe('2026-10-12');
  });

  it('geçmiş 8 haftalık skor eski → yeni sırada', () => {
    const list = Array.from({ length: 6 }, (_, i) => review(i * 7 + 1, { textLength: 150 }));
    const h = contributionHistory(list, NOW, 8);
    expect(h).toHaveLength(8);
    expect(h[7]).toBe(contributionScore(list, NOW).score);
    expect(h[0]).toBeLessThanOrEqual(h[7]);
  });
});
