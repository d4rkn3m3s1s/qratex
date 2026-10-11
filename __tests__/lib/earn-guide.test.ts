/**
 * Puan Rehberi (lib/economy/earn-guide) — oyunlaştırma-ekonomi O7.
 * Rehber elle yazılmış metin değil: miktarlar matristen, sınırlar ECONOMY_CAPS'ten, "bugün"
 * ilerlemesi tavanı uygulayan sayımdan gelir. Ayar değişince rehber de değişmeli.
 */
jest.mock('@/lib/prisma', () => ({ prisma: {} }));

import { buildEarnGuide } from '@/lib/economy/earn-guide';
import { getDefaultPointsMatrix } from '@/lib/points-rules';
import { ECONOMY_CAPS } from '@/lib/economy/caps';
import { PASSIVE_POINTS_MAX_PER_CONSUMPTION } from '@/lib/consumption/service';
import { badgeRewardPoints } from '@/lib/badge-reward-points';
import { EMOJI_BADGE_TEXTS } from '@/lib/emoji-badge-texts';

const base = {
  milestones: [
    { days: 3, points: 50 },
    { days: 7, points: 150 },
  ],
  feedback: { today: 120, week: 900 },
  game: { today: 600, week: 1200 },
  visitToday: 80,
};

describe('puan rehberi', () => {
  it('miktarlar puan matrisinden; yönetici değiştirince rehber de değişir', () => {
    const m = structuredClone(getDefaultPointsMatrix());
    m.feedback.base.points = 70;
    m.feedback.detailed.points = 140;
    m.referral.referrerPoints = 1234;
    const g = buildEarnGuide({ ...base, matrix: m });
    expect(g.feedback).toMatchObject({ base: 70, detailed: 140 });
    expect(g.referral.referrer).toBe(1234);
    expect(g.streak.milestones).toEqual(base.milestones);
  });

  it('sınırlar mintPoints ile aynı tablodan; bugün/hafta sayımı aynen taşınır', () => {
    const g = buildEarnGuide({ ...base, matrix: getDefaultPointsMatrix() });
    expect(g.feedback.cap).toEqual({ today: 120, daily: ECONOMY_CAPS.feedback.daily, week: 900, weekly: ECONOMY_CAPS.feedback.weekly });
    expect(g.game.cap).toEqual({ today: 600, daily: ECONOMY_CAPS.game.daily, week: 1200, weekly: ECONOMY_CAPS.game.weekly });
    expect(g.visit).toEqual({
      perConsumptionMax: PASSIVE_POINTS_MAX_PER_CONSUMPTION,
      perPlaceDaily: ECONOMY_CAPS.dealer_passive.perActorDaily,
      daily: ECONOMY_CAPS.dealer_passive.daily,
      today: 80,
    });
  });

  it('rozet aralığı ödeyen tablonun (badgeRewardPoints) uçlarını kapsar; çark en büyük puan ödülü', () => {
    const g = buildEarnGuide({ ...base, matrix: getDefaultPointsMatrix() });
    const anyEmoji = Object.keys(EMOJI_BADGE_TEXTS)[0];
    const p = badgeRewardPoints(anyEmoji);
    expect(g.badges.min).toBeLessThanOrEqual(p);
    expect(g.badges.max).toBeGreaterThanOrEqual(p);
    expect(g.badges.min).toBeGreaterThan(0);
    const spinMax = Math.max(...getDefaultPointsMatrix().spin.prizes.filter((x) => x.type === 'points').map((x) => x.value));
    expect(g.spin.maxPrize).toBe(spinMax);
  });
});
